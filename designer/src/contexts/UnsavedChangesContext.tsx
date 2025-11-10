import React, { createContext, useContext, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

interface UnsavedChangesContextType {
  isDirty: boolean
  setIsDirty: (dirty: boolean) => void
  showModal: boolean
  setShowModal: (show: boolean) => void
  pendingNavigation: string | null
  setPendingNavigation: (path: string | null) => void
  pendingAction: (() => void) | null
  setPendingAction: (action: (() => void) | null) => void
  attemptNavigation: (path: string) => void
  attemptAction: (action: () => void) => void
  confirmNavigation: () => void
  cancelNavigation: () => void
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType | undefined>(undefined)

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const navigate = useNavigate()

  const attemptNavigation = useCallback((path: string) => {
    if (isDirty) {
      setPendingNavigation(path)
      setPendingAction(null)
      setShowModal(true)
    } else {
      navigate(path)
    }
  }, [isDirty, navigate])

  const attemptAction = useCallback((action: () => void) => {
    if (isDirty) {
      setPendingAction(() => action)
      setPendingNavigation(null)
      setShowModal(true)
    } else {
      action()
    }
  }, [isDirty])

  const confirmNavigation = useCallback(() => {
    // Note: Don't set isDirty here - let the save handler manage it
    // This prevents redundant state updates that cause flicker
    
    // Close modal
    setShowModal(false)
    
    if (pendingNavigation) {
      const path = pendingNavigation
      setPendingNavigation(null)
      // Small delay to let modal close animation start
      requestAnimationFrame(() => {
        navigate(path)
      })
    } else if (pendingAction) {
      const action = pendingAction
      setPendingAction(null)
      // Execute action after modal starts closing
      requestAnimationFrame(() => {
        action()
      })
    }
  }, [pendingNavigation, pendingAction, navigate])

  const cancelNavigation = useCallback(() => {
    setShowModal(false)
    setPendingNavigation(null)
    setPendingAction(null)
  }, [])

  return (
    <UnsavedChangesContext.Provider
      value={{
        isDirty,
        setIsDirty,
        showModal,
        setShowModal,
        pendingNavigation,
        setPendingNavigation,
        pendingAction,
        setPendingAction,
        attemptNavigation,
        attemptAction,
        confirmNavigation,
        cancelNavigation,
      }}
    >
      {children}
    </UnsavedChangesContext.Provider>
  )
}

export function useUnsavedChanges() {
  const context = useContext(UnsavedChangesContext)
  if (!context) {
    throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider')
  }
  return context
}

