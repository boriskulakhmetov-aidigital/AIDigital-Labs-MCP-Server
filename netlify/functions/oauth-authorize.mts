/**
 * GET /oauth/authorize
 * OAuth 2.0 authorization endpoint — serves the Clerk-authenticated consent page.
 *
 * Query params (from Claude):
 *   response_type=code
 *   client_id=claude (or any registered client)
 *   redirect_uri=https://claude.ai/api/mcp/auth_callback
 *   scope=mcp:tools
 *   state=<opaque>
 *
 * POST /oauth/authorize
 * Called by the consent page JS after Clerk authentication.
 * Generates an auth code and returns the redirect URL.
 */
import { createClient } from '@supabase/supabase-js';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { sha256, generateToken } from './_shared/crypto.js';

const ALLOWED_REDIRECT_PREFIXES = [
  'https://claude.ai/',
  'https://claude.com/',
  'http://localhost',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);

  // ---------- POST: generate auth code after consent ----------
  if (req.method === 'POST') {
    let body: {
      clerk_token: string;
      redirect_uri: string;
      client_id: string;
      state: string;
      scope: string;
    };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid body' }, { status: 400, headers: CORS });
    }

    // Verify Clerk JWT
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      return Response.json({ error: 'Server misconfigured' }, { status: 500, headers: CORS });
    }

    let userId: string;
    let email: string | null = null;
    try {
      const payload = await verifyToken(body.clerk_token, { secretKey });
      userId = payload.sub;
      // Get email
      try {
        const clerk = createClerkClient({ secretKey });
        const user = await clerk.users.getUser(userId);
        const primary = user.emailAddresses.find((e: any) => e.id === user.primaryEmailAddressId);
        email = primary?.emailAddress ?? null;
      } catch { /* non-fatal */ }
    } catch {
      return Response.json({ error: 'Invalid authentication' }, { status: 401, headers: CORS });
    }

    // Validate redirect URI
    const validRedirect = ALLOWED_REDIRECT_PREFIXES.some((p) => body.redirect_uri.startsWith(p));
    if (!validRedirect) {
      return Response.json({ error: 'Invalid redirect_uri' }, { status: 400, headers: CORS });
    }

    // Check user exists and get org
    const supabase = getSupabase();
    const { data: appUser } = await supabase
      .from('app_users')
      .select('clerk_id, org_id, status, email')
      .eq('clerk_id', userId)
      .maybeSingle();

    if (!appUser || appUser.status === 'blocked') {
      return Response.json(
        { error: 'no_account', message: 'No AIDigital Labs account found. Sign up at aidigitallabs.com' },
        { status: 403, headers: CORS },
      );
    }

    // Check org tier
    let tier = 'tier_0';
    let orgName = '';
    if (appUser.org_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('tier, name, trial_expires_at')
        .eq('id', appUser.org_id)
        .single();
      if (org) {
        tier = org.tier || 'tier_0';
        orgName = org.name || '';
        // Check trial expiry
        if (tier === 'tier_0' && org.trial_expires_at && new Date(org.trial_expires_at) < new Date()) {
          return Response.json(
            { error: 'trial_expired', message: 'Your trial has expired. Contact sales to upgrade.' },
            { status: 403, headers: CORS },
          );
        }
      }
    }

    // Generate auth code (short-lived, 5 min)
    const code = generateToken('mc');
    await supabase.from('mcp_oauth_codes').insert({
      code,
      user_id: userId,
      org_id: appUser.org_id,
      redirect_uri: body.redirect_uri,
      client_id: body.client_id,
      scope: body.scope || 'mcp:tools',
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    // Return redirect URL with code
    const redirectUrl = new URL(body.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (body.state) redirectUrl.searchParams.set('state', body.state);

    return Response.json(
      { redirect_url: redirectUrl.toString(), tier, org_name: orgName },
      { status: 200, headers: CORS },
    );
  }

  // ---------- GET: serve consent page ----------
  const responseType = url.searchParams.get('response_type');
  const clientId = url.searchParams.get('client_id') || 'claude';
  const redirectUri = url.searchParams.get('redirect_uri') || '';
  const scope = url.searchParams.get('scope') || 'mcp:tools';
  const state = url.searchParams.get('state') || '';

  if (responseType !== 'code') {
    return new Response('Invalid response_type. Expected "code".', { status: 400 });
  }

  const clerkPubKey = process.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_live_Y2xlcmsuYXV0aC5haWRpZ2l0YWxsYWJzLmNvbSQ';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect to AI Digital Labs</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a; color: #e0e0e0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .card {
      background: #111; border: 1px solid #222; border-radius: 16px;
      padding: 40px; max-width: 480px; width: 100%; text-align: center;
    }
    .logo { color: #0009DC; font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 32px; }
    .tools-list {
      text-align: left; margin: 24px 0; padding: 16px;
      background: #0a0a0a; border-radius: 8px; border: 1px solid #1a1a1a;
    }
    .tools-list h3 { color: #999; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .tool-item { padding: 6px 0; color: #ccc; font-size: 0.9rem; display: flex; align-items: center; gap: 8px; }
    .tool-dot { width: 6px; height: 6px; border-radius: 50%; background: #0009DC; flex-shrink: 0; }
    .tier-badge {
      display: inline-block; padding: 4px 12px; border-radius: 12px;
      font-size: 0.8rem; margin: 16px 0;
    }
    .tier-badge.active { background: #0009DC22; color: #7b8cff; }
    .tier-badge.trial { background: #dc910022; color: #dcb100; }
    .btn {
      display: block; width: 100%; padding: 14px; border: none; border-radius: 10px;
      font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 16px; transition: all 0.15s;
    }
    .btn-primary { background: #0009DC; color: #fff; }
    .btn-primary:hover { background: #0007b3; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #1a1a1a; color: #999; }
    .btn-secondary:hover { background: #222; color: #ccc; }
    .status { margin-top: 16px; font-size: 0.85rem; color: #666; }
    .status.error { color: #dc3545; }
    .clerk-container { margin: 24px 0; }
    #sign-in-step, #consent-step, #loading-step, #error-step { display: none; }
    #loading-step { display: block; }
    .spinner { margin: 40px auto; width: 32px; height: 32px; border: 3px solid #222; border-top-color: #0009DC; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .usage-info { font-size: 0.85rem; color: #666; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">AI Digital Labs</div>
    <div class="subtitle">Connect to Claude</div>

    <div id="loading-step">
      <div class="spinner"></div>
      <p class="status">Checking authentication...</p>
    </div>

    <div id="sign-in-step">
      <p style="color:#999; margin-bottom:16px;">Sign in with your AI Digital Labs account to connect.</p>
      <div id="clerk-sign-in" class="clerk-container"></div>
      <p class="usage-info">Don't have an account? <a href="https://aidigitallabs.com" style="color:#7b8cff;">Get started</a></p>
    </div>

    <div id="consent-step">
      <p style="color:#999;">Allow <strong>Claude</strong> to use your AI Digital Labs tools?</p>
      <div id="user-info" style="margin:16px 0; font-size:0.9rem;"></div>
      <div class="tools-list">
        <h3>Tools Claude will access</h3>
        <div class="tool-item"><span class="tool-dot"></span>Website Audit</div>
        <div class="tool-item"><span class="tool-dot"></span>Neuromarketing Audit</div>
        <div class="tool-item"><span class="tool-dot"></span>Prompt Engineering</div>
        <div class="tool-item"><span class="tool-dot"></span>AIO Optimization</div>
        <div class="tool-item"><span class="tool-dot"></span>Synthetic Focus Group</div>
      </div>
      <p class="usage-info">Usage will count toward your plan limits.</p>
      <button id="authorize-btn" class="btn btn-primary">Authorize</button>
      <button id="cancel-btn" class="btn btn-secondary" onclick="window.close()">Cancel</button>
      <p id="consent-status" class="status"></p>
    </div>

    <div id="error-step">
      <p style="color:#dc3545; font-size:1.1rem; margin-bottom:12px;" id="error-title">Connection Failed</p>
      <p style="color:#999;" id="error-message"></p>
      <a href="https://aidigitallabs.com" class="btn btn-primary" style="display:inline-block; text-decoration:none; margin-top:24px;">Visit AI Digital Labs</a>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.min.js"></script>
  <script>
    const PARAMS = {
      clientId: ${JSON.stringify(clientId)},
      redirectUri: ${JSON.stringify(redirectUri)},
      scope: ${JSON.stringify(scope)},
      state: ${JSON.stringify(state)},
    };

    function showStep(id) {
      ['loading-step','sign-in-step','consent-step','error-step'].forEach(s => {
        document.getElementById(s).style.display = s === id ? 'block' : 'none';
      });
    }

    function showError(title, message) {
      document.getElementById('error-title').textContent = title;
      document.getElementById('error-message').textContent = message;
      showStep('error-step');
    }

    async function init() {
      try {
        const clerk = new window.Clerk(${JSON.stringify(clerkPubKey)});
        await clerk.load();

        if (clerk.user) {
          showConsent(clerk);
        } else {
          showStep('sign-in-step');
          clerk.mountSignIn(document.getElementById('clerk-sign-in'), {
            afterSignInUrl: window.location.href,
            appearance: {
              baseTheme: undefined,
              variables: { colorPrimary: '#0009DC' },
            },
          });
          // Watch for sign-in completion
          clerk.addListener(({ user }) => {
            if (user) showConsent(clerk);
          });
        }
      } catch (err) {
        showError('Configuration Error', 'Unable to initialize authentication.');
      }
    }

    async function showConsent(clerk) {
      const user = clerk.user;
      const email = user.primaryEmailAddress?.emailAddress || '';
      document.getElementById('user-info').innerHTML =
        '<span style="color:#7b8cff;">' + email + '</span>';
      showStep('consent-step');

      document.getElementById('authorize-btn').onclick = () => authorize(clerk);
    }

    async function authorize(clerk) {
      const btn = document.getElementById('authorize-btn');
      const status = document.getElementById('consent-status');
      btn.disabled = true;
      btn.textContent = 'Connecting...';
      status.textContent = '';

      try {
        // Get Clerk session token
        const token = await clerk.session.getToken();
        if (!token) throw new Error('No session token');

        // Call our backend to generate auth code
        const res = await fetch('/oauth/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clerk_token: token,
            redirect_uri: PARAMS.redirectUri,
            client_id: PARAMS.clientId,
            state: PARAMS.state,
            scope: PARAMS.scope,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.error === 'no_account') {
            showError('No Account Found', data.message || 'Sign up at aidigitallabs.com');
          } else if (data.error === 'trial_expired') {
            showError('Trial Expired', data.message || 'Contact sales to upgrade.');
          } else {
            throw new Error(data.message || data.error || 'Authorization failed');
          }
          return;
        }

        // Redirect to Claude with auth code
        window.location.href = data.redirect_url;
      } catch (err) {
        status.textContent = err.message || 'Authorization failed';
        status.className = 'status error';
        btn.disabled = false;
        btn.textContent = 'Authorize';
      }
    }

    init();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html', ...CORS },
  });
};

export const config = {
  path: '/oauth/authorize',
};
