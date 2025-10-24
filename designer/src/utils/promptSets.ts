// Utilities for representing multiple named prompt sets inside config.prompts
// using inline meta markers. This keeps all persistence in the existing
// config.prompts array while providing a structured view for the Designer.

export type PromptRole = 'system' | 'assistant' | 'user'

export interface PromptItem {
  role: PromptRole
  content: string
}

export interface RawPromptMessage {
  role?: string
  content: string
}

export interface PromptSet {
  id: string
  name: string
  active: boolean
  items: PromptItem[]
}

const START_TAG = '<lf-meta>prompt_set_start:'
const END_TAG = '<lf-meta>prompt_set_end</lf-meta>'

function parseStartTag(
  content: string
): { name: string; active: boolean } | null {
  if (!content.startsWith(START_TAG) || !content.endsWith('</lf-meta>'))
    return null
  const inner = content.slice(
    START_TAG.length,
    content.length - '</lf-meta>'.length
  )
  try {
    const parsed = JSON.parse(inner)
    const name =
      typeof parsed.name === 'string' && parsed.name.trim()
        ? parsed.name.trim()
        : 'Untitled'
    const active = !!parsed.active
    return { name, active }
  } catch {
    return null
  }
}

function isEndTag(content: string): boolean {
  return content === END_TAG
}

function generateId(prefix: string = 'set'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function hashString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

export function parsePromptSets(prompts: RawPromptMessage[] | undefined): {
  sets: PromptSet[]
  hasMarkers: boolean
} {
  if (!Array.isArray(prompts) || prompts.length === 0) {
    return {
      sets: [
        {
          id: generateId(),
          name: 'Default',
          active: true,
          items: [],
        },
      ],
      hasMarkers: false,
    }
  }

  const sets: PromptSet[] = []
  let hasMarkers = false
  let current: PromptSet | null = null

  for (const msg of prompts) {
    const role = (msg.role || 'system') as PromptRole
    const content = msg.content || ''

    // Only system messages can carry meta markers
    if (role === 'system') {
      const parsedStart = parseStartTag(content)
      if (parsedStart) {
        hasMarkers = true
        // Close any open set implicitly
        if (current) {
          sets.push(current)
        }
        current = {
          id: generateId(),
          name: parsedStart.name,
          active: parsedStart.active,
          items: [],
        }
        continue
      }
      if (isEndTag(content)) {
        hasMarkers = true
        if (current) {
          sets.push(current)
          current = null
        }
        continue
      }
    }

    // Regular prompt item
    const item: PromptItem = { role: role as PromptRole, content }
    if (!current) {
      // If no explicit markers yet, create an implicit default bucket
      current = { id: generateId(), name: 'Default', active: true, items: [] }
    }
    current.items.push(item)
  }

  if (current) {
    sets.push(current)
  }

  if (sets.length === 0) {
    sets.push({ id: generateId(), name: 'Default', active: true, items: [] })
  }

  // Ensure exactly one active
  let firstActiveIndex = sets.findIndex(s => s.active)
  if (firstActiveIndex === -1) firstActiveIndex = 0
  for (let i = 0; i < sets.length; i++) {
    sets[i].active = i === firstActiveIndex
  }

  // Assign stable IDs derived from set content to avoid React key churn
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i]
    const base = `${i}|${s.name}|${s.items
      .map(it => `${it.role}:${it.content}`)
      .join('|')}`
    s.id = `set-${hashString(base)}`
  }

  return { sets, hasMarkers }
}

export function serializePromptSets(sets: PromptSet[]): RawPromptMessage[] {
  const result: RawPromptMessage[] = []
  for (const set of sets) {
    const startPayload = JSON.stringify({
      name: set.name,
      active: !!set.active,
    })
    result.push({
      role: 'system',
      content: `${START_TAG}${startPayload}</lf-meta>`,
    })
    for (const item of set.items) {
      result.push({ role: item.role, content: item.content })
    }
    result.push({ role: 'system', content: END_TAG })
  }
  return result
}

export function getActiveSet(sets: PromptSet[]): PromptSet {
  const active = sets.find(s => s.active)
  return active || sets[0]
}

export function isMetaMessage(msg: RawPromptMessage): boolean {
  if (msg.role !== 'system' || typeof msg.content !== 'string') return false
  return (
    msg.content.startsWith(START_TAG) ||
    msg.content === '<lf-meta>prompt_set_end</lf-meta>'
  )
}

export function filterActiveSetMessages(
  prompts: RawPromptMessage[] | undefined
): RawPromptMessage[] {
  const { sets, hasMarkers } = parsePromptSets(prompts)
  if (!hasMarkers) return prompts || []
  const active = getActiveSet(sets)
  return active.items.map(it => ({ role: it.role, content: it.content }))
}
