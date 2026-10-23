import { expect, test } from 'claude-code/testing'
import { endTurn, startSession, stash, stub } from './harness.ts'

test('registers /stash to run mid-turn', async ($, on) => {
  const seen = stub(on)

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect(seen.commands).toEqual([
    expect.objectContaining({ name: 'stash', immediate: true }),
  ])
})

test('session start shows what an earlier run left queued', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a', 'b']]]) })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect(seen.statuses).toEqual(['2 queued (/stash)'])
})

test('push saves the idea and says nothing Claude reads', async ($, on) => {
  const seen = stub(on)

  const answer = await stash($, 'rename the flag')

  expect(answer.text).toBeUndefined()
  expect(seen.store.get('session:s1')).toEqual(['rename the flag'])
  expect(seen.toasts).toEqual(['Stashed (1 queued)'])
  expect(seen.statuses).toEqual(['1 queued (/stash)'])
})

test('list shows numbered ideas as a dim line', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a', 'b']]]) })

  await stash($)
  await stash($, 'list')

  expect(seen.logs).toEqual(['1. a\n2. b', '1. a\n2. b'])
})

test('pop moves the newest idea into the prompt box', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a', 'b']]]) })

  await stash($, 'pop')

  expect(seen.fills).toEqual([{ text: 'b', mode: 'insert' }])
  expect(seen.store.get('session:s1')).toEqual(['a'])
  expect(seen.statuses).toEqual(['1 queued (/stash)'])
})

test('pop by number, and the last pop clears the key and the status line', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a', 'b']]]) })

  await stash($, 'pop 1')
  await stash($, 'pop')

  expect(seen.fills.map((f) => f.text)).toEqual(['a', 'b'])
  expect(seen.store.has('session:s1')).toBe(false)
  expect(seen.statuses).toEqual(['1 queued (/stash)', undefined])
})

test('pop shows the idea where no prompt box takes it', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a']]]), fills: false })

  await stash($, 'pop')

  expect(seen.logs).toEqual(['a'])
  expect(seen.store.has('session:s1')).toBe(false)
})

test('pop and drop on an empty stash or a missing number change nothing', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a']]]) })

  await stash($, 'pop 3')
  await stash($, 'drop 2')

  expect(seen.toasts).toEqual(['No item #3, the stash has 1', 'No item #2, the stash has 1'])
  expect(seen.store.get('session:s1')).toEqual(['a'])
  expect(seen.fills).toEqual([])
})

test('pop on an empty stash says so', async ($, on) => {
  const seen = stub(on)

  await stash($, 'pop')

  expect(seen.toasts).toEqual(['Stash is empty.'])
})

test('drop removes without filling the prompt', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a', 'b', 'c']]]) })

  await stash($, 'drop 2')

  expect(seen.store.get('session:s1')).toEqual(['a', 'c'])
  expect(seen.toasts).toEqual(['Dropped: b'])
  expect(seen.fills).toEqual([])
})

test('clear empties this session only', async ($, on) => {
  const store = new Map<string, unknown>([
    ['session:s1', ['a', 'b']],
    ['session:other', ['keep']],
  ])
  const seen = stub(on, { store })

  await stash($, 'clear')

  expect(store.has('session:s1')).toBe(false)
  expect(store.get('session:other')).toEqual(['keep'])
  expect(seen.toasts).toEqual(['Cleared 2'])
})

test('sessions keep separate stashes', async ($, on) => {
  const store = new Map<string, unknown>([['session:other', ['theirs']]])
  const seen = stub(on, { sessionId: 'mine', store })

  await stash($, 'ours')
  await stash($)

  expect(store.get('session:mine')).toEqual(['ours'])
  expect(seen.logs).toEqual(['1. ours'])
})

test('a corrupt stored value reads as empty', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', 'not a list']]) })

  await stash($, 'fresh')

  expect(seen.store.get('session:s1')).toEqual(['fresh'])
})

test('push with no idea shows usage', async ($, on) => {
  const seen = stub(on)

  await stash($, 'push')

  expect(seen.toasts[0]).toMatch(/^Usage: \/stash/)
  expect(seen.store.size).toBe(0)
})

test('/clear refreshes the status line for the new session', async ($, on) => {
  const seen = stub(on, { sessionId: 'after-clear' })

  await $.classic.SessionStart({ source: 'clear' })

  expect(seen.statuses).toEqual([undefined])
})

test('a turn that ends with nothing queued sends the newest idea as the next prompt', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a', 'b']]]) })
  await startSession($)

  await endTurn($)
  await seen.clock.advance(1000)

  expect(seen.submits).toEqual([{ text: 'b', asUser: true }])
  expect(seen.fills).toEqual([])
  expect(seen.store.get('session:s1')).toEqual(['a'])
  expect(seen.toasts).toEqual(['Sent a stashed idea (1 queued)'])
})

test('the turn a sent idea starts sends the next on its end, until the stash is empty', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a', 'b']]]) })
  await startSession($)

  await endTurn($)
  await seen.clock.advance(1000)
  await $.turn.start({ text: 'b', turnId: 't2' })
  await endTurn($, { turnId: 't2' })
  await seen.clock.advance(1000)

  expect(seen.submits.map((s) => s.text)).toEqual(['b', 'a'])
  expect(seen.store.has('session:s1')).toBe(false)
  expect(seen.toasts.at(-1)).toBe('Sent the last stashed idea')
})

test('a queued prompt starting the next turn holds the stash', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a']]]) })
  await startSession($)

  await endTurn($)
  await $.turn.start({ text: 'queued prompt', turnId: 't2' })
  await seen.clock.advance(1000)

  expect(seen.submits).toEqual([])
  expect(seen.store.get('session:s1')).toEqual(['a'])
})

test('a draft in the prompt box holds the stash', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a']]]), draft: 'half typed' })
  await startSession($)

  await endTurn($)
  await seen.clock.advance(1000)

  expect(seen.submits).toEqual([])
  expect(seen.store.get('session:s1')).toEqual(['a'])
})

test('interrupted turns and subagent turns send nothing', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a']]]) })
  await startSession($)

  await endTurn($, { reason: 'aborted', isAborted: true })
  await endTurn($, { agentId: 'sub1' })
  await seen.clock.advance(1000)

  expect(seen.submits).toEqual([])
})

test('a prompt a hook drops stays in the stash', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a']]]), drops: true })
  await startSession($)

  await endTurn($)
  await seen.clock.advance(1000)

  expect(seen.submits).toEqual([{ text: 'a', asUser: true }])
  expect(seen.store.get('session:s1')).toEqual(['a'])
})

test('a non-interactive run (claude -p) never sends', async ($, on) => {
  const seen = stub(on, { store: new Map([['session:s1', ['a']]]) })
  await startSession($, false)

  await endTurn($)
  await seen.clock.advance(1000)

  expect(seen.submits).toEqual([])
  expect(seen.store.get('session:s1')).toEqual(['a'])
})

test('an empty stash makes a finished turn a no-op', async ($, on) => {
  const seen = stub(on)
  await startSession($)

  await endTurn($)
  await seen.clock.advance(1000)

  expect(seen.submits).toEqual([])
  expect(seen.toasts).toEqual([])
})
