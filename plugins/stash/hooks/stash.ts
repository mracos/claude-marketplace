// Pure stash logic: what `/stash <args>` asks for, and edits to the list.
// Nothing here touches the mods API, so tests can call it directly.

export const USAGE = 'Usage: /stash [<idea> | list | pop [N] | drop [N] | clear]'

export type Action =
  | { kind: 'list' }
  | { kind: 'push'; idea: string }
  | { kind: 'pop'; index?: number }
  | { kind: 'drop'; index?: number }
  | { kind: 'clear' }
  | { kind: 'usage' }

// `pop`/`drop` take an optional 1-based item number. A verb followed by
// anything that isn't a number is an idea that happens to start with that
// word ("drop the old cache"), so it is stashed whole.
export function parse(args: string): Action {
  const text = args.trim()
  const [verb = '', ...words] = text.split(/\s+/)
  const rest = words.join(' ')

  switch (verb) {
    case '':
    case 'list':
      return rest ? { kind: 'push', idea: text } : { kind: 'list' }
    case 'clear':
      return rest ? { kind: 'push', idea: text } : { kind: 'clear' }
    case 'push':
      return rest ? { kind: 'push', idea: rest } : { kind: 'usage' }
    case 'pop':
    case 'drop': {
      if (!rest) return { kind: verb }
      return /^[1-9]\d*$/.test(rest) ? { kind: verb, index: Number(rest) } : { kind: 'push', idea: text }
    }
    default:
      return { kind: 'push', idea: text }
  }
}

// Removes item `index` (1-based, default the newest) without mutating `items`.
export function take(items: readonly string[], index = items.length) {
  if (index < 1 || index > items.length) return undefined
  return {
    item: items[index - 1],
    rest: [...items.slice(0, index - 1), ...items.slice(index)],
  }
}

export function formatList(items: readonly string[]): string {
  if (items.length === 0) return 'Stash is empty.'
  return items.map((idea, i) => `${i + 1}. ${idea}`).join('\n')
}

export function statusText(count: number): string | undefined {
  return count === 0 ? undefined : `${count} queued (/stash)`
}
