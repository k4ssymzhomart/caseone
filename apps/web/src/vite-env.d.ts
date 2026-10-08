/// <reference types="vite/client" />

// Public build time values only (they ship inside the bundle). Never put a secret here.
interface ImportMetaEnv {
  /** 'mock' (default) or 'supabase'. */
  readonly VITE_API_MODE?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** 'false' hides the demo account chips on the login page. */
  readonly VITE_DEMO_ACCOUNTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
