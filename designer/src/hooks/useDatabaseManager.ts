import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useUpdateProject, projectKeys } from './useProjects'
import {
  buildUpdatedConfig,
  updateDatasetReferences,
  validateDatabaseOperation,
} from '../utils/database-utils'

/**
 * Type for a database
 */
export type Database = {
  name: string
  type: 'ChromaStore' | 'QdrantStore'
  config?: Record<string, any>
  default_embedding_strategy?: string
  default_retrieval_strategy?: string
  embedding_strategies?: Array<{
    name: string
    type: string
    priority?: number
    config?: Record<string, any>
  }>
  retrieval_strategies?: Array<{
    name: string
    type: string
    config?: Record<string, any>
    default?: boolean
  }>
}

/**
 * Hook to manage databases in the config
 * Provides mutations for creating, updating, and deleting databases
 *
 * NOTE: This implementation uses a client-side read-modify-write pattern which
 * has a potential race condition if multiple users modify databases concurrently.
 * For production use, consider implementing atomic backend API endpoints.
 * See: https://github.com/llama-farm/llamafarm/issues/XXX
 *
 * @param namespace - The project namespace
 * @param projectId - The project identifier
 * @returns Mutation hooks for database operations
 */
export const useDatabaseManager = (namespace: string, projectId: string) => {
  const queryClient = useQueryClient()
  const updateProjectMutation = useUpdateProject()

  // Shared mutation options
  const baseMutationOptions = {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(namespace, projectId),
      })
    },
    onError: (error: Error) => {
      console.error('Database operation failed:', error)
    },
  }

  /**
   * Create a new database
   */
  const createDatabase = useMutation({
    mutationFn: async ({
      database,
      projectConfig,
    }: {
      database: Database
      projectConfig: any
    }) => {
      validateDatabaseOperation(namespace, projectId, projectConfig)

      const databases = projectConfig.rag?.databases || []

      // Check if database name already exists
      if (databases.some((db: any) => db.name === database.name)) {
        throw new Error(
          `Database "${database.name}" already exists. Please use a different name.`
        )
      }

      // Add new database
      const updatedDatabases = [...databases, database]
      const nextConfig = buildUpdatedConfig(projectConfig, updatedDatabases)

      // Update project via API
      return await updateProjectMutation.mutateAsync({
        namespace,
        projectId,
        request: { config: nextConfig },
      })
    },
    ...baseMutationOptions,
  })

  /**
   * Update an existing database
   */
  const updateDatabase = useMutation({
    mutationFn: async ({
      oldName,
      updates,
      projectConfig,
      datasetUpdates,
    }: {
      oldName: string
      updates: Partial<Database>
      projectConfig: any
      datasetUpdates?: Array<{ name: string; database: string }>
    }) => {
      validateDatabaseOperation(namespace, projectId, projectConfig)

      const databases = projectConfig.rag?.databases || []
      const databaseIndex = databases.findIndex(
        (db: any) => db.name === oldName
      )

      if (databaseIndex === -1) {
        throw new Error(`Database "${oldName}" not found in config`)
      }

      // If renaming, check new name doesn't exist
      if (updates.name && updates.name !== oldName) {
        if (databases.some((db: any) => db.name === updates.name)) {
          throw new Error(
            `Database "${updates.name}" already exists. Please use a different name.`
          )
        }
      }

      // Update the database
      const updatedDatabases = [...databases]
      updatedDatabases[databaseIndex] = {
        ...updatedDatabases[databaseIndex],
        ...updates,
      }

      // Update datasets if provided
      let updatedDatasets = projectConfig.datasets || []
      if (datasetUpdates && datasetUpdates.length > 0) {
        updatedDatasets = updatedDatasets.map((ds: any) => {
          const update = datasetUpdates.find((u) => u.name === ds.name)
          return update ? { ...ds, database: update.database } : ds
        })
      }

      const nextConfig = buildUpdatedConfig(
        projectConfig,
        updatedDatabases,
        updatedDatasets
      )

      // Update project via API
      return await updateProjectMutation.mutateAsync({
        namespace,
        projectId,
        request: { config: nextConfig },
      })
    },
    ...baseMutationOptions,
  })

  /**
   * Delete a database
   */
  const deleteDatabase = useMutation({
    mutationFn: async ({
      databaseName,
      projectConfig,
      reassignTo,
    }: {
      databaseName: string
      projectConfig: any
      reassignTo?: string
    }) => {
      validateDatabaseOperation(namespace, projectId, projectConfig)

      const databases = projectConfig.rag?.databases || []

      // Filter out the database
      const updatedDatabases = databases.filter(
        (db: any) => db.name !== databaseName
      )

      if (updatedDatabases.length === databases.length) {
        throw new Error(`Database "${databaseName}" not found in config`)
      }

      // Update datasets if reassignment specified
      let updatedDatasets = projectConfig.datasets || []
      if (reassignTo) {
        updatedDatasets = updateDatasetReferences(
          updatedDatasets,
          databaseName,
          reassignTo
        )
      }

      const nextConfig = buildUpdatedConfig(
        projectConfig,
        updatedDatabases,
        updatedDatasets
      )

      // Update project via API
      return await updateProjectMutation.mutateAsync({
        namespace,
        projectId,
        request: { config: nextConfig },
      })
    },
    ...baseMutationOptions,
  })

  return {
    createDatabase,
    updateDatabase,
    deleteDatabase,
    isUpdating:
      createDatabase.isPending ||
      updateDatabase.isPending ||
      deleteDatabase.isPending,
  }
}
