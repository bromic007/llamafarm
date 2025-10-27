// Utilities for working with prompt sets in the native YAML structure

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
  items: PromptItem[]
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

export function parsePromptSets(
  prompts: Array<{ name: string; messages: RawPromptMessage[] }> | undefined
): PromptSet[] {
  if (!Array.isArray(prompts) || prompts.length === 0) {
    return [
      {
        id: generateId(),
        name: 'Default',
        items: [],
      },
    ]
  }

  const sets: PromptSet[] = prompts.map((promptSet, i) => {
    const items: PromptItem[] = (promptSet.messages || []).map(msg => ({
      role: (msg.role || 'system') as PromptRole,
      content: msg.content || '',
    }))

    // Generate stable ID based on content
    const base = `${i}|${promptSet.name}|${items
      .map(it => `${it.role}:${it.content}`)
      .join('|')}`

    return {
      id: `set-${hashString(base)}`,
      name: promptSet.name,
      items,
    }
  })

  return sets.length > 0
    ? sets
    : [{ id: generateId(), name: 'Default', items: [] }]
}

export function serializePromptSets(
  sets: PromptSet[]
): Array<{ name: string; messages: RawPromptMessage[] }> {
  return sets.map(set => ({
    name: set.name,
    messages: set.items.map(item => ({
      role: item.role,
      content: item.content,
    })),
  }))
}
