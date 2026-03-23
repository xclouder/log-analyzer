/**
 * sanitize.ts — HTML escaping utilities to prevent XSS.
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape HTML special characters to prevent XSS in innerHTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}
