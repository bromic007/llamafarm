import React, { useState, useEffect, useRef } from 'react'
import { useConfigStructure } from '../../hooks/useConfigStructure'
import TOCNode from './TOCNode'
import type {
  TOCNode as TOCNodeType,
  EditorNavigationAPI,
} from '../../types/config-toc'
import Loader from '../../common/Loader'

interface ConfigTableOfContentsProps {
  /** YAML config content */
  configContent: string

  /** Navigation API from CodeMirror editor */
  navigationAPI: EditorNavigationAPI | null

  /** Whether to update the TOC structure (usually when not dirty) */
  shouldUpdate?: boolean
}

/**
 * Table of contents component for config editor
 * Displays hierarchical structure and allows navigation
 */
const ConfigTableOfContents: React.FC<ConfigTableOfContentsProps> = ({
  configContent,
  navigationAPI,
  shouldUpdate = true,
}) => {
  // Parse config structure
  const { nodes, success, error } = useConfigStructure(
    configContent,
    shouldUpdate
  )

  // Track the active/selected node
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)

  // Track if we're in a manual navigation (to prevent auto-scroll from overriding)
  const isManualNavigating = useRef(false)

  // Handle navigation to a node
  const handleNavigate = (node: TOCNodeType) => {
    if (!navigationAPI) return

    // Set manual navigation flag
    isManualNavigating.current = true

    // Set as active
    setActiveNodeId(node.id)

    // Scroll to the line
    navigationAPI.scrollToLine(node.lineStart)

    // Highlight only the first line
    navigationAPI.highlightLines(node.lineStart, node.lineStart, 2500)

    // Clear the manual navigation flag after scroll + animation completes
    setTimeout(() => {
      isManualNavigating.current = false
    }, 3000) // 3 seconds: enough for scroll (500ms) + settle (2500ms)
  }

  // Track scroll position and update active section
  useEffect(() => {
    if (!navigationAPI?.getCurrentLine || nodes.length === 0) return

    const handleScroll = () => {
      // Don't update if user manually clicked (let the click handler manage it)
      if (isManualNavigating.current) return

      const currentLine = navigationAPI.getCurrentLine?.() || 1

      // Find which node contains the current line
      const findActiveNode = (nodeList: TOCNodeType[]): string | null => {
        for (const node of nodeList) {
          // Check if current line is within this node's range
          if (currentLine >= node.lineStart && currentLine <= node.lineEnd) {
            // If it has children, check them first (more specific)
            if (node.children && node.children.length > 0) {
              const childActive = findActiveNode(node.children)
              if (childActive) return childActive
            }
            return node.id
          }
        }
        return null
      }

      const activeId = findActiveNode(nodes)
      if (activeId && activeId !== activeNodeId) {
        setActiveNodeId(activeId)
      }
    }

    // Set up scroll listener with throttling
    let scrollTimeout: NodeJS.Timeout
    const throttledScroll = () => {
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(handleScroll, 200)
    }

    // Initial check (but only if not manually navigating)
    if (!isManualNavigating.current) {
      handleScroll()
    }

    // Listen to editor scroll events (check less frequently)
    const checkInterval = setInterval(throttledScroll, 1000)

    return () => {
      clearInterval(checkInterval)
      clearTimeout(scrollTimeout)
    }
  }, [navigationAPI, nodes, activeNodeId])

  // Loading or error states
  if (!success && error) {
    return (
      <div className="h-full w-full bg-card border-l border-t border-b border-border rounded-tl-lg rounded-bl-lg flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Contents</h3>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Unable to parse config
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="h-full w-full bg-card border-l border-t border-b border-border rounded-tl-lg rounded-bl-lg flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Contents</h3>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <Loader className="w-6 h-6" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-card border-l border-t border-b border-border rounded-tl-lg rounded-bl-lg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Contents</h3>
        </div>
      </div>

      {/* TOC tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <nav aria-label="Config sections" className="py-2 pb-24">
          {nodes.map(node => (
            <TOCNode
              key={node.id}
              node={node}
              onNavigate={handleNavigate}
              defaultCollapsed={false} // Top-level nodes start expanded
              isActive={activeNodeId === node.id}
              activeNodeId={activeNodeId}
            />
          ))}
        </nav>
      </div>
    </div>
  )
}

export default ConfigTableOfContents
