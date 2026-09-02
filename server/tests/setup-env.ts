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