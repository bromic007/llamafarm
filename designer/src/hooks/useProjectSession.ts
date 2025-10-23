/**
 * React hook for project session management
 *
 * Manages session state for both Designer Chat and Project Chat services
 * with localStorage persistence and project context switching
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useActiveProject } from './useActiveProject'
import {
  findExistingSession,
  getStoredSessions,
  saveStoredSessions,
  createMessage,
  createPersistentSession,
  addMessageToPersistentSession,
  type ChatMessage,
} from '../utils/projectSessionManager'

export interface ProjectSessionOptions {
  chatService: 'designer' | 'project'
  autoCreate?: boolean
}

export interface ProjectSessionState {
  sessionId: string | null
  messages: ChatMessage[]
  error: string | null
  isTemporaryMode: boolean
  tempMessages: ChatMessage[]
}

export interface ProjectSessionActions {
  addMessage: (content: string, role: 'user' | 'assistant') => ChatMessage
  addTempMessage: (message: ChatMessage) => void
  addPersistentMessage: (message: ChatMessage) => void
  clearHistory: () => void
  deleteCurrentSession: () => void
  refreshSession: () => void
  createSessionFromServer: (serverSessionId: string) => void
  reconcileWithServer: (
    clientSessionId: string,
    serverSessionId: string
  ) => void
  debugState: () => void
  listSessions: () => Array<{
    id: string
    createdAt: string
    lastUsed: string
    messageCount: number
  }>
  selectSession: (sessionId: string) => void
}

/**
 * Hook for managing project sessions with project context integration
 * Phase 2: Added temporary message state for optimistic updates
 */
