# 0002: ai - Claude Code plugins live in lib/claude: stash and guards

**Date:** 2026-10-11
**Status:** Accepted
**Deciders:** Marcos

## Context

`/stash` queues an idea while Claude works, to pick up later. It was built from a skill (`files/ai/.claude/skills/stash/`), a `UserPromptSubmit` hook that intercepted the command and exited 2, and a `Stop` hook that drained the queue back into the conversation.

Settings hooks can only do that at turn boundaries. Claude Code holds a custom command typed mid-turn until the turn ends, and no hook event fires while the user types. So a "stash" typed during work landed after the work, and the `Stop` drain returned `decision: "block"`, which forced Claude to act on every stashed item at once: the opposite of a queue.

Claude Code v2.1.287 added mods: plugins whose hooks module is JavaScript or TypeScript running inside Claude Code. A mod can register a command with `immediate: true`, which runs the moment it is typed, mid-turn included, and never starts a turn. It also has a per-plugin store, a status line, and a way to put text in the prompt box. That is the primitive the stash was missing.

Two questions follow: where Claude Code plugins live in this repo, and how they stay extractable the way `nbx`, `mcp` and the nvim plugins are.

## Decision

**1. A `lib/claude/<plugin>/` tier, publish-ready in place.**

Same reasoning as `lib/nvim/<plugin>/` (ADR editors/0008): the source is already in the layout a standalone repo needs (`.claude-plugin/plugin.json`, `hooks/`, `tests/`, `README.md`, `LICENSE`, `docs/integrating.md`), so extraction is a copy, not a rewrite. `lib/claude/.claude-plugin/marketplace.json` lists every plugin in the tier, which makes `lib/claude` a local marketplace that `claude plugin marketplace add` registers directly.

**2. TypeScript, no build step, tests through `claude plugin test`.**

Claude Code loads `.ts` hooks modules directly, so there is no bundler or `node_modules`. Pure logic sits in its own file (`hooks/stash.ts`) and the mods API wiring in the hooks module (`hooks/register.ts`), so most behavior is unit-testable and the rest goes through the official test kit (`claude-code/testing`), which fires events and stubs every mods API call with no session, sign-in or network.

Mod events and methods change between releases, so each plugin's `extract.conf` pins `CLAUDE_CODE_VERSION`: the release CI installs to run `claude plugin validate` and `claude plugin test`, and the one the README names.

**3. `scripts/extract-claude.sh`, extraction-ready and unpublished.**

The Claude-plugin sibling of `extract-nvim.sh`: verbatim copy minus `extract.conf` and the type declarations Claude Code writes locally, plus generated glue (a one-plugin root `marketplace.json`, `.gitignore`, CI). No manifest sets `MIRROR_REPO` yet, so nothing publishes, the same state `rules` and `pipeline` are in (ADR rules/0007). `publish-sync.sh` only knows the `shell` and `nvim` kinds; a `claude` kind lands with the first `MIRROR_REPO`.

> [!NOTE]
> 2026-10-21: stash is the first to publish; the `claude` kind and rollout are ADR ai/0003.

**4. Installed by the post-link hook, gated on version.**

`hooks/post-link/ai.sh` already declares marketplaces and plugins (ADR ai/0001). The local marketplace and its mods go through a separate table that is skipped below the first release with mods, since an older Claude Code would load the plugin without understanding its `modules` key.

**5. stash semantics.**

- `/stash` registers with `immediate: true`. Every reply goes to a toast, a dim transcript line or the status line, none of which Claude reads, so stashing never steers the turn in flight.
- `pop` puts the idea in the prompt box (`$.prompt.fill`) rather than sending it: edit it or press Enter. This replaces the skill's "Want me to run with this?" model turn.
- The queue is per session: `$.store` is shared by every session on the machine, so each keeps a `session:<id>` key and re-reads it before every write.
- A persistent status line (`N queued (/stash)`) replaces the `Stop` drain as the reminder.

**6. Settings hooks ship in a plugin too: `guards`.**

Settings hooks lived in `~/.hooks.json`, merged into `~/.claude/settings.json` by the `hooks` CLI (ADR hooks/0001). They move into `lib/claude/guards/`, a plugin with a `hooks/hooks.json` and no hooks module: still shell commands, but installed, toggled and versioned with the other plugins. Scripts are referenced as `${CLAUDE_PLUGIN_ROOT}/scripts/...`. A tool with its own hook entry point is called directly: rtk ships `rtk hook claude`, which replaces the vendored `rtk-rewrite.sh`.

With no hooks left to merge, the `hooks` CLI and `~/.hooks.json` are retired. What `hooks apply` also did, generating `~/.claude/settings.json` from the repo template with `$HOME` expanded, moves into `hooks/post-link/ai.sh`. The template stays out of stow (`.stow-local-ignore`) because Claude Code writes the live file itself: a symlink would put every `/model` or plugin install into the repo working tree.

guards also carries the operator's NEVER rules from the global instructions as `PreToolUse` guards: shell commands that post as the user, skip checks or discard work are refused or put to the user, and edits that add an em dash or a `§N` reference are refused. They match command text, so they back up the instructions rather than replace them. A rule scoped to one repository stays in that repository: dotfiles' "ask before `npm test`" is a permission `ask` rule in its `.claude/settings.json`.

A plugin without a hooks module has no `claude plugin test` suite, so the CI job and the extractor run it only where `tests/*.test.ts` exist, and guards is tested with bats instead, in `test/claude/guards/` (mirroring `lib/claude/guards/` as `test/tools/<tool>/` mirrors a CLI tool), through the command strings in its `hooks.json`. Like `extract.sh` does for CLI tests, `extract-claude.sh` ships that suite as the plugin's `tests/`, with paths rewritten, a standalone `test_helper` and a `package.json` for the bats libraries.

## Consequences

- `/stash` works mid-turn, and nothing about it reaches Claude until you pop an idea and send it
- New Claude Code plugins have a home, a test runner and an extraction path without new decisions
- Mods need v2.1.287 or later. Below that the post-link hook skips them, and there is no `/stash` at all
- The test suite needs the Claude Code CLI, so it runs in its own CI job rather than in the bats matrix; the extractor itself is covered by `test/extract-claude.bats`
- A pinned `CLAUDE_CODE_VERSION` has to be bumped by hand, and a bump can surface API changes in the mod
- Hooks no longer depend on a merge step that could leave live settings out of step with the repo
- Live settings are regenerated from the template on every post-link, so anything Claude Code wrote there that matters has to be copied into the template

## Implementation Notes

The skill (`files/ai/.claude/skills/stash/`), its two settings hooks (`stash-intercept.sh`, `stash-drain.sh`) and their `files/ai/.hooks.json` entries were removed in the same change that added the mod. Left in place they would have shadowed it: the skill also answers to `/stash`, and the `UserPromptSubmit` hook intercepted any prompt starting with `/stash`.

## Related Decisions

- ADR ai/0001: skills and plugins installed by the post-link hook
- ADR hooks/0001: the `hooks` CLI, superseded here
- ADR editors/0008: the nvim plugin extraction this mirrors
- ADR tools/0003: the generic extraction engine
- ADR rules/0007: extraction-ready but unpublished
