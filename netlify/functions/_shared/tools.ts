import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
  {
    name: 'website_audit',
    description:
      'Submit a website audit job. Returns a job_id. After calling this, you MUST repeatedly call check_status with the returned job_id and app="website-audit" every 15 seconds until status is "complete", then call get_result to retrieve the full report. Processing takes 4-8 minutes.',
    inputSchema: {
      type: 'object' as const,
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
      'Submit a neuromarketing audit job. Returns a job_id. After calling this, you MUST repeatedly call check_status with the returned job_id and app="neuromarketing" every 15 seconds until status is "complete", then call get_result to retrieve the full report. Processing takes 8-12 minutes.',
    inputSchema: {
      type: 'object' as const,
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
      type: 'object' as const,
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
      'Submit an AIO scan job. Returns a job_id. After calling this, you MUST repeatedly call check_status with the returned job_id and app="aio-optimization" every 15 seconds until status is "complete", then call get_result. Processing takes 10-15 minutes.',
    inputSchema: {
      type: 'object' as const,
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
      'Submit a focus group simulation job. Returns a job_id. After calling this, you MUST repeatedly call check_status with the returned job_id and app="synthetic-focus-group" every 15 seconds until status is "complete", then call get_result. Processing takes 8-12 minutes.',
    inputSchema: {
      type: 'object' as const,
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
    name: 'ai_concierge',
    description:
      'Submit a marketing goal to the AI Concierge. The Concierge analyzes your goal, selects the right AI Digital Labs tools (website audit, neuromarketing, prompt engineering, AIO scan, focus group), dispatches them in parallel, waits for results, and returns a synthesized summary with individual report links. Use this when the user has a broad marketing goal that may require multiple tools. Returns a job_id. After calling this, use check_status and get_result to retrieve the synthesized findings. Processing takes 10-20 minutes (runs multiple tools).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        goal: {
          type: 'string',
          description: 'The marketing goal or question (e.g., "Audit our website and test our hero banner for neuromarketing effectiveness")',
        },
        brand_name: {
          type: 'string',
          description: 'Brand or company name (optional)',
        },
        website_url: {
          type: 'string',
          description: 'Website URL if relevant to the goal (optional)',
        },
        asset_url: {
          type: 'string',
          description: 'Creative asset URL if relevant (optional)',
        },
        instructions: {
          type: 'string',
          description: 'Additional instructions or context for the Concierge (optional)',
        },
      },
      required: ['goal'],
    },
  },
  {
    name: 'check_status',
    description: 'Check job status. If status is NOT "complete", you MUST call this tool again after the recommended wait time (see estimated_seconds_remaining in response). Keep calling until status is "complete" or "error". When complete, call get_result.',
    inputSchema: {
      type: 'object' as const,
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
            'ai-concierge',
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
      'Get the completed report. Only call this AFTER check_status returns status="complete". Returns markdown_report, visual_report (structured JSON), and report_url (hosted interactive report link).',
    inputSchema: {
      type: 'object' as const,
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
            'ai-concierge',
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
