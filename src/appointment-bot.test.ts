import test from "node:test";
import assert from "node:assert/strict";
import { operationalDecision } from "./appointment-bot.ts";

test("holds a same-day notification for staff review", () => {
  const input = {
    patientReference: "pt-42",
    appointmentType: "follow-up" as const,
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    channel: "sms" as const
  };
  assert.equal(operationalDecision(input), "hold");
});

test("sends a notification when there is a full day of notice", () => {
  const input = {
    patientReference: "pt-42",
    appointmentType: "telehealth" as const,
    startTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    channel: "email" as const
  };
  assert.equal(operationalDecision(input), "send");
});
