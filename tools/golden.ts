// npm run golden [-- --live] [-- --reference] [-- --case 05] [-- --cap 0.30]
// Runs the ai-verify golden set (CLAUDE.md §11, supabase/functions/ai-verify/golden/*.json): for each case the
// rules (TypeScript mirror of internal.rules_checks), the same LLM input as ai-verify (buildVerifyMessages), one
// LLM call, the scoring of public.ai_submit (aggregateReview), then expected against got and «Точность: N из 10».
//
//   default      LLM_PROVIDER from the environment, mock when unset: free, checks the pipeline end to end;
//                the mock answers every case the same way, so its accuracy says nothing about the model
//   --reference  no LLM call: scores each case's reference answer (must be 10 из 10)
//   --live       Claude (anthropic) with .secrets/anthropic.env; every cost goes to .secrets/llm-ledger.json and
//                the budget guard stops the run at --cap USD (default 0.30). Golden runs cost money: run sparingly.
// Every answer, the reference ones included, goes through normalizeVerifyAnswer as in ai-verify, so the golden
// set scores exactly what production hands to ai_submit. A failed LLM call (or an answer the normalizer refuses)
// is scored like production scores it: a rules only review (ai_submit with p_llm = null).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixtureDirectories, type LlmAnswerInput } from '@rota/shared';
import { jsonFileLedger } from '../supabase/functions/_shared/ledger.ts';
import {
  createLlm,
  isLlmError,
  llmConfigFromEnv,
  type Llm,
} from '../supabase/functions/_shared/llm.ts';
import { buildDirectory, type DirectoryEmployee } from '../supabase/functions/_shared/privacy.ts';
import { PROMPT_VERSION } from '../supabase/functions/_shared/prompts.ts';
import { buildVerifyMessages } from '../supabase/functions/_shared/verifyInput.ts';
import { normalizeVerifyAnswer } from '../supabase/functions/ai-verify/input.ts';
import { readSecrets } from './lib/env.ts';
import {
  goldenContext,
  goldenMatches,
  goldenOutcome,
  goldenPhotos,
  goldenRules,
  type GoldenCase,
  type GoldenOutcome,
} from './lib/golden.ts';

const root = resolve(import.meta.dirname, '..');
const goldenDir = resolve(root, 'supabase/functions/ai-verify/golden');
const ledgerPath = resolve(root, '.secrets', 'llm-ledger.json');

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(name);
const option = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const live = flag('--live');
const reference = flag('--reference');
const only = option('--case');
const cap = Number(option('--cap') ?? 0.3);

const nmrLabel = (v: boolean): string => (v ? 'мастер' : 'без мастера');
const describe = (verdict: string | null, nmr: boolean): string =>
  `${verdict ?? 'любой'} · ${nmrLabel(nmr)}`;

function loadCases(): GoldenCase[] {
  return readdirSync(goldenDir)
    .filter((f) => /^\d\d_.+\.json$/.test(f))
    .sort()
    .filter((f) => !only || f.startsWith(only))
    .map((f) => JSON.parse(readFileSync(resolve(goldenDir, f), 'utf8')) as GoldenCase);
}

function explain(answer: LlmAnswerInput | null, got: GoldenOutcome): string[] {
  const lines = got.checks.map(
    (c) => `      ${c.id} ${c.status} ${c.points}/${c.max}: ${c.message_ru}`,
  );
  if (answer) {
    lines.push(
      `      ИИ: работы ${answer.work_match?.verdict}, шифр ${answer.code_consistent ? 'верен' : `неверен → ${answer.suggested_code}`}, ` +
        `материалы ${answer.materials_logic?.verdict}, фото: после ${answer.photo?.after_present}, то же ${answer.photo?.same_equipment}, ` +
        `устранено ${answer.photo?.problem_resolved}, оценка ${answer.photo?.score_1_5}, уверенность ${answer.confidence}`,
    );
    if (answer.summary_master) lines.push(`      ИИ мастеру: ${answer.summary_master}`);
  }
  return lines;
}

