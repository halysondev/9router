# AGENTS.md — 9Router (DevEstacion fork)

This file contains instructions for AI coding agents working on the DevEstacion/9router fork. This fork adds OpenCode tool-calling support and local quota tracking for xAI.

## Project overview

9Router is an AI proxy gateway (Next.js + Node.js) that routes CLI tool requests (Claude Code, Cursor, Codex, OpenCode) to upstream providers. It translates formats (e.g. OpenAI to ConnectRPC for Cursor, or NDJSON for Grok) and tracks token usage.

**Key Fork Differences vs Upstream (`decolua/9router`):**
- **Cursor tool calling:** `open-sse/utils/cursorToolMapping.js` handles bidirectional tool name translation (e.g., `bash` <-> `shell`) so OpenCode can use Cursor's native tools.
- **xAI quota aggregation:** xAI lacks a public quota API. The route handler `src/app/api/usage/[connectionId]/route.js` manually aggregates 30-day usage from the local `usageHistory` SQLite table.

## Setup commands

- Install dependencies: `npm install` in the root, and `cd cli && npm install`
- Build the CLI package: `cd cli && npm run build` (Required after ANY changes to `src/` or `open-sse/`)
- Restart the background service: `systemctl --user daemon-reload && systemctl --user restart 9router`

## Testing instructions

- Run unit tests: `cd tests && NODE_PATH=/tmp/node_modules /tmp/node_modules/.bin/vitest run --config ./vitest.config.js`
- Test files live in `tests/unit/`. When modifying tool mapping or usage aggregation, run the corresponding `.test.js` file.
- The `tests/translator/AGENTS.md` contains specific instructions for the translator test suite.

## Code style and Architecture

- Use ES Modules (`import`/`export`).
- **Separation of concerns:** `open-sse/` is the proxy/streaming layer. Do NOT import Next.js specific code or `better-sqlite3` directly into `open-sse/` files, as it will break the Node 25 runtime service (ABI mismatch).
- **Database access:** Database operations must go through `src/lib/db/` via `src/lib/localDb.js`.
- **xAI Quota rows:** Cumulative xAI quota rows (Total spend, Total tokens) have no hard cap. They MUST include `unlimited: true` and `remaining: 100` so the UI renders the green "100%" badge and hides the progress bar instead of showing a misleading "0%".

## PR instructions

- Title format: `type(scope): description` (e.g., `feat(cursor): add identity backfill`)
- Atomic commits: 3+ files changed MUST be split into multiple logical commits. Never group unrelated changes.
- Ensure `npm run build` succeeds before pushing.

## Approved Models

Agents must use the following models only when routing requests. This file is the **single source of truth** for the curated set on this fork — **do not add `MODELS.md`** or duplicate lists elsewhere.

### Codex (cx/)
- gpt-5.5 (all reasoning levels: low, medium, high, xhigh)
- gpt-5.4 (all reasoning levels: low, medium, high, xhigh)

### Cursor (cu/)
- composer-2.5
- claude-opus-4-8 (high, thinking-high, high-fast, thinking-high-fast, xhigh, thinking-xhigh, xhigh-fast, thinking-xhigh-fast)
- claude-opus-4-7 (high, thinking-high, high-fast, thinking-high-fast, xhigh, thinking-xhigh, xhigh-fast, thinking-xhigh-fast)
- claude-opus-4-6 (high, thinking-high, high-fast, thinking-high-fast) — **no `max` / `thinking-max` variants** on this fork

### Gemini CLI (gc/)
- gemini-3.1-pro-preview
- gemini-3.1-flash-preview
- gemini-3.1-flash-lite
- gemini-3-flash-preview
- gemini-2.5-pro
- gemini-2.5-flash

### xAI / Grok (xai/)
- grok-build
- grok-composer-2.5-fast

## Dashboard model curation (this fork)

Per-provider **Available Models** in the UI come from `modelLock_*` keys inside `providerConnections.data` (JSON in `~/.9router/db/data.sqlite`), not from shrinking the global catalog in `open-sse/config/providerModels.js`.

- **UPDATE existing rows only** — do not create new tables or schema.
- After changing the approved list, prune each connection's `modelLock_*` to match **Approved Models** above.
- Keep **combos** and **aliases** (`PUT /api/models/alias`) aligned with the same set (e.g. `gpt-5.5-9router`, `composer-9router`).

## Provider compatibility gotchas

Some upstream models reject parameters that clients (Claude Code, OpenCode, etc.) send by default. 9Router strips them automatically; do not add them back to translator output.

### xAI / Grok
- `grok-build` accepts standard OpenAI `reasoning_effort`.
- `grok-composer-2.5-fast` (and any `*composer*` / `*fast*` xAI model) **does not** support `reasoning_effort`. Dedicated `XaiExecutor` (open-sse/executors/xai.js) handles suffix parsing (`grok-4-high` → effort=high) and strips the param for denied models. `grok-4.3` accepts `reasoning_effort` (per official docs).
- Tool calling works on `grok-composer-2.5-fast` (verified: returns a `function` tool_call for a `calculator` tool, and a `bash` tool for the OpenCode `bash` agent).
- `grok-composer-2.5-fast` is the recommended agent model (tool calling + fast). `grok-build` is the recommended chat model.

### Gemini CLI
- `gemini-3.1-flash-preview` currently returns `404 NOT_FOUND` from the upstream Google API even though it is listed in the Gemini CLI's model picker. Prefer `gemini-3.1-pro-preview` (verified OK) and `gemini-3-flash-preview` until Google rolls out 3.1-flash properly.
- `gemini-2.5-pro` and `gemini-2.5-flash` are still safe fallbacks.

### Codex
- `cx/gpt-5.5-high` and `cx/gpt-5.4-high` are reliable; the `*-review` variants are auto-generated by the provider and are not curated here.
 
### OpenCode (this deployment)
- Combo alias: **`9router/gpt-5.5-9router`** (not `openai/gpt-5.5-9router`).
- Service: Node 25 + `systemctl --user restart 9router` after `cd cli && npm run build`. Legacy `ai-tools` systemd unit removed.

## Testing checklist (after model or executor changes)

Upstream **429** rate limits when quotas are exhausted are expected; that is not a routing bug.

Use `POST /v1/chat/completions` with an active key from the `apiKeys` table, and/or dashboard **Test Connection** (`POST /api/models/test`). Register combo aliases with `PUT /api/models/alias` when needed.

When touching model lists, executors, or request transformers, at minimum verify:

- `xai/grok-build` basic completion
- `xai/grok-composer-2.5-fast` basic completion + tool calling (with `reasoning_effort` in the request)
- At least one `cx/gpt-5.5-*` and one `cx/gpt-5.4-*` variant
- At least one high/thinking Cursor model under `cu/`
- At least one Gemini model under `gc/`

When touching model lists, executors, or request transformers, at minimum verify the above plus any newly added models.
