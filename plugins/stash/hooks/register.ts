// /stash: a per-session queue of ideas you can push while Claude is working.
//
// The command registers with `immediate: true`, so it runs the moment you
// press Enter, even mid-turn, and never starts a turn. Everything it shows goes
// through toasts, dim transcript lines and the status line, none of which
// Claude reads, so stashing an idea never steers the work in flight.
import type { On } from 'claude-code'
import { USAGE, formatList, parse, statusText, take } from './stash.ts'

// $.store is shared by every session on the machine, so each session keeps its
// own key. Re-read before every write: another session may have written since.
async function storeKey($): Promise<string> {
  return 'session:' + (await $.session.id())
}

async function load($): Promise<string[]> {
  const saved = await $.store.get(await storeKey($))
  return Array.isArray(saved) ? saved.filter((idea) => typeof idea === 'string') : []
}

async function save($, items: string[]): Promise<void> {
  const key = await storeKey($)
  if (items.length === 0) await $.store.delete(key)
  else await $.store.set(key, items)
  $.ui.status(statusText(items.length))
}

async function refreshStatus($): Promise<void> {
  $.ui.status(statusText((await load($)).length))
}

// A prompt queued behind a turn starts the next main-loop turn as soon as that
// one ends, so a count that has not moved AUTO_SEND_DELAY_MS after a turn
// ended means nothing was waiting.
const AUTO_SEND_DELAY_MS = 1000
let turnsStarted = 0
// A sent idea starts a turn, so in claude -p it would keep the run going.
let isInteractive = false

// The newest idea goes out as the next prompt, in the person's own words. Each
// one starts a turn, whose end sends the next, so the stash drains one idea per
// turn. Never while a draft or the prompts an interrupt hands back sit in the
// box. Taken off the queue only once the prompt entered: a hook may drop it.
async function autoSend($): Promise<void> {
  const items = await load($)
  const taken = take(items)
  if (!taken) return
  if ((await $.prompt.read()).text !== '') return
  const sent = await $.prompt.submit({ text: taken.item, asUser: true })
  if ('drop' in sent) return
  await save($, taken.rest)
  $.ui.toast(taken.rest.length === 0 ? 'Sent the last stashed idea' : `Sent a stashed idea (${taken.rest.length} queued)`)
}

async function run($, args: string): Promise<void> {
  const action = parse(args)
  const items = await load($)

  switch (action.kind) {
    case 'usage':
      $.ui.toast(USAGE)
      return
    case 'list':
      $.ui.log(formatList(items))
      return
    case 'push':
      await save($, [...items, action.idea])
      $.ui.toast(`Stashed (${items.length + 1} queued)`)
      return
    case 'clear':
      await save($, [])
      $.ui.toast(items.length === 0 ? 'Stash is empty.' : `Cleared ${items.length}`)
      return
    case 'pop':
    case 'drop': {
      if (items.length === 0) {
        $.ui.toast('Stash is empty.')
        return
      }
      const taken = take(items, action.index)
      if (!taken) {
        $.ui.toast(`No item #${action.index}, the stash has ${items.length}`)
        return
      }
      await save($, taken.rest)
      if (action.kind === 'drop') {
        $.ui.toast(`Dropped: ${taken.item}`)
        return
      }
      // Into the prompt box rather than straight to Claude: edit it or press
      // Enter. Where no box can take it (claude -p), show it instead.
      const filled = await $.prompt.fill({ text: taken.item, mode: 'insert' })
      if (!filled.isFilled) $.ui.log(taken.item)
    }
  }
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive
    // First: a throw skips the rest of the hook, and a status line for a
    // command that failed to register (name taken) would be pointless anyway.
    await $.command.register({
      name: 'stash',
      description: 'Queue an idea for later without interrupting Claude',
      argumentHint: '[idea | list | pop [N] | drop [N] | clear]',
      immediate: true,
    })
    await refreshStatus($)
    return next(e)
  })

  // /clear, /resume and /branch move to another session id, and session.start
  // doesn't fire again, so the status line has to catch up here.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await refreshStatus($)
    return next(e)
  })

  // Subagent runs raise no turn.start, so this counts main-loop turns only.
  on('turn.start', async ($, e, next) => {
    turnsStarted++
    return next(e)
  })

  // An interrupted or failed turn is the user stepping in, so only an answer
  // sends the next idea.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.reason !== 'answer') return result
    const startedBefore = turnsStarted
    $.clock.after(AUTO_SEND_DELAY_MS, () => {
      if (isInteractive && turnsStarted === startedBefore) void autoSend($)
    })
    return result
  })

  on('command.run', { command: 'stash' }, async ($, e) => {
    await run($, e.args)
    return {}
  })
}
