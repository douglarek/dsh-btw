import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from '../lib/config.js'

test('applies documented defaults', () => {
  const { config, warnings } = resolveConfig(undefined)
  assert.deepEqual(warnings, [])
  assert.equal(config.enabled, true)
  assert.equal(config.context, 'none')
  assert.match(config.description, /旁问/)
  assert.match(config.description, /side question/)
  assert.equal(config.maxContextChars, 12000)
  assert.equal(config.maxToolResultChars, 1200)
  assert.equal(config.includeToolResults, true)
  assert.equal(config.timeoutMs, 120000)
  assert.equal(config.temperature, 0.2)
  assert.equal(config.provider, undefined)
  assert.equal(config.maxTokens, undefined)
  assert.ok(Object.isFrozen(config))
})

test('keeps the optional route and request controls', () => {
  const { config } = resolveConfig({
    provider: 'tokenhub',
    model: 'deepseek-v4.1-flash-1017',
    reasoningEffort: 'low',
    maxTokens: 800,
    temperature: 0,
    enabled: false,
  })
  assert.equal(config.provider, 'tokenhub')
  assert.equal(config.model, 'deepseek-v4.1-flash-1017')
  assert.equal(config.reasoningEffort, 'low')
  assert.equal(config.maxTokens, 800)
  assert.equal(config.temperature, 0)
  assert.equal(config.enabled, false)
})

test('accepts a deployment-specific menu description', () => {
  assert.equal(resolveConfig({ description: '旁问' }).config.description, '旁问')
  assert.throws(() => resolveConfig({ description: '   ' }), /description must be a non-empty string/)
})

test('accepts both context modes and rejects anything else', () => {
  assert.equal(resolveConfig({ context: 'session' }).config.context, 'session')
  assert.equal(resolveConfig({ context: 'none' }).config.context, 'none')
  assert.throws(() => resolveConfig({ context: 'file' }), /context must be one of "none", "session"/)
})

test('rejects a half-supplied route', () => {
  assert.throws(() => resolveConfig({ provider: 'tokenhub' }), /provider and model must be supplied together/)
  assert.throws(() => resolveConfig({ model: 'deepseek-v4.1-flash-1017' }), /provider and model must be supplied together/)
})

test('rejects unusable values instead of degrading silently', () => {
  assert.throws(() => resolveConfig({ enabled: 'yes' }), /enabled must be a boolean/)
  assert.throws(() => resolveConfig({ maxContextChars: 1.5 }), /maxContextChars must be an integer/)
  assert.throws(() => resolveConfig({ maxContextChars: -1 }), /maxContextChars must be >= 0/)
  assert.throws(() => resolveConfig({ timeoutMs: 0 }), /timeoutMs must be >= 1/)
  assert.throws(() => resolveConfig({ temperature: 3 }), /temperature must be <= 2/)
  assert.throws(() => resolveConfig({ maxTokens: 0 }), /maxTokens must be >= 1/)
  assert.throws(() => resolveConfig('nope'), /config must be an object/)
})

test('reports unknown keys as warnings', () => {
  const { warnings } = resolveConfig({ maxContextCharacter: 10 })
  assert.deepEqual(warnings, ['unknown config key "maxContextCharacter" is ignored'])
})
