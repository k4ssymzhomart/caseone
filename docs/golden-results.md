# ai-verify golden set: results

The golden set lives in `supabase/functions/ai-verify/golden/` (10 cases from CLAUDE.md §11, facts reused from `supabase/tests/ai_review.sql`, synthetic 512×384 photos rendered by `tools/golden-photos.ts`). `npm run golden` builds the same LLM input as ai-verify (`_shared/verifyInput.ts`), scores the answer with the TypeScript mirror of `ai_submit` and prints expected against got.

- `npm run golden`: mock provider, free, proves the pipeline (6 из 10: the mock answers every case the same way)
- `npm run golden -- --reference`: the reference answers, must be 10 из 10 (also pinned by `packages/shared/src/domain/verifyGolden.test.ts`)
- `npm run golden -- --live`: Sonnet 5.5, costs about 0.016 USD per case; capped at 0.30 USD per run

## Phase 4 log

- 2026-10-08 · golden `--live`, claude-sonnet-5-5, prompt p0.1, input p0.1.i1: **Точность: 7 из 10**, cost 0.1583 USD (ledger total 0.1593 USD)

| Case | Expected | Got | Score | Confidence |
| --- | --- | --- | --- | --- |
| 01 good repair | accepted | accepted | 100 | 0.9 |
| 02 no after photo | rework | rework | 60 | 0.4 |
| 03 duplicate photo | rework | rework | 70 | 0.35 |
| 04 excess materials | rework | rework | 79 | 0.6 |
| 05 wrong fault code | accepted_with_remarks | **rework** | 55 | 0.6 |
| 06 unrelated works | rework | rework | 63 | 0.95 |
| 07 suspiciously fast | accepted_with_remarks, no master | accepted_with_remarks, **master review** | 61 | 0.55 |
| 08 overdue but good | accepted | accepted | 95 | 0.9 |
| 09 planned, no photo | accepted_with_remarks, no master | accepted_with_remarks, **master review** | 75 | 0.55 |
| 10 unclear photo | master review | master review (accepted) | 91 | 0.55 |

### Disagreements

- **05 wrong fault code → rework (55).** The wrong code is charged three times: L1 −8 for the code, R3 −6 for materials that are untypical for Э-03, and another −5 because the model marked `materials_logic` suspicious, although its own explanation says the bearing and grease fit the works and the problem is the code. With the model's `partial` work match (L1 10 − 8 = 2) the score falls below 60. Fix options: tell the model in the prompt to judge materials against the works, not against the code; or skip the −5 in `ai_submit` when `code_consistent` is false.
- **07 suspiciously fast → master review.** The verdict matches (61, with remarks), but the model returned `code_consistent: false` with `suggested_code: "Г-01"`, the same code the worker chose: a self contradictory answer that cost 8 points. Confidence 0.55 then sent it to the master. Fix: treat `code_consistent` as true when `suggested_code` equals the order's fault code (in `normalizeVerifyAnswer` or `ai_submit`). A master review for a 5 minute closure is defensible, so the expectation could also move.
- **09 planned without photo → master review.** The model lowers confidence to 0.55 when no photo exists at all, although the rules already charge for the missing photo (R1 −5, R2 −5, L2 0). Fix: the prompt should say that confidence is about the judgement of what is given and that a missing photo is already scored by the rules.
- The model's confidence clusters at 0.55 to 0.6 whenever visual evidence is weak (cases 04, 05, 07, 09, 10), right at `ai_confidence_threshold` 0.6. Lowering the threshold would break case 10 (also 0.55), so the prompt is the lever, not the threshold.
