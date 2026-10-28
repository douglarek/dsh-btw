/**
 * dsh-btw — browser half.
 *
 * Renders the `/btw` command row in the conversation flow. The Host executor
 * logs `command/run` before the side request starts, so this row shows the
 * question immediately, then the answer once the request settles. The command
 * view is keyed by the command name, so only `/btw` rows use it; every other
 * command keeps the shipped generic card.
 *
 * The row mirrors the Host's own Turn process row: a full-width summary button
 * with a bottom hairline, an ellipsized label, and a chevron that flips when the
 * answer is open.
 *
 * The answer is Markdown. This bundle cannot import the host's Markdown
 * component, so the block and inline subset below renders it with elements
 * styled from the shared theme tokens; anything it does not understand stays
 * literal text.
 */
window.__ModuleLoader__.load({
  id: 'dsh-btw',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dsh-btw'

    const EN = {
      'btw.answering': 'Answering…',
      'btw.reasoning': 'Thinking',
    }
    const ZH = {
      'btw.answering': '正在回答…',
      'btw.reasoning': '思考过程',
    }

    const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

    const CSS = `
.dshBtw-root { box-sizing: border-box; width: 100%; min-width: 0; display: flex; flex-direction: column; }
.dshBtw-head {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: calc(33px + var(--dsh-content-font-delta, 0px));
  align-items: center;
  padding: 0 0 8px;
  border: none;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
  background: none;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: var(--dsh-content-font-size, 14px);
  text-align: left;
  cursor: pointer;
  transition: color .1s;
  display: flex;
}
.dshBtw-head:disabled { cursor: default; }
.dshBtw-head:hover:not(:disabled) { color: var(--dsw-alias-label-secondary); }
.dshBtw-head:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dshBtw-token { flex: none; color: var(--dsw-alias-state-warn-primary); font-weight: 600; }
.dshBtw-question {
  min-width: 0;
  margin-left: 8px;
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.dshBtw-status { flex: none; margin-left: 8px; }
.dshBtw-chevron {
  width: 14px;
  height: 14px;
  flex: none;
  margin-left: 4px;
  color: inherit;
  transition: transform .1s;
}
.dshBtw-head[data-open='true'] .dshBtw-chevron { transform: rotate(180deg); }
.dshBtw-body {
  padding: 8px 0 2px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.dshBtw-body[data-error='true'] { color: var(--dsw-alias-state-error-primary); }
.dshBtw-reasoning { display: flex; flex-direction: column; gap: 4px; }
.dshBtw-reasoningToggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
}
.dshBtw-reasoningToggle:hover { color: var(--dsw-alias-label-secondary); }
.dshBtw-reasoningToggle:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 2px; }
.dshBtw-chevronSmall { width: 12px; height: 12px; margin: 0; }
.dshBtw-reasoningToggle[aria-expanded='true'] .dshBtw-chevronSmall { transform: rotate(180deg); }
.dshBtw-reasoningBody {
  padding-left: 10px;
  border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 320px;
  overflow: auto;
}
.dshBtw-body > * + * { margin-top: 8px; }
.dshBtw-text { white-space: pre-wrap; }
.dshBtw-h { font-weight: 600; line-height: 1.4; }
.dshBtw-h[data-level='1'] { font-size: 15px; }
.dshBtw-h[data-level='2'] { font-size: 14px; }
.dshBtw-h[data-level='3'], .dshBtw-h[data-level='4'], .dshBtw-h[data-level='5'], .dshBtw-h[data-level='6'] { font-size: 13px; }
.dshBtw-list { margin: 0; padding-left: 20px; }
.dshBtw-li + .dshBtw-li { margin-top: 2px; }
.dshBtw-li .dshBtw-list { margin-top: 2px; }
.dshBtw-quote {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
}
.dshBtw-code {
  margin: 0;
  padding: 8px 10px;
  border: .5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg, 8px);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: ${MONO};
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
}
.dshBtw-inlineCode {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  font-family: ${MONO};
  font-size: 12px;
  white-space: pre-wrap;
}
.dshBtw-link { color: var(--dsw-alias-brand-primary); text-decoration: none; }
.dshBtw-link:hover { text-decoration: underline; }
.dshBtw-hr { margin: 10px 0; border: 0; border-top: .5px solid var(--dsw-alias-border-l1); }
.dshBtw-tableWrap { overflow-x: auto; }
.dshBtw-table { border-collapse: collapse; font-size: 12.5px; }
.dshBtw-table th, .dshBtw-table td {
  border: .5px solid var(--dsw-alias-border-l1);
  padding: 4px 8px;
  text-align: left;
  vertical-align: top;
}
.dshBtw-table th { background: var(--dsw-alias-bg-layer-2); font-weight: 600; }
@media (prefers-reduced-motion: reduce) {
  .dshBtw-head, .dshBtw-chevron { transition: none; }
}
`

    const CHEVRON = h(
      'svg',
      {
        className: 'dshBtw-chevron',
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('path', {
        d: 'M4 6.25 8 10.25 12 6.25',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
    )

    const REASONING_CHEVRON = h(
      'svg',
      {
        className: 'dshBtw-chevron dshBtw-chevronSmall',
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('path', {
        d: 'M4 6.25 8 10.25 12 6.25',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
    )

    const FENCE = /^\s*```(.*)$/
    const FENCE_CLOSE = /^\s*```\s*$/
    const HEADING = /^(#{1,6})\s+(.*)$/
    const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
    const QUOTE = /^\s*>/
    const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
    const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/
    const INLINE =
      /`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|(?<![*\w])\*([^*\n]+)\*(?![*\w])|(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])|\[([^\]\n]+)\]\(([^)\s]+)\)/g

    function fallbackTranslate(key) {
      return EN[key] ?? key
    }

    function isBlockStart(lines, index) {
      const line = lines[index]
      return (
        FENCE.test(line) ||
        HEADING.test(line) ||
        RULE.test(line) ||
        QUOTE.test(line) ||
        LIST_ITEM.test(line) ||
        (line.includes('|') && index + 1 < lines.length && TABLE_RULE.test(lines[index + 1]))
      )
    }

    function splitRow(line) {
      return line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
    }

    /**
     * Split a settled row into the reasoning block and the answer.
     *
     * The Host sends one string through `command/done`, wrapping the reasoning
     * between two marker lines; text without markers is the answer itself.
     *
     * @param {string} text The settled command text.
     * @returns {{ reasoning: string, answer: string }} the parts.
     */
    function splitResult(text) {
      const value = typeof text === 'string' ? text : ''
      const prefix = '<<<btw:reasoning>>>\n'
      if (!value.startsWith(prefix)) return { reasoning: '', answer: value }
      const rest = value.slice(prefix.length)
      const marker = '\n<<<btw:answer>>>\n'
      const at = rest.indexOf(marker)
      if (at === -1) return { reasoning: '', answer: value }
      return { reasoning: rest.slice(0, at), answer: rest.slice(at + marker.length).replace(/^\n/, '') }
    }

    /**
     * Parse the Markdown subset this row renders.
     *
     * @param {string} source Answer text.
     * @returns {Array<object>} block nodes in document order.
     */
    function parseMarkdown(source) {
      const lines = String(source).replace(/\r\n?/g, '\n').split('\n')
      const blocks = []
      let index = 0

      while (index < lines.length) {
        const line = lines[index]
        if (line.trim() === '') {
          index += 1
          continue
        }

        const fence = FENCE.exec(line)
        if (fence !== null) {
          const body = []
          index += 1
          while (index < lines.length && !FENCE_CLOSE.test(lines[index])) {
            body.push(lines[index])
            index += 1
          }
          if (index < lines.length) index += 1
          blocks.push({ type: 'code', text: body.join('\n') })
          continue
        }

        const heading = HEADING.exec(line)
        if (heading !== null) {
          blocks.push({
            type: 'heading',
            level: heading[1].length,
            text: heading[2].replace(/\s+#+\s*$/, '').trim(),
          })
          index += 1
          continue
        }

        if (RULE.test(line)) {
          blocks.push({ type: 'hr' })
          index += 1
          continue
        }

        if (QUOTE.test(line)) {
          const quoted = []
          while (index < lines.length && QUOTE.test(lines[index])) {
            quoted.push(lines[index].replace(/^\s*>\s?/, ''))
            index += 1
          }
          blocks.push({ type: 'quote', text: quoted.join('\n') })
          continue
        }

        if (line.includes('|') && index + 1 < lines.length && TABLE_RULE.test(lines[index + 1])) {
          const header = splitRow(line)
          const rows = []
          index += 2
          while (index < lines.length && lines[index].trim() !== '' && lines[index].includes('|')) {
            rows.push(splitRow(lines[index]))
            index += 1
          }
          blocks.push({ type: 'table', header, rows })
          continue
        }

        const item = LIST_ITEM.exec(line)
        if (item !== null) {
          const list = parseList(lines, index, item[1].length)
          blocks.push(list.block)
          index = list.next
          continue
        }

        const paragraph = [line]
        index += 1
        while (index < lines.length && lines[index].trim() !== '' && !isBlockStart(lines, index)) {
          paragraph.push(lines[index])
          index += 1
        }
        blocks.push({ type: 'paragraph', text: paragraph.join('\n').replace(/\s+$/, '') })
      }

      return blocks
    }

    /**
     * Parse one list, including nested items by indentation.
     *
     * @param {string[]} lines Source lines.
     * @param {number} start Index of the first item line.
     * @param {number} baseIndent Indentation of this list's marker column.
     * @returns {{ block: object, next: number }} the list node and the next unparsed index.
     */
    function parseList(lines, start, baseIndent) {
      const items = []
      let ordered = false
      let index = start

      while (index < lines.length) {
        const match = LIST_ITEM.exec(lines[index])
        if (match === null) {
          if (items.length > 0 && lines[index].trim() !== '' && /^\s{2,}\S/.test(lines[index])) {
            items[items.length - 1].text += `\n${lines[index].trim()}`
            index += 1
            continue
          }
          break
        }

        const indent = match[1].length
        if (indent < baseIndent) break
        if (indent >= baseIndent + 2 && items.length > 0) {
          const nested = parseList(lines, index, indent)
          items[items.length - 1].children.push(nested.block)
          index = nested.next
          continue
        }

        ordered = match[2].length > 1 || /[.)]/.test(match[2])
        items.push({ text: match[3], children: [] })
        index += 1
      }

      return { block: { type: 'list', ordered, items }, next: index }
    }

    /**
     * Render inline Markdown inside one text run.
     *
     * @param {string} text Source text.
     * @param {string} keyPrefix Stable key prefix for this run.
     * @returns {Array<object|string>} React children.
     */
    function renderInline(text, keyPrefix) {
      const nodes = []
      const pattern = new RegExp(INLINE.source, 'g')
      let last = 0
      let counter = 0
      let match

      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index))
        const key = `${keyPrefix}-${counter}`
        counter += 1

        if (match[1] !== undefined) {
          nodes.push(h('code', { key, className: 'dshBtw-inlineCode' }, match[1]))
        } else if (match[2] !== undefined || match[3] !== undefined) {
          nodes.push(h('strong', { key }, renderInline(match[2] ?? match[3], key)))
        } else if (match[4] !== undefined) {
          nodes.push(h('del', { key }, renderInline(match[4], key)))
        } else if (match[5] !== undefined || match[6] !== undefined) {
          nodes.push(h('em', { key }, renderInline(match[5] ?? match[6], key)))
        } else if (match[7] !== undefined) {
          nodes.push(
            h(
              'a',
              { key, className: 'dshBtw-link', href: match[8], target: '_blank', rel: 'noreferrer noopener' },
              renderInline(match[7], key),
            ),
          )
        }

        last = match.index + match[0].length
      }

      if (last < text.length) nodes.push(text.slice(last))
      return nodes
    }

    /**
     * Render parsed blocks.
     *
     * @param {Array<object>} blocks Block nodes.
     * @param {string} keyPrefix Stable key prefix.
     * @returns {Array<object>} React elements.
     */
    function renderBlocks(blocks, keyPrefix) {
      return blocks.map((block, index) => {
        const key = `${keyPrefix}-${index}`

        if (block.type === 'heading') {
          return h('div', { key, className: 'dshBtw-h', 'data-level': block.level }, renderInline(block.text, key))
        }
        if (block.type === 'code') return h('pre', { key, className: 'dshBtw-code' }, block.text)
        if (block.type === 'hr') return h('hr', { key, className: 'dshBtw-hr' })
        if (block.type === 'quote') {
          return h('blockquote', { key, className: 'dshBtw-quote' }, renderInline(block.text, key))
        }
        if (block.type === 'table') {
          return h(
            'div',
            { key, className: 'dshBtw-tableWrap' },
            h(
              'table',
              { className: 'dshBtw-table' },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  block.header.map((cell, cellIndex) =>
                    h('th', { key: cellIndex }, renderInline(cell, `${key}-h${cellIndex}`)),
                  ),
                ),
              ),
              h(
                'tbody',
                null,
                block.rows.map((row, rowIndex) =>
                  h(
                    'tr',
                    { key: rowIndex },
                    row.map((cell, cellIndex) =>
                      h('td', { key: cellIndex }, renderInline(cell, `${key}-${rowIndex}-${cellIndex}`)),
                    ),
                  ),
                ),
              ),
            ),
          )
        }
        if (block.type === 'list') {
          return h(
            block.ordered ? 'ol' : 'ul',
            { key, className: 'dshBtw-list' },
            block.items.map((entry, itemIndex) => {
              const itemKey = `${key}-${itemIndex}`
              return h(
                'li',
                { key: itemKey, className: 'dshBtw-li' },
                renderInline(entry.text, itemKey),
                entry.children.length === 0 ? null : renderBlocks(entry.children, itemKey),
              )
            }),
          )
        }
        return h('div', { key, className: 'dshBtw-text' }, renderInline(block.text, key))
      })
    }

    /**
     * One `/btw` row: the question on a summary line, the answer beneath it.
     *
     * @param {object} props Slot props; `node` is the folded command lifecycle,
     * `t` is the locale seat bound to this plugin's namespace.
     */
    function BtwCommandRow({ node, t }) {
      const translate = typeof t === 'function' ? t : fallbackTranslate
      const [toggled, setToggled] = React.useState(null)

      const question = typeof node?.args === 'string' ? node.args.trim() : ''
      const outcome = node?.outcome ?? null
      const failed = outcome !== null && outcome.kind === 'error'
      const raw = typeof outcome?.text === 'string' ? outcome.text : ''
      const { reasoning, answer } = React.useMemo(() => splitResult(raw), [raw])
      // The Host settles the submission before the model answers, so a
      // successful outcome without text is still an open side question.
      const settled = outcome !== null && (failed || answer !== '' || reasoning !== '')
      const pending = !settled
      const foldable = settled
      const open = toggled === null ? true : toggled
      const state = pending ? 'running' : failed ? 'error' : 'done'
      const [reasoningOpen, setReasoningOpen] = React.useState(false)

      const blocks = React.useMemo(() => {
        if (answer === '') return []
        try {
          return parseMarkdown(answer)
        } catch {
          return null
        }
      }, [answer])

      const toggle = React.useCallback(() => {
        setToggled((value) => !(value === null ? true : value))
      }, [])

      const toggleReasoning = React.useCallback(() => {
        setReasoningOpen((value) => !value)
      }, [])

      return h(
        'div',
        { className: 'dshBtw-root', 'data-state': state },
        h(
          'button',
          {
            type: 'button',
            className: 'dshBtw-head',
            'data-open': foldable && open ? 'true' : undefined,
            disabled: !foldable,
            'aria-expanded': foldable ? open : undefined,
            onClick: toggle,
          },
          h('span', { className: 'dshBtw-token' }, '/btw'),
          question === '' ? null : h('span', { className: 'dshBtw-question' }, question),
          pending ? h('span', { className: 'dshBtw-status' }, translate('btw.answering')) : null,
          foldable ? CHEVRON : null,
        ),
        settled && open
          ? h(
              'div',
              { className: 'dshBtw-body', 'data-error': failed ? 'true' : undefined },
              reasoning === ''
                ? null
                : h(
                    'div',
                    { className: 'dshBtw-reasoning' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshBtw-reasoningToggle',
                        'aria-expanded': reasoningOpen,
                        onClick: toggleReasoning,
                      },
                      REASONING_CHEVRON,
                      h('span', null, translate('btw.reasoning')),
                    ),
                    reasoningOpen ? h('div', { className: 'dshBtw-reasoningBody' }, reasoning) : null,
                  ),
              blocks === null
                ? h('pre', { className: 'dshBtw-code' }, answer)
                : renderBlocks(blocks, 'b'),
            )
          : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = NS
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'dsh-btw:styles')

        ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'dsh-btw:dictionaries')

        ctx.slots.inject('conversation.chat.commandview', () =>
          ctx.slots.register(
            { name: 'conversation.chat.commandview', key: 'btw', locale: NS },
            BtwCommandRow,
          ),
        )
      },
      BtwCommandRow,
      parseMarkdown,
      renderInline,
    }
  },
})
