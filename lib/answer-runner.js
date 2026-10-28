/**
 * Detached side-question delivery.
 *
 * The Harness settles a claimed command's submission on its handler's return,
 * and the composer keeps the submitted line until then. A handler that awaited
 * the model would therefore hold the user's draft for the whole side request, so
 * `/btw` returns at once and this runner delivers the answer afterwards as the
 * row's settlement (`command/done`, the event the Chat command node folds).
 *
 * @module dsh-btw/answer-runner
 */

import { askSideQuestion } from './side-question.js'

/** Upper bound on how long plugin unload waits for aborted requests. */
const DISPOSE_GRACE_MS = 2000

export class DetachedAnswers {
  /**
   * @param {object} runtime Plugin runtime (`ctx`, `config`, `logger`).
   */
  constructor(runtime) {
    this.runtime = runtime
    this.active = new Map()
    this.closing = false
  }

  /**
   * Start one side question and settle its command row when it completes.
   *
   * @param {object} agent Receiving agent.
   * @param {string} commandId Lifecycle id of the `/btw` run that asked.
   * @param {string} question The side question.
   */
  start(agent, commandId, question) {
    if (this.closing) {
      this.settle(agent, commandId, { kind: 'error', text: 'Side question cancelled: the plugin is unloading' })
      return
    }

    const controller = new AbortController()
    const promise = this.run(agent, commandId, question, controller.signal)
      .catch((error) => {
        this.runtime.logger?.warn?.('dsh-btw: detached answer task failed:', error)
      })
      .finally(() => {
        this.active.delete(commandId)
      })

    this.active.set(commandId, { controller, promise })
  }

  /** Resolve once every started side question has settled. */
  async whenIdle() {
    while (this.active.size > 0) {
      await Promise.allSettled([...this.active.values()].map((entry) => entry.promise))
    }
  }

  /**
   * Abort in-flight side questions and wait, within a bound, for their rows to settle.
   *
   * A provider stream that ignores cancellation must not block plugin unload, so
   * the wait is bounded and a still-open request only leaves a warning behind.
   */
  async dispose() {
    this.closing = true
    const pending = [...this.active.values()]
    for (const entry of pending) entry.controller.abort(new Error('dsh-btw is unloading'))
    const settled = Promise.allSettled(pending.map((entry) => entry.promise))
    const grace = new Promise((resolve) => {
      const timer = setTimeout(resolve, DISPOSE_GRACE_MS)
      timer.unref?.()
    })
    await Promise.race([settled, grace])
    if (this.active.size > 0) {
      this.runtime.logger?.warn?.(`dsh-btw: ${this.active.size} side question(s) still open at unload`)
    }
  }

  async run(agent, commandId, question, signal) {
    let result
    try {
      result = { kind: 'success', text: await askSideQuestion(this.runtime, agent, question, signal) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result = { kind: 'error', text: `Side question failed: ${message}` }
    }
    this.settle(agent, commandId, result)
  }

  /**
   * Append the answer as the row's settlement.
   *
   * `command/run` and the first `command/done` were logged by the command
   * executor when the handler returned; this event carries the same
   * `commandId`, so the Chat command node folds it into the row that is already
   * on screen instead of creating a second one.
   *
   * @param {object} agent Receiving agent.
   * @param {string} commandId Lifecycle id of the originating run.
   * @param {{ kind: 'success'|'error', text: string }} result Settled outcome.
   */
  settle(agent, commandId, result) {
    try {
      agent.session.append('command/done', {
        commandId,
        kind: result.kind,
        ...typeof result.text === 'string' && result.text !== '' ? { text: result.text } : {},
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.runtime.logger?.warn?.(`dsh-btw: could not settle command "${commandId}": ${message}`)
    }
  }
}
