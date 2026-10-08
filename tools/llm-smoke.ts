// npm run llm:smoke [-- --vision] [-- --mock]
// Calls Haiku 5.5 with the smoke schema; with --vision also Sonnet 5.5 with the app icon.
// Reads .secrets/anthropic.env (the key is never printed), appends every cost to .secrets/llm-ledger.json,
// and caps this run at 0.02 USD through the budget guard. No retries: a failed call is reported as is.
// Model ids: LLM_MODEL_FAST and LLM_MODEL_SMART (environment or anthropic.env) override the defaults.

import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { jsonFileLedger } from '../supabase/functions/_shared/ledger.ts';
import {
  createLlm,
  isLlmError,
  llmConfigFromEnv,
  type LlmCallRequest,
} from '../supabase/functions/_shared/llm.ts';
import { buildDirectory, type DirectoryEmployee } from '../supabase/functions/_shared/privacy.ts';
import type { LlmPurpose } from '../supabase/functions/_shared/schemas.ts';
import { readSecrets } from './lib/env.ts';

const RUN_CAP_USD = 0.02;
const root = resolve(import.meta.dirname, '..');
const ledgerPath = resolve(root, '.secrets', 'llm-ledger.json');
const iconPath = resolve(root, 'packages/design/assets/app-icon/app-icon-256.png');

const args = new Set(process.argv.slice(2));
const vision = args.has('--vision');
const mock = args.has('--mock');

const secrets = readSecrets('anthropic');
const get = (key: string): string | undefined => {
  if (key === 'LLM_PROVIDER') return mock ? 'mock' : 'anthropic';
  return process.env[key] || secrets[key] || undefined;
};

const employees = (
  JSON.parse(readFileSync(resolve(root, 'supabase/seed/directories.json'), 'utf8')) as {
    employees: DirectoryEmployee[];
  }
).employees;

const ledger = jsonFileLedger({
  read: async () => (existsSync(ledgerPath) ? readFile(ledgerPath, 'utf8') : null),
  write: async (text) => writeFile(ledgerPath, text, { mode: 0o600 }),
});

async function main(): Promise<number> {
  const base = llmConfigFromEnv(get);
  if (base.provider === 'anthropic' && !base.apiKey) {
    console.error('ANTHROPIC_API_KEY is missing in .secrets/anthropic.env');
    return 1;
  }
  const spentBefore = mock ? 0 : await ledger.spentUsd();
  const budget = base.budgetUsd ?? 4;
  const llm = createLlm({
    ...base,
    // The guard stops this run before it can pass the smoke cap or the account budget.
    budgetUsd: Math.min(budget, spentBefore + RUN_CAP_USD),
    spentUsd: () => (mock ? 0 : ledger.spentUsd()),
    ...(mock ? {} : { audit: ledger.audit }),
    privacy: buildDirectory(employees),
    onWarning: (m) => console.warn(`warning: ${m}`),
  });

  console.log(
    `provider ${llm.provider}; spent so far ${spentBefore.toFixed(6)} USD of ${budget} USD`,
  );

  const calls: { label: string; req: LlmCallRequest<LlmPurpose> }[] = [
    {
      label: 'fast',
      req: {
        purpose: 'smoke',
        messages: [{ role: 'user', content: 'Ответь JSON: ok true, echo «Рота готова»' }],
      },
    },
  ];
  if (vision) {
    if (!existsSync(iconPath)) {
      console.error(`missing ${iconPath}: run git merge main first`);
      return 1;
    }
    calls.push({
      label: 'vision',
      req: {
        purpose: 'smoke',
        model: llm.modelFor('verify'),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                media_type: 'image/png',
                data: readFileSync(iconPath).toString('base64'),
              },
              {
                type: 'text',
                text: 'Ответь JSON: ok true, echo: цвет знака на картинке, одно слово по-русски.',
              },
            ],
          },
        ],
      },
    });
  }

  let failed = 0;
  for (const { label, req } of calls) {
    const model = req.model ?? llm.modelFor(req.purpose);
    try {
      const r = await llm.call(req);
      console.log(
        `${label}: ${r.model} → ${JSON.stringify(r.data)}; tokens in ${r.usage.input_tokens}, out ${r.usage.output_tokens}; ` +
          `${r.costUsd.toFixed(6)} USD; ${r.latencyMs} ms; stop ${r.stopReason ?? 'n/a'}`,
      );
    } catch (e) {
      failed += 1;
      // Billed tokens of a failed call (refusal, max_tokens) are already in the ledger through the audit sink.
      const message = isLlmError(e) ? e.message : e instanceof Error ? e.message : String(e);
      console.error(`${label}: FAILED model ${model}: ${message}`);
    }
  }

  const spentAfter = mock ? 0 : await ledger.spentUsd();
  const billed = Math.round((spentAfter - spentBefore) * 1_000_000) / 1_000_000;
  console.log(
    `run total ${billed.toFixed(6)} USD (cap ${RUN_CAP_USD}); ledger total ${spentAfter.toFixed(6)} USD`,
  );
  if (billed > RUN_CAP_USD) {
    console.error(`run cost ${billed} USD is over the ${RUN_CAP_USD} USD cap`);
    return 1;
  }
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
