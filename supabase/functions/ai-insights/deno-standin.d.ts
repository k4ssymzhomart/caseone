// Type stand-in for the two Deno globals index.ts uses, so `tsc -p supabase/functions/ai-verify` checks the
// function without a Deno install. Never imported by the function, so it is not part of the deploy.

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
  }
  const env: Env;
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}
