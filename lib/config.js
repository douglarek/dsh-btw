/**
 * Configuration resolution for dsh-btw.
 *
 * The bundle row's `config` is authored by hand in `cordis.patch.yml`, so this
 * module is the only validator: it applies defaults, rejects values that would
 * degrade silently, and reports unknown keys instead of dropping them quietly.
 *
 * @module dsh-btw/config
 */

/** Largest delay a timer accepts, mirroring the Harness timeout contract. */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/**
 * Default menu copy. The `/` menu renders a third-party Host command with its
 * catalog description only — the client localizes just its own first-party
 * definition ids — so the default carries both languages and `description`
 * overrides it for any deployment that wants a single one.
 */
const DEFAULT_DESCRIPTION = '旁问：不打断当前任务地提问 · Ask a side question without interrupting'

/** Accepted `context` values: a standalone question, or the session transcript. */
const CONTEXT_MODES = new Set(['none', 'session'])

/** Accepted configuration keys and their defaults. */
const DEFAULTS = Object.freeze({
  enabled: true,
  description: DEFAULT_DESCRIPTION,
  context: 'none',
  maxContextChars: 12000,
  maxToolResultChars: 1200,
  includeToolResults: true,
  timeoutMs: 120000,
  temperature: 0.2,
})

const KNOWN_KEYS = new Set([
  ...Object.keys(DEFAULTS),
  'maxTokens',
  'reasoningEffort',
  'provider',
  'model',
])

/**
 * Resolve one raw bundle configuration.
 *
 * @param {unknown} rawConfig The bundle row's `config`, or undefined.
 * @returns {{ config: Readonly<object>, warnings: string[] }}
 * @throws {Error} when a supplied value has the wrong type or an unusable range.
 */
export function resolveConfig(rawConfig) {
  if (rawConfig !== undefined && rawConfig !== null && (typeof rawConfig !== 'object' || Array.isArray(rawConfig))) {
    throw new Error('dsh-btw: config must be an object')
  }
  const input = rawConfig ?? {}
  const warnings = []
  for (const key of Object.keys(input)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`unknown config key "${key}" is ignored`)
  }

  const config = {
    enabled: booleanOf(input.enabled, DEFAULTS.enabled, 'enabled'),
    description: textOf(input.description, DEFAULTS.description, 'description'),
    context: contextOf(input.context, DEFAULTS.context, 'context'),
    maxContextChars: integerOf(input.maxContextChars, DEFAULTS.maxContextChars, 'maxContextChars', { min: 0 }),
    maxToolResultChars: integerOf(input.maxToolResultChars, DEFAULTS.maxToolResultChars, 'maxToolResultChars', { min: 0 }),
    includeToolResults: booleanOf(input.includeToolResults, DEFAULTS.includeToolResults, 'includeToolResults'),
    timeoutMs: integerOf(input.timeoutMs, DEFAULTS.timeoutMs, 'timeoutMs', { min: 1, max: MAX_TIMER_DELAY_MS }),
    temperature: numberOf(input.temperature, DEFAULTS.temperature, 'temperature', { min: 0, max: 2 }),
  }

  const provider = stringOf(input.provider, 'provider')
  const model = stringOf(input.model, 'model')
  if ((provider === undefined) !== (model === undefined)) {
    throw new Error('dsh-btw: provider and model must be supplied together')
  }
  if (provider !== undefined) {
    config.provider = provider
    config.model = model
  }

  const reasoningEffort = stringOf(input.reasoningEffort, 'reasoningEffort')
  if (reasoningEffort !== undefined) config.reasoningEffort = reasoningEffort

  const maxTokens = optionalInteger(input.maxTokens, 'maxTokens', { min: 1 })
  if (maxTokens !== undefined) config.maxTokens = maxTokens

  return { config: Object.freeze(config), warnings }
}

function booleanOf(value, fallback, key) {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(`dsh-btw: ${key} must be a boolean`)
  return value
}

function textOf(value, fallback, key) {
  if (value === undefined) return fallback
  const text = stringOf(value, key)
  return text ?? fallback
}

function contextOf(value, fallback, key) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !CONTEXT_MODES.has(value)) {
    throw new Error(`dsh-btw: ${key} must be one of ${[...CONTEXT_MODES].map((mode) => `"${mode}"`).join(', ')}`)
  }
  return value
}

function integerOf(value, fallback, key, range) {
  if (value === undefined) return fallback
  return optionalInteger(value, key, range)
}

function optionalInteger(value, key, range) {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`dsh-btw: ${key} must be an integer`)
  }
  if (range.min !== undefined && value < range.min) throw new Error(`dsh-btw: ${key} must be >= ${range.min}`)
  if (range.max !== undefined && value > range.max) throw new Error(`dsh-btw: ${key} must be <= ${range.max}`)
  return value
}

function numberOf(value, fallback, key, range) {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`dsh-btw: ${key} must be a number`)
  if (range.min !== undefined && value < range.min) throw new Error(`dsh-btw: ${key} must be >= ${range.min}`)
  if (range.max !== undefined && value > range.max) throw new Error(`dsh-btw: ${key} must be <= ${range.max}`)
  return value
}

function stringOf(value, key) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`dsh-btw: ${key} must be a non-empty string`)
  return value.trim()
}
