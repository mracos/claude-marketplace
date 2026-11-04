// The pure half of the prs mod: reading the session's PRs out of
// its transcript, reading gh's answer, and laying the PRs out for the footer.
import type { Pr, PrState } from '../types'

type Entry = {
  type?: string
  prUrl?: unknown
  prNumber?: unknown
  prRepository?: unknown
  toolUseResult?: { stdout?: unknown; gitOperation?: { pr?: { url?: unknown; action?: unknown } } }
}

// The engine links one PR per command, the last it printed, so a command that
// opens several leaves the others out. Its output still names them: every PR
// URL of the same repo in a command the engine saw create one.
function createdTogether(entry: Entry): Pr[] {
  const result = entry.toolUseResult
  const created = result?.gitOperation?.pr
  if (created?.action !== 'created' || typeof created.url !== 'string' || typeof result?.stdout !== 'string') return []
  const repo = created.url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+$/)?.[1]
  if (!repo) return []
  const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...result.stdout.matchAll(new RegExp(`https://github\\.com/${escaped}/pull/(\\d+)`, 'g'))].map(m => ({
    url: m[0],
    number: Number(m[1]),
    repo,
    state: 'UNKNOWN' as const,
  }))
}

export function parsePrLinks(jsonl: string): Pr[] {
  const found = new Map<string, Pr>()
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    let entry: Entry
    try {
      entry = JSON.parse(line)
    } catch {
      // The transcript is appended to while we read it: a torn last line is the
      // only malformed one there is, and the next refresh reads it whole.
      continue
    }
    const prs =
      entry.type === 'pr-link' && typeof entry.prUrl === 'string'
        ? [{ url: entry.prUrl, number: Number(entry.prNumber), repo: String(entry.prRepository ?? ''), state: 'UNKNOWN' as const }]
        : createdTogether(entry)
    for (const pr of prs) if (!found.has(pr.url)) found.set(pr.url, pr)
  }
  return [...found.values()]
}

export function parseGhState(stdout: string): PrState {
  const { state, isDraft } = JSON.parse(stdout) as { state?: string; isDraft?: boolean }
  if (state === 'OPEN') return isDraft ? 'DRAFT' : 'OPEN'
  if (state === 'MERGED' || state === 'CLOSED') return state
  return 'UNKNOWN'
}

export const isFinal = (state: PrState) => state === 'MERGED' || state === 'CLOSED'

// Cells the hint line loses to the prompt's padding, which the viewport's width
// still counts.
const HINT_INSET = 4

// What the footer draws in `columns` cells after `hint`: every PR, open (and not
// yet known) first, then merged and closed, each in the order the session made
// them. When that overflows, merged and closed only counted at the end. With no
// width measured, every PR, and the line wraps.
export function footer(prs: readonly Pr[], hint: string, columns?: number) {
  const live = prs.filter(pr => !isFinal(pr.state))
  const final = prs.filter(pr => isFinal(pr.state))
  const merged = final.filter(pr => pr.state === 'MERGED').length
  const closed = final.length - merged
  // a PR is its octicon, a space and its label; two cells of gap before each
  const width = [...hint].length + prs.reduce((w, pr) => w + 4 + label(pr, prs).length, 0)
  return columns === undefined || width <= columns - HINT_INSET
    ? { listed: [...live, ...final], merged: 0, closed: 0 }
    : { listed: live, merged, closed }
}

// `#12`, or `infra#12` once the session has PRs in more than one repo.
export function label(pr: Pr, prs: readonly Pr[]): string {
  const multiRepo = new Set(prs.map(p => p.repo)).size > 1
  return multiRepo ? `${pr.repo.split('/').pop()}#${pr.number}` : `#${pr.number}`
}

// The engine's own pill for the latest PR (`· PR #12`), dropped since the
// list replaces it.
export const stripEnginePr = (hint: string) => hint.replace(/\s*·\s*PR #\d+/, '')
