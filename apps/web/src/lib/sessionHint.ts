// A synchronous guess at the entry point: does this browser hold a signed in panel session? Only key names are read,
// never values. Keys: MockApi 'rota.mock.session', SupabaseApi 'rota.supabase.session', supabase-js
// 'sb-<project ref>-auth-token'. All of them are removed on sign out. Blocked storage counts as signed out.
export function hasStoredSession(): boolean {
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i) ?? '';
      if (key === 'rota.mock.session' || key === 'rota.supabase.session' || /^sb-.+-auth-token$/.test(key)) {
        return true;
      }
    }
  } catch {
    // private window or blocked site data
  }
  return false;
}

/** `/` for a signed out visitor: boot the landing alone, without the API client and the router. */
export function isLandingVisit(): boolean {
  return window.location.pathname === '/' && !hasStoredSession();
}