export function useProjectSession(
  options: ProjectSessionOptions
): ProjectSessionState & ProjectSessionActions {
  const { chatService } = options
  const activeProject = useActiveProject()

  // Existing state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)

  // Add temporary message state for pre-session messages
  const [tempMessages, setTempMessages] = useState<ChatMessage[]>([])

  // Add ref to track current temp messages to avoid stale closure
  const tempMessagesRef = useRef<ChatMessage[]>([])

  // Add transfer lock to prevent session resets during/after transfer
  const transferLockRef = useRef(false)

  // Helper function to check if session reset should be prevented
  const shouldPreventReset = useCallback((_context: string) => {
    if (transferLockRef.current) {
      return true
    }
    return false
  }, [])

  // Determine if we're in temporary or persistent mode
  const isTemporaryMode = !sessionId
  const displayMessages = isTemporaryMode ? tempMessages : messages

  // Update ref whenever tempMessages changes to avoid stale closure
  useEffect(() => {
    tempMessagesRef.current = tempMessages
  }, [tempMessages])

  // State inspection function for debugging
  const debugState = useCallback(() => {
    console.log('=== PROJECT SESSION STATE DEBUG ===')
    console.log('sessionId:', sessionId)
    console.log('isTemporaryMode:', isTemporaryMode)
    console.log('tempMessages length:', tempMessages.length)
    console.log('messages length:', messages.length)
    console.log('displayMessages length:', displayMessages.length)
    console.log('activeProject:', activeProject)
    console.log('=== END DEBUG ===')
  }, [
    sessionId,
    isTemporaryMode,
    tempMessages,
    messages,
    displayMessages,
    activeProject,
  ])

  // Helper to build fixed session id per project/service
  const makeFixedId = useCallback(
    (ns: string, project: string, svc: string) => `${ns}:${project}:${svc}`,
    []
  )

  // Project change effect - single persistent session per project/service
  useEffect(() => {
    // Don't reset session if we're in the middle of a transfer
    if (shouldPreventReset('project change effect')) {
      return
    }

    if (activeProject) {
      const id = makeFixedId(
        activeProject.namespace,
        activeProject.project,
        chatService
      )
      setSessionId(id)
      const sessions = getStoredSessions()
      const sessionData = sessions[id]
      setMessages(sessionData ? sessionData.messages : [])
      setTempMessages([])
    } else {
      // No active project
      setSessionId(null)
      setMessages([])
      setTempMessages([])
    }
  }, [
    activeProject?.namespace,
    activeProject?.project,
    chatService,
    makeFixedId,
  ])

  //  Function to add message to temporary state
  const addTempMessage = useCallback((message: ChatMessage) => {
    // Validate message before adding
    if (!message || !message.content || message.content.trim() === '') {
      return
    }

    setTempMessages(prev => [...prev, message])
  }, [])

  //  Function to add message to persistent state
  const addPersistentMessage = useCallback(
    (message: ChatMessage) => {
      // Validate message before adding
      if (!message || !message.content || message.content.trim() === '') {
        return
      }

      if (!sessionId) {
        return
      }

      // Update local state
      setMessages(prev => [...prev, message])

      // Update localStorage using new helper function
      addMessageToPersistentSession(sessionId, message)
    },
    [sessionId]
  )

  // Helper function to transfer temp messages to a server session
  const transferToServerSession = useCallback(
    (serverSessionId: string, tempMessages: ChatMessage[]) => {
      transferLockRef.current = true

      try {
        if (!activeProject) {
          return
        }

        // Filter out any "Thinking..." placeholder messages before transfer
        const messagesToTransfer = tempMessages.filter(msg => {
          const isThinkingPlaceholder =
            msg.content === 'Thinking...' && msg.role === 'assistant'
          return !isThinkingPlaceholder
        })

        // Create persistent session with filtered messages
        createPersistentSession(
          serverSessionId,
          activeProject.namespace,
          activeProject.project,
          chatService,
          messagesToTransfer
        )

        // Update local state to persistent mode
        setSessionId(serverSessionId)
        setMessages(messagesToTransfer)
        setTempMessages([])

        // Verify state after a tick to ensure React has processed the updates
        setTimeout(() => {
          // State verification after transfer
        }, 0)
      } finally {
        // Always release the transfer lock
        setTimeout(() => {
          transferLockRef.current = false
        }, 100)
      }
    },
    [activeProject, chatService]
  )

  // Main function to add messages (chooses temp vs persistent based on mode)
  const addMessage = useCallback(
    (content: string, role: 'user' | 'assistant'): ChatMessage => {
      if (!content || content.trim() === '') {
        throw new Error('Cannot add empty message')
      }

      try {
        const message = createMessage(role, content)

        if (isTemporaryMode) {
          addTempMessage(message)
        } else {
          addPersistentMessage(message)
        }

        return message
      } catch (err) {
        console.error('Failed to add message:', err)
        throw err
      }
    },
    [isTemporaryMode, addTempMessage, addPersistentMessage]
  )

  // Clear chat history
  const clearHistory = useCallback(() => {
    if (sessionId) {
      // Clear persistent session
      const sessions = getStoredSessions()
      delete sessions[sessionId]
      saveStoredSessions(sessions)
    }

    // Clear local state
    setSessionId(null)
    setMessages([])
    setTempMessages([])
    setError(null)
  }, [sessionId])

  // Delete current session
  const deleteCurrentSession = useCallback(() => {
    clearHistory()
  }, [clearHistory])

  // Refresh session from storage
  const refreshSession = useCallback(() => {
    if (sessionId) {
      const sessions = getStoredSessions()
      const sessionData = sessions[sessionId]
      if (sessionData) {
        setMessages(sessionData.messages || [])
      }
    }
  }, [sessionId])

  // Reconcile with server session ID (handles session ID mismatches)
  const reconcileWithServer = useCallback(
    (_clientId: string, _serverId: string) => {
      // No-op with fixed session IDs
    },
    []
  )

  // Create session from server (when server provides a new session ID)
  const createSessionFromServer = useCallback((_serverSessionId: string) => {
    // No-op with fixed session IDs
  }, [])

  // List sessions for current project/chatService
  const listSessions = useCallback(() => [], [])

  // Select an existing session by ID
  const selectSession = useCallback((_id: string) => {
    setMessages([])
    setTempMessages([])
    setError(null)
  }, [])

  return {
    // State
    sessionId,
    messages: displayMessages,
    error,
    isTemporaryMode,
    tempMessages,

    // Actions
    addMessage,
    addTempMessage,
    addPersistentMessage,
    clearHistory,
    deleteCurrentSession,
    refreshSession,
    createSessionFromServer,
    reconcileWithServer,
    debugState,
    listSessions,
    selectSession,
  }
}

export default useProjectSession
