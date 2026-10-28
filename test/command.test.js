import assert from 'node:assert/strict'
import test from 'node:test'
import { DetachedAnswers } from '../lib/answer-runner.js'
import { BTW_USAGE, createBtwCommandDefinition, handleBtwInvocation } from '../lib/command.js'
import { resolveConfig } from '../lib/config.js'
import { resolveRoute } from '../lib/side-question.js'

const ROUTE = Object.freeze({ config: { provider: 'tokenhub', model: 'deepseek-v4.1-flash-1017' } })

function text(value) {
  return { type: 'text', text: value }
}

function fakeRuntime({ stream, selection, projections, config } = {}) {
  const calls = []
  const services = {
    llm: {
      stream(options) {
        calls.push(options)
        return stream === undefined
          ? streamFrom([{ type: 'text-delta', index: 0, text: 'an answer' }, { type: 'finish', reason: { kind: 'stop' } }])
          : stream(options)
      },
    },
    ...(selection === undefined ? {} : { agentDefaultModel: { currentSelection: () => selection } }),
    ...(projections === undefined ? {} : { sessionProjections: projections }),
  }
  const ctx = {
    get(name) {
      return services[name]
    },
  }
  const runtime = { ctx, config: resolveConfig(config).config, logger: {} }
  runtime.answers = new DetachedAnswers(runtime)
  return { runtime, calls }
}

async function* streamFrom(chunks) {
  for (const chunk of chunks) yield chunk
}

function fakeAgent({ header = ROUTE, messages = [] } = {}) {
  const appended = []
  return {
    agent: {
      id: 'session-1',
      session: {
        requestHeader: () => header,
        deriveMessages: () => messages,
        append: (type, data) => {
          appended.push({ type, data })
        },
      },
    },
    appended,
  }
}

function invocation(agent, rawInput) {
  return { commandId: 'cmd-test-1', agent, rawInput, attachments: [], signal: undefined }
}

test('exposes a discoverable command with an argument hint', () => {
  const { runtime } = fakeRuntime()
  const definition = createBtwCommandDefinition(runtime)
  assert.equal(definition.name, 'btw')
  assert.deepEqual(definition.input, { hint: '<question>' })
  assert.equal(definition.description, runtime.config.description)
  assert.match(definition.description, /side question/)
})

test('a bare /btw reports usage without calling the model', async () => {
  const { runtime, calls } = fakeRuntime()
  const { agent, appended } = fakeAgent()
  const result = handleBtwInvocation(runtime, invocation(agent, '   '))
  assert.deepEqual(result, { kind: 'error', text: BTW_USAGE })
  await runtime.answers.whenIdle()
  assert.equal(calls.length, 0)
  assert.deepEqual(appended, [])
})

test('settles the submission before the model answers', async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const { runtime } = fakeRuntime({
    stream: async function* () {
      await gate
      yield { type: 'text-delta', index: 0, text: 'late answer' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  })
  const { agent, appended } = fakeAgent()

  const result = handleBtwInvocation(runtime, invocation(agent, ' what is WBC?'))
  assert.deepEqual(result, { kind: 'success' }, 'the handler must not wait for the model')
  assert.deepEqual(appended, [], 'nothing is settled while the request is in flight')

  release()
  await runtime.answers.whenIdle()
  assert.deepEqual(appended, [{ type: 'command/done', data: { commandId: 'cmd-test-1', kind: 'success', text: 'late answer' } }])
})

test('answers a standalone question with the session route and no transcript', async () => {
  const { runtime, calls } = fakeRuntime()
  const { agent, appended } = fakeAgent({
    messages: [],
  })
  agent.session.deriveMessages = () => {
    throw new Error('context=none must not read the session transcript')
  }

  handleBtwInvocation(runtime, invocation(agent, ' what does WBC stand for?'))
  await runtime.answers.whenIdle()

  assert.equal(calls.length, 1)
  assert.equal(calls[0].messages.length, 1)
  assert.match(calls[0].messages[0].content[0].text, /standalone/)
  assert.match(calls[0].system, /standalone side question/)
  assert.equal(appended[0].data.text, 'an answer')
})

test('answers through the session route with a bounded, tool-free request', async () => {
  const messages = [
    { role: 'user', content: [text('fix the retry loop first')] },
    { role: 'assistant', content: [text('Looking at it.')] },
  ]
  const { runtime, calls } = fakeRuntime({ config: { context: 'session' } })
  const { agent } = fakeAgent({ messages })

  handleBtwInvocation(runtime, invocation(agent, ' what does WBC stand for?'))
  await runtime.answers.whenIdle()

  assert.equal(calls.length, 1)
  const options = calls[0]
  assert.equal(options.provider, 'tokenhub')
  assert.equal(options.model, 'deepseek-v4.1-flash-1017')
  assert.equal(options.sessionId, 'session-1')
  assert.equal(options.temperature, 0.2)
  assert.equal(options.tools, undefined)
  assert.match(options.system, /SIDE_QUESTION_POLICY/)
  assert.deepEqual(options.messages, [
    { role: 'user', content: [text('fix the retry loop first')] },
    {
      role: 'assistant',
      content: [text('Looking at it.')],
      source: { kind: 'model', provider: 'tokenhub', model: 'deepseek-v4.1-flash-1017' },
    },
    {
      role: 'user',
      content: [text('<side_question>\nwhat does WBC stand for?\n</side_question>\n\nAnswer this side question from the user now. Ground the answer in the transcript above where it applies.')],
    },
  ])
})

// Every assistant message in a request is read as `source.replayState` by the
// LLM runtime and by both shipped adapters, so the text-only transcript still
// needs model source metadata. Without it the request fails with
// `UNKNOWN: Cannot read properties of undefined (reading 'replayState')`.
test('assistant transcript messages satisfy the runtime source contract', async () => {
  const messages = [
    { role: 'user', content: [text('fix the retry loop first')] },
    { role: 'assistant', content: [text('Looking at it.')] },
    { role: 'user', content: [text('and then?')] },
  ]
  let assistants = 0
  const { runtime } = fakeRuntime({
    config: { context: 'session' },
    stream: (options) => {
      for (const message of options.messages) {
        if (message.role !== 'assistant') continue
        assistants += 1
        assert.equal(message.source?.kind, 'model', 'assistant message lost its model source')
        assert.equal(message.source.replayState, undefined, 'side history must not replay provider state')
      }
      return streamFrom([{ type: 'text-delta', index: 0, text: 'ok' }, { type: 'finish', reason: { kind: 'stop' } }])
    },
  })
  const { agent } = fakeAgent({ messages })
  handleBtwInvocation(runtime, invocation(agent, 'anything?'))
  await runtime.answers.whenIdle()
  assert.equal(assistants, 1)
})

test('ignores reasoning deltas and reports a truncated answer', async () => {
  const { runtime } = fakeRuntime({
    stream: () =>
      streamFrom([
        { type: 'reasoning-delta', index: 0, text: 'thinking out loud' },
        { type: 'text-delta', index: 1, text: '  WBC is a blood count.  ' },
        { type: 'finish', reason: { kind: 'max-tokens' } },
      ]),
  })
  const { agent, appended } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'what is WBC?'))
  await runtime.answers.whenIdle()
  assert.equal(appended[0].data.kind, 'success')
  assert.equal(appended[0].data.text, "WBC is a blood count.\n\n(The answer stopped at the model's token limit.)")
})

test('turns a provider failure into a readable row error', async () => {
  const { runtime } = fakeRuntime({
    stream: () => streamFrom([{ type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMITED', message: 'slow down' } } }]),
  })
  const { agent, appended } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'anything?'))
  await runtime.answers.whenIdle()
  assert.deepEqual(appended, [
    { type: 'command/done', data: { commandId: 'cmd-test-1', kind: 'error', text: 'Side question failed: RATE_LIMITED: slow down' } },
  ])
})

test('an empty answer is an error, never a blank success', async () => {
  const { runtime } = fakeRuntime({
    stream: () => streamFrom([{ type: 'reasoning-delta', index: 0, text: 'only reasoning' }, { type: 'finish', reason: { kind: 'stop' } }]),
  })
  const { agent, appended } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'anything?'))
  await runtime.answers.whenIdle()
  assert.deepEqual(appended, [
    { type: 'command/done', data: { commandId: 'cmd-test-1', kind: 'error', text: 'Side question failed: the model returned no answer text' } },
  ])
})

test('falls back to the default model selection before the first request', async () => {
  const { runtime, calls } = fakeRuntime({ selection: { provider: 'fallback', model: 'default-model' } })
  const { agent } = fakeAgent({ header: undefined })
  agent.session.requestHeader = () => undefined
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal(calls[0].provider, 'fallback')
  assert.equal(calls[0].model, 'default-model')
})

test('reports a missing route instead of throwing', () => {
  const agent = { id: 'session-3', session: { requestHeader: () => undefined } }
  const { runtime } = fakeRuntime()
  assert.throws(() => resolveRoute(runtime.ctx, agent, runtime.config), /no model route yet/)
})

test('the session selection outranks the last request route', async () => {
  const { runtime, calls } = fakeRuntime({
    projections: {
      stateOf: () => ({ lastUsed: { provider: 'tokenhub', model: 'old-model', reasoningEffort: 'low' }, pending: { provider: 'cpa', model: 'gpt-6-sol', reasoningEffort: 'high' } }),
    },
    selection: { provider: 'fallback', model: 'default-model' },
  })
  const { agent } = fakeAgent({ header: { config: { provider: 'tokenhub', model: 'deepseek-v4.1-flash-1017', reasoningEffort: 'max' } } })
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal(calls[0].provider, 'cpa')
  assert.equal(calls[0].model, 'gpt-6-sol')
  assert.equal(calls[0].reasoningEffort, 'high')
})

