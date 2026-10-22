# Integrating prs

For changing or extending the mod. Usage is in the [README](../README.md).

## Layout

| Path | Holds |
|------|-------|
| `hooks/prs.ts` | Pure logic: parsing `pr-link` lines, reading `gh`'s JSON, footer order, labels, dropping the engine's own pill |
| `hooks/register.tsx` | The hooks module: refresh on `session.start`, `turn.complete` and a timer; the `PromptHint` render |
| `types/index.d.ts` | `Pr`, `PrState`, and the `prs.list` state contract |
| `tests/prs.test.ts` | Unit tests for `hooks/prs.ts` |
| `tests/register.test.ts` | Refresh and render through the test kit, on terminal and desktop |
| `tests/harness.ts` | Stubs: `grep` answers with transcript lines, `gh` with a state per URL |

## Data

The engine's transcript entry, one per PR attach (repeated across resumes, so the mod deduplicates by URL):

```json
{ "type": "pr-link", "sessionId": "...", "prNumber": 410, "prUrl": "https://github.com/acme/app/pull/410", "prRepository": "acme/app", "timestamp": "..." }
```

## Constraints

- **grep, not `$.fs.read` or `$.session.messages()`.** `messages()` returns user and assistant messages only, and long transcripts pass `$.fs.read`'s 4 MiB cap. The transcript is found as `<config>/projects/*/<session id>.jsonl`, `<config>` being `CLAUDE_CONFIG_DIR` or `~/.claude`.
- **Refresh off the dispatch.** `turn.complete` queues the refresh with `$.clock.after(0)` instead of awaiting it, so a slow `gh` never holds the turn's end. A module-level flag drops a refresh that starts while one runs.
- **The mod draws the whole hint line.** `PromptHint`'s `tail` is a plain dim string, which cannot hold links or colors, so once there is a PR the mod returns its own tree: the engine's hint text (minus its `· PR #N` pill) and the list. That text loses the engine's own colors (the auto-mode label's yellow). With no PRs it passes, and the engine draws the line as usual.
