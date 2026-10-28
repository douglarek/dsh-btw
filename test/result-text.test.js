import assert from 'node:assert/strict'
import test from 'node:test'
import { ANSWER_OPEN, REASONING_OPEN, decodeResult, encodeResult } from '../lib/result-text.js'

test('a plain answer carries no markers', () => {
  assert.equal(encodeResult('just the answer', ''), 'just the answer')
  assert.equal(encodeResult('just the answer', '   '), 'just the answer')
  assert.deepEqual(decodeResult('just the answer'), { reasoning: '', answer: 'just the answer' })
})

test('reasoning and answer round-trip', () => {
  const text = encodeResult('the answer', ' step one\nstep two ')
  assert.equal(text, `${REASONING_OPEN}\nstep one\nstep two\n${ANSWER_OPEN}\n\nthe answer`)
  assert.deepEqual(decodeResult(text), { reasoning: 'step one\nstep two', answer: 'the answer' })
})

test('multi-line answers keep their layout', () => {
  const answer = '# 结论\n\n- 一\n- 二\n\n```js\nconst a = 1\n```'
  const decoded = decodeResult(encodeResult(answer, '思考'))
  assert.equal(decoded.reasoning, '思考')
  assert.equal(decoded.answer, answer)
})

test('a truncated payload degrades to a plain answer', () => {
  assert.deepEqual(decodeResult(`${REASONING_OPEN}\nonly reasoning`), {
    reasoning: '',
    answer: `${REASONING_OPEN}\nonly reasoning`,
  })
  assert.deepEqual(decodeResult(''), { reasoning: '', answer: '' })
  assert.deepEqual(decodeResult(undefined), { reasoning: '', answer: '' })
})
