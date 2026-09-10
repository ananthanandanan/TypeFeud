export const HISTORY_KEY = "typefeud.recent-lines.v1";

export interface HistoryEntry {
  sessionId: string;
  lineIds: string[];
}

export interface RecentHistory {
  version: 1;
  matches: HistoryEntry[];
}

interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const emptyHistory = (): RecentHistory => ({ version: 1, matches: [] });

/** Malformed or old storage is an empty history, never a broken match. */
export function parseHistory(raw: string | null): RecentHistory {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 ||
      !("matches" in value) || !Array.isArray(value.matches) || value.matches.length > 3) return emptyHistory();
    const matches: HistoryEntry[] = [];
    for (const entry of value.matches) {
      if (!entry || typeof entry !== "object" || typeof entry.sessionId !== "string" || !entry.sessionId ||
        !Array.isArray(entry.lineIds) || !entry.lineIds.every((id: unknown) => typeof id === "string" && id.length > 0) ||
        matches.some((match) => match.sessionId === entry.sessionId)) return emptyHistory();
      matches.push({ sessionId: entry.sessionId, lineIds: [...new Set<string>(entry.lineIds)] });
    }
    return { version: 1, matches };
  } catch {
    return emptyHistory();
  }
}

export function appendHistory(history: RecentHistory, entry: HistoryEntry): RecentHistory {
  if (history.matches.some((match) => match.sessionId === entry.sessionId)) return history;
  return {
    version: 1,
    matches: [...history.matches, { sessionId: entry.sessionId, lineIds: [...new Set(entry.lineIds)] }].slice(-3),
  };
}

export function recentLineIds(history: RecentHistory): string[] {
  return [...new Set(history.matches.flatMap((match) => match.lineIds))];
}

/** The getter also catches browsers that throw when accessing localStorage. */
export function createHistoryStore(storage: () => HistoryStorage) {
  let memory = emptyHistory();
  let storageFailed = false;
  function read(): RecentHistory {
    if (!storageFailed) {
      try {
        memory = parseHistory(storage().getItem(HISTORY_KEY));
      } catch {
        storageFailed = true;
      }
    }
    return memory;
  }
  return {
    read,
    finish(entry: HistoryEntry): RecentHistory {
      const before = read();
      memory = appendHistory(before, entry);
      if (memory !== before && !storageFailed) {
        try {
          storage().setItem(HISTORY_KEY, JSON.stringify(memory));
        } catch {
          storageFailed = true;
        }
      }
      return memory;
    },
  };
}
