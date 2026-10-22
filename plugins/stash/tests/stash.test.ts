import { expect, test } from 'claude-code/testing'
import { formatList, parse, statusText, take } from '../hooks/stash.ts'

test('bare and list both list', () => {
  expect(parse('')).toEqual({ kind: 'list' })
  expect(parse('  list  ')).toEqual({ kind: 'list' })
})

test('free text is pushed whole, trimmed', () => {
  expect(parse('  rename the flag  ')).toEqual({ kind: 'push', idea: 'rename the flag' })
})

test('push takes everything after the verb', () => {
  expect(parse('push list the todos')).toEqual({ kind: 'push', idea: 'list the todos' })
  expect(parse('push')).toEqual({ kind: 'usage' })
})

test('pop and drop take an optional item number', () => {
  expect(parse('pop')).toEqual({ kind: 'pop' })
  expect(parse('pop 2')).toEqual({ kind: 'pop', index: 2 })
  expect(parse('drop 10')).toEqual({ kind: 'drop', index: 10 })
})

test('a verb followed by words is an idea, not a command', () => {
  expect(parse('drop the old cache')).toEqual({ kind: 'push', idea: 'drop the old cache' })
  expect(parse('pop 0')).toEqual({ kind: 'push', idea: 'pop 0' })
  expect(parse('clear the queue first')).toEqual({ kind: 'push', idea: 'clear the queue first' })
  expect(parse('list what changed')).toEqual({ kind: 'push', idea: 'list what changed' })
})

test('take defaults to the newest and leaves the input alone', () => {
  const items = ['a', 'b', 'c']

  const taken = take(items)

  expect(taken).toEqual({ item: 'c', rest: ['a', 'b'] })
  expect(items).toEqual(['a', 'b', 'c'])
})

test('take by number, and out of range is undefined', () => {
  expect(take(['a', 'b', 'c'], 1)).toEqual({ item: 'a', rest: ['b', 'c'] })
  expect(take(['a'], 2)).toBeUndefined()
  expect(take([])).toBeUndefined()
})

test('formatList numbers from 1', () => {
  expect(formatList(['a', 'b'])).toBe('1. a\n2. b')
  expect(formatList([])).toBe('Stash is empty.')
})

test('statusText clears the line when nothing is queued', () => {
  expect(statusText(2)).toBe('2 queued (/stash)')
  expect(statusText(0)).toBeUndefined()
})
