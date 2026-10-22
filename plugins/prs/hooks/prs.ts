// The pure half of the prs mod: reading the session's pr-link entries out of
// its transcript, reading gh's answer, and laying the PRs out for the footer.
import type { Pr, PrState } from '../types'

export function parsePrLinks(jsonl: string): Pr[] {
  const found = new Map<string, Pr>()
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    let entry: { type?: string; prUrl?: unknown; prNumber?: unknown; prRepository?: unknown }
    try {
      entry = JSON.parse(line)
    } catch {
      // The transcript is appended to while we read it: a torn last line is the
      // only malformed one there is, and the next refresh reads it whole.
      continue
    }
    if (entry.type !== 'pr-link' || typeof entry.prUrl !== 'string' || found.has(entry.prUrl)) continue
    found.set(entry.prUrl, {
      url: entry.prUrl,
      number: Number(entry.prNumber),
      repo: String(entry.prRepository ?? ''),
      state: 'UNKNOWN',
    })
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

// Open (and not yet known) first, then merged and closed, each in the order the
// session made them.
export const footerOrder = (prs: readonly Pr[]): Pr[] => [
  ...prs.filter(pr => !isFinal(pr.state)),
  ...prs.filter(pr => isFinal(pr.state)),
]

// `#12`, or `infra#12` once the session has PRs in more than one repo.
export function label(pr: Pr, prs: readonly Pr[]): string {
  const multiRepo = new Set(prs.map(p => p.repo)).size > 1
  return multiRepo ? `${pr.repo.split('/').pop()}#${pr.number}` : `#${pr.number}`
}

// The engine's own pill for the latest PR (`· PR #12`), dropped since the
// list replaces it.
export const stripEnginePr = (hint: string) => hint.replace(/\s*·\s*PR #\d+/, '')
