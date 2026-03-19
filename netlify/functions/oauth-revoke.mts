/**
 * POST /oauth/revoke
 * Revoke an OAuth access or refresh token.
 */
import { createClient } from '@supabase/supabase-js';
import { sha256 } from './_shared/crypto.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: CORS });
  }

  let params: Record<string, string>;
  const ct = req.headers.get('Content-Type') || '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    params = Object.fromEntries(new URLSearchParams(await req.text()));
  } else {
    try { params = await req.json(); } catch {
      return Response.json({ error: 'invalid_request' }, { status: 400, headers: CORS });
    }
  }

  const token = params.token;
  if (!token) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers: CORS });
  }

  const supabase = getSupabase();
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();

  // Try revoking as access token
  const { count: accessCount } = await supabase
    .from('mcp_oauth_tokens')
    .update({ revoked_at: now })
    .eq('access_token_hash', tokenHash)
    .is('revoked_at', null)
    .select('id', { count: 'exact', head: true });

  // Try revoking as refresh token if not found as access token
  if (!accessCount) {
    await supabase
      .from('mcp_oauth_tokens')
      .update({ revoked_at: now })
      .eq('refresh_token_hash', tokenHash)
      .is('revoked_at', null);
  }

  // Per RFC 7009, always return 200 even if token not found
  return new Response(null, { status: 200, headers: CORS });
};

export const config = {
  path: '/oauth/revoke',
};
