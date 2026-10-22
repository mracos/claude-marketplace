export type PrState = 'OPEN' | 'DRAFT' | 'MERGED' | 'CLOSED' | 'UNKNOWN'
export type Pr = { url: string; number: number; repo: string; state: PrState }

declare module 'claude-code' {
  interface PluginState {
    prs: { list: Pr[] }
  }
}
