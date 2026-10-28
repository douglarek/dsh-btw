/**
 * Small text helpers shared by the side-question pipeline.
 *
 * @module dsh-btw/text
 */

/**
 * Normalize a submitted command line's argument text into one side question.
 *
 * The Harness keeps the separator whitespace after the command name in
 * `rawInput`, and a multi-line question is legitimate, so only the outer
 * whitespace is removed.
 *
 * @param {unknown} raw The invocation's `rawInput`.
 * @returns {string} the trimmed question, or an empty string.
 */
export function trimQuestion(raw) {
  if (typeof raw !== 'string') return ''
  return raw.replace(/^\s+/, '').replace(/\s+$/, '')
}

/**
 * Clip text to a code-point budget without splitting a surrogate pair.
 *
 * @param {string} text Source text.
 * @param {number} maxChars Maximum retained code points; a non-positive value clips to nothing.
 * @param {string} [ellipsis] Marker appended when text was removed.
 * @returns {string} the original text or a clipped copy.
 */
export function clipText(text, maxChars, ellipsis = ' …') {
  if (typeof text !== 'string') return ''
  if (maxChars <= 0) return ''
  const points = Array.from(text)
  if (points.length <= maxChars) return text
  return points.slice(0, maxChars).join('') + ellipsis
}
