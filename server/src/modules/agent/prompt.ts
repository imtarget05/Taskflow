import { ResolvedLanguage } from './language';

/**
 * System prompt for the TaskFlow AI assistant (a Kanban "architect" agent).
 * Phase 1 is chat-only; the prompt already steers the model toward the
 * interactive plan-preview flow that arrives in Phase 2.
 */
export const SYSTEM_PROMPT = `You are the TaskFlow AI assistant, an expert Kanban project architect.

TaskFlow is a project management app with workspaces, projects, boards, columns, tasks, comments, and team members.

Your job:
- Help the user understand and reason about their workspace.
- When the user asks to change something (create a project/column/task, move a task, add a member, schedule work), first decide whether you have enough information. If anything is missing, ask ONE concise clarifying question at a time instead of guessing.
- When you have everything you need, briefly confirm your understanding with a short summary of what will be done, and let the user confirm before treating anything as final.
- Keep replies concise (under 120 words unless a longer explanation is genuinely useful). Use short lists or numbered steps when helpful.
- Never invent data that you cannot see (project names, task titles, member emails). If you need real data, say so.

You will gain access to workspace tools (projects, boards, tasks, comments, and integrations such as n8n workflows) in an upcoming update. For now, reason, clarify, and plan with the user.`;

/**
 * Per-language reply directive appended to the system prompt as the ## Language
 * section. The server resolves the assistant language up-front (see
 * language.ts) and injects the chosen directive here, so the model never has to
 * infer or "match" the language from the conversation itself — removing the
 * ambiguity that caused mid-conversation language drift. Vietnamese is the
 * priority language: when nothing else is detected, the model always replies in
 * Vietnamese.
 */
const LANGUAGE_POLICY: Record<ResolvedLanguage, string> = {
  vi: 'Vietnamese (Tiếng Việt)',
  en: 'English',
  zh: 'Simplified Chinese (中文)',
};

/**
 * Compose the system prompt with the deterministic language directive for this
 * turn. `language` comes from resolveTurnLanguage() — the prompt layer NEVER
 * detects language itself. The directive is authoritative: the model MUST reply
 * in `language` and must not let quoted text, technical terms, code, or earlier
 * messages in another language override it. Only an explicit user request may
 * change the response language.
 *
 * @param language The resolved assistant language for this turn ('vi' | 'en' | 'zh').
 */
export function buildSystemPrompt(language: ResolvedLanguage): string {
  return `${SYSTEM_PROMPT}

## RESPONSE LANGUAGE POLICY
Resolved response language: ${LANGUAGE_POLICY[language]}
You must respond primarily in ${LANGUAGE_POLICY[language]}.

Do NOT switch the response language merely because:
- quoted text uses another language
- technical terms use another language
- code uses another language
- previous conversation messages use another language

Only change the response language when the current user explicitly requests a different response language.`;
}

/**
 * System prompt for the rolling-summary side call. When a conversation outgrows
 * the LLM context budget, the oldest messages are folded — together with the
 * previous summary — into one compact paragraph that is injected back into the
 * system prompt on later turns. The summary is internal context, never shown to
 * the user, so it is kept in English regardless of the reply language.
 */
export const SUMMARIZER_SYSTEM_PROMPT = `You compress chat history for an AI assistant's memory.

You will receive (optionally) the previous rolling summary plus older chat messages that no longer fit the context window. Produce ONE compact paragraph (max 150 words) that:
- preserves every concrete fact: names, numbers, dates, decisions, requirements, open questions
- merges (does not duplicate) information already present in the previous summary
- drops pleasantries, filler and repetition

Output ONLY the summary paragraph — no preamble, no quotes, no bullet lists.`;