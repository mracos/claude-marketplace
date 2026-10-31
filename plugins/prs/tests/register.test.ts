import { expect, test } from 'claude-code/testing'
import { hint, link, stub } from './harness.ts'

const URL = (n: number) => `https://github.com/acme/app/pull/${n}`

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the engine's hint stands while the session has no PRs`, async ($, on) => {
    const { clock } = stub(on)
    on('ui.render', { component: 'PromptHint' }, ($, e) => $.ui.resolve(e).Text({ children: `engine: ${e.props.hint}` }))

    await $.session.start({ surface, isInteractive: true, cwd: '/repo' })
    await clock.settle()
    const ui = await $.ui.mount(hint(surface, '? for shortcuts'))

    expect(await ui.find({ type: 'Text', text: 'engine: ? for shortcuts' })).toBeDefined()
    expect(await ui.find({ type: 'Link' })).toBeUndefined()
  })

  test(`${surface}: lists open PRs first, merged and closed after, each a link`, async ($, on) => {
    const { clock } = stub(on, {
      transcript: [link('acme/app', 1), link('acme/app', 2), link('acme/app', 3), link('acme/app', 4)],
      states: { [URL(1)]: 'MERGED', [URL(2)]: 'OPEN', [URL(3)]: 'CLOSED', [URL(4)]: 'DRAFT' },
    })

    await $.session.start({ surface, isInteractive: true, cwd: '/repo' })
    await clock.settle()
    const ui = await $.ui.mount(hint(surface))

    expect(await ui.find({ type: 'Text', text: 'auto mode on (shift+tab to cycle)' })).toBeDefined()
    const links = await ui.findAll({ type: 'Link' })
    expect(links.map(l => l.props.href)).toEqual([URL(2), URL(4), URL(1), URL(3)])
    expect(links.map(l => l.props.label)).toEqual(['\uf407 #2', '\uf4dd #4', '\uf419 #1', '\uf4dc #3'])
  })

  test(`${surface}: open PRs are green, merged purple, closed red, drafts dimmed`, async ($, on) => {
    const { clock } = stub(on, {
      transcript: [link('acme/app', 1), link('acme/app', 2), link('acme/app', 3), link('acme/app', 4)],
      states: { [URL(1)]: 'MERGED', [URL(2)]: 'OPEN', [URL(3)]: 'CLOSED', [URL(4)]: 'DRAFT' },
    })

    await $.session.start({ surface, isInteractive: true, cwd: '/repo' })
    await clock.settle()
    const ui = await $.ui.mount(hint(surface))

    const style = async (n: number) => {
      const t = await ui.find({ type: 'Text', text: `#${n}` })
      return [t?.props.color, Boolean(t?.props.dimColor)]
    }
    expect(await style(2)).toEqual(['green', false])
    expect(await style(3)).toEqual(['red', false])
    expect(await style(4)).toEqual([undefined, true])
    expect(await style(1)).toEqual(['magenta', false])
  })
}

test('merged and closed PRs are never asked about again; open ones are', async ($, on) => {
  const { seen, clock } = stub(on, {
    transcript: [link('acme/app', 1), link('acme/app', 2)],
    states: { [URL(1)]: 'MERGED', [URL(2)]: 'OPEN' },
  })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/repo' })
  await clock.settle()
  await clock.advance(120_000)

  expect(seen.ghCalls).toEqual([URL(1), URL(2), URL(2)])
})

test('greps the session transcript under the config dir', async ($, on) => {
  const { seen, clock } = stub(on)

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/repo' })
  await clock.settle()

  expect(seen.greps[0]?.slice(-2)).toEqual(['/home/u/.claude', 's1'])
})
