import { describe, expect, it } from "vitest";
import {
  appendHistory,
  createHistoryStore,
  parseHistory,
  recentLineIds,
  recentWpm,
  type RecentHistory,
} from "../src/match/history";

describe("recent displayed lines", () => {
  it("keeps the last three distinct completed matches without mutating earlier history", () => {
    const original: RecentHistory = { version: 1, matches: [] };
    let history = original;
    for (let i = 0; i < 4; i++)
      history = appendHistory(history, { sessionId: String(i), lineIds: [String(i), String(i)] });
    expect(history.matches.map((match) => match.sessionId)).toEqual(["1", "2", "3"]);
    expect(recentLineIds(history)).toEqual(["1", "2", "3"]);
    expect(appendHistory(history, { sessionId: "2", lineIds: ["extra"] })).toBe(history);
    expect(original.matches).toEqual([]);
  });

  it.each([
    null,
    "bad json",
    "null",
    '{"version":2,"matches":[]}',
    '{"version":1,"matches":[{"sessionId":"x","lineIds":[2]}]}',
    '{"version":1,"matches":[{"sessionId":"x","lineIds":[]},{"sessionId":"x","lineIds":[]}]}',
  ])("recovers invalid storage: %s", (raw) => {
    expect(parseHistory(raw)).toEqual({ version: 1, matches: [] });
  });

  it("persists once under duplicate finalization and reads newer stored history", () => {
    let raw: string | null = null;
    let writes = 0;
    const store = createHistoryStore(() => ({
      getItem: () => raw,
      setItem: (_key, value) => {
        raw = value;
        writes++;
      },
    }));
    const entry = { sessionId: "one", lineIds: ["a", "b"] };
    store.finish(entry);
    store.finish(entry);
    expect(writes).toBe(1);
    raw = JSON.stringify(appendHistory(parseHistory(raw), { sessionId: "another-tab", lineIds: ["c"] }));
    expect(store.finish({ sessionId: "two", lineIds: ["d"] }).matches.map((match) => match.sessionId)).toEqual([
      "one",
      "another-tab",
      "two",
    ]);
  });

  it("keeps recent WPM with the match while accepting older entries without it", () => {
    let history = appendHistory({ version: 1, matches: [] }, { sessionId: "old", lineIds: ["a"] });
    history = appendHistory(history, { sessionId: "new", lineIds: ["b"], wpm: 74 });
    expect(recentWpm(history)).toEqual([74]);
    expect(parseHistory(JSON.stringify(history))).toEqual(history);
    expect(parseHistory('{"version":1,"matches":[{"sessionId":"x","lineIds":["a"],"wpm":-1}]}')).toEqual({
      version: 1,
      matches: [],
    });
  });

  it("keeps usable in-memory history after storage access or writing fails", () => {
    for (const getStorage of [
      () => {
        throw new Error("blocked");
      },
      () => ({
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ]) {
      const store = createHistoryStore(getStorage);
      store.finish({ sessionId: "one", lineIds: ["a"] });
      store.finish({ sessionId: "two", lineIds: ["b"] });
      expect(recentLineIds(store.read())).toEqual(["a", "b"]);
    }
  });
});
