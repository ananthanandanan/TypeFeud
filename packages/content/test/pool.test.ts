import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePool } from "../src/validate";

const POOL_DIR = join(import.meta.dirname, "..", "pool");

const poolFiles = readdirSync(POOL_DIR).filter((f) => f.endsWith(".json"));

describe("content pool", () => {
  it("has at least one pool file", () => {
    expect(poolFiles.length).toBeGreaterThan(0);
  });

  for (const file of poolFiles) {
    it(`${file} passes validation`, () => {
      const raw = JSON.parse(readFileSync(join(POOL_DIR, file), "utf8"));
      expect(validatePool(raw)).toEqual([]);
    });
  }
});

describe("validatePool", () => {
  it("catches a wordCount that disagrees with the text", () => {
    const issues = validatePool([
      {
        id: "groupchat-debate-jab-001",
        arena: "group_chat",
        round: "debate",
        tier: "jab",
        text: "You left me on read.",
        wordCount: 99,
        tags: [],
      },
    ]);
    expect(issues.map((i) => i.problem)).toContain("wordCount says 99, text has 5");
  });

  it("catches a line outside its tier's word bounds", () => {
    const issues = validatePool([
      {
        id: "groupchat-debate-jab-001",
        arena: "group_chat",
        round: "debate",
        tier: "jab",
        text: "one two three four five six seven eight nine ten eleven twelve",
        wordCount: 12,
        tags: [],
      },
    ]);
    expect(issues.some((i) => i.problem.includes("outside jab bounds"))).toBe(true);
  });

  it("catches duplicate ids", () => {
    const line = {
      id: "groupchat-debate-jab-001",
      arena: "group_chat",
      round: "debate",
      tier: "jab",
      text: "You left me on read.",
      wordCount: 5,
      tags: [],
    };
    const issues = validatePool([line, { ...line, text: "Four hours. I counted them." }]);
    expect(issues.some((i) => i.problem === "duplicate id")).toBe(true);
  });
});
