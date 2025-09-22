export type SampleProject = {
  id: string
  slug: string
  title: string
  description: string
  updatedAt: string // ISO date
  downloadSize: string // e.g., "2.2GB"
  dataSize: string // e.g., "560MB"
  primaryModel?: string
  models?: string[]
  tags?: string[]
  samplePrompt?: string
  embeddingStrategy?: string
  retrievalStrategy?: string
  datasetCount?: number
}

export const sampleProjects: SampleProject[] = [
  {
    id: 'aircraft-mx',
    slug: 'aircraft-mx',
    title: 'Aircraft MX',
    description:
      'A fairly simple description of this sample project and what it does and what you might learn from playing with it.',
    updatedAt: '2025-08-15T00:00:00.000Z',
    downloadSize: '2.2GB',
    dataSize: '130MB',
    primaryModel: 'TinyLama',
    models: ['TinyLama'],
    tags: ['maintenance', 'fleet', 'ops'],
    samplePrompt:
      'You are an experienced aircraft maintenance technician with 15+ years of experience working on military and commercial aircraft.',
    embeddingStrategy: 'PDF Simple',
    retrievalStrategy: 'Hybrid BM25 + embedding',
    datasetCount: 3,
  },
  {
    id: 'eagle-vision',
    slug: 'eagle-vision',
    title: 'EagleVision',
    description:
      'A fairly simple description of this sample project and what it does and what you might learn from playing with it.',
    updatedAt: '2025-08-15T00:00:00.000Z',
    downloadSize: '3.4GB',
    dataSize: '560MB',
    primaryModel: 'TinyLama',
    models: ['TinyLama'],
    tags: ['vision', 'images'],
    samplePrompt:
      'You analyze inspection images to detect damage and suggest next steps. Be concise and cite detection confidence.',
    embeddingStrategy: 'CLIP embeddings',
    retrievalStrategy: 'Vector similarity',
    datasetCount: 2,
  },
  {
    id: 'hawk-eye',
    slug: 'hawk-eye',
    title: 'HawkEye',
    description:
      'A fairly simple description of this sample project and what it does and what you might learn from playing with it.',
    updatedAt: '2025-08-15T00:00:00.000Z',
    downloadSize: '100MB',
    dataSize: '85MB',
    primaryModel: 'TinyLama',
    models: ['TinyLama'],
    tags: ['monitoring'],
    samplePrompt:
      'Monitor telemetry for anomalies and produce a short status report with severity ratings.',
    embeddingStrategy: 'Timeseries chunk + metadata',
    retrievalStrategy: 'BM25',
    datasetCount: 1,
  },
  {
    id: 'raptor-control',
    slug: 'raptor-control',
    title: 'RaptorControl',
    description:
      'A fairly simple description of this sample project and what it does and what you might learn from playing with it.',
    updatedAt: '2025-08-15T00:00:00.000Z',
    downloadSize: '560MB',
    dataSize: '300MB',
    primaryModel: 'TinyLama',
    models: ['TinyLama'],
    tags: ['control'],
    samplePrompt:
      'Assist operators with control procedures. Validate commands and summarize safety checks before execution.',
    embeddingStrategy: 'Markdown splitter + embedding',
    retrievalStrategy: 'Hybrid BM25 + embedding',
    datasetCount: 4,
  },
]
