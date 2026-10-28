/**
 * One side question, answered by the session's own model route.
 *
 * `/btw` never joins the prompt queue, so it must build its own provider
 * request: the session's latest request route, a fixed side-question policy,
 * no tools, and — only when `context` is `session` — a bounded plain-text
 * transcript. Nothing here writes to the session log; the command executor
 * records only the `/btw` lifecycle.
 *
 * @module dsh-btw/side-question
 */

import { buildTranscript, renderQuestion, toRequestMessages } from './transcript.js'

/**
 * Fixed policy for a side request. It replaces the agent's own system prompt:
 * the answer is an aside, not a continuation of the main task, and the request
 * declares no tools, so the model must not pretend to act.
 *
 * @param {boolean} hasContext Whether the request carries the session transcript.
 * @returns {string} the policy sent as the request's system prompt.
 */
export function sideQuestionPolicy(hasContext) {
  if (!hasContext) {
    return `SIDE_QUESTION_POLICY
You are answering one standalone side question. It has no conversation context: nothing before this request applies to it.

The answer appears in a small side panel and changes nothing else.

Answer only what was asked, in the user's language. Open with the answer itself, then at most a few sentences of necessary detail. If the question depends on facts you do not have, say so plainly instead of guessing.

You have no tools in this request. Do not ask clarifying questions unless the question is genuinely ambiguous.`
  }

  return `SIDE_QUESTION_POLICY
You are the same assistant that is working in this conversation, answering one side question the user asked while the main task continues.

The answer appears in a small side panel. It is not part of the main conversation and it changes nothing about the main task.

Answer only what was asked, in the user's language. Open with the answer itself, then at most a few sentences of necessary detail. When the transcript already establishes the fact, rely on it; when it does not, say plainly that you cannot verify it from this conversation instead of guessing.

You have no tools in this request. Do not continue the main task, do not propose or describe edits as if you had made them, do not run or claim to have run anything, and do not ask clarifying questions unless the question is genuinely ambiguous.`
}

/** Route fields carried by the session's latest request header. */
const HEADER_ROUTE_KEYS = ['provider', 'model']

/**
 * Answer one side question for the receiving agent.
 *
 * @param {object} runtime Plugin runtime: `{ ctx, config, logger }`.
 * @param {object} agent Receiving agent (`{ id, session }` at runtime).
 * @param {string} question The side question.
 * @param {AbortSignal} signal Cancellation owned by the UI command request.
 * @returns {Promise<string>} the answer text.
 */
export async function askSideQuestion(runtime, agent, question, signal) {
  const { ctx, config } = runtime
  const llm = ctx.get('llm')
  if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
    throw new Error('the LLM service is not mounted in this profile')
  }

  const route = resolveRoute(ctx, agent, config)
  const hasContext = config.context === 'session'
  const session = agent?.session
  const derived = hasContext && typeof session?.deriveMessages === 'function' ? session.deriveMessages() : []
  const transcript = buildTranscript(derived, {
    maxContextChars: config.maxContextChars,
    maxToolResultChars: config.maxToolResultChars,
    includeToolResults: config.includeToolResults,
  })

  const messages = toRequestMessages(transcript.entries, route)
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: renderQuestion(question, transcript.omitted, hasContext) }],
  })

  const timeout = createTimeoutSignal(config.timeoutMs)
  const requestSignal = combineSignals([signal, timeout.signal])
  const options = {
    provider: route.provider,
    model: route.model,
    system: sideQuestionPolicy(hasContext),
    messages,
    temperature: config.temperature,
    ...config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort },
    ...config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens },
    ...agent?.id === undefined ? {} : { sessionId: agent.id },
    signal: requestSignal,
  }

  runtime.logger?.debug?.(
    `dsh-btw: side request route=${route.provider}/${route.model} context=${config.context} messages=${messages.length} chars=${transcriptLength(transcript.entries)} omitted=${transcript.omitted}`,
  )

  try {
    return await readAnswer(llm.stream(options))
  } catch (error) {
    if (timeout.fired()) throw new Error(`no answer within ${formatDelay(config.timeoutMs)}`)
    if (signal?.aborted === true) throw new Error('cancelled')
    throw describeError(error)
  } finally {
    timeout.dispose()
  }
}

/**
 * Resolve the provider route for one side request.
 *
 * The session's latest `request/header` is the route the main turn used; the
 * default model selection covers a session that has not sent a request yet.
 *
 * @param {object} ctx Plugin context exposing optional Host services.
 * @param {object} agent Receiving agent.
 * @param {object} config Resolved plugin config.
 * @returns {{ provider: string, model: string }} the resolved route.
 */
export function resolveRoute(ctx, agent, config) {
  if (typeof config.provider === 'string' && typeof config.model === 'string') {
    return { provider: config.provider, model: config.model }
  }

  const header = safeCall(() => agent?.session?.requestHeader?.())
  const route = header?.config
  if (route !== undefined && HEADER_ROUTE_KEYS.every((key) => typeof route[key] === 'string' && route[key] !== '')) {
    return { provider: route.provider, model: route.model }
  }

  const fallback = safeCall(() => ctx.get('agentDefaultModel')?.currentSelection?.())
  if (fallback !== undefined && HEADER_ROUTE_KEYS.every((key) => typeof fallback[key] === 'string' && fallback[key] !== '')) {
    return { provider: fallback.provider, model: fallback.model }
  }

  throw new Error('this session has no model route yet; send one message or set provider and model in the dsh-btw config')
}

/**
 * Consume one model stream into answer text.
 *
 * Reasoning and tool-call blocks are not answer text; a `max-tokens` finish is
 * reported in the returned text because the visible answer was cut short.
 *
 * @param {AsyncIterable<object>} stream Model stream.
 * @returns {Promise<string>} the answer text.
 */
export async function readAnswer(stream) {
  let text = ''
  let finish
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    else if (chunk?.type === 'finish') finish = chunk.reason
  }

  if (finish === undefined) throw new Error('the model stream ended without a terminal finish')
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    const failure = finish.failure ?? {}
    throw new Error(`${failure.code ?? finish.kind}: ${failure.message ?? 'the model request failed'}`)
  }

  const answer = text.trim()
  if (answer === '') throw new Error('the model returned no answer text')
  return finish.kind === 'max-tokens' ? `${answer}\n\n(The answer stopped at the model's token limit.)` : answer
}

function transcriptLength(entries) {
  let total = 0
  for (const entry of entries) total += Array.from(entry.text).length
  return total
}

function formatDelay(milliseconds) {
  if (milliseconds < 1000) return `${milliseconds}ms`
  const seconds = milliseconds / 1000
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`
}

function safeCall(call) {
  try {
    return call()
  } catch {
    return undefined
  }
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error)
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController()
  let fired = false
  const timer = setTimeout(() => {
    fired = true
    controller.abort(new Error('side question timed out'))
  }, timeoutMs)
  return {
    signal: controller.signal,
    fired: () => fired,
    dispose: () => clearTimeout(timer),
  }
}

function combineSignals(signals) {
  const present = signals.filter((signal) => signal !== undefined && signal !== null)
  if (present.length === 0) return undefined
  if (present.length === 1) return present[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(present)

  const controller = new AbortController()
  const forward = (signal) => {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  for (const signal of present) forward(signal)
  return controller.signal
}
