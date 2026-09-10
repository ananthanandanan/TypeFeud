import { describe, expect, it } from "vitest";
import { dealThree } from "../src/deal";
import type { ContentLine } from "../src/schema";

function line(id: string, tier: ContentLine["tier"], text: string, tags: string[] = []): ContentLine {
  return { id, tier, text, tags, arena: "test", round: "debate", wordCount: 4 };
}
const pool = [
  line("j1", "jab", "Alpha"), line("j2", "jab", "Delta"), line("j3", "jab", "Golf"),
  line("c1", "combo", "Bravo"), line("c2", "combo", "Echo"), line("c3", "combo", "Hotel"),
  line("h1", "haymaker", "Charlie"), line("h2", "haymaker", "Foxtrot"), line("h3", "haymaker", "India"),
];
const query = { arena: "test", round: "debate" as const };
const ids = (lines: { id: string }[]) => lines.map((line) => line.id);

describe("selection history and exhaustion", () => {
  it("excludes both windows when enough eligible lines exist", () => {
    const dealt = dealThree(query, ["j1", "c1", "h1"], () => 0, { pool, recent: ["j2", "c2", "h2"] });
    expect(ids(dealt)).toEqual(["j3", "c3", "h3"]);
  });

  it("relaxes recent history before repeating a line from this match", () => {
    const dealt = dealThree(query, ["j1", "c1", "h1"], () => 0, { pool, recent: ids(pool) });
    expect(ids(dealt)).toEqual(["j2", "c2", "h2"]);
  });

  it("repeats deterministically when every candidate has been displayed", () => {
    const dealt = dealThree(query, ids(pool), () => 0.5, { pool, recent: ids(pool) });
    expect(ids(dealt)).toEqual(["j2", "c2", "h2"]);
    expect(dealt).toEqual(dealThree(query, ids(pool), () => 0.5, { pool }));
  });

  it("keeps choices stable when pool file order changes", () => {
    expect(dealThree(query, [], () => 0.7, { pool })).toEqual(dealThree(query, [], () => 0.7, { pool: [...pool].reverse() }));
  });

  it("backtracks when a greedy first-character choice would strand a tier", () => {
    const tricky = [line("j1", "jab", "Alpha"), line("j2", "jab", "Charlie"),
      line("c1", "combo", "Bravo"), line("c2", "combo", "Alpha"),
      line("h1", "haymaker", "Alpha"), line("h2", "haymaker", "Bravo")];
    const dealt = dealThree(query, [], () => 0, { pool: tricky });
    expect(new Set(dealt.map((line) => line.text[0])).size).toBe(3);
  });

  it("prefers unseen tags without sacrificing valid first-character choices", () => {
    const tagged = pool.map((item) => ({ ...item, tags: item.id.endsWith("3") ? ["fresh"] : ["seen"] }));
    const dealt = dealThree(query, ["j1"], () => 0, { pool: tagged });
    expect(ids(dealt)).toEqual(["j3", "c3", "h3"]);
  });
});
