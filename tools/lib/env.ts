import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Reads KEY=value lines from a dotenv style file. Never logs values. */
export function readEnvFile(path: string): Record<string, string> {
  const file = resolve(path);
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Loads one of the git ignored files in `.secrets/` by name, for example `supabase`. */
export function readSecrets(name: string): Record<string, string> {
  return readEnvFile(resolve(import.meta.dirname, '..', '..', '.secrets', `${name}.env`));
}
