// Stubs for the host calls the prs module makes: grep answers with the
// transcript's pr-link lines, gh with a state per PR URL.
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Pr, PrState } from '../types'

export const link = (repo: string, n: number) =>
  JSON.stringify({ type: 'pr-link', prNumber: n, prUrl: `https://github.com/${repo}/pull/${n}`, prRepository: repo })

export const pr = (repo: string, n: number, state: PrState = 'UNKNOWN'): Pr => ({
  url: `https://github.com/${repo}/pull/${n}`,
  number: n,
  repo,
  state,
})

type Options = {
  transcript?: string[]
  // gh's answer per URL as `STATE` or `DRAFT`; a URL left out makes gh fail
  states?: Record<string, PrState>
}

export function stub(on: On, options: Options = {}) {
  const seen = { greps: [] as string[][], ghCalls: [] as string[] }
  const states = options.states ?? {}
  const ran = (exitCode: number, stdout: string) => ({
    value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  })

  on('process.run', ($, e) => {
    if (e.argv[0] === 'sh') {
      seen.greps.push([...e.argv])
      const lines = options.transcript ?? []
      return ran(lines.length ? 0 : 1, lines.join('\n'))
    }
    const url = e.argv[3] ?? ''
    seen.ghCalls.push(url)
    const state = states[url]
    if (!state) return ran(1, '')
    const json = state === 'DRAFT' ? { state: 'OPEN', isDraft: true } : { state, isDraft: false }
    return ran(0, JSON.stringify(json))
  })
  on('session.id', () => ({ value: 's1' }))
  on('session.start', () => ({ cwd: '/repo' }))
  mock.env(on, { HOME: '/home/u' })
  const clock = mock.clock(on, { now: 0 })

  return { seen, clock }
}

export const hint = (surface: 'terminal' | 'desktop', text = 'auto mode on (shift+tab to cycle) · PR #2') =>
  ({
    plugin: 'prs',
    surface,
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: text },
  }) as const
