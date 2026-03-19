const APP_URLS: Record<string, string> = {
  'website-audit': 'https://website-audit.apps.aidigitallabs.com',
  'neuromarketing': 'https://neuromarketing-audit.apps.aidigitallabs.com',
  'prompt-engineering': 'https://prompt-engineer.apps.aidigitallabs.com',
  'aio-optimization': 'https://aio-optimization.apps.aidigitallabs.com',
  'synthetic-focus-group': 'https://synthetic-focus-group.apps.aidigitallabs.com',
};

export class AIDigitalLabsClient {
  constructor(private apiKey: string) {}

  async submit(app: string, params: Record<string, unknown>): Promise<{ job_id: string }> {
    const baseUrl = APP_URLS[app];
    if (!baseUrl) throw new Error(`Unknown app: ${app}`);

    const res = await fetch(`${baseUrl}/api/v1/submit`, {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<{ job_id: string }>;
  }

  async status(app: string, jobId: string): Promise<Record<string, unknown>> {
    const baseUrl = APP_URLS[app];
    if (!baseUrl) throw new Error(`Unknown app: ${app}`);

    const res = await fetch(`${baseUrl}/api/v1/status?job_id=${encodeURIComponent(jobId)}`, {
      headers: { 'X-API-Key': this.apiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<Record<string, unknown>>;
  }

  async result(app: string, jobId: string, format = 'both'): Promise<Record<string, unknown>> {
    const baseUrl = APP_URLS[app];
    if (!baseUrl) throw new Error(`Unknown app: ${app}`);

    const res = await fetch(
      `${baseUrl}/api/v1/result?job_id=${encodeURIComponent(jobId)}&format=${encodeURIComponent(format)}`,
      { headers: { 'X-API-Key': this.apiKey } },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<Record<string, unknown>>;
  }

  async submitAndWait(
    app: string,
    params: Record<string, unknown>,
    timeoutMs = 600000,
  ): Promise<Record<string, unknown>> {
    const { job_id } = await this.submit(app, params);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const s = await this.status(app, job_id);

      if (s.status === 'complete') {
        return this.result(app, job_id);
      }
      if (s.status === 'error') {
        throw new Error(`Job failed: ${s.error ?? 'unknown error'}`);
      }

      // Poll every 5 seconds
      await new Promise((r) => setTimeout(r, 5000));
    }

    throw new Error(`Job timed out after ${timeoutMs / 1000}s (job_id: ${job_id})`);
  }
}
