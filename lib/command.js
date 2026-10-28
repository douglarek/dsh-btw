/**
 * The `/btw` slash command.
 *
 * The Harness command executor runs a handler directly against the receiving
 * agent, outside the prompt queue and outside any turn: the question is
 * answered while the main task keeps running, and only the command lifecycle
 * (`command/run`, `command/done`) enters the session log.
 *
 * The handler returns before the model does. A claimed command submits
 * synchronously from the composer's point of view, and the composer keeps the
 * submitted line until the handler returns, so awaiting the answer here would
 * hold the user's draft for the whole side request. The answer is delivered
 * afterwards by {@link DetachedAnswers}, which settles the same command row.
 *
 * @module dsh-btw/command
 */

import { trimQuestion } from './text.js'

/** Command name without the leading slash. Matches the Client renderer key. */
export const BTW_COMMAND_NAME = 'btw'

/** Shown when the command arrives without a question. */
export const BTW_USAGE = 'Usage: /btw <question> — ask a side question without interrupting the current task.'

/**
 * Build the command definition registered with the Host command registry.
 *
 * @param {object} runtime Plugin runtime: `{ ctx, config, logger }`.
 * @returns {object} a `CommandDefinition`.
 */
export function createBtwCommandDefinition(runtime) {
  return {
    name: BTW_COMMAND_NAME,
    description: runtime.config.description,
    input: { hint: '<question>' },
    handler: (invocation) => handleBtwInvocation(runtime, invocation),
  }
}

/**
 * Admit one `/btw` invocation and start its detached answer.
 *
 * @param {object} runtime Plugin runtime: `{ ctx, config, logger, answers }`.
 * @param {object} invocation The executor's `CommandInvocation`.
 * @returns {object} the immediate `CommandResult` — the row's own answer arrives later.
 */
export function handleBtwInvocation(runtime, invocation) {
  const question = trimQuestion(invocation?.rawInput)
  if (question === '') return { kind: 'error', text: BTW_USAGE }

  runtime.answers.start(invocation.agent, invocation.commandId, question)
  runtime.logger?.debug?.(`dsh-btw: started a side question (${question.length} chars)`)
  return { kind: 'success' }
}
