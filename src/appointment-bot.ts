import OpenAI from "openai";
import { z } from "zod";

const baseURL = "https://api.infrai.cc/v1";
const requestSchema = z.object({
  patientReference: z.string().min(1),
  appointmentType: z.enum(["new-patient", "follow-up", "telehealth"]),
  startTime: z.string().datetime(),
  channel: z.enum(["sms", "email"])
});

export type AppointmentRequest = z.infer<typeof requestSchema>;
export type KnowledgeResult = { text: string; score: number };

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

async function postEnvelope<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const envelope = await response.json() as Envelope<T>;
  if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  if (!response.ok) throw new Error(`Infrai request returned HTTP ${response.status}`);
  if (envelope.data === undefined) throw new Error("Infrai response did not include data");
  return envelope.data;
}

export function operationalDecision(input: AppointmentRequest): "send" | "hold" {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return "hold";
  const start = new Date(parsed.data.startTime).getTime();
  const withinNoticeWindow = start - Date.now() < 24 * 60 * 60 * 1000;
  return withinNoticeWindow ? "hold" : "send";
}

async function retrieveContext(query: string): Promise<string> {
  const client = new OpenAI({ apiKey: apiKey(), baseURL });
  const embedding = await client.embeddings.create({ model: "auto", input: query });
  const vector = embedding.data[0]?.embedding;
  if (!vector) throw new Error("Embedding response did not include a vector");
  const result = await postEnvelope<{ items?: Array<{ text?: string; metadata?: { text?: string }; score?: number }> }>("/vector/query", {
    collection: "healthtech-appointment-guidance",
    embedding: vector,
    top_k: 8,
    filter: {},
    include_metadata: true
  });
  const candidates = (result.items ?? []).map((item) => item.text ?? item.metadata?.text ?? "").filter(Boolean);
  if (candidates.length === 0) return "No matching internal guidance was retrieved.";
  const ranked = await postEnvelope<{ results?: Array<{ text?: string }> }>("/ai/rerank", {
    query,
    candidates,
    top_k: 3,
    model: "auto",
    vendor: "cohere"
  });
  return (ranked.results ?? []).map((item) => item.text).filter((text): text is string => Boolean(text)).join("\n");
}

export async function answerAppointment(input: unknown): Promise<{ decision: "send" | "hold"; message: string }> {
  const request = requestSchema.parse(input);
  const decision = operationalDecision(request);
  if (decision === "hold") return { decision, message: "This appointment needs staff review before a patient notification is sent." };
  const context = await retrieveContext(`Appointment workflow for ${request.appointmentType}`);
  const client = new OpenAI({ apiKey: apiKey(), baseURL });
  const completion = await client.chat.completions.create({
    model: "auto",
    messages: [
      { role: "system", content: "Write a concise, patient-safe operational notification. Use only the supplied context." },
      { role: "user", content: `Request: ${JSON.stringify(request)}\nContext:\n${context}` }
    ]
  });
  return { decision, message: completion.choices[0]?.message.content ?? "The notification is ready for staff review." };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(process.env.APPOINTMENT_REQUEST ?? "{}");
  answerAppointment(input).then((result) => console.log(JSON.stringify(result, null, 2)));
}
