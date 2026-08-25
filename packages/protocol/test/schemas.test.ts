import { describe, expect, it } from "vitest";
import { clientMessageSchema, serverMessageSchema } from "../src/index";

describe("clientMessageSchema", () => {
  it("round-trips a progress snapshot", () => {
    const msg = { t: "progress", lineId: "grpchat-debate-jab-003", charIndex: 12, errors: 1 };
    expect(clientMessageSchema.parse(msg)).toEqual(msg);
  });

  it("rejects an unknown message type", () => {
    expect(clientMessageSchema.safeParse({ t: "definitely.not.real" }).success).toBe(false);
  });

  it("rejects a negative charIndex", () => {
    const bad = { t: "progress", lineId: "x", charIndex: -1, errors: 0 };
    expect(clientMessageSchema.safeParse(bad).success).toBe(false);
  });
});

describe("serverMessageSchema", () => {
  it("requires exactly three options on round.start", () => {
    const line = { id: "a", tier: "jab", text: "hi", wordCount: 1 };
    const twoOptions = {
      t: "round.start",
      round: "debate",
      options: [line, line],
      serverTime: 0,
      endsAt: 45_000,
    };
    expect(serverMessageSchema.safeParse(twoOptions).success).toBe(false);
  });
});
