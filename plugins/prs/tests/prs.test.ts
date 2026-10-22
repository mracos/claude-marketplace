import { expect, test } from 'claude-code/testing'
import { footerOrder, label, parseGhState, parsePrLinks, stripEnginePr } from '../hooks/prs.ts'
import { link, pr } from './harness.ts'

test('parsePrLinks keeps pr-link entries once each, in transcript order', () => {
  const jsonl = [link('acme/app', 2), '{"type":"user"}', link('acme/app', 1), link('acme/app', 2), '{"type":"pr-li'].join('\n')

  expect(parsePrLinks(jsonl)).toEqual([pr('acme/app', 2), pr('acme/app', 1)])
})

test('parseGhState reads drafts apart from open', () => {
  expect(parseGhState('{"state":"OPEN","isDraft":true}')).toBe('DRAFT')
  expect(parseGhState('{"state":"OPEN","isDraft":false}')).toBe('OPEN')
  expect(parseGhState('{"state":"MERGED","isDraft":false}')).toBe('MERGED')
})

test('footerOrder puts merged and closed after the rest, keeping order', () => {
  const prs = [pr('a/b', 1, 'MERGED'), pr('a/b', 2, 'OPEN'), pr('a/b', 3, 'CLOSED'), pr('a/b', 4, 'UNKNOWN')]

  expect(footerOrder(prs).map(p => p.number)).toEqual([2, 4, 1, 3])
})

test('label names the repo only when the session spans several', () => {
  const one = [pr('acme/app', 1), pr('acme/app', 2)]
  const two = [pr('acme/app', 1), pr('acme/infra', 2)]

  expect(label(pr('acme/app', 1), one)).toBe('#1')
  expect(label(pr('acme/infra', 2), two)).toBe('infra#2')
})

test("stripEnginePr drops the engine's own PR pill", () => {
  expect(stripEnginePr('auto mode on (shift+tab to cycle) · PR #5796')).toBe('auto mode on (shift+tab to cycle)')
  expect(stripEnginePr('? for shortcuts')).toBe('? for shortcuts')
})
