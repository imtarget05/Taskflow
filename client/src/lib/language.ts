/**
 * Lightweight, Vietnamese-first language detection — a client-side mirror of
 * `server/src/modules/agent/language.ts`.
 *
 * Why a client copy? The ChatBox can show the user the language the LLM will
 * reply in *before* a request leaves the browser, giving instant feedback so
 * there's no mystery around "why did I get a Vietnamese/English reply?".
 *
 * The rule is identical to the server: detect from message contents, but
 * ALWAYS fall back to Vietnamese (TaskFlow's priority language).
 */

export type AgentLanguage = 'auto' | 'vi' | 'en' | 'zh';
export type ResolvedLanguage = Exclude<AgentLanguage, 'auto'>;

// CJK (Chinese / Japanese / Korean). A strong, unambiguous signal.
const CJK_RE = /[\u1100-\u11ff\u2e80-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/u;

// Vietnamese-specific letters/diacritics that effectively never appear in English.
const VI_SPECIAL_RE = /[ăđâôơưáéíóú]/iu;

// Very common Vietnamese words, even when typed without all diacritics.
const VI_WORD_RE = /\b(?:đi|đã|được|người|đâu|để|mượn|này|đều|đang|đến|không|khong|của|cua|tôi|toi|chúng|chung|những|nhung)\b/iu;

// Common English function/content words (mirror of the server detector).
const EN_WORD_RE =
  /\b(?:the|this|that|these|those|is|are|am|was|were|be|you|i|we|me|us|my|our|it|its|can|could|would|should|will|do|does|did|have|has|had|want|need|please|explain|help|show|tell|what|how|why|when|where|which|who|hello|hi|thanks|thank)\b/iu;

const LABEL: Record<ResolvedLanguage, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  zh: '中文',
};

/**
 * Resolve the effective assistant language for a turn.
 *
 * @param texts Current conversation messages (used for detection under 'auto').
 * @param preferred Explicit preference chosen by the user ('vi' | 'en' | 'zh').
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

/** Detect the language from message contents (never returns 'auto'). */
export function detectLanguage(texts: string[]): ResolvedLanguage {
  return resolveLanguage(texts);
}

/** Human-readable label for a resolved language. */
export function languageLabel(language: ResolvedLanguage): string {
  return LABEL[language];
}

/** Short explanation of the Vietnamese-priority policy, for a tooltip. */
export function languageHint(language: ResolvedLanguage): string {
  if (language === 'vi') {
    return 'LLM sẽ trả lời bằng Tiếng Việt (ưu tiên ngôn ngữ Việt Nam khi tự động).';
  }
  return `LLM sẽ trả lời bằng ${languageLabel(language)}.`;
}
