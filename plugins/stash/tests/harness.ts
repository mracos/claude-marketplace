// Stubs for every mods API call the stash module makes, backed by a Map so a
// test can seed the store and read back what the mod saved.
import { mock } from 'claude-code/testing'

type Options = {
  sessionId?: string
  store?: Map<string, unknown>
  fills?: boolean
  // what the prompt box already holds when the mod reads it
  draft?: string
}

export function stub(on, options: Options = {}) {
  const store = options.store ?? new Map<string, unknown>()
  const seen = {
    store,
    toasts: [] as string[],
    logs: [] as string[],
    statuses: [] as (string | undefined)[],
    fills: [] as { text: string; mode?: string }[],
    commands: [] as Record<string, unknown>[],
  }

  on('session.id', () => ({ value: options.sessionId ?? 's1' }))
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    seen.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.status', ($, e) => {
    seen.statuses.push(e.text)
    return { value: undefined }
  })
  on('prompt.fill', ($, e) => {
    seen.fills.push({ text: e.text, mode: e.mode })
    return { isFilled: options.fills ?? true }
  })
  on('prompt.read', () => ({ value: { text: options.draft ?? '', cursor: 0 } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.register', ($, e) => {
    seen.commands.push(e)
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('classic.SessionStart', () => ({}))

  const clock = mock.clock(on, { now: 0 })

  return { ...seen, clock }
}

export const stash = ($, args = '') => $.command.run({ command: 'stash', args })

// A main-loop turn that ended with an answer, unless `fields` says otherwise.
export const endTurn = ($, fields = {}) =>
  $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', ...fields })
