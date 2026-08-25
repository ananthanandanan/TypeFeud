import { TIER_WORD_BOUNDS } from "@typefeud/game";
import { contentPoolSchema, type ContentLine, type ContentPool } from "./schema";

export interface ValidationIssue {
  lineId: string;
  problem: string;
}

/** Terms that must never ship. Extend as the content pipeline matures. SPEC §3.2. */
export const BANNED_TERMS: readonly string[] = [];

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * SPEC §3.2 validation gate: word counts, tier bounds, banned terms, duplicates.
 * Runs in CI over everything in `pool/`. Human review is the *quality* gate;
 * this is only the mechanical one.
 */
export function validatePool(raw: unknown): ValidationIssue[] {
  const parsed = contentPoolSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => ({
      lineId: i.path.join(".") || "<pool>",
      problem: i.message,
    }));
  }

  const pool: ContentPool = parsed.data;
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  const seenText = new Set<string>();

  for (const line of pool) {
    if (seenIds.has(line.id)) issues.push({ lineId: line.id, problem: "duplicate id" });
    seenIds.add(line.id);

    const normalised = line.text.trim().toLowerCase();
    if (seenText.has(normalised)) issues.push({ lineId: line.id, problem: "duplicate text" });
    seenText.add(normalised);

    issues.push(...validateLine(line));
  }

  return issues;
}

function validateLine(line: ContentLine): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const actual = countWords(line.text);
  if (actual !== line.wordCount) {
    issues.push({
      lineId: line.id,
      problem: `wordCount says ${line.wordCount}, text has ${actual}`,
    });
  }

  // The trigger round is a single word and sits outside the tier system.
  if (line.round !== "trigger") {
    const bounds = TIER_WORD_BOUNDS[line.tier];
    if (actual < bounds.min || actual > bounds.max) {
      issues.push({
        lineId: line.id,
        problem: `${actual} words is outside ${line.tier} bounds ${bounds.min}–${bounds.max}`,
      });
    }
  }

  if (!line.id.startsWith(`${line.arena.replace(/_/g, "")}-`)) {
    issues.push({ lineId: line.id, problem: `id does not match arena "${line.arena}"` });
  }

  const lower = line.text.toLowerCase();
  for (const term of BANNED_TERMS) {
    if (lower.includes(term)) issues.push({ lineId: line.id, problem: `banned term "${term}"` });
  }

  return issues;
}
