# dsh-btw

Side questions for DeepSeek Harness. `/btw <question>` asks the session's own model an aside while the main task keeps running: nothing is queued, the running turn is not interrupted, and the answer never enters the model's conversation.

The command surface follows Grok Build's `/btw` (`crates/codegen/xai-grok-pager/src/slash/commands/btw.rs` and `scrollback/blocks/btw.rs`): a command that bypasses the prompt queue, a golden-accented `/btw <question>` row, and an answer kept outside the main turn. One deliberate difference: Grok answers from the live session, while this plugin defaults to a standalone question with no conversation at all; set `context: session` for the Grok behavior.

## Use

```text
/btw what does WBC stand for?
/btw which file owns the retry loop?
```

- The row appears immediately with the question and `Answering…`, then shows the answer. The composer clears as soon as the command is admitted, not when the model replies.
- The answer is written by the session's current provider and model. By default the question is standalone (`context: none`); `context: session` also sends the conversation.
- Answers render Markdown: headings, lists, quotes, tables, fenced code, inline code, bold, italic, links.
- When the model reasons before answering, the row carries a collapsible **Thinking** block above the answer, so the aside shows the work it did at the inherited thinking level.
- The summary line is a disclosure control like the host's own Turn row: the question ellipsizes to one line, the chevron flips, and a click anywhere on the line folds the answer away or brings it back. Fenced code keeps its line breaks in its own block.
- `Esc`, drafting, and the queue are untouched: a second question, a follow-up prompt, or a running turn all continue independently.

The answer is not a model message and is not part of the next request. It is recorded as the command lifecycle (`command/run`, `command/done`) in the session log, so it survives reload, fork, and replay, and appears in the session transcript exactly once.

## Install

From a DeepSeek Harness profile, either form works — the published spec, or a local checkout:

```text
plugin_manager install_bundle  target=github:douglarek/dsh-btw
plugin_manager install_bundle  target=/absolute/path/to/dsh-btw
```

The bundle inserts one Host row named `dsh-btw` and declares its browser half through `dsh.client`. Enabling the row makes `/btw` available in the composer's command menu and registers the `/btw` renderer in the conversation.

### Configuration

Every key has a code default; the values in `cordis.patch.yml` are those defaults.

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Mount the command at all. |
| `context` | `none` | What the side request may see. `none` asks a standalone question with no conversation at all; `session` prepends the bounded conversation transcript below, which is what Grok's `/btw` does. |
| `description` | `旁问：不打断当前任务地提问 · Ask a side question without interrupting` | Copy shown under the composer's `/` list. The client renders a third-party Host command's catalog description verbatim, so this is the only place to set its wording and language. |
| `maxContextChars` | `12000` | Code-point budget for the conversation transcript sent with the question. The opening task prompt and the most recent messages are kept; the rest is summarized as an omission count. |
| `maxToolResultChars` | `1200` | Per-tool-result cap inside that transcript. |
| `includeToolResults` | `true` | Whether tool output is part of the transcript. Disable it to keep side questions cheap on long sessions. |
| `timeoutMs` | `120000` | Bound on one side request; `0` is rejected. |
| `temperature` | `0.2` | Sampling temperature for the side request. |
| `maxTokens` | unset | Optional output bound for the side request. |
| `reasoningEffort` | unset | Optional override of the thinking level. Unset inherits the level the session itself runs: its current model selection, then its latest request route; when neither names a level, the profile default model's level applies for the same provider and model. |
| `provider`, `model` | unset | Optional pinned route. Unset uses the session's latest request route, then the profile's default model. Supply both together. |

## How it differs from a prompt

| | Prompt | `/btw` |
| --- | --- | --- |
| Waits for the running turn | yes | no |
| Enters the model's next request | yes | no |
| Sees the session's conversation | yes | only with `context: session` |
| Uses tools | yes | no |
| Appears in the session log | as a message | as command lifecycle only |

## How it works

- **Host** (`index.js`, `lib/`): registers the `btw` command with `ctx.commands.register()`. The side request runs the session's own route — its provider, model, and reasoning effort — so an aside answers at the same thinking level as the main turn, falling back to the profile default model's level when the session never picked one. The handler runs outside any turn and returns at once: the composer keeps a claimed command's line until its handler returns, so awaiting the model there would hold the user's draft for the whole request. `lib/answer-runner.js` then resolves the route from the session's current model selection (falling back to `session.requestHeader()`, then `ctx.agentDefaultModel`), streams one `ctx.llm.stream()` request with a fixed side-question policy and no tools, and settles the same row by appending `command/done` for the run's `commandId`. Under `context: session` it first flattens `session.deriveMessages()` into a text-only transcript; under the default `none` the request is the question alone. `llm` and `commands` are hard injections, so the plugin stays inactive in a profile without them.
- **Client** (`client.js`): registers `conversation.chat.commandview` under the key `btw`, the keyed slot the Chat view dispatches by command name. The component renders the question on the disclosure line and the answer as Markdown through a small block/inline parser this bundle owns (the host's Markdown component is not importable from a plugin); theming uses only `--dsw-alias-*` tokens, and text comes from the plugin's own locale namespace.

## Limitations

- `/btw` must start the message. Grok also hoists a mid-message `/btw` and treats the rest of the line as the side question; the Harness command plane only resolves a command at byte zero, so `fix the retry loop. /btw why?` is sent as an ordinary prompt.
- The answer arrives in one piece. The command plane settles a handler once, so the row cannot stream tokens.
- Delivery is a second `command/done` for the originating `commandId` (the executor already logged one when the handler returned). The Chat command node folds it into the existing row; readers that expect exactly one `command/done` per run will see two.
- The lifecycle carries one `text` string, so a row with reasoning stores it inline between `<<<btw:reasoning>>>` and `<<<btw:answer>>>` marker lines (`lib/result-text.js`). The row parser reads them; the shipped generic command card, which does not, would show the markers as text.
- Tool use, images, and plan-mode side requests are out of scope: the side request declares no tools and sends text only.
- A side question started from a session that has never sent a request needs `provider` and `model` in the config, because there is no route to inherit yet.
- The `/` list draws a glyph and a localized title only for the six first-party definition ids in `dsh-client-ui-commands`' `HOST_FACES` table; any other Host command renders its name plus this plugin's `description`. A third-party command cannot add an icon there, and a client-side command contribution — which could — takes no arguments, so `/btw <question>` would stop working.

## Development

```sh
node --test        # unit tests
node scripts/check.js  # syntax, manifest, bundle entry points, locale keys
```
