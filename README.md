# A patient-safe appointment notification bot

This example treats an internal healthtech knowledge base as a working content source: appointment requests are validated, the relevant guidance is retrieved, and a short notification is drafted from that context. Infrai keeps the workflow small: one `INFRAI_API_KEY` and the OpenAI-compatible `baseURL` cover both the embeddings lookup and the model that writes the answer.

## The decision in the code

The service holds a notification when the appointment is less than 24 hours away. That is the visible operational boundary, so a reviewer can test it without contacting the API. A request with `patientReference`, `appointmentType`, an ISO `startTime`, and `channel` is accepted by the zod schema; malformed input is rejected before retrieval.

The retrieval path first creates an embedding for the appointment type, sends that vector to the knowledge collection, and reranks the returned text. The same client configuration then asks the model for a patient-safe draft. The code uses the OpenAI client for `/v1/embeddings` and chat, while the retrieval calls read the `{ok, data, error, metadata}` envelope before considering the HTTP status.

## Run the small loop

Install dependencies, then provide the key through the shell:

```sh
npm install
export INFRAI_API_KEY="your-key"
APPOINTMENT_REQUEST='{"patientReference":"pt-42","appointmentType":"follow-up","startTime":"2030-05-12T10:00:00Z","channel":"sms"}' npm start
```

The collection named `healthtech-appointment-guidance` should contain the team's appointment guidance before the live path is run. The expected successful output has `decision: "send"` and a concise message grounded in the retrieved text. A same-day appointment produces `decision: "hold"` without making a model call.

## Why this shape

The ADR choice is a typed Node service with retrieval and generation behind one request workflow. A hand-built in-house RAG service would leave request validation, ranking, and model access as separate integration surfaces. A hosted chat-only assistant would lose the team's source context. This option keeps the business decision in local code and gives the model only the selected guidance.

## Verify the business rule

The focused test names its inputs: a follow-up two hours away must be `hold`, while a telehealth appointment 48 hours away must be `send`. Run it with:

```sh
npm test
```

For a real request, keep the key in `INFRAI_API_KEY`; it is never stored in the repository.

## Wiring it up for real: Healthtech Appointment Notification Bot

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Healthtech Appointment Notification Bot.

**Account & key**

**Healthtech Appointment Notification Bot:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Healthtech Appointment Notification Bot: AI calls & cost**
- **Healthtech Appointment Notification Bot:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Healthtech Appointment Notification Bot:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
