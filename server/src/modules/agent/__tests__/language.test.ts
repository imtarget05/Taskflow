import { detectLanguage, resolveLanguage, resolveTurnLanguage } from '../language';

describe('agent language detection', () => {
  it('detects Vietnamese from typical Vietnamese input', () => {
    expect(detectLanguage(['Xin chào, tôi là quản lý dự án'])).toBe('vi');
  });

  it('detects Vietnamese via the đ marker and diacritics', () => {
    expect(detectLanguage(['đang khóa học này có gì mới?'])).toBe('vi');
  });

  it('detects Chinese from CJK text (highest priority signal)', () => {
    expect(detectLanguage(['你好，请帮我规划一个项目'])).toBe('zh');
    expect(detectLanguage(['次のタスクは？'])).toBe('zh'); // kana → CJK bucket
  });

  it('detects confident English sentences', () => {
    expect(detectLanguage(['Hello, can you explain this architecture?'])).toBe('en');
    expect(detectLanguage(['What is the deadline for this task?'])).toBe('en');
    expect(resolveLanguage(['Please help me'], 'auto' as never)).toBe('en');
  });

  it('falls back to Vietnamese only for ambiguous/no-signal input', () => {
    // No English/Vietnamese/CJK signal at all.
    expect(detectLanguage(['plan a sprint'])).toBe('vi');
  });

  it('returns Vietnamese as a sensible default for empty content', () => {
    expect(detectLanguage([''])).toBe('vi');
    expect(resolveLanguage([])).toBe('vi');
  });

  it('lets an explicit client preference win over detection', () => {
    expect(resolveLanguage(['你好世界'], 'en')).toBe('en');
    expect(resolveLanguage(['xin chào'], 'zh')).toBe('zh');
    expect(resolveLanguage([], 'vi')).toBe('vi');
  });

  it('treats "auto" as auto-detection', () => {
    expect(resolveLanguage(['你好世界'], 'auto')).toBe('zh');
    expect(resolveLanguage(['đang xử lý'], 'auto')).toBe('vi');
    expect(resolveLanguage(['hello there'], 'auto')).toBe('en');
  });
});

