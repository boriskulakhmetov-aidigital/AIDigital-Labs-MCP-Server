/**
 * MCP Streamable HTTP Transport — remote MCP server for Claude Desktop / Claude Code.
 *
 * Authentication methods (in priority order):
 *   1. OAuth Bearer token (from Claude marketplace: Authorization: Bearer aidl_at_xxx)
 *   2. API key (direct: Authorization: Bearer aidl_xxx or ?key=aidl_xxx)
 *
 * OAuth tokens are validated against mcp_oauth_tokens with tier/access checks.
 * API keys are validated the old way (direct to app endpoints).
 */
import { createClient } from '@supabase/supabase-js';
import { TOOLS } from './_shared/tools.js';
import { AIDigitalLabsClient } from './_shared/client.js';
import { sha256 } from './_shared/crypto.js';

/* ---------- helpers ---------- */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/* ---------- auth types ---------- */

interface AuthResult {
  valid: boolean;
  method: 'oauth' | 'apikey';
  userId?: string;
  orgId?: string;
  tier?: string;
  apiKey?: string; // only for apikey method (passed to AIDigitalLabsClient)
  error?: string;
}

/** Authenticate the request — tries OAuth token first, then API key. */
async function authenticate(req: Request): Promise<AuthResult> {
  const auth = req.headers.get('Authorization');
  const url = new URL(req.url);

  // Extract token from header or query param
  let token = auth?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!token) token = url.searchParams.get('key') || '';
  if (!token) return { valid: false, method: 'apikey', error: 'Missing authentication' };

  // OAuth access token (aidl_at_ prefix)
  if (token.startsWith('aidl_at_')) {
    const supabase = getSupabase();
    const tokenHash = await sha256(token);
    const { data } = await supabase.rpc('validate_mcp_token', { p_token_hash: tokenHash });
    const row = Array.isArray(data) ? data[0] : data;

    if (!row?.valid) {
      return { valid: false, method: 'oauth', error: row?.reason || 'Invalid or expired token' };
    }

    return {
      valid: true,
      method: 'oauth',
      userId: row.user_id,
      orgId: row.org_id,
      tier: row.tier,
      apiKey: undefined, // OAuth users don't have an API key — we use internal service key
    };
  }

  // API key (aidl_ prefix, no _at_)
  if (token.startsWith('aidl_')) {
    return { valid: true, method: 'apikey', apiKey: token };
  }

  return { valid: false, method: 'apikey', error: 'Invalid token format' };
}

/* ---------- tool annotations ---------- */

/** Add MCP tool annotations for the marketplace. */
function annotatedTools() {
  return TOOLS.map((tool) => {
    const readOnly = tool.name === 'check_status' || tool.name === 'get_result';
    return {
      ...tool,
      annotations: {
        title: tool.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        readOnlyHint: readOnly,
        destructiveHint: false,
        idempotentHint: readOnly,
        openWorldHint: true,
      },
    };
  });
}

/* ---------- access control for OAuth users ---------- */

const TOOL_APP_MAP: Record<string, string> = {
  website_audit: 'website-audit',
  neuromarketing_audit: 'neuromarketing',
  prompt_engineering: 'prompt-engineering',
  aio_scan: 'aio-optimization',
  synthetic_focus_group: 'synthetic-focus-group',
};

/**
 * For OAuth users, check tier-based access before executing a tool.
 * API key users are checked by the downstream app (existing flow).
 */
async function checkToolAccess(
  auth: AuthResult,
  toolName: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // API key users — access checked by the target app
  if (auth.method === 'apikey') return { allowed: true };

  // Non-submission tools always allowed
  if (!TOOL_APP_MAP[toolName]) return { allowed: true };

  const app = TOOL_APP_MAP[toolName];
  const supabase = getSupabase();

  // Call the existing check_access RPC
  const { data, error } = await supabase.rpc('check_access', {
    p_user_id: auth.userId,
    p_app: app,
  });

  if (error || !data) {
    return { allowed: false, reason: 'Unable to verify access. Contact support.' };
  }

  const result = Array.isArray(data) ? data[0] : data;

  if (!result.allowed) {
    const reason = result.reason || 'Access denied';
    // Friendly messages based on common denial reasons
    if (reason.includes('limit')) {
      return {
        allowed: false,
        reason: `You've reached your ${app} limit for this period (${result.user_used}/${result.user_limit}). Upgrade your plan at aidigitallabs.com for more.`,
      };
    }
    if (reason.includes('trial')) {
      return {
        allowed: false,
        reason: 'Your trial has expired. Upgrade at aidigitallabs.com to continue.',
      };
    }
    return { allowed: false, reason };
  }

  return { allowed: true };
}

/**
 * For OAuth users, record usage after successful tool execution.
 */
async function recordToolUsage(auth: AuthResult, toolName: string): Promise<void> {
  if (auth.method !== 'oauth' || !TOOL_APP_MAP[toolName]) return;
  const supabase = getSupabase();
  await supabase.rpc('record_usage', {
    p_user_id: auth.userId,
    p_org_id: auth.orgId || null,
    p_app: TOOL_APP_MAP[toolName],
  }).catch(() => { /* non-fatal */ });
}

/* ---------- tool execution ---------- */

