/**
 * Wire form of one settled `/btw` row.
 *
 * The Harness command lifecycle carries a single `text` string, so a side
 * answer that also produced reasoning travels as one payload: the reasoning
 * block between two marker lines, then the answer. Readers that only want the
 * answer use {@link decodeResult}; anything that does not know the markers
 * (the shipped generic command card, a log export) still shows readable text.
 *
 * @module dsh-btw/result-text
 */

/** Opens the reasoning block. Kept in sync with the client bundle's parser. */
export const REASONING_OPEN = '<<<btw:reasoning>>>'

/** Closes the reasoning block and opens the answer. */
export const ANSWER_OPEN = '<<<btw:answer>>>'

/**
 * Compose the row text for one settled side question.
 *
 * @param {string} answer The answer text.
 * @param {string} reasoning Reasoning the model produced, if any.
 * @returns {string} the payload for `command/done`.
 */
export function encodeResult(answer, reasoning) {
  const thought = typeof reasoning === 'string' ? reasoning.trim() : ''
  if (thought === '') return answer
  return `${REASONING_OPEN}\n${thought}\n${ANSWER_OPEN}\n\n${answer}`
}

/**
 * Split a settled row text back into reasoning and answer.
 *
 * @param {string} text A `command/done` text value.
 * @returns {{ reasoning: string, answer: string }} the parts; reasoning is empty for a plain answer.
 */
export function decodeResult(text) {
  const value = typeof text === 'string' ? text : ''
  const prefix = `${REASONING_OPEN}\n`
  if (!value.startsWith(prefix)) return { reasoning: '', answer: value }

  const rest = value.slice(prefix.length)
  const marker = `\n${ANSWER_OPEN}\n`
  const at = rest.indexOf(marker)
  if (at === -1) return { reasoning: '', answer: value }

  return {
    reasoning: rest.slice(0, at),
    answer: rest.slice(at + marker.length).replace(/^\n/, ''),
  }
}
