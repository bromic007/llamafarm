import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import type { Database } from '../../hooks/useDatabaseManager'

export type DatabaseModalMode = 'create' | 'edit'

interface DatabaseModalProps {
  isOpen: boolean
  mode: DatabaseModalMode
  initialDatabase?: Database
  existingDatabases: Database[]
  onClose: () => void
  onCreate: (database: Database) => Promise<void>
  onUpdate: (oldName: string, updates: Partial<Database>) => Promise<void>
  onDelete: (databaseName: string, reassignTo?: string) => Promise<void>
  isLoading?: boolean
  error?: string | null
  affectedDatasets?: Array<{ name: string; database: string }>
}

const DatabaseModal: React.FC<DatabaseModalProps> = ({
  isOpen,
  mode,
  initialDatabase,
  existingDatabases,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  isLoading = false,
  error = null,
  affectedDatasets = [],
}) => {
  const [name, setName] = useState(initialDatabase?.name || '')
  const [type, setType] = useState<'ChromaStore' | 'QdrantStore'>(
    initialDatabase?.type || 'ChromaStore'
  )
  const [copyFromDb, setCopyFromDb] = useState<string>('none')
  const [defaultEmbedding, setDefaultEmbedding] = useState(
    initialDatabase?.default_embedding_strategy || ''
  )
  const [defaultRetrieval, setDefaultRetrieval] = useState(
    initialDatabase?.default_retrieval_strategy || ''
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [reassignToDb, setReassignToDb] = useState<string>('')

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setName(initialDatabase?.name || '')
      setType(initialDatabase?.type || 'ChromaStore')
      setCopyFromDb('none')
      setDefaultEmbedding(initialDatabase?.default_embedding_strategy || '')
      setDefaultRetrieval(initialDatabase?.default_retrieval_strategy || '')
      setConfirmingDelete(false)
      // Set default reassignment database
      if (mode === 'edit' && affectedDatasets.length > 0) {
        const otherDatabases = existingDatabases.filter(
          (db) => db.name !== initialDatabase?.name
        )
        setReassignToDb(otherDatabases[0]?.name || '')
      }
    }
  }, [
    isOpen,
    initialDatabase,
    mode,
    affectedDatasets.length,
    existingDatabases,
  ])

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, isLoading, onClose])

  const title =
    mode === 'create' ? 'Create new database' : `Edit ${initialDatabase?.name}`
  const cta = mode === 'create' ? 'Create' : 'Save'
  
  // Validate database name: only alphanumeric, hyphens, and underscores allowed
  const nameValidationError = name.trim().length > 0 && !/^[a-zA-Z0-9_-]+$/.test(name.trim())
    ? 'Database name can only contain letters, numbers, hyphens (-), and underscores (_)'
    : null
  
  const isValid = name.trim().length > 0 && !nameValidationError && !isLoading

  const handleDelete = () => {
    if (!initialDatabase) return
    setConfirmingDelete(true)
  }

  const handleConfirmDelete = async () => {
    if (!initialDatabase) return
    try {
      await onDelete(
        initialDatabase.name,
        affectedDatasets.length > 0 ? reassignToDb : undefined
      )
      onClose()
    } catch (e) {
      console.error('Failed to delete database:', e)
    }
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setConfirmingDelete(false)
      onClose()
    }
  }

  const handleSave = async () => {
    if (!isValid) return

    try {
      if (mode === 'create') {
        // Convert name to snake_case
        const snakeCaseName = name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')

        // Get source database for copying strategies
        const sourceDb =
          copyFromDb !== 'none'
            ? existingDatabases.find((db) => db.name === copyFromDb)
            : undefined

        // Build new database object
        const newDatabase: Database = {
          name: snakeCaseName,
          type,
          config: {
            persist_directory: `./data/${type === 'ChromaStore' ? 'chroma_db' : 'qdrant_db'}`,
            distance_function: 'cosine',
            collection_name: snakeCaseName,
          },
          default_embedding_strategy:
            defaultEmbedding || sourceDb?.default_embedding_strategy || '',
          default_retrieval_strategy:
            defaultRetrieval || sourceDb?.default_retrieval_strategy || '',
          embedding_strategies: sourceDb
            ? JSON.parse(JSON.stringify(sourceDb.embedding_strategies || []))
            : [],
          retrieval_strategies: sourceDb
            ? JSON.parse(JSON.stringify(sourceDb.retrieval_strategies || []))
            : [],
        }

        await onCreate(newDatabase)
      } else {
        // Edit mode - update database
        const updates: Partial<Database> = {
          name: name.trim(),
          type,
        }
        await onUpdate(initialDatabase?.name || '', updates)
      }
      onClose()
    } catch (e) {
      console.error('Failed to save database:', e)
    }
  }

  // Get list of other databases for reassignment
  const otherDatabases = existingDatabases.filter(
    (db) => db.name !== initialDatabase?.name
  )

  // Get embedding/retrieval strategies from selected copy source
  const copySourceDb =
    copyFromDb !== 'none'
      ? existingDatabases.find((db) => db.name === copyFromDb)
      : undefined
  const availableEmbeddings = copySourceDb?.embedding_strategies || []
  const availableRetrievals = copySourceDb?.retrieval_strategies || []

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          if (!isLoading) onClose()
        }}
        onPointerDownOutside={(e) => {
          if (!isLoading) return
          e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (!isLoading) return
          e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-lg text-foreground">{title}</DialogTitle>
        </DialogHeader>

        {!confirmingDelete ? (
          <div className="flex flex-col gap-3 pt-1">
            <div>
              <label className="text-xs text-muted-foreground">
                Database name
              </label>
              <input
                className={`w-full mt-1 bg-transparent rounded-lg py-2 px-3 border text-foreground ${
                  error || nameValidationError ? 'border-destructive' : 'border-input'
                }`}
                placeholder="Enter database name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
              {nameValidationError && (
                <p className="text-xs text-destructive mt-1">{nameValidationError}</p>
              )}
              {error && !nameValidationError && (
                <p className="text-xs text-destructive mt-1">{error}</p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <select
                className="w-full mt-1 bg-transparent rounded-lg py-2 px-3 border border-input text-foreground"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as 'ChromaStore' | 'QdrantStore')
                }
                disabled={isLoading}
              >
                <option value="ChromaStore">ChromaStore</option>
                <option value="QdrantStore">QdrantStore</option>
              </select>
            </div>

            {mode === 'create' && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Copy strategies from
                  </label>
                  <select
                    className="w-full mt-1 bg-transparent rounded-lg py-2 px-3 border border-input text-foreground"
                    value={copyFromDb}
                    onChange={(e) => {
                      setCopyFromDb(e.target.value)
                      // Reset default strategy selections when changing source
                      if (e.target.value === 'none') {
                        setDefaultEmbedding('')
                        setDefaultRetrieval('')
                      }
                    }}
                    disabled={isLoading}
                  >
                    <option value="none">None</option>
                    {existingDatabases.map((db) => (
                      <option key={db.name} value={db.name}>
                        {db.name}
                      </option>
                    ))}
                  </select>
                  {copyFromDb !== 'none' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      This will copy all embedding and retrieval strategies from{' '}
                      {copyFromDb}
                    </p>
                  )}
                </div>

                {copyFromDb !== 'none' && availableEmbeddings.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Default embedding strategy
                    </label>
                    <select
                      className="w-full mt-1 bg-transparent rounded-lg py-2 px-3 border border-input text-foreground"
                      value={defaultEmbedding}
                      onChange={(e) => setDefaultEmbedding(e.target.value)}
                      disabled={isLoading}
                    >
                      <option value="">Select a strategy</option>
                      {availableEmbeddings.map((emb) => (
                        <option key={emb.name} value={emb.name}>
                          {emb.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {copyFromDb !== 'none' && availableRetrievals.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Default retrieval strategy
                    </label>
                    <select
                      className="w-full mt-1 bg-transparent rounded-lg py-2 px-3 border border-input text-foreground"
                      value={defaultRetrieval}
                      onChange={(e) => setDefaultRetrieval(e.target.value)}
                      disabled={isLoading}
                    >
                      <option value="">Select a strategy</option>
                      {availableRetrievals.map((ret) => (
                        <option key={ret.name} value={ret.name}>
                          {ret.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-1">
            {affectedDatasets.length > 0 ? (
              <>
                <p className="text-sm text-foreground">
                  Deleting this database will leave {affectedDatasets.length}{' '}
                  dataset{affectedDatasets.length > 1 ? 's' : ''} unassigned.
                </p>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Assign these datasets to:
                  </label>
                  <select
                    className="w-full mt-1 bg-transparent rounded-lg py-2 px-3 border border-input text-foreground"
                    value={reassignToDb}
                    onChange={(e) => setReassignToDb(e.target.value)}
                    disabled={isLoading || otherDatabases.length === 0}
                  >
                    {otherDatabases.map((db) => (
                      <option key={db.name} value={db.name}>
                        {db.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Affected datasets: {affectedDatasets.map((d) => d.name).join(', ')}
                </p>
              </>
            ) : (
              <p className="text-sm text-foreground">
                Are you sure you want to delete this database?
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex flex-row items-center justify-between sm:justify-between gap-2">
          {mode === 'edit' && !confirmingDelete ? (
            <button
              className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 text-sm disabled:opacity-50"
              onClick={handleDelete}
              disabled={isLoading}
              type="button"
            >
              Delete
            </button>
          ) : confirmingDelete ? (
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-2 rounded-md text-sm text-primary hover:underline disabled:opacity-50"
                onClick={() => setConfirmingDelete(false)}
                disabled={isLoading}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 text-sm disabled:opacity-50"
                onClick={handleConfirmDelete}
                disabled={
                  isLoading ||
                  (affectedDatasets.length > 0 && !reassignToDb)
                }
                type="button"
              >
                Confirm delete
              </button>
            </div>
          ) : (
            <div />
          )}
          {!confirmingDelete && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                className="px-3 py-2 rounded-md text-sm text-primary hover:underline disabled:opacity-50"
                onClick={handleCancel}
                disabled={isLoading}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm ${
                  isValid
                    ? 'bg-primary text-primary-foreground hover:opacity-90'
                    : 'opacity-50 cursor-not-allowed bg-primary text-primary-foreground'
                }`}
                onClick={handleSave}
                disabled={!isValid}
                type="button"
              >
                {isLoading
                  ? mode === 'create'
                    ? 'Creating...'
                    : 'Saving...'
                  : cta}
              </button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DatabaseModal

