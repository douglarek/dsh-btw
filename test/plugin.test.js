import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, inject, name } from '../index.js'

function fakeCtx(services = {}) {
  const registrations = []
  const effects = []
  const logs = []
  const ctx = {
    get(service) {
      return services[service]
    },
    effect(callback, label) {
      effects.push(label)
      return callback()
    },
    logger: {
      debug: (...args) => logs.push(['debug', ...args]),
      info: (...args) => logs.push(['info', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
      error: (...args) => logs.push(['error', ...args]),
    },
  }
  return {
    ctx,
    registrations,
    effects,
    logs,
    withCommands() {
      services.commands = {
        register(definition) {
          registrations.push(definition)
          return () => registrations.splice(registrations.indexOf(definition), 1)
        },
      }
      services.llm = { stream: () => (async function* () {})() }
      return this
    },
  }
}

test('declares its name and hard dependencies', () => {
  assert.equal(name, 'dsh-btw')
  assert.deepEqual(inject, ['commands', 'llm'])
})

test('registers exactly one /btw command through a disposed effect', () => {
  const harness = fakeCtx().withCommands()
  apply(harness.ctx, undefined)
  assert.equal(harness.registrations.length, 1)
  assert.equal(harness.registrations[0].name, 'btw')
  assert.deepEqual(harness.effects, ['dsh-btw.answers', 'dsh-btw.command.btw'])

  const result = harness.registrations[0].handler({ commandId: 'cmd-1', agent: { id: 's' }, rawInput: '   ', attachments: [], signal: undefined })
  assert.equal(result.kind, 'error')
})

test('does nothing when the configuration disables it', () => {
  const harness = fakeCtx().withCommands()
  apply(harness.ctx, { enabled: false })
  assert.equal(harness.registrations.length, 0)
})

test('warns instead of throwing when the command service is absent', () => {
  const harness = fakeCtx()
  apply(harness.ctx, undefined)
  assert.equal(harness.registrations.length, 0)
  assert.ok(harness.logs.some(([level, message]) => level === 'warn' && /commands service/.test(message)))
})

test('propagates an invalid configuration loudly', () => {
  const harness = fakeCtx().withCommands()
  assert.throws(() => apply(harness.ctx, { temperature: 'hot' }), /temperature must be a number/)
})

test('logs configuration warnings without failing the mount', () => {
  const harness = fakeCtx().withCommands()
  apply(harness.ctx, { maxContextCharacter: 10 })
  assert.equal(harness.registrations.length, 1)
  assert.ok(harness.logs.some(([level, message]) => level === 'warn' && /maxContextCharacter/.test(message)))
})
