# ai-explain-rating

«Из чего сложился рейтинг» (CLAUDE.md §13). `POST {employee_id, from, to}` with a user session returns
`{text, source, model, generated_at, reason?, cost_usd?}`. Deployed with `verify_jwt = true`.

1. The caller from `auth.getUser`: a worker may ask about themselves only, masters, managers and admins about anyone.
2. `rpc('rating')` for the period with the secret key, so the worker is compared with the whole team.
3. The worker's Q T F V D against the team medians, the points of each component and the gap to the team in rating
   points, with which component helps and which hurts most (`_shared/reportInput.ts`). No name goes out.
4. One Haiku 5.5 call (no thinking field, effort low, 17 s timeout) with the `explain_rating` schema: three short
   sentences, what helped, what hurt, one concrete action.

No closed orders, the mock provider, CONFIG, BUDGET_EXCEEDED, HTTP, TIMEOUT or a too short answer return the rules
text (`_shared/reportText.ts`) with `source: 'rules'`.
