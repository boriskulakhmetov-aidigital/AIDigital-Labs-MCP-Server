import { TOOLS } from './_shared/tools.js';
import { AIDigitalLabsClient } from './_shared/client.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Extract API key from query param or Authorization header
  const url = new URL(req.url);
  const apiKey =
    url.searchParams.get('key') ||
    req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!apiKey?.startsWith('aidl_')) {
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32000, message: 'Missing or invalid API key' } },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  // Only accept POST for JSON-RPC
  if (req.method !== 'POST') {
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32600, message: 'Only POST is supported' } },
      { status: 405, headers: CORS_HEADERS },
    );
  }

  const client = new AIDigitalLabsClient(apiKey);

  // Parse JSON-RPC request
  let body: { method: string; params?: Record<string, any>; id?: string | number };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { method, params, id } = body;

  // Handle MCP protocol methods
  switch (method) {
    case 'initialize':
      return Response.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'aidigital-labs', version: '1.0.0' },
          },
        },
        { headers: CORS_HEADERS },
      );

    case 'notifications/initialized':
      // Client acknowledgement — no response needed per spec, but return empty OK
      return Response.json(
        { jsonrpc: '2.0', id, result: {} },
        { headers: CORS_HEADERS },
      );

    case 'tools/list':
      return Response.json(
        { jsonrpc: '2.0', id, result: { tools: TOOLS } },
        { headers: CORS_HEADERS },
      );

    case 'tools/call': {
      const { name, arguments: args } = params as { name: string; arguments: Record<string, any> };
      try {
        let result: Record<string, unknown>;
        const appMap: Record<string, string> = {
          website_audit: 'website-audit',
          neuromarketing_audit: 'neuromarketing',
          prompt_engineering: 'prompt-engineering',
          aio_scan: 'aio-optimization',
          synthetic_focus_group: 'synthetic-focus-group',
        };

        if (name === 'check_status') {
          result = await client.status(args.app, args.job_id);
        } else if (name === 'get_result') {
          result = await client.result(args.app, args.job_id, args.format || 'both');
        } else if (appMap[name]) {
          // Submit only — don't wait (Netlify Functions have a 10s timeout)
          // Claude will call check_status and get_result separately
          const submitResult = await client.submit(appMap[name], args);
          result = {
            ...submitResult,
            app: appMap[name],
            next_steps: `Job submitted. Use check_status with job_id="${submitResult.job_id}" and app="${appMap[name]}" to monitor progress. When status is "complete", use get_result to retrieve the report. Typical processing time: 3-15 minutes depending on the tool.`,
          };
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }

        return Response.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            },
          },
          { headers: CORS_HEADERS },
        );
      } catch (error: any) {
        return Response.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Error: ${error.message}` }],
              isError: true,
            },
          },
          { headers: CORS_HEADERS },
        );
      }
    }

    default:
      return Response.json(
        {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        },
        { status: 400, headers: CORS_HEADERS },
      );
  }
};

export const config = {
  path: '/mcp',
};
