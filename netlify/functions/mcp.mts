/**
 * MCP Streamable HTTP Transport — remote MCP server for Claude Desktop / Claude Code.
 *
 * Install:
 *   Claude Desktop → Settings → Developer → Edit Config:
 *   {
 *     "mcpServers": {
 *       "aidigital-labs": {
 *         "url": "https://mcp.apps.aidigitallabs.com/mcp",
 *         "headers": { "Authorization": "Bearer aidl_YOUR_KEY" }
 *       }
 *     }
 *   }
 *
 *   Claude Code → .mcp.json:
 *   {
 *     "mcpServers": {
 *       "aidigital-labs": {
 *         "type": "url",
 *         "url": "https://mcp.apps.aidigitallabs.com/mcp",
 *         "headers": { "Authorization": "Bearer aidl_YOUR_KEY" }
 *       }
 *     }
 *   }
 */
import { TOOLS } from './_shared/tools.js';
import { AIDigitalLabsClient } from './_shared/client.js';

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

/** Extract API key from Authorization header or ?key= query param. */
function extractApiKey(req: Request): string | null {
  // Standard: Authorization: Bearer aidl_xxx
  const auth = req.headers.get('Authorization');
  if (auth) {
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (token.startsWith('aidl_')) return token;
  }
  // Fallback: ?key=aidl_xxx
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (key?.startsWith('aidl_')) return key;
  return null;
}

/* ---------- tool execution ---------- */

const APP_MAP: Record<string, string> = {
  website_audit: 'website-audit',
  neuromarketing_audit: 'neuromarketing',
  prompt_engineering: 'prompt-engineering',
  aio_scan: 'aio-optimization',
  synthetic_focus_group: 'synthetic-focus-group',
};

const TYPICAL_SECONDS: Record<string, number> = {
  'website-audit': 300,
  'neuromarketing': 480,
  'prompt-engineering': 120,
  'aio-optimization': 600,
  'synthetic-focus-group': 480,
};

async function executeTool(
  client: AIDigitalLabsClient,
  name: string,
  args: Record<string, any>,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
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
    } else if (APP_MAP[name]) {
      const app = APP_MAP[name];
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

  // GET — SSE stream for server-initiated messages (not used, return 405)
  if (req.method === 'GET') {
    return jsonResponse(
      { jsonrpc: '2.0', error: { code: -32000, message: 'SSE not supported on this stateless server. Use POST.' } },
      405,
    );
  }

  // DELETE — end session (stateless, just acknowledge)
  if (req.method === 'DELETE') {
    return new Response(null, { status: 200, headers: CORS });
  }

  // Only POST from here
  if (req.method !== 'POST') {
    return jsonResponse(
      { jsonrpc: '2.0', error: { code: -32600, message: 'Method not allowed' } },
      405,
    );
  }

  // Authenticate
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return jsonResponse(
      { jsonrpc: '2.0', error: { code: -32000, message: 'Missing or invalid API key. Use Authorization: Bearer aidl_YOUR_KEY' } },
      401,
    );
  }

  // Parse JSON-RPC request
  let body: { jsonrpc?: string; method: string; params?: any; id?: string | number | null };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null },
      400,
    );
  }

  const { method, params, id } = body;

  // Notifications have no id — return 202 Accepted with no body
  const isNotification = id === undefined || id === null;

  // Generate a session ID (stateless — new each request, but clients can send one back)
  const sessionId = req.headers.get('Mcp-Session-Id') || crypto.randomUUID();
  const sessionHeader = { 'Mcp-Session-Id': sessionId };

  switch (method) {
    /* ---- lifecycle ---- */

    case 'initialize':
      return jsonResponse(
        {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: 'aidigital-labs', version: '1.2.0' },
          },
        },
        200,
        sessionHeader,
      );

    case 'notifications/initialized':
      // Notification — no response body per JSON-RPC 2.0 spec
      return new Response(null, { status: 202, headers: { ...CORS, ...sessionHeader } });

    /* ---- tools ---- */

    case 'tools/list':
      return jsonResponse(
        { jsonrpc: '2.0', id, result: { tools: TOOLS } },
        200,
        sessionHeader,
      );

    case 'tools/call': {
      const { name, arguments: args } = params as { name: string; arguments: Record<string, any> };
      const client = new AIDigitalLabsClient(apiKey);
      const result = await executeTool(client, name, args);
      return jsonResponse(
        { jsonrpc: '2.0', id, result },
        200,
        sessionHeader,
      );
    }

    /* ---- ping ---- */

    case 'ping':
      return jsonResponse(
        { jsonrpc: '2.0', id, result: {} },
        200,
        sessionHeader,
      );

    /* ---- unknown ---- */

    default:
      if (isNotification) {
        // Unknown notification — accept silently
        return new Response(null, { status: 202, headers: { ...CORS, ...sessionHeader } });
      }
      return jsonResponse(
        { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } },
        200, // Per spec, method-not-found is still 200 with error in body
        sessionHeader,
      );
  }
};

export const config = {
  path: '/mcp',
};
