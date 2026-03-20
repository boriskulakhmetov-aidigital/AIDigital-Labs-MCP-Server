# MCP Server

> **Repo:** `boriskulakhmetov-aidigital/AIDigital-Labs-MCP-Server`

Part of the AI Digital Labs portfolio. See the Design System repo CLAUDE.md for full architecture reference.

## SDLC & Deploy Process

**IMPORTANT: Follow this process for ALL changes. No exceptions.**

### Environments

| Environment | Branch | Supabase | URLs |
|-------------|--------|----------|------|
| Local dev | any | staging (rqpvrikighrlgjxzkqde) | localhost:5173 |
| Staging | `develop` | staging (rqpvrikighrlgjxzkqde) | develop--{site}.netlify.app |
| Production | `main` | production (njwzbptrhgznozpndcxf) | {app}.apps.aidigitallabs.com |

### Workflow

1. **All work on `develop` branch** — never push directly to `main`
2. **Push to develop** → staging auto-deploys with staging Supabase
3. **E2E testing optional** during development (run at discretion)
4. **"Ship it" triggers mandatory pipeline:**
   - Pre-deploy: E2E smoke + workflow on staging (must pass)
   - Merge develop → main
   - Post-deploy: E2E smoke + workflow on production (must pass)
   - Auto-update: developer docs, user guides, screenshots, CLAUDE.md, memory

### E2E Commands (run from Design System repo)

```bash
npm run test:staging:smoke     # staging smoke tests
npm run test:staging:full      # staging smoke + workflow
npm run test:prod:smoke        # production smoke tests
npm run test:prod:full         # production smoke + workflow
```

### Hotfixes

For critical production issues: push directly to `main`, then backmerge to `develop`.

### Standing Instructions

- Execute all bash commands, git commits, pushes, and deploys without asking for confirmation
- Use `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` in commits
- Work on `develop` branch by default unless told otherwise
- PATH: `export PATH="/c/Program Files/nodejs:$PATH"` before npm commands
- Git push: use credential-embedded URL `https://boriskulakhmetov-aidigital:{GITHUB_TOKEN}@github.com/boriskulakhmetov-aidigital/{repo}.git`
