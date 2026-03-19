export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
}

const APP_URLS: Record<string, string> = {
  'website-audit': 'https://website-audit.apps.aidigitallabs.com',
  'neuromarketing': 'https://neuromarketing-audit.apps.aidigitallabs.com',
  'prompt-engineering': 'https://prompt-engineer.apps.aidigitallabs.com',
  'aio-optimization': 'https://aio-optimization.apps.aidigitallabs.com',
  'synthetic-focus-group': 'https://synthetic-focus-group.apps.aidigitallabs.com',
};

export const TOOLS: Tool[] = [
  {
    name: 'website_audit',
    description:
      'Run a comprehensive website audit analyzing SEO, conversion optimization, and accessibility. Returns detailed scores, recommendations, and an action roadmap.',
    inputSchema: {
      type: 'object',
      properties: {
        website_url: {
          type: 'string',
          description: 'Full URL of the website to audit (e.g., https://example.com)',
        },
        brand_name: {
          type: 'string',
          description: 'Company or brand name (optional — will be inferred from the website)',
        },
        industry: {
          type: 'string',
          description: 'Industry sector (optional — will be inferred)',
        },
        business_model: {
          type: 'string',
          enum: ['B2B', 'B2C', 'B2B2C', 'Marketplace'],
          description: 'Business model type',
        },
        conversion_goal: {
          type: 'string',
          enum: ['Lead Generation', 'E-commerce', 'Sign-up', 'Information'],
          description: 'Primary conversion goal',
        },
        instructions: {
          type: 'string',
          description:
            'Additional instructions for the audit (e.g., "Focus on mobile experience" or "Compare against competitor X")',
        },
      },
      required: ['website_url'],
    },
  },
  {
    name: 'neuromarketing_audit',
    description:
      'Score a creative asset (banner, ad, landing page) against 41 neuromarketing and color psychology criteria. Analyzes visual hierarchy, emotional triggers, and behavioral patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        asset_url: {
          type: 'string',
          description: 'URL of the creative asset to audit',
        },
        brand_name: {
          type: 'string',
          description: 'Brand name',
        },
        asset_type: {
          type: 'string',
          enum: ['static_banner', 'landing_page', 'social_post', 'email', 'full_website'],
          description: 'Type of creative asset',
        },
        offer: {
          type: 'string',
          description: 'What the asset asks the user to do (CTA/offer)',
        },
        target_audience: {
          type: 'string',
          description: 'Target audience description',
        },
        instructions: {
          type: 'string',
          description: 'Additional audit instructions',
        },
      },
      required: ['asset_url', 'brand_name'],
    },
  },
  {
    name: 'prompt_engineering',
    description:
      'Design, test, and optimize an AI prompt. Tests the prompt 3 times for consistency, identifies hallucinations and drift, and produces an engineered version.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt_text: {
          type: 'string',
          description: 'The complete prompt to optimize (use this OR prompt_idea)',
        },
        prompt_idea: {
          type: 'string',
          description:
            'Description of what the prompt should do (use this if you need the prompt designed from scratch)',
        },
        model_target: {
          type: 'string',
          enum: ['claude', 'gpt-4', 'gemini', 'llama', 'general'],
          description: 'Target model',
        },
        use_case: {
          type: 'string',
          enum: [
            'creative_writing',
            'code_generation',
            'data_analysis',
            'chat',
            'instruction',
            'reasoning',
            'summarization',
            'extraction',
          ],
          description: 'Use case category',
        },
        instructions: {
          type: 'string',
          description: 'Additional instructions for the engineering process',
        },
      },
      required: ['prompt_text'],
    },
  },
  {
    name: 'aio_scan',
    description:
      'Audit how AI search engines (ChatGPT, Gemini, Perplexity, etc.) see a brand or product. Scans multiple engines with generated queries and synthesizes findings.',
    inputSchema: {
      type: 'object',
      properties: {
        concept_name: {
          type: 'string',
          description: 'Brand, product, or concept name to scan',
        },
        concept_type: {
          type: 'string',
          enum: ['product', 'offering', 'concept'],
          description: 'Type of concept',
        },
        concept_category: {
          type: 'string',
          description: 'Broader category (e.g., "SUV", "Digital Advertising")',
        },
        concept_context: {
          type: 'string',
          description: 'Target market, geography, competitors',
        },
        query_count: {
          type: 'number',
          description: 'Number of queries to generate (default 10)',
        },
        instructions: {
          type: 'string',
          description: 'Additional scan instructions',
        },
      },
      required: ['concept_name', 'concept_type', 'concept_category'],
    },
  },
  {
    name: 'synthetic_focus_group',
    description:
      'Simulate an AI-powered focus group to test creative concepts. Generates buyer personas and evaluates creatives through their perspectives.',
    inputSchema: {
      type: 'object',
      properties: {
        brand_name: {
          type: 'string',
          description: 'Brand or product name',
        },
        product_description: {
          type: 'string',
          description: 'Brief product/service description',
        },
        product_category: {
          type: 'string',
          description: 'Product category',
        },
        campaign_objective: {
          type: 'string',
          description: 'Campaign objective (awareness, conversion, etc.)',
        },
        creative_urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs of creative assets to evaluate',
        },
        instructions: {
          type: 'string',
          description: 'Additional evaluation instructions',
        },
      },
      required: ['brand_name', 'product_description'],
    },
  },
  {
    name: 'check_status',
    description: 'Check the status of a running audit, scan, or analysis job.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID returned from a submit call',
        },
        app: {
          type: 'string',
          enum: [
            'website-audit',
            'neuromarketing',
            'prompt-engineering',
            'aio-optimization',
            'synthetic-focus-group',
          ],
          description: 'Which app the job belongs to',
        },
      },
      required: ['job_id', 'app'],
    },
  },
  {
    name: 'get_result',
    description:
      'Get the completed report from a finished audit, scan, or analysis. Returns both markdown and structured JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'The job ID',
        },
        app: {
          type: 'string',
          enum: [
            'website-audit',
            'neuromarketing',
            'prompt-engineering',
            'aio-optimization',
            'synthetic-focus-group',
          ],
          description: 'Which app',
        },
        format: {
          type: 'string',
          enum: ['both', 'markdown', 'visual'],
          description: 'Output format (default: both)',
        },
      },
      required: ['job_id', 'app'],
    },
  },
];
