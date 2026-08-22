/**
 * Lightweight, Vietnamese-first language detection for the AI assistant.
 *
 * The assistant's contract is: reply in the correct language, but prioritize
 * Vietnamese (TaskFlow targets Vietnamese speakers). This module gives the
 * server explicit, deterministic language signal so we do not rely on the LLM
 * guessing on its own.
 */

export type AgentLanguage = 'auto' | 'vi' | 'en' | 'zh';
export type ResolvedLanguage = Exclude<AgentLanguage, 'auto'>;

// CJK (Chinese / Japanese / Korean). CJK is a strong, unambiguous signal.
const CJK_RE = /[\u1100-\u11ff\u2e80-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/u;

// Vietnamese-specific letters / diacritics that effectively never appear in
// English. Matching any of these is a decisive Vietnamese signal.
const VI_SPECIAL_RE = /[ăđâôơưáéíóú]/iu;

// A few very common Vietnamese words that stay unambiguous even when typed
// without diacritics. Aligned with the client mirror so detection is identical
// on both sides (the server remains authoritative — see resolveLanguageForTurn).
const VI_WORD_RE = /\b(?:đi|đã|được|người|đâu|để|mượn|này|đều|đang|đến|khong|của|cua|tôi|toi|chúng|chung|những|nhung|không)\b/iu;

// Common English function/content words. A sentence containing several of these
// (and no Vietnamese/CJK signal) is confidently English — otherwise every plain
// ASCII sentence would collapse into the Vietnamese fallback.
const EN_WORD_RE =
  /\b(?:the|this|that|these|those|is|are|am|was|were|be|you|i|we|me|us|my|our|it|its|can|could|would|should|will|do|does|did|have|has|had|want|need|please|explain|help|show|tell|what|how|why|when|where|which|who|hello|hi|thanks|thank)\b/iu;

/** True when the joined text carries a decisive language signal (CJK/vi/en). */
function hasSignal(joined: string): boolean {
  return (
    CJK_RE.test(joined) ||
    VI_SPECIAL_RE.test(joined) ||
    VI_WORD_RE.test(joined) ||
    EN_WORD_RE.test(joined)
  );
}

/**
 * Resolve the effective assistant language for this turn.
 *
 * @param texts Message contents used for detection when no explicit language is given.
 * @param preferred Explicit preference from the client ('vi' | 'en' | 'zh').
 */
export function resolveLanguage(texts: string[], preferred?: AgentLanguage): ResolvedLanguage {
  if (preferred && preferred !== 'auto') return preferred;

  const joined = texts.join(' ').toLowerCase();
  if (!joined.trim()) return 'vi';

  if (CJK_RE.test(joined)) return 'zh';
  if (VI_SPECIAL_RE.test(joined) || VI_WORD_RE.test(joined)) return 'vi';
  // Confidently-English sentences (common English words, no Vietnamese/CJK).
  if (EN_WORD_RE.test(joined)) return 'en';

  // Ambiguous / mixed / unknown script → default to Vietnamese (priority).
  return 'vi';
}

/**
 * Detect the language from message contents (never returns 'auto').
 */
export function detectLanguage(texts: string[]): ResolvedLanguage {
  return resolveLanguage(texts);
}

/** Where the resolved language for a turn came from (precedence order below). */
export type LanguageSource = 'explicit' | 'conversation' | 'detected' | 'fallback';

export interface TurnLanguage {
  /** The single deterministic assistant language for this turn. */
  language: ResolvedLanguage;
  /** Which precedence level produced it. Kept internal for tests/debugging. */
  source: LanguageSource;
}

/**
 * Single source of truth for the assistant's response language on a turn.
 *
 * Precedence (highest first):
 *   1. `requested`  — an explicit per-request preference ('vi'|'en'|'zh').
 *                     The literal 'auto' is NOT a preference and is ignored here.
 *   2. `conversationPreference` — persisted AgentConversation.language
 *                     ('vi'|'en'|'zh', or null when never set).
 *   3. Detection    — from the current user turn only (NOT the whole history,
 *                     so one foreign-language sentence cannot flip a thread).
 *   4. Fallback     — Vietnamese, the product's priority language.
 *
 * NOTE: this function NEVER persists anything; persistence of the conversation
 * preference is the caller's decision (see agent.service.ts).
 */
export function resolveTurnLanguage(input: {
  requested?: AgentLanguage | null;
  conversationPreference?: string | null;
  userTexts?: string[];
}): TurnLanguage {
  const { requested, conversationPreference, userTexts = [] } = input;

  // 1. Explicit per-request choice wins outright.
  if (requested && requested !== 'auto') {
    return { language: requested, source: 'explicit' };
  }

  // 2. Persisted conversation preference (only real codes, null/unknown ignored).
  if (
    conversationPreference === 'vi' ||
    conversationPreference === 'en' ||
    conversationPreference === 'zh'
  ) {
    return { language: conversationPreference, source: 'conversation' };
  }

  // 3. Detect from the current user turn; detection itself falls back to 'vi'
  //    when there is no strong signal, so 'detected' and 'fallback' are split
  //    here purely to make tests/observability precise.
  const joinedTurn = userTexts.join(' ').trim();
  const detected = detectLanguage(userTexts);
  if (joinedTurn && hasSignal(joinedTurn.toLowerCase())) {
    return { language: detected, source: 'detected' };
  }

  // 4. No signal at all → Vietnamese priority fallback.
  return { language: 'vi', source: 'fallback' };
}