describe('resolveTurnLanguage (server-authoritative precedence)', () => {
  // 1. Explicit per-request preference wins over everything.
  it('explicit vi/en/zh beats conversation preference and detection', () => {
    expect(resolveTurnLanguage({ requested: 'vi', conversationPreference: 'en', userTexts: ['你好'] })).toEqual({ language: 'vi', source: 'explicit' });
    expect(resolveTurnLanguage({ requested: 'en', conversationPreference: 'vi', userTexts: ['xin chào'] })).toEqual({ language: 'en', source: 'explicit' });
    expect(resolveTurnLanguage({ requested: 'zh', conversationPreference: 'en', userTexts: ['hello'] })).toEqual({ language: 'zh', source: 'explicit' });
  });

  // 'auto' is NOT an explicit preference.
  it('treats requested "auto" as no explicit preference', () => {
    expect(resolveTurnLanguage({ requested: 'auto', conversationPreference: 'en', userTexts: ['xin chào'] })).toEqual({ language: 'en', source: 'conversation' });
    expect(resolveTurnLanguage({ requested: 'auto', conversationPreference: null, userTexts: ['你好'] })).toEqual({ language: 'zh', source: 'detected' });
  });

  // 2. Conversation preference beats per-turn detection — a Vietnamese message
  //    inside an English conversation must NOT flip the thread.
  it('conversation preference wins over detection (no flip on foreign message)', () => {
    expect(resolveTurnLanguage({ requested: null, conversationPreference: 'vi', userTexts: ['plan a sprint in English please'] })).toEqual({ language: 'vi', source: 'conversation' });
    expect(resolveTurnLanguage({ requested: null, conversationPreference: 'en', userTexts: ['Giải thích Kubernetes deployment cho tôi'] })).toEqual({ language: 'en', source: 'conversation' });
    expect(resolveTurnLanguage({ requested: null, conversationPreference: 'zh', userTexts: ['xin chào'] })).toEqual({ language: 'zh', source: 'conversation' });
  });

  // 3. Detection on the current turn only.
  it('detects from the current turn when no preference exists', () => {
    expect(resolveTurnLanguage({ requested: null, conversationPreference: null, userTexts: ['đang quản lý dự án của tôi'] })).toEqual({ language: 'vi', source: 'detected' });
    expect(resolveTurnLanguage({ requested: null, conversationPreference: null, userTexts: ['你好，请帮我规划一个项目'] })).toEqual({ language: 'zh', source: 'detected' });
  });

  // Technical terms / quoted text must not flip detection.
  it('ignores English technical terms and quoted text inside Vietnamese input', () => {
    expect(resolveTurnLanguage({ userTexts: ['Giải thích Kubernetes deployment cho tôi'] })).toEqual({ language: 'vi', source: 'detected' });
    expect(resolveTurnLanguage({ userTexts: ['Giải thích câu "How are you?" bằng tiếng Việt.'] })).toEqual({ language: 'vi', source: 'detected' });
  });

  // 4. Vietnamese fallback.
  it('falls back to Vietnamese for ambiguous/empty input', () => {
    expect(resolveTurnLanguage({ requested: null, conversationPreference: null, userTexts: ['plan a sprint'] })).toEqual({ language: 'vi', source: 'fallback' });
    expect(resolveTurnLanguage({ requested: null, conversationPreference: null, userTexts: [] })).toEqual({ language: 'vi', source: 'fallback' });
    expect(resolveTurnLanguage({})).toEqual({ language: 'vi', source: 'fallback' });
  });

  // Old conversations have language = null → behaves like no preference.
  it('handles legacy conversations with language null', () => {
    expect(resolveTurnLanguage({ requested: null, conversationPreference: null, userTexts: ['xyz123'] })).toEqual({ language: 'vi', source: 'fallback' });
    expect(resolveTurnLanguage({ requested: 'auto', conversationPreference: null, userTexts: ['đang làm gì đó'] })).toEqual({ language: 'vi', source: 'detected' });
  });

  // Unknown persisted codes are ignored (defensive).
  it('ignores unknown conversation preference codes', () => {
    expect(resolveTurnLanguage({ requested: null, conversationPreference: 'fr', userTexts: ['zzz123'] })).toEqual({ language: 'vi', source: 'fallback' });
    // With a detectable Vietnamese message, detection takes over instead.
    expect(resolveTurnLanguage({ requested: null, conversationPreference: 'fr', userTexts: ['Xin chào bạn'] })).toEqual({ language: 'vi', source: 'detected' });
  });
});

describe('resolveTurnLanguage — invalid language hardening (whitelist)', () => {
  const INVALID = ['fr', 'de', 'ja', 'ko'];

  it('rejects invalid requested languages and falls through precedence', () => {
    for (const bad of INVALID) {
      // Invalid request + valid conversation preference → conversation wins.
      expect(resolveTurnLanguage({ requested: bad as never, conversationPreference: 'en', userTexts: [] }).language).toBe('en');
      // Invalid request + no preference + English message → detected en.
      expect(resolveTurnLanguage({ requested: bad as never, conversationPreference: null, userTexts: ['How does this work?'] }).source).toBe('detected');
      // Invalid request + nothing else → fallback vi.
      expect(resolveTurnLanguage({ requested: bad as never }).language).toBe('vi');
    }
  });

  it('rejects invalid conversation preferences from the DB', () => {
    for (const bad of INVALID) {
      expect(resolveTurnLanguage({ requested: 'auto', conversationPreference: bad, userTexts: ['Hello, can you explain this?'] }).language).toBe('en');
      expect(resolveTurnLanguage({ requested: null, conversationPreference: bad, userTexts: [] }).language).toBe('vi');
    }
  });

  it('never returns a language outside vi|en|zh for any input', () => {
    const requests = ['vi', 'en', 'zh', 'auto', null, undefined, '', 'fr', 'de', 'ja', 'ko'];
    const prefs = [null, undefined, 'vi', 'en', 'zh', 'fr', 'de', 'ja', 'ko'];
    for (const r of requests) {
      for (const p of prefs) {
        const result = resolveTurnLanguage({ requested: r as never, conversationPreference: p, userTexts: ['Hello'] });
        expect(['vi', 'en', 'zh']).toContain(result.language);
      }
    }
  });
});