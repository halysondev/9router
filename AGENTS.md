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

Agents must use the following models only when routing requests. These represent the "best" variants per provider, stripped of lower tiers and legacy models.

### Codex (cx/)
- gpt-5.5 (all reasoning levels: low, medium, high, xhigh)
- gpt-5.4 (all reasoning levels: low, medium, high, xhigh)

### Cursor (cu/)
- composer-2.5
- claude-opus-4-8 (high, thinking-high, high-fast, thinking-high-fast, xhigh, thinking-xhigh, xhigh-fast, thinking-xhigh-fast)
- claude-opus-4-7 (high, thinking-high, high-fast, thinking-high-fast, xhigh, thinking-xhigh, xhigh-fast, thinking-xhigh-fast)
- claude-opus-4-6 (high, thinking-high, high-fast, thinking-high-fast, max, thinking-max, max-fast, thinking-max-fast)

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
