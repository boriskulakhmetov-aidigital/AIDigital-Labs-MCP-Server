/**
 * GET /.well-known/oauth-protected-resource
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 *
 * MCP clients read this to discover which authorization server to use.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const baseUrl = 'https://mcp.apps.aidigitallabs.com';

  return Response.json(
    {
      resource: `${baseUrl}/mcp`,
      authorization_servers: [`${baseUrl}`],
      scopes_supported: ['mcp:tools'],
      bearer_methods_supported: ['header'],
    },
    { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } },
  );
};

export const config = {
  path: '/.well-known/oauth-protected-resource',
};
