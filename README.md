# claude-marketplace

Claude Code plugins by mracos. Mods and hooks for Claude Code, each tested against the Claude Code release its README names.

## Install

```bash
claude plugin marketplace add mracos/claude-marketplace
claude plugin install <plugin>@mracos
```

## Plugins

| Plugin | What it does |
|--------|--------------|
| [`stash`](plugins/stash/README.md) | Claude Code mod: queue ideas mid-session with /stash, without interrupting Claude |
| [`prs`](plugins/prs/README.md) | Claude Code mod: every PR the session created under the prompt, open first, merged dimmed, closed red, each a link |

Each plugin's README covers its usage, and `docs/integrating.md` beside it covers changing it.

## License

MIT
