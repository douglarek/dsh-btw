/**
 * dsh-btw — side questions for DeepSeek Harness.
 *
 * `/btw <question>` answers through the session's own model route without
 * interrupting the running turn. This Host half owns the command and the
 * provider request; `client.js` renders the `/btw` row in the conversation.
 *
 * @module dsh-btw
 */

import { DetachedAnswers } from './lib/answer-runner.js'
import { createBtwCommandDefinition } from './lib/command.js'
import { resolveConfig } from './lib/config.js'

export const name = 'dsh-btw'
export const inject = ['commands', 'llm']

/**
 * Mount the `/btw` command.
 *
 * @param {object} ctx Cordis plugin context.
 * @param {unknown} rawConfig The bundle row's `config`.
 */
export function apply(ctx, rawConfig) {
  let resolved
  try {
    resolved = resolveConfig(rawConfig)
  } catch (error) {
    ctx.logger?.error?.('dsh-btw: invalid configuration:', error)
    throw error
  }

  const { config, warnings } = resolved
  for (const warning of warnings) ctx.logger?.warn?.(`dsh-btw: ${warning}`)

  if (!config.enabled) {
    ctx.logger?.info?.('dsh-btw: disabled by configuration')
    return
  }

  const commands = ctx.get('commands')
  if (commands === undefined || commands === null) {
    ctx.logger?.warn?.('dsh-btw: the commands service is not mounted; /btw is unavailable')
    return
  }

  const runtime = { ctx, config, logger: ctx.logger ?? {} }
  const answers = new DetachedAnswers(runtime)
  runtime.answers = answers
  ctx.effect(() => () => answers.dispose(), 'dsh-btw.answers')

  const definition = createBtwCommandDefinition(runtime)
  ctx.effect(() => commands.register(definition), 'dsh-btw.command.btw')

  ctx.logger?.info?.('dsh-btw: /btw is available')
}
