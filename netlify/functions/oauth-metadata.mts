/**
 * GET /.well-known/oauth-authorization-server
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 *
 * Claude Desktop/Code discovers this automatically when the MCP endpoint returns 401.
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
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      scopes_supported: ['mcp:tools'],
      code_challenge_methods_supported: ['S256'],
    },
    { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } },
  );
};

export const config = {
  path: '/.well-known/oauth-authorization-server',
};
