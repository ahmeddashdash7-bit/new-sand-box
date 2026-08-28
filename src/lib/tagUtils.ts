/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Normalizes a single tag string:
 * - Removes leading/trailing whitespace
 * - Strips leading '#' character if present
 * - Normalizes internal spaces (replaces multiple spaces with a single space)
 * - Converts to lowercase for consistent comparison and storage
 *
 * Example:
 *  " Physics " -> "physics"
 *  "#physics"  -> "physics"
 *  "PHYSICS"   -> "physics"
 *  "heat  capacity" -> "heat capacity"
 */
export function normalizeTag(tag: string): string {
  if (!tag) return "";
  let clean = tag.trim();
  if (clean.startsWith("#")) {
    clean = clean.substring(1).trim();
  }
  clean = clean.replace(/\s+/g, " ").toLowerCase();
  return clean;
}

/**
 * Normalizes an array of tags, removing duplicates and empty strings.
 */
export function normalizeTags(tags: (string | undefined | null)[] = []): string[] {
  const uniqueSet = new Set<string>();
  tags.forEach((t) => {
    if (t && typeof t === "string") {
      const normalized = normalizeTag(t);
      if (normalized) {
        uniqueSet.add(normalized);
      }
    }
  });
  return Array.from(uniqueSet);
}

/**
 * Checks if a collection of tags contains a target filter tag (case-insensitive & whitespace-insensitive).
 */
export function hasMatchingTag(questionTags: string[] | undefined, filterTag: string): boolean {
  if (!filterTag || filterTag.toLowerCase() === "all") return true;
  const target = normalizeTag(filterTag);
  if (!target) return true;
  if (!questionTags || questionTags.length === 0) return false;
  
  return questionTags.some((t) => normalizeTag(t) === target);
}
