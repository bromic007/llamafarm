import type { Database } from '../hooks/useDatabaseManager'

/**
 * Build a new database object with optional strategy copying from a source database
 */
export function buildDatabaseWithStrategies(
  name: string,
  type: 'ChromaStore' | 'QdrantStore',
  options: {
    sourceDb?: Database
    defaultEmbedding?: string
    defaultRetrieval?: string
  } = {}
): Database {
  const { sourceDb, defaultEmbedding, defaultRetrieval } = options

  return {
    name,
    type,
    config: {
      persist_directory: `./data/${type === 'ChromaStore' ? 'chroma_db' : 'qdrant_db'}`,
      distance_function: 'cosine',
      collection_name: name,
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
}

/**
 * Build updated project config with new databases and optional datasets
 */
export function buildUpdatedConfig(
  projectConfig: any,
  databases: any[],
  datasets?: any[]
) {
  const rag = projectConfig.rag || {}
  return {
    ...projectConfig,
    rag: {
      ...rag,
      databases,
    },
    ...(datasets && { datasets }),
  }
}

/**
 * Update dataset references when a database is renamed or for reassignment
 */
export function updateDatasetReferences(
  datasets: any[],
  oldDbName: string,
  newDbName: string
): any[] {
  return datasets.map(ds =>
    ds.database === oldDbName ? { ...ds, database: newDbName } : ds
  )
}

/**
 * Validate mutation parameters
 */
export function validateDatabaseOperation(
  namespace: string,
  projectId: string,
  projectConfig: any
): void {
  if (!namespace || !projectId || !projectConfig) {
    throw new Error('Missing required parameters for database operation')
  }
}

