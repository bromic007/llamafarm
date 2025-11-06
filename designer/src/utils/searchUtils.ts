/**
 * Search utility functions for text matching and navigation
 */

export interface SearchMatch {
  from: number
  to: number
  line: number
  preview: string
}

/**
 * Find all matches of a query string within content
 * @param content - The content to search within
 * @param query - The search query
 * @returns Array of search matches with position information
 */
export function findSearchMatches(content: string, query: string): SearchMatch[] {
  if (!query || query.trim().length === 0) {
    return []
  }

  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  if (lowerQuery.length === 0) {
    return []
  }

  const lineOffsets: number[] = [0]
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') {
      lineOffsets.push(i + 1)
    }
  }

  const findLineIndex = (position: number): number => {
    let low = 0
    let high = lineOffsets.length - 1
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const offset = lineOffsets[mid]
      if (offset === position) {
        return mid
      }
      if (offset < position) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return Math.max(0, high)
  }

  const matches: SearchMatch[] = []
  let searchFrom = 0

  while (searchFrom <= lowerContent.length - lowerQuery.length) {
    const index = lowerContent.indexOf(lowerQuery, searchFrom)
    if (index === -1) break

    const lineIndex = findLineIndex(index)
    const lineStart = lineOffsets[lineIndex]
    const nextLineStart =
      lineIndex + 1 < lineOffsets.length ? lineOffsets[lineIndex + 1] : content.length
    const lineText = content.slice(lineStart, nextLineStart).replace(/\r?\n$/, '')

    matches.push({
      from: index,
      to: index + query.length,
      line: lineIndex + 1,
      preview: lineText.trim(),
    })

    if (lowerQuery.length === 0) {
      break
    }

    searchFrom = index + Math.max(lowerQuery.length, 1)
  }

  return matches
}

