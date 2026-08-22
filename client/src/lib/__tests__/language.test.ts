import { describe, it, expect } from 'vitest';
import {
  resolveLanguage,
  detectLanguage,
  languageLabel,
  languageHint,
} from '@/lib/language';

describe('client language detection (Vietnamese-first)', () => {
  it('detects Vietnamese from diacritics and the đ marker', () => {
    expect(resolveLanguage(['Xin chào, tôi là quản lý dự án'])).toBe('vi');
    expect(resolveLanguage(['đang khóa học này có gì mới?'])).toBe('vi');
    expect(resolveLanguage(['tôi không thể đăng nhập được'])).toBe('vi');
  });

  it('detects Vietnamese from common words without full diacritics', () => {
    expect(resolveLanguage(['di khoa thi cua toi co the khong'])).toBe('vi');
  });

  it('detects Chinese (CJK) content as zh', () => {
    expect(resolveLanguage(['你好，请帮我规划一个项目'])).toBe('zh');
    expect(resolveLanguage(['次のタスクは？'])).toBe('zh');
  });

  it('detects confident English input as en under auto', () => {
    expect(resolveLanguage(['What is the deadline?'])).toBe('en');
    expect(resolveLanguage(['Please explain this architecture'])).toBe('en');
  });

  it('still prefers Vietnamese for Vietnamese-without-diacritics input', () => {
    expect(resolveLanguage(['toi khong the dang nhap'])).toBe('vi');
  });

  it('falls back to Vietnamese for empty input', () => {
    expect(resolveLanguage([''])).toBe('vi');
    expect(resolveLanguage([])).toBe('vi');
  });

  it('honors an explicit language preference over detection', () => {
    // Even a Vietnamese message replies in English if the user explicitly chose English.
    expect(resolveLanguage(['xin chào'], 'en')).toBe('en');
    expect(resolveLanguage(['你好'], 'en')).toBe('en');
    expect(resolveLanguage(['hello'], 'zh')).toBe('zh');
  });

  it('detectLanguage is never "auto"', () => {
    expect(detectLanguage(['hello'])).not.toBe('auto');
    expect(detectLanguage(['xin chào'])).toBe('vi');
  });

  it('exposes human-readable labels and hints', () => {
    expect(languageLabel('vi')).toBe('Tiếng Việt');
    expect(languageLabel('en')).toBe('English');
    expect(languageLabel('zh')).toBe('中文');
    expect(languageHint('vi')).toContain('Tiếng Việt');
    expect(languageHint('en')).toContain('English');
    expect(languageHint('zh')).toContain('中文');
  });
});
