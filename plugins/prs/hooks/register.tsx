// Every PR the session created, in the hint line under the prompt, where the
// engine shows only the latest (`· PR #12`): open first in green, then merged in
// purple and closed in red, each a link with its state's octicon (Nerd Font
// glyphs). Past the terminal's width, merged and closed shrink to a count each.
//
// The engine records each PR as a pr-link entry in the session's transcript,
// one per command, so the commands it saw create a PR are read too. The
// transcript outgrows $.fs.read's 4 MiB and $.session.messages() leaves pr-link
// out, so grep pulls both. State comes from gh, every two minutes and after
// each turn; merged and closed are final and never asked again.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Pr, PrState } from '../types'
import { footer, isFinal, label, parseGhState, parsePrLinks, stripEnginePr } from './prs.ts'

const list = atom({ plugin: 'prs', key: 'list' } as const, [] as Pr[])

const REFRESH_MS = 120_000

const ICONS: Record<PrState, string> = {
  OPEN: '\uf407',
  UNKNOWN: '\uf407',
  DRAFT: '\uf4dd',
  MERGED: '\uf419',
  CLOSED: '\uf4dc',
}

const COLORS: Partial<Record<PrState, string>> = { OPEN: 'green', MERGED: 'magenta', CLOSED: 'red' }

async function prLinkLines($: EngineInterface): Promise<string> {
  const home = await $.env.get('HOME')
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`
  const r = await $.process.run([
    'sh',
    '-c',
    'grep -hF -e \'"type":"pr-link"\' -e \'"gitOperation":{"pr":\' "$1"/projects/*/"$2".jsonl',
    'sh',
    config,
    await $.session.id(),
  ])
  // grep exits 1 on no match, which is a session with no PRs yet
  return r.exitCode === 0 ? r.stdout : ''
}

async function withState($: EngineInterface, pr: Pr): Promise<Pr> {
  if (isFinal(pr.state)) return pr
  const r = await $.process.run(['gh', 'pr', 'view', pr.url, '--json', 'state,isDraft'])
  return r.exitCode === 0 ? { ...pr, state: parseGhState(r.stdout) } : pr
}

let refreshing = false

async function refresh($: EngineInterface) {
  if (refreshing) return
  refreshing = true
  try {
    const known = new Map((await read($, list)).map(pr => [pr.url, pr]))
    const found = parsePrLinks(await prLinkLines($)).map(pr => known.get(pr.url) ?? pr)
    const fresh = await Promise.all(found.map(pr => withState($, pr)))
    await update($, list, () => fresh)
  } finally {
    refreshing = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    $.clock.after(0, () => refresh($))
    $.clock.every(REFRESH_MS, () => refresh($))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    $.clock.after(0, () => refresh($))
    return result
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const prs = await read($, list)
    if (prs.length === 0) return next(e)

    const { Box, Text, Link } = $.ui.resolve(e)
    const hint = stripEnginePr(e.props.hint)
    const { listed, merged, closed } = footer(prs, hint, e.viewport?.columns)
    const count = (state: 'MERGED' | 'CLOSED', n: number) =>
      n > 0 && (
        <Text key={state} color={COLORS[state]}>
          {`${ICONS[state]} +${n} ${state.toLowerCase()}`}
        </Text>
      )
    return (
      // wrap, or a row wider than the terminal shrinks every item and breaks each label mid-word
      <Box flexWrap="wrap" columnGap={2}>
        <Text dimColor>{hint}</Text>
        {listed.map(pr => (
          <Text key={pr.url} color={COLORS[pr.state]} dimColor={!COLORS[pr.state]}>
            <Link href={pr.url} label={`${ICONS[pr.state]} ${label(pr, prs)}`} />
          </Text>
        ))}
        {count('MERGED', merged)}
        {count('CLOSED', closed)}
      </Box>
    )
  })
}
