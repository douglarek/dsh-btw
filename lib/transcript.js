/**
 * Conversation transcript assembly for one side question.
 *
 * The side request must carry the facts the main conversation established, but
 * it must not replay the agent's own system prompt or tool protocol: the side
 * call declares no tools, so tool calls and their results become plain labeled
 * text and the request stays valid on every provider route.
 *
 * @module dsh-btw/transcript
 */

/** Roles whose text belongs to the human-visible conversation. */
const CONVERSATION_ROLES = new Set(['user', 'assistant', 'tool'])

/**
 * Build the plain-text transcript entries for one side request.
 *
 * @param {readonly object[]} messages The session's derived model history.
 * @param {object} options Resolved transcript limits.
 * @param {number} options.maxContextChars Code-point budget for the whole transcript.
 * @param {number} options.maxToolResultChars Per-tool-result code-point cap.
 * @param {boolean} options.includeToolResults Whether tool output is retained.
 * @returns {{ entries: Array<{ role: 'user'|'assistant', text: string }>, omitted: number }}
 */
export function buildTranscript(messages, options) {
  const list = Array.isArray(messages) ? messages : []
  const toolNames = new Map()
  const entries = []

  for (const message of list) {
    if (message === null || typeof message !== 'object') continue
    if (!CONVERSATION_ROLES.has(message.role)) continue
    const content = Array.isArray(message.content) ? message.content : []

    if (message.role === 'assistant') {
      for (const block of content) {
        if (block?.type === 'tool-call' && typeof block.id === 'string' && typeof block.name === 'string') {
          toolNames.set(block.id, block.name)
        }
      }
      push(entries, 'assistant', textOf(content))
      continue
    }

    if (message.role === 'user') {
      push(entries, 'user', textOf(content))
      continue
    }

    if (!options.includeToolResults) continue
    const result = textOf(content)
    if (result === '') continue
    const name = toolNames.get(message.toolCallId) ?? 'tool'
    push(entries, 'user', `Tool result (${name}):\n${clip(result, options.maxToolResultChars)}`)
  }

  const merged = mergeAdjacent(entries)
  return trimToBudget(merged, options.maxContextChars)
}

/**
 * Convert transcript entries into provider-neutral request messages.
 *
 * Assistant messages carry model source metadata because the LLM runtime and
 * both shipped adapters read `source.replayState` on every assistant message
 * in a request; the source names the route this side request runs on, and it
 * deliberately has no replay state, so no historical provider metadata is
 * replayed against rewritten content.
 *
 * @param {readonly Array<{ role: 'user'|'assistant', text: string }>} entries Transcript entries.
 * @param {{ provider: string, model: string }} route Resolved side-request route.
 * @returns {Array<object>} request messages.
 */
export function toRequestMessages(entries, route) {
  return entries.map((entry) =>
    entry.role === 'assistant'
      ? {
          role: 'assistant',
          content: [{ type: 'text', text: entry.text }],
          source: { kind: 'model', provider: route.provider, model: route.model },
        }
      : { role: 'user', content: [{ type: 'text', text: entry.text }] },
  )
}

/**
 * Render the final user message that carries the side question.
 *
 * @param {string} question The user's side question.
 * @param {number} omitted Count of equally-sized earlier messages left out of the transcript.
 * @param {boolean} hasContext Whether the request carries the session transcript.
 * @returns {string} the wrapped question text.
 */
export function renderQuestion(question, omitted, hasContext = true) {
  const lines = []
  if (hasContext && omitted > 0) {
    lines.push(`(Note: ${omitted} earlier message(s) of this conversation were omitted from the transcript above.)`, '')
  }
  lines.push('<side_question>', question, '</side_question>', '')
  lines.push(
    hasContext
      ? 'Answer this side question from the user now. Ground the answer in the transcript above where it applies.'
      : 'Answer this side question now. It is standalone: no conversation context applies to it.',
  )
  return lines.join('\n')
}

function textOf(content) {
  const parts = []
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') parts.push(block.text)
  }
  return parts.join('\n\n').trim()
}

function push(entries, role, text) {
  if (text === '') return
  entries.push({ role, text })
}

function mergeAdjacent(entries) {
  const merged = []
  for (const entry of entries) {
    const last = merged[merged.length - 1]
    if (last !== undefined && last.role === entry.role) last.text += `\n\n${entry.text}`
    else merged.push({ role: entry.role, text: entry.text })
  }
  return merged
}

function size(entry) {
  return Array.from(entry.text).length
}

function trimToBudget(entries, budget) {
  if (entries.length === 0) return { entries: [], omitted: 0 }
  if (budget <= 0) return { entries: [], omitted: entries.length }

  let total = 0
  for (const entry of entries) total += size(entry)
  if (total <= budget) return { entries, omitted: 0 }

  const head = entries[0]
  const tail = []
  let used = size(head)
  for (let index = entries.length - 1; index >= 1; index -= 1) {
    const entry = entries[index]
    const cost = size(entry) + 2
    if (used + cost > budget) break
    tail.unshift(entry)
    used += cost
  }

  const omitted = entries.length - 1 - tail.length
  return { entries: [head, ...tail], omitted }
}

function clip(text, maxChars) {
  if (!Number.isFinite(maxChars) || maxChars <= 0) return ''
  const points = Array.from(text)
  if (points.length <= maxChars) return text
  return `${points.slice(0, maxChars).join('')} …`
}
