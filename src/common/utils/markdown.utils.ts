/**
 * Splits chapter markdown content by pagebreak delimiters:
 * - HTML comment: <!-- pagebreak -->
 * - Markdown horizontal rule: --- (on its own line)
 *
 * @param content The raw markdown content of a chapter
 * @returns An array of page content strings (trimmed)
 */
export function splitChapterIntoPages(content: string): string[] {
  if (!content) {
    return [''];
  }

  // Split by:
  // 1. <!-- pagebreak -->
  // 2. Horizontal rule: --- on a line by itself
  const pages = content.split(/<!--\s*pagebreak\s*-->|^\s*---\s*$/m);

  return pages.map((page) => page.trim());
}
