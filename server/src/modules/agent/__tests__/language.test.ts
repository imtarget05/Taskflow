import { detectLanguage, resolveLanguage } from '../language';

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

  it('falls back to Vietnamese when there is no strong signal', () => {
    // Even plain-English text defaults to the product's priority language.
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
    expect(resolveLanguage(['hello'], 'auto')).toBe('vi');
  });
});