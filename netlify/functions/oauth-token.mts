/**
 * POST /oauth/token
 * OAuth 2.0 token endpoint.
 *
 * Supports:
 *   grant_type=authorization_code  — exchange auth code for access + refresh tokens
 *   grant_type=refresh_token       — refresh an expired access token
 */
import { createClient } from '@supabase/supabase-js';
import { sha256, generateToken } from './_shared/crypto.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ACCESS_TOKEN_TTL = 60 * 60 * 1000;          // 1 hour
const REFRESH_TOKEN_TTL = 90 * 24 * 60 * 60 * 1000; // 90 days

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

  // Parse form-encoded or JSON body (OAuth spec uses form-encoded)
  let params: Record<string, string>;
  const ct = req.headers.get('Content-Type') || '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    params = Object.fromEntries(new URLSearchParams(text));
  } else {
    try {
      params = await req.json();
    } catch {
      return Response.json({ error: 'invalid_request' }, { status: 400, headers: CORS });
    }
  }

  const grantType = params.grant_type;
  const supabase = getSupabase();

  // ---------- authorization_code ----------
  if (grantType === 'authorization_code') {
    const { code, redirect_uri, client_id } = params;
    if (!code) {
      return Response.json({ error: 'invalid_request', error_description: 'Missing code' }, { status: 400, headers: CORS });
    }

    // Look up and validate the auth code
    const { data: authCode } = await supabase
      .from('mcp_oauth_codes')
      .select('*')
      .eq('code', code)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!authCode) {
      return Response.json({ error: 'invalid_grant', error_description: 'Code expired or already used' }, { status: 400, headers: CORS });
    }

    // Validate redirect_uri matches
    if (redirect_uri && authCode.redirect_uri !== redirect_uri) {
      return Response.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, { status: 400, headers: CORS });
    }

    // Mark code as used
    await supabase
      .from('mcp_oauth_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('code', code);

    // Generate tokens
    const accessToken = generateToken('aidl_at');
    const refreshToken = generateToken('aidl_rt');
    const accessHash = await sha256(accessToken);
    const refreshHash = await sha256(refreshToken);
    const now = new Date();

    await supabase.from('mcp_oauth_tokens').insert({
      user_id: authCode.user_id,
      org_id: authCode.org_id,
      access_token_hash: accessHash,
      refresh_token_hash: refreshHash,
      scope: authCode.scope || 'mcp:tools',
      expires_at: new Date(now.getTime() + ACCESS_TOKEN_TTL).toISOString(),
      refresh_expires_at: new Date(now.getTime() + REFRESH_TOKEN_TTL).toISOString(),
    });

    return Response.json(
      {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL / 1000,
        refresh_token: refreshToken,
        scope: authCode.scope || 'mcp:tools',
      },
      { status: 200, headers: { ...CORS, 'Cache-Control': 'no-store' } },
    );
  }

  // ---------- refresh_token ----------
  if (grantType === 'refresh_token') {
    const { refresh_token } = params;
    if (!refresh_token) {
      return Response.json({ error: 'invalid_request', error_description: 'Missing refresh_token' }, { status: 400, headers: CORS });
    }

    const refreshHash = await sha256(refresh_token);

    // Find the existing token row
    const { data: existing } = await supabase
      .from('mcp_oauth_tokens')
      .select('*')
      .eq('refresh_token_hash', refreshHash)
      .is('revoked_at', null)
      .gt('refresh_expires_at', new Date().toISOString())
      .maybeSingle();

    if (!existing) {
      return Response.json({ error: 'invalid_grant', error_description: 'Refresh token expired or revoked' }, { status: 400, headers: CORS });
    }

    // Revoke old token pair
    await supabase
      .from('mcp_oauth_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', existing.id);

    // Issue new token pair (token rotation)
    const newAccessToken = generateToken('aidl_at');
    const newRefreshToken = generateToken('aidl_rt');
    const newAccessHash = await sha256(newAccessToken);
    const newRefreshHash = await sha256(newRefreshToken);
    const now = new Date();

    await supabase.from('mcp_oauth_tokens').insert({
      user_id: existing.user_id,
      org_id: existing.org_id,
      access_token_hash: newAccessHash,
      refresh_token_hash: newRefreshHash,
      scope: existing.scope,
      expires_at: new Date(now.getTime() + ACCESS_TOKEN_TTL).toISOString(),
      refresh_expires_at: new Date(now.getTime() + REFRESH_TOKEN_TTL).toISOString(),
    });

    return Response.json(
      {
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL / 1000,
        refresh_token: newRefreshToken,
        scope: existing.scope,
      },
      { status: 200, headers: { ...CORS, 'Cache-Control': 'no-store' } },
    );
  }

  return Response.json(
    { error: 'unsupported_grant_type', error_description: `Unsupported: ${grantType}` },
    { status: 400, headers: CORS },
  );
};

export const config = {
  path: '/oauth/token',
};
