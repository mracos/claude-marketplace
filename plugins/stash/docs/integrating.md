# Integrating stash

For changing or extending the mod. Usage is in the [README](../README.md).

## Layout

| Path | Holds |
|------|-------|
| `.claude-plugin/plugin.json` | Manifest |
| `hooks/hooks.json` | Points Claude Code at the hooks module (`modules`) |
| `hooks/register.ts` | The hooks module: every mods API call lives here |
| `hooks/stash.ts` | Pure logic: argument parsing, list edits, display text. No mods API |
| `tests/stash.test.ts` | Unit tests for `hooks/stash.ts` |
| `tests/register.test.ts` | The hooks driven through the test kit |
| `tests/harness.ts` | Stubs for every mods API call the module makes, backed by a `Map` |

Keep new behavior in `hooks/stash.ts` when it can be expressed without `$`, and test it there. `register.ts` should stay a thin translation from an `Action` to API calls.

## Hooks

| Event | Why |
|-------|-----|
| `session.start` | Registers `/stash` with `immediate: true`, then shows the status line for whatever this session already has queued |
| `classic.SessionStart` (`clear`, `resume`, `fork`) | Those move to another session id without firing `session.start` again, so the status line is refreshed here |
| `turn.start` | Counts main-loop turns (a subagent's run raises none) |
| `turn.complete` | On a main-loop turn that ended with `reason: 'answer'`, waits `AUTO_SEND_DELAY_MS` and sends the newest idea if no turn started meanwhile |
| `command.run` (`stash`) | Parses the arguments and acts. Always returns `{}`, so nothing is printed as the command's output |

The command is registered before the status refresh on purpose: a hook that throws skips everything after the throw, and a failed status read must not leave the command unregistered.

## Auto-send

The mods API exposes no queue of pending prompts, so "nothing queued" is inferred: a prompt typed mid-turn starts the next turn as soon as the current one ends, so a `turn.start` count that has not moved a second after `turn.complete` means nothing was waiting. The idea goes out through `$.prompt.submit({ asUser: true })`, read as the person's own words, and starts a turn whose end sends the next one.

It sends only into an empty box (`$.prompt.read()`), which also covers the queued prompts an interrupt hands back to the box, and only in an interactive session (`session.start`'s `isInteractive`): in `claude -p` each sent idea would extend the run. The idea leaves the queue only once the prompt entered; a hook that answers `{ drop }` leaves it queued.

## Storage

`$.store` is one JSON file per plugin under `~/.claude/plugins/store/`, shared by every session on the machine. The queue for a session is the key `session:<session id>`, holding an array of strings. The key is deleted when the queue empties, so finished sessions do not accumulate keys.

A `get` followed by a `set` is not atomic. The module re-reads the key right before each write instead of caching it, and keys never collide across sessions, so the only race left is two `/stash` commands in the same session landing at once.

A stored value that is not an array of strings reads as an empty queue.

## Constraints from the mods runtime

These come from `claude plugin validate`'s static analysis, which Claude Code also runs when it loads the mod:

- Write every mods API call in full (`$.store.get(...)`). `$` may be passed to a function declared at the top level of the same file, which is why `load`, `save` and `storeKey` take it as a parameter; passing it to an imported function fails validation.
- Event names in `on(...)` must be string literals.
- Imports are relative paths inside the plugin, plus `claude-code` for types and the test kit.

An immediate command runs while a turn may still be streaming, so `command.run` must not assume anything about the turn's state. Nothing here reads the transcript.

## Testing

`claude plugin test` runs every `*.test.ts` file with no session, sign-in or network. Each test starts with the module freshly loaded and no hook called, so a test that depends on `session.start` fires it first. Every mods API call the module makes needs a stub, registered before the test's first call on `$`; `tests/harness.ts` registers all of them, and its options seed the store, pick the session id, and decide whether the prompt box accepts a fill.

The Claude Code release the suite is pinned to is `CLAUDE_CODE_VERSION` in the source repository's `extract.conf`, which CI installs exactly. Bump it deliberately: mod events and methods can change between releases.

When Claude Code loads the mod from `--plugin-dir` in an interactive session, it writes type declarations for that build into `.claude-plugin/types/` and a `tsconfig.json` at the root. Both are ignored by git; they are the authoritative reference for the API of the version you are running.
