// CORS for every Edge Function (CLAUDE.md §2): answer OPTIONS, add the headers to every response.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** Returns the preflight response for OPTIONS, otherwise null. */
export function handleOptions(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { status: 200, headers: corsHeaders });
}

/** A JSON response with the CORS headers. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}
