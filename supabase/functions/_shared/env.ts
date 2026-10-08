// Environment access without Deno or Node globals: callers pass a getter
// (`(k) => Deno.env.get(k)` in Edge Functions, `(k) => process.env[k]` in scripts).

export type EnvGetter = (key: string) => string | undefined;

/** The project secret key: SUPABASE_SECRET_KEYS (JSON, key `default`), else the legacy SUPABASE_SERVICE_ROLE_KEY. */
export function readSecretKey(get: EnvGetter): string {
  const keys = get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, unknown>;
      if (typeof parsed.default === 'string' && parsed.default) return parsed.default;
    } catch {
      // fall through to the legacy key
    }
  }
  return get('SUPABASE_SERVICE_ROLE_KEY') ?? get('SUPABASE_SECRET_KEY') ?? '';
}