async function main(): Promise<number> {
  const cases = loadCases();
  if (cases.length === 0) {
    console.error('no golden cases found');
    return 1;
  }
  const dirs = fixtureDirectories();
  const threshold = Number(dirs.settings.ai_confidence_threshold ?? 0.6);

  const secrets = live ? readSecrets('anthropic') : {};
  const get = (key: string): string | undefined => {
    if (key === 'LLM_PROVIDER') return live ? 'anthropic' : process.env.LLM_PROVIDER || 'mock';
    return process.env[key] || secrets[key] || undefined;
  };
  const ledger = jsonFileLedger({
    read: async () => (existsSync(ledgerPath) ? readFile(ledgerPath, 'utf8') : null),
    write: async (text) => writeFile(ledgerPath, text, { mode: 0o600 }),
  });

  let llm: Llm | null = null;
  let spentBefore = 0;
  if (!reference) {
    const base = llmConfigFromEnv(get);
    if (base.provider === 'anthropic' && !live) {
      console.error('LLM_PROVIDER=anthropic costs money: pass --live to confirm');
      return 1;
    }
    if (base.provider === 'anthropic' && !base.apiKey) {
      console.error('ANTHROPIC_API_KEY is missing in .secrets/anthropic.env');
      return 1;
    }
    const paid = base.provider === 'anthropic';
    spentBefore = paid ? await ledger.spentUsd() : 0;
    const employees = (
      JSON.parse(readFileSync(resolve(root, 'supabase/seed/directories.json'), 'utf8')) as {
        employees: DirectoryEmployee[];
      }
    ).employees;
    llm = createLlm({
      ...base,
      // The guard stops this run before it passes the cap or the account budget.
      ...(paid
        ? {
            budgetUsd: Math.min(base.budgetUsd ?? 4, spentBefore + cap),
            spentUsd: () => ledger.spentUsd(),
            audit: ledger.audit,
          }
        : {}),
      privacy: buildDirectory(employees),
      onWarning: (m) => console.warn(`warning: ${m}`),
    });
    console.log(
      `golden: ${cases.length} cases, provider ${llm.provider}, model ${llm.provider === 'mock' ? 'mock' : llm.modelFor('verify')}, prompt ${PROMPT_VERSION}` +
        (paid ? `, cap ${cap} USD, spent before ${spentBefore.toFixed(6)} USD` : ''),
    );
    if (llm.provider === 'mock') {
      console.log(
        'mock: one canned answer for every case, the accuracy below only proves the pipeline',
      );
    }
  } else {
    console.log(`golden: ${cases.length} cases, reference answers (no LLM call)`);
  }

  let passed = 0;
  let cost = 0;
  const misses: string[] = [];
  for (const c of cases) {
    const rules = goldenRules(c, dirs);
    const ctx = goldenContext(c, dirs, rules);
    const photos = goldenPhotos(ctx, (file) => readFileSync(resolve(goldenDir, file)));
    let answer: LlmAnswerInput | null = null;
    let note = '';
    if (reference) {
      answer = normalizeVerifyAnswer(c.reference_llm, ctx.order);
    } else if (llm) {
      const t0 = Date.now();
      try {
        const r = await llm.call({ purpose: 'verify', ...buildVerifyMessages(ctx, photos) });
        cost += r.costUsd;
        note = `${r.model}, ${r.usage.input_tokens} in / ${r.usage.output_tokens} out, ${r.costUsd.toFixed(4)} USD, ${((Date.now() - t0) / 1000).toFixed(1)} s`;
        const raw = r.data;
        answer = normalizeVerifyAnswer(raw, ctx.order);
        if (raw.code_consistent === false && answer.code_consistent) {
          note += `; шифр ${raw.suggested_code} совпадает с шифром наряда: code_consistent исправлен на true`;
        }
      } catch (e) {
        note = `LLM error ${isLlmError(e) ? e.code : 'UNKNOWN'}: ${e instanceof Error ? e.message : String(e)}; rules only`;
        if (isLlmError(e, 'BUDGET_EXCEEDED')) {
          console.error(note);
          return 1;
        }
      }
    }
    const got = goldenOutcome(rules, answer, threshold);
    const ok = goldenMatches(c.expected, got);
    if (ok) passed += 1;
    else misses.push(c.case);
    console.log(
      `${ok ? '✓' : '✕'} ${c.case.padEnd(22)} ожидали ${describe(c.expected.verdict, c.expected.needs_master_review).padEnd(36)} ` +
        `получили ${describe(got.verdict, got.needs_master_review)}, ${got.score} баллов` +
        (got.confidence !== null ? `, уверенность ${got.confidence}` : ''),
    );
    if (note) console.log(`      ${note}`);
    if (!ok) for (const line of explain(answer, got)) console.log(line);
  }

  console.log(`Точность: ${passed} из ${cases.length}`);
  if (misses.length > 0) console.log(`Не совпали: ${misses.join(', ')}`);
  if (llm?.provider === 'anthropic') {
    const spentAfter = await ledger.spentUsd();
    const billed = Math.round((spentAfter - spentBefore) * 1_000_000) / 1_000_000;
    console.log(
      `Стоимость: ${billed.toFixed(4)} USD (по ответам ${cost.toFixed(4)} USD); всего в журнале ${spentAfter.toFixed(4)} USD`,
    );
  }
  return reference && passed !== cases.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
