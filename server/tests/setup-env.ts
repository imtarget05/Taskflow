// This file runs BEFORE the test framework is installed, ensuring NODE_ENV=test
// is set before any application modules are loaded (which import env.ts).
process.env.NODE_ENV = 'test';

// Block real LLM calls in tests: tests/setup.ts loads .env (dotenv/config), which
// would otherwise point integration tests at the real Cloudflare Workers AI
// endpoint (slow, flaky, non-deterministic). With LLM_MODEL unset,
// llm.isConfigured() is false so services exercise their rule-based fallback
// instead of making network calls. dotenv never overwrites already-set
// variables, so these values stick. LLM_BASE_URL keeps a syntactically valid
// URL because the Zod schema enforces z.string().url().
process.env.LLM_BASE_URL = 'http://llm.invalid';
process.env.LLM_MODEL = '';

// Raise rate limits for integration tests so suites don't get 429'd when
// chaining many auth + API requests. These must be set here (before env.ts
// loads) because env.ts is a singleton evaluated at import time and the
// values set later in tests/setup.ts are ignored.
process.env.RATE_LIMIT_MAX = '5000';
process.env.RATE_LIMIT_AUTH_LOGIN = '10000';
process.env.RATE_LIMIT_AUTH_REGISTER = '10000';
process.env.RATE_LIMIT_AUTH_REFRESH = '10000';
