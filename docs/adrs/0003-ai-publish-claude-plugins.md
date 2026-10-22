# 0003: ai - publish Claude Code plugins as one marketplace

**Date:** 2026-10-21
**Status:** Accepted
**Deciders:** Marcos

## Context

ADR ai/0002 left `lib/claude/<plugin>/` extraction-ready and unpublished: `scripts/extract-claude.sh stash <dir>` assembles a clean standalone tree (plugin, a one-plugin `marketplace.json`, CI pinned to `CLAUDE_CODE_VERSION`), but no manifest sets `MIRROR_REPO`, and `publish-sync.sh` only knows the `shell` and `nvim` kinds.

stash and prs are the first two worth publishing: small, tested through `claude plugin test`, and with nothing private in their trees. prs exists because a session that opens PRs in several repos has no single place to see them: Claude Code shows only the latest one.

Claude Code installs a plugin from a marketplace (a repo with `.claude-plugin/marketplace.json`) or from npm; `--plugin-dir` only loads one for a session. So every public plugin repo is a marketplace either way, and the choice is how many there are.

## Decision

**1. One repo, `mracos/claude-marketplace`, for every published plugin.**

A repo per plugin means a `marketplace add` per plugin for whoever installs them, and an infra2 module, a mirror and a CI per plugin here. One marketplace is added once, and each new plugin is one more `claude plugin install <plugin>@mracos`. The repo is a read-only mirror like the others: dotfiles stays canonical, it is replayed commit-for-commit (ADR tools/0003) and published by the one `publish.yml` (ADR tools/0005). It is declared in `mracos/infra2` (`module "claude_marketplace"`) and created by that repo's apply, never by hand.

**2. `lib/claude/extract.conf` is the opt-in.**

The tier gets a manifest of its own: `MIRROR_REPO="claude-marketplace"`, `MARKETPLACE_NAME="mracos"`, and `PLUGINS`, the plugins that go public. A plugin's own `extract.conf` keeps `CLAUDE_CODE_VERSION`, `DESCRIPTION` and `ADRS` but sets no `MIRROR_REPO`. guards and review stay out of `PLUGINS`, and each still assembles alone with `extract-claude.sh`.

**3. `scripts/extract-claude-marketplace.sh` assembles it from `extract-claude.sh`.**

Each listed plugin is assembled exactly as it would be alone, into `plugins/<plugin>/`, minus the glue that only makes sense at a repo root (its one-plugin `marketplace.json`, CI, `.gitignore`); its ADRs move to the root `docs/adrs/`. The root gets a `marketplace.json` listing `./plugins/<plugin>`, a README with the install and a row per plugin, the shared LICENSE, and CI with one job per plugin on that plugin's pinned release plus a `marketplace` job validating the root.

**4. The `claude` kind in `publish-sync.sh` is that one mirror.**

| Function | `claude` arm |
|----------|--------------|
| `mirrors()` | `lib/claude/extract.conf` is one row, tool `marketplace` |
| `assemble` / `assemble_at` | run `extract-claude-marketplace.sh`, copied with `extract-claude.sh` into the materialized tree |
| `owned_paths` | the tier manifest, plus `lib/claude/<p>`, `test/claude/<p>` and the `ADRS` of every plugin in `PLUGINS` |
| `engine_paths` | both extractors |
| `test` | `claude plugin validate` on the root and each plugin, `claude plugin test` where a suite exists, `npm test` where a bats suite does |

Each plugin is tested on its own `CLAUDE_CODE_VERSION`: `claude_at` uses the `claude` on PATH when it is that release, and `npx` otherwise, so `_publish.yml` only sets up node.

**5. A manifest's ADRs count as owned paths, for every kind.**

`owned_paths` didn't include the `ADRS` globs, so a commit that only edits a shipped ADR triggered no publish leg and crossed at the next tip sync. nvim had the same gap. Both kinds now add the manifest's `ADRS` to their owned paths. The published plugins ship ai/0002 and this ADR; they describe dotfiles internals (`files/ai`, `hooks/post-link/ai.sh`, the guards plugin), but nothing private.

## Rollout

1. Merge the `mracos/infra2` PR that declares `claude_marketplace`. Its apply creates the empty repo; the `DOTFILES_PUBLISH_REPOS` token already covers every repo.
2. Push dotfiles with the tier manifest. Its publish leg finds no `sync dotfiles@<sha>` marker in the mirror and writes one snapshot commit.
3. List it on `mracos.github.io` (`data/tools.yaml`) and in the personal projects list.

## Consequences

- Publishing another plugin is one line in `PLUGINS`: no infra2 module, no new repo, no new workflow.
- Commits touching a listed plugin's paths are public commits, so the commit-message rule in `CLAUDE.md` applies to them.
- Plugins keep separate pins. The mirror's CI and the publish leg test each on its own release, so bumping one is one manifest edit and does not move the others.

## Related

- ADR ai/0002: the `lib/claude` tier and `extract-claude.sh`
- ADR tools/0003: replay and the boundary guard
- ADR tools/0005: one publish workflow, `MIRROR_REPO` as the opt-in
- ADR editors/0008: the nvim kind, the closest template
