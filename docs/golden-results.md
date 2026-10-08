# ai-verify golden set: results

The golden set lives in `supabase/functions/ai-verify/golden/` (10 cases from CLAUDE.md §11, facts reused from `supabase/tests/ai_review.sql`, synthetic 512×384 photos rendered by `tools/golden-photos.ts`). `npm run golden` builds the same LLM input as ai-verify (`_shared/verifyInput.ts`), cleans every answer with the same `normalizeVerifyAnswer` (`ai-verify/input.ts`), scores it with the TypeScript mirror of `ai_submit` and prints expected against got.

- `npm run golden`: mock provider, free, proves the pipeline (6 из 10: the mock answers every case the same way)
- `npm run golden -- --reference`: the reference answers, must be 10 из 10 (also pinned by `packages/shared/src/domain/verifyGolden.test.ts`)
- `npm run golden -- --live`: Sonnet 5.5, costs about 0.016 USD per case; capped at 0.30 USD per run

## Latest result

**10 из 10** with prompt p0.2 (input p0.2.i1) on claude-sonnet-5-5, 2026-10-09, 0.1619 USD. This is the number for the slide; the run is logged below.

## Phase 4 log

Newest first.

- 2026-10-09 · golden `--live`, claude-sonnet-5-5, prompt p0.2, input p0.2.i1: **Точность: 10 из 10**, cost 0.1619 USD (ledger total 0.3212 USD)

| Case | Expected | Got | Score | Confidence |
| --- | --- | --- | --- | --- |
| 01 good repair | accepted | accepted | 100 | 0.92 |
| 02 no after photo | rework | rework | 60 | 0.8 |
| 03 duplicate photo | rework | rework | 84 | 0.75 |
| 04 excess materials | rework | rework | 79 | 0.8 |
| 05 wrong fault code | accepted_with_remarks | accepted_with_remarks | 60 | 0.8 |
| 06 unrelated works | rework | rework | 63 | 0.93 |
| 07 suspiciously fast | accepted_with_remarks, no master | accepted_with_remarks, no master | 77 | 0.8 |
| 08 overdue but good | accepted | accepted | 95 | 0.9 |
| 09 planned, no photo | accepted_with_remarks, no master | accepted_with_remarks, no master | 75 | 0.8 |
| 10 unclear photo | master review | master review (accepted) | 91 | 0.55 |

What changed from p0.1 (the three disagreements of the 2026-10-08 run, fixed at their cause; CLAUDE.md §11 scoring, `ai_submit` and the expected verdicts unchanged):

- **Prompt p0.2** (`_shared/prompts.ts`): a new rule 4 says every flaw counts once, in its own field (a wrong code only in `code_consistent`, a missing photo only in the photo fields and the rules), and must not lower `work_match`, `materials_logic` or `confidence`. `work_match` compares the works with the described problem, not with the code. `materials_logic` judges the materials against the works and the problem, not against the code: «не типовой для шифра» under a wrong code is no longer a reason for `suspicious`. `confidence` is defined as certainty about the model's own conclusions from what it was given: findings like a too fast job or a wrong code are conclusions, not doubt; a missing photo does not lower it by itself; below 0.6 only when the main question cannot be answered (a blurred or dark after photo, works that cannot be understood).
- **Answer cleanup** (`normalizeVerifyAnswer(answer, order)` in `ai-verify/input.ts`, used by ai-verify and by `tools/golden.ts`): `code_consistent` becomes true when `suggested_code` is the order's own fault code, compared through `canonicalFaultCode` (Latin look alike letters, any dash, a trailing name). The model still produced that contradiction in 2 of 10 answers under p0.2 (03 and 07); the cleanup turned both into a consistent code, and the golden output now notes every such fix.
- Effect per disagreement: 05 is now scored with materials `ok` (no third charge for the wrong code) and lands at 60 with remarks; 07 keeps its 8 points and confidence 0.8 (77, no master); 09 keeps confidence 0.8 without a photo (75, no master). Case 10 still drops to 0.55, so the unclear photo goes to the master as intended.
- Watch: 05 sits exactly on the 60 boundary. The golden output prints the answer only for misses, but 60 decomposes in one way only: rules 49 + L1 2 (`partial` minus 8 for the code) + L2 9 (photo score 3), materials `ok`. So the model still calls the work match `partial`, and one photo point less would turn the case into rework. If a later run flips 05, the next lever is the work match wording for a root cause found and fixed (the description says the breaker trips, the works replace a bearing), not the threshold.

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

### Disagreements of the p0.1 run (fixed in p0.2)

- **05 wrong fault code → rework (55).** The wrong code is charged three times: L1 −8 for the code, R3 −6 for materials that are untypical for Э-03, and another −5 because the model marked `materials_logic` suspicious, although its own explanation says the bearing and grease fit the works and the problem is the code. With the model's `partial` work match (L1 10 − 8 = 2) the score falls below 60. Fix options: tell the model in the prompt to judge materials against the works, not against the code; or skip the −5 in `ai_submit` when `code_consistent` is false.
- **07 suspiciously fast → master review.** The verdict matches (61, with remarks), but the model returned `code_consistent: false` with `suggested_code: "Г-01"`, the same code the worker chose: a self contradictory answer that cost 8 points. Confidence 0.55 then sent it to the master. Fix: treat `code_consistent` as true when `suggested_code` equals the order's fault code (in `normalizeVerifyAnswer` or `ai_submit`). A master review for a 5 minute closure is defensible, so the expectation could also move.
- **09 planned without photo → master review.** The model lowers confidence to 0.55 when no photo exists at all, although the rules already charge for the missing photo (R1 −5, R2 −5, L2 0). Fix: the prompt should say that confidence is about the judgement of what is given and that a missing photo is already scored by the rules.
- The model's confidence clusters at 0.55 to 0.6 whenever visual evidence is weak (cases 04, 05, 07, 09, 10), right at `ai_confidence_threshold` 0.6. Lowering the threshold would break case 10 (also 0.55), so the prompt is the lever, not the threshold.