const TYPICAL_SECONDS: Record<string, number> = {
  'website-audit': 300,
  'neuromarketing': 480,
  'prompt-engineering': 120,
  'aio-optimization': 600,
  'synthetic-focus-group': 480,
};

async function executeTool(
  auth: AuthResult,
  name: string,
  args: Record<string, any>,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  // For OAuth users, we need an internal API key to call the app endpoints
  // Use the INTERNAL_API_KEY env var (a service-level key with no rate limits)
  const apiKey = auth.apiKey || process.env.INTERNAL_API_KEY || '';
  if (!apiKey) {
    return {
      content: [{ type: 'text', text: 'Error: Server misconfigured — no internal API key for OAuth flow.' }],
      isError: true,
    };
  }

  const client = new AIDigitalLabsClient(apiKey);

  try {
    let result: Record<string, unknown>;

    if (name === 'check_status') {
      result = await client.status(args.app, args.job_id);
      const status = result.status as string;
      const meta = result.meta as any;
      let est: number | null = null;
      if (meta?.steps_done != null && meta?.total_steps) {
        const ratio = (meta.steps_done as number) / (meta.total_steps as number);
        est = Math.round((TYPICAL_SECONDS[args.app] || 300) * (1 - ratio));
      }
      (result as any).estimated_seconds_remaining = est;
      (result as any).instructions =
        status === 'complete'
          ? `Job complete! Call get_result with job_id="${args.job_id}" and app="${args.app}" to retrieve the full report.`
          : status === 'error'
            ? `Job failed: ${(result as any).error || 'unknown error'}`
            : `Still processing. Call check_status again in ${Math.min(est || 30, 30)} seconds.`;
    } else if (name === 'get_result') {
      result = await client.result(args.app, args.job_id, args.format || 'both');
    } else if (TOOL_APP_MAP[name]) {
      const app = TOOL_APP_MAP[name];
      const submitResult = await client.submit(app, args);
      result = {
        ...submitResult,
        app,
        next_steps: `Job submitted. Use check_status with job_id="${submitResult.job_id}" and app="${app}" to monitor progress. When status is "complete", use get_result to retrieve the report. Typical processing time: ${Math.round((TYPICAL_SECONDS[app] || 300) / 60)}-${Math.round((TYPICAL_SECONDS[app] || 300) / 60) + 3} minutes.`,
      };
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error: any) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
}

/* ---------- main handler ---------- */

export default async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // GET — SSE not supported on stateless server
  if (req.method === 'GET') {
    return jsonResponse(
      { jsonrpc: '2.0', error: { code: -32000, message: 'SSE not supported. Use POST.' } },
      405,
    );
  }

  // DELETE — end session
  if (req.method === 'DELETE') {
    return new Response(null, { status: 200, headers: CORS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ jsonrpc: '2.0', error: { code: -32600, message: 'Method not allowed' } }, 405);
  }

  // Authenticate
  const auth = await authenticate(req);
  if (!auth.valid) {
    // Return 401 with OAuth discovery header per MCP spec
    // Claude will look up /.well-known/oauth-authorization-server and start the OAuth flow
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: auth.error || 'Unauthorized' } }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.apps.aidigitallabs.com/.well-known/oauth-protected-resource"',
          ...CORS,
        },
      },
    );
  }

  // Parse JSON-RPC
  let body: { jsonrpc?: string; method: string; params?: any; id?: string | number | null };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }, 400);
  }

  const { method, params, id } = body;
  const isNotification = id === undefined || id === null;

  // Session header (stateless — echo or generate)
  const sessionId = req.headers.get('Mcp-Session-Id') || crypto.randomUUID();
  const sessionHeader = { 'Mcp-Session-Id': sessionId };

  switch (method) {
    case 'initialize':
      return jsonResponse(
        {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: 'aidigital-labs', version: '2.0.0' },
          },
        },
        200,
        sessionHeader,
      );

    case 'notifications/initialized':
      return new Response(null, { status: 202, headers: { ...CORS, ...sessionHeader } });

    case 'tools/list':
      return jsonResponse(
        { jsonrpc: '2.0', id, result: { tools: annotatedTools() } },
        200,
        sessionHeader,
      );

    case 'tools/call': {
      const { name, arguments: args } = params as { name: string; arguments: Record<string, any> };

      // Access control for OAuth users
      const access = await checkToolAccess(auth, name);
      if (!access.allowed) {
        return jsonResponse(
          {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Access denied: ${access.reason}` }],
              isError: true,
            },
          },
          200,
          sessionHeader,
        );
      }

      const result = await executeTool(auth, name, args);

      // Record usage for OAuth users (only on successful submission)
      if (!result.isError && TOOL_APP_MAP[name]) {
        await recordToolUsage(auth, name);
      }

      return jsonResponse({ jsonrpc: '2.0', id, result }, 200, sessionHeader);
    }

    case 'ping':
      return jsonResponse({ jsonrpc: '2.0', id, result: {} }, 200, sessionHeader);

    default:
      if (isNotification) {
        return new Response(null, { status: 202, headers: { ...CORS, ...sessionHeader } });
      }
      return jsonResponse(
        { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } },
        200,
        sessionHeader,
      );
  }
};

export const config = {
  path: '/mcp',
};
