import { z } from "zod";

/** SPEC §3.3. The committed JSON is the source of truth; the generator drafts into it. */
export const contentLineSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+-[a-z]+-[a-z]+-\d{3}$/, "id must be <arena>-<round>-<tier>-<nnn>"),
  arena: z.string(),
  round: z.enum(["trigger", "debate", "roast", "fight"]),
  tier: z.enum(["jab", "combo", "haymaker"]),
  text: z.string().min(1),
  wordCount: z.number().int().positive(),
  tags: z.array(z.string()).default([]),
  /** optional: enables reactive pairing (SPEC §3.3, phase 2) */
  responseTo: z.array(z.string()).optional(),
  tone: z.string().optional(),
});

export type ContentLine = z.infer<typeof contentLineSchema>;

export const contentPoolSchema = z.array(contentLineSchema);
export type ContentPool = ContentLine[];

/** Canned intermission copy. It is selected, never edited by a player. */
export const tauntSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+-taunt-\d{3}$/, "id must be <arena>-taunt-<nnn>"),
  arena: z.string(),
  text: z.string().min(1),
});

export const tauntPoolSchema = z.array(tauntSchema);
export type Taunt = z.infer<typeof tauntSchema>;
