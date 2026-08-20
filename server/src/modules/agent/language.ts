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
// without diacritics.
const VI_WORD_RE = /\b(?:đi|đã|nguyen|hay)\b/iu;

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

  // No strong signal → default to Vietnamese (the product's priority language).
  return 'vi';
}

/** Detect the language from message contents (never returns 'auto'). */
export function detectLanguage(texts: string[]): ResolvedLanguage {
  return resolveLanguage(texts);
}