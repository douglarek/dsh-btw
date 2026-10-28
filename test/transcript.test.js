import assert from 'node:assert/strict'
import test from 'node:test'
import { trimQuestion, clipText } from '../lib/text.js'
import { buildTranscript, renderQuestion, toRequestMessages } from '../lib/transcript.js'

const options = Object.freeze({ maxContextChars: 10000, maxToolResultChars: 1200, includeToolResults: true })
const ROUTE = Object.freeze({ provider: 'tokenhub', model: 'deepseek-v4.1-flash-1017' })

function text(value) {
  return { type: 'text', text: value }
}

test('trimQuestion keeps inner line breaks and strips the command separator', () => {
  assert.equal(trimQuestion('  what does WBC\nstand for?  '), 'what does WBC\nstand for?')
  assert.equal(trimQuestion(undefined), '')
  assert.equal(trimQuestion('   '), '')
})

test('clipText never splits a surrogate pair', () => {
  assert.equal(clipText('😀😀😀', 2), '😀😀 …')
  assert.equal(clipText('short', 10), 'short')
  assert.equal(clipText('anything', 0), '')
})

test('builds a text-only transcript from the derived history', () => {
  const messages = [
    { role: 'system', content: [text('agent system prompt')] },
    { role: 'developer', content: [text('tool addition')] },
    { role: 'user', content: [text('fix the retry loop first')] },
    { role: 'assistant', content: [{ type: 'reasoning', text: 'thinking' }, text('On it.')] },
    { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'bash', arguments: '{}' }] },
    { role: 'tool', toolCallId: 'c1', content: [text('WBC = white blood cell count')] },
  ]

  const { entries, omitted } = buildTranscript(messages, options)
  assert.equal(omitted, 0)
  assert.deepEqual(entries, [
    { role: 'user', text: 'fix the retry loop first' },
    { role: 'assistant', text: 'On it.' },
    { role: 'user', text: 'Tool result (bash):\nWBC = white blood cell count' },
  ])
})

test('merges adjacent same-role entries so the request alternates at most once per role', () => {
  const messages = [
    { role: 'user', content: [text('one')] },
    { role: 'user', content: [text('two')] },
    { role: 'assistant', content: [text('three')] },
  ]
  const { entries } = buildTranscript(messages, options)
  assert.deepEqual(entries, [
    { role: 'user', text: 'one\n\ntwo' },
    { role: 'assistant', text: 'three' },
  ])
})

test('drops tool output when disabled and caps one result', () => {
  const messages = [
    { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'grep', arguments: '{}' }] },
    { role: 'tool', toolCallId: 'c1', content: [text('x'.repeat(50))] },
  ]
  assert.deepEqual(buildTranscript(messages, { ...options, includeToolResults: false }).entries, [])

  const { entries } = buildTranscript(messages, { ...options, maxToolResultChars: 5 })
  assert.equal(entries[0].text, 'Tool result (grep):\nxxxxx …')
})

test('keeps the opening task plus the recent tail when the transcript exceeds the budget', () => {
  const messages = [
    { role: 'user', content: [text('opening task')] },
    { role: 'assistant', content: [text('a'.repeat(100))] },
    { role: 'user', content: [text('b'.repeat(100))] },
    { role: 'assistant', content: [text('recent answer')] },
  ]
  const { entries, omitted } = buildTranscript(messages, { ...options, maxContextChars: 140 })
  assert.equal(entries[0].text, 'opening task')
  assert.equal(entries.at(-1).text, 'recent answer')
  assert.equal(entries.length, 3)
  assert.equal(omitted, 1)
})

test('an empty budget still produces a valid, empty transcript request list', () => {
  const { entries, omitted } = buildTranscript([{ role: 'user', content: [text('hi')] }], { ...options, maxContextChars: 0 })
  assert.deepEqual(entries, [])
  assert.equal(omitted, 1)

  const messages = toRequestMessages(entries, ROUTE)
  messages.push({ role: 'user', content: [text(renderQuestion('why?', omitted))] })
  assert.equal(messages.length, 1)
  assert.match(messages[0].content[0].text, /1 earlier message\(s\).*were omitted/s)
  assert.match(messages[0].content[0].text, /<side_question>\nwhy\?\n<\/side_question>/)
})

test('assistant request messages carry the model source the runtime reads', () => {
  const { entries } = buildTranscript(
    [
      { role: 'user', content: [text('fix the retry loop first')] },
      { role: 'assistant', content: [text('Looking at it.')] },
      { role: 'user', content: [text('and then?')] },
    ],
    options,
  )
  const messages = toRequestMessages(entries, ROUTE)
  assert.deepEqual(messages[0], { role: 'user', content: [text('fix the retry loop first')] })
  assert.deepEqual(messages[1], {
    role: 'assistant',
    content: [text('Looking at it.')],
    source: { kind: 'model', provider: ROUTE.provider, model: ROUTE.model },
  })
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    assert.equal(typeof message.source?.provider, 'string')
    assert.equal(typeof message.source?.model, 'string')
    assert.equal(message.source.replayState, undefined)
  }
})

test('renderQuestion omits the note when nothing was dropped', () => {
  const rendered = renderQuestion('what is WBC?', 0)
  assert.doesNotMatch(rendered, /omitted/)
  assert.match(rendered, /<side_question>\nwhat is WBC\?\n<\/side_question>/)
})