test('an empty pending selection falls back to the last-used one', async () => {
  const { runtime, calls } = fakeRuntime({
    projections: { stateOf: () => ({ lastUsed: { provider: 'tokenhub', model: 'deepseek-v4.1-flash-1017', reasoningEffort: 'max' }, pending: null }) },
  })
  const { agent } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal(calls[0].reasoningEffort, 'max')
})

test('an unavailable or broken selection projection falls back to the header', async () => {
  for (const projections of [undefined, { stateOf: () => undefined }, { stateOf: () => { throw new Error('no such key') } }]) {
    const { runtime, calls } = fakeRuntime({ projections })
    const { agent } = fakeAgent({ header: { config: { provider: 'tokenhub', model: 'deepseek-v4.1-flash-1017', reasoningEffort: 'max' } } })
    handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
    await runtime.answers.whenIdle()
    assert.equal(calls[0].provider, 'tokenhub')
    assert.equal(calls[0].reasoningEffort, 'max')
  }
})

test('inherits the thinking level the session runs', async () => {
  const { runtime, calls } = fakeRuntime()
  const { agent } = fakeAgent({ header: { config: { provider: 'tokenhub', model: 'deepseek-v4.1-flash-1017', reasoningEffort: 'max' } } })
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal(calls[0].reasoningEffort, 'max')
})

test('an explicit config thinking level overrides the inherited one', async () => {
  const { runtime, calls } = fakeRuntime({ config: { reasoningEffort: 'low' } })
  const { agent } = fakeAgent({ header: { config: { provider: 'tokenhub', model: 'deepseek-v4.1-flash-1017', reasoningEffort: 'max' } } })
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal(calls[0].reasoningEffort, 'low')
})

test('adopts the profile default level when the session route carries none', async () => {
  const { runtime, calls } = fakeRuntime({
    selection: { provider: 'tokenhub', model: 'deepseek-v4.1-flash-1017', reasoningEffort: 'max' },
  })
  const { agent } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal(calls[0].reasoningEffort, 'max')
})

test('ignores the profile default level for a different model', async () => {
  const { runtime, calls } = fakeRuntime({
    selection: { provider: 'tokenhub', model: 'some-other-model', reasoningEffort: 'max' },
  })
  const { agent } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal('reasoningEffort' in calls[0], false)
})

test('a config level still overrides the profile default level', async () => {
  const { runtime, calls } = fakeRuntime({
    config: { reasoningEffort: 'low' },
    selection: { provider: 'tokenhub', model: 'deepseek-v4.1-flash-1017', reasoningEffort: 'max' },
  })
  const { agent } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal(calls[0].reasoningEffort, 'low')
})

test('a route without a thinking level leaves the adapter default in place', async () => {
  const { runtime, calls } = fakeRuntime()
  const { agent } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal('reasoningEffort' in calls[0], false)
})

test('inherits the thinking level from the default selection before the first request', async () => {
  const { runtime, calls } = fakeRuntime({ selection: { provider: 'fallback', model: 'default-model', reasoningEffort: 'high' } })
  const { agent } = fakeAgent()
  agent.session.requestHeader = () => undefined
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal(calls[0].provider, 'fallback')
  assert.equal(calls[0].reasoningEffort, 'high')
})

test('an explicit config route wins over the session route', async () => {
  const { runtime, calls } = fakeRuntime({ config: { provider: 'pinned', model: 'pinned-model', reasoningEffort: 'low', maxTokens: 256 } })
  const { agent } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal(calls[0].provider, 'pinned')
  assert.equal(calls[0].model, 'pinned-model')
  assert.equal(calls[0].reasoningEffort, 'low')
  assert.equal(calls[0].maxTokens, 256)
})

test('a stalled provider request is bounded by timeoutMs', async () => {
  const { runtime } = fakeRuntime({
    config: { timeoutMs: 60 },
    stream: (options) => stalled(options.signal),
  })
  const { agent, appended } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.whenIdle()
  assert.equal(appended[0].data.kind, 'error')
  assert.equal(appended[0].data.text, 'Side question failed: no answer within 60ms')
})

test('unloading the plugin aborts in-flight questions and settles their rows', async () => {
  const { runtime } = fakeRuntime({ stream: (options) => stalled(options.signal) })
  const { agent, appended } = fakeAgent()
  handleBtwInvocation(runtime, invocation(agent, 'hi there?'))
  await runtime.answers.dispose()
  assert.equal(appended[0].data.kind, 'error')
  assert.match(appended[0].data.text, /cancelled/)
})

async function* stalled(signal) {
  yield { type: 'text-delta', index: 0, text: 'partial' }
  if (signal.aborted) throw new Error('aborted')
  await new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
}
