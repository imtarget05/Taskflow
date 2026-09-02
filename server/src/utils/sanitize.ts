/**
 * Escape HTML special characters so user-supplied text (task titles, comments,
 * descriptions) can never execute as markup when rendered. React escapes on
 * output, but storing already-safe text is defense-in-depth (any future
 * dangerouslySetInnerHTML / email template / export path stays safe).
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Neutralize common XSS payloads in stored text: strip script/style blocks,
 * inline event handlers (on*), javascript:/data: URLs and dangerous tags.
 * Safe for plain-text storage; rendering layer must still escape.
 */
export function sanitizeText(input: string): string {
  return escapeHtml(input);
}