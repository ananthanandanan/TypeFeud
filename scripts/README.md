# scripts

## `generate-content.ts` — not yet written (Milestone 7 / content authoring)

The LLM authoring pipeline from SPEC §3.2. It is a **drafting aid you run
offline**, never a runtime dependency. There are no LLM API calls at match time.

```
generate-content.ts
  → prompt an LLM with arena + topic + tier + tone constraints
  → 50–100 candidate lines per batch
  → write packages/content/drafts/<arena>-<round>.json   (git-ignored)
  → HUMAN REVIEW: keep / cut / rewrite                    ← the real quality gate
  → promote to packages/content/pool/<arena>-<round>.json (committed)
  → validate: pnpm --filter @typefeud/content test
```

Drafts are git-ignored on purpose: only human-reviewed lines are the source of
truth.
