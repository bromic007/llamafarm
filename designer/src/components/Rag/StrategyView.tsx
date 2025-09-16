import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FontIcon from '../../common/FontIcon'
import Loader from '../../common/Loader'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { defaultStrategies } from './strategies'
import { useToast } from '../ui/toast'
import PageActions from '../common/PageActions'
import { Mode } from '../ModeToggle'
import Tabs from '../Tabs'
import { ChevronDown, Plus, Settings, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

function StrategyView() {
  const navigate = useNavigate()
  const { strategyId } = useParams()
  const { toast } = useToast()
  const [mode, setMode] = useState<Mode>('designer')

  const [strategyMetaTick, setStrategyMetaTick] = useState(0)

  const strategyName = useMemo(() => {
    if (!strategyId) return 'Strategy'
    try {
      const override = localStorage.getItem(
        `lf_strategy_name_override_${strategyId}`
      )
      if (override && override.trim().length > 0) return override
    } catch {}
    const found = defaultStrategies.find(s => s.id === strategyId)
    if (found) return found.name
    // Fallback to title-casing the id
    return strategyId
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  }, [strategyId, strategyMetaTick])

  const strategyDescription = useMemo(() => {
    if (!strategyId) return ''
    try {
      const override = localStorage.getItem(
        `lf_strategy_description_${strategyId}`
      )
      if (override !== null) return override
    } catch {}
    const found = defaultStrategies.find(s => s.id === strategyId)
    return found?.description || ''
  }, [strategyId, strategyMetaTick])

  const usedBy = ['aircraft-maintenance-guides', 'another dataset']

  const [currentModel, setCurrentModel] = useState<string>(
    'text-embedding-3-large'
  )
  const [savedModel, setSavedModel] = useState<string>('text-embedding-3-large')
  const [saveState, setSaveState] = useState<'idle' | 'loading' | 'success'>(
    'idle'
  )

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  // Load current and saved models, and compute change state
  useEffect(() => {
    try {
      if (!strategyId) return
      const storedCfg = localStorage.getItem(
        `lf_strategy_embedding_config_${strategyId}`
      )
      let nextCurrent = currentModel
      if (storedCfg) {
        const parsed = JSON.parse(storedCfg)
        if (parsed?.modelId) nextCurrent = parsed.modelId
      }
      const storedModel = localStorage.getItem(
        `lf_strategy_embedding_model_${strategyId}`
      )
      if (storedModel) nextCurrent = storedModel
      setCurrentModel(nextCurrent)

      const storedSaved = localStorage.getItem(
        `lf_strategy_saved_embedding_model_${strategyId}`
      )
      if (storedSaved) {
        setSavedModel(storedSaved)
      } else {
        // initialize baseline saved == current
        localStorage.setItem(
          `lf_strategy_saved_embedding_model_${strategyId}`,
          nextCurrent
        )
        setSavedModel(nextCurrent)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyId])

  // Listen for embedding changes from the ChangeEmbeddingModel page
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        // @ts-ignore detail typing
        const { strategyId: sid, modelId } = (e as CustomEvent).detail || {}
        if (sid && strategyId && sid === strategyId && modelId) {
          setCurrentModel(modelId)
        }
      } catch {}
    }
    window.addEventListener(
      'lf:strategyEmbeddingUpdated',
      handler as EventListener
    )
    return () =>
      window.removeEventListener(
        'lf:strategyEmbeddingUpdated',
        handler as EventListener
      )
  }, [strategyId])

  // Tabbed Parsers/Extractors data -------------------------------------------
  type ParserRow = {
    id: string
    name: string
    priority: number
    include: string
    exclude: string
    summary: string
  }
  type ExtractorRow = {
    id: string
    name: string
    priority: number
    applyTo: string
    summary: string
  }

  const parserRows: ParserRow[] = [
    {
      id: 'pdf-llamaindex',
      name: 'PDFParser_LlamaIndex',
      priority: 100,
      include: '*.pdf, *.PDF',
      exclude: '*_draft.pdf, *.tmp.pdf',
      summary:
        'Semantic chunking, 1000 chars, 200 overlap, extract metadata & tables',
    },
    {
      id: 'pdf-pypdf2',
      name: 'PDFParser_PyPDF2',
      priority: 50,
      include: '*.pdf, *.PDF',
      exclude: '*_draft.pdf, *.tmp.pdf',
      summary: 'Paragraph chunking, 1000 chars, 150 overlap, extract metadata',
    },
    {
      id: 'docx-llamaindex',
      name: 'DocxParser_LlamaIndex',
      priority: 100,
      include: '*.docx, *.DOCX, *.doc, *.DOC',
      exclude: '~$*, *.tmp',
      summary: '1000 chars, 150 overlap, extract tables & metadata',
    },
    {
      id: 'md-python',
      name: 'MarkdownParser_Python',
      priority: 100,
      include: '*.md, *.markdown, *.mdown, *.mkd, README*',
      exclude: '*.tmp.md, _draft*.md',
      summary: 'Section-based, extract code & links',
    },
    {
      id: 'csv-pandas',
      name: 'CSVParser_Pandas',
      priority: 100,
      include: '*.csv, *.CSV, *.tsv, *.TSV, *.dat',
      exclude: '*_backup.csv, *.tmp.csv',
      summary: 'Row-based, 500 chars, UTF-8',
    },
    {
      id: 'excel-pandas',
      name: 'ExcelParser_Pandas',
      priority: 100,
      include: '*.xlsx, *.XLSX, *.xls, *.XLS',
      exclude: '~$*, *.tmp.xlsx',
      summary: 'Process all sheets, 500 chars, extract metadata',
    },
    {
      id: 'text-python',
      name: 'TextParser_Python',
      priority: 50,
      include: '*.txt, *.json, *.xml, *.yaml, *.py, *.js, LICENSE*, etc.',
      exclude: '*.pyc, *.pyo, *.class',
      summary: 'Sentence-based, 1200 chars, 200 overlap',
    },
  ]

  const extractorRows: ExtractorRow[] = [
    {
      id: 'content-stats',
      name: 'ContentStatisticsExtractor',
      priority: 100,
      applyTo: 'All files (*)',
      summary: 'Include readability, vocabulary & structure analysis',
    },
    {
      id: 'entity',
      name: 'EntityExtractor',
      priority: 90,
      applyTo: 'All files (*)',
      summary:
        'Extract: PERSON, ORG, GPE, DATE, PRODUCT, MONEY, PERCENT | Min length: 2',
    },
    {
      id: 'keyword',
      name: 'KeywordExtractor',
      priority: 80,
      applyTo: 'All files (*)',
      summary: 'YAKE algorithm, 10 max keywords, 3 min keyword length',
    },
    {
      id: 'table',
      name: 'TableExtractor',
      priority: 100,
      applyTo: '*.pdf, *.PDF only',
      summary: 'Dict format output, extract headers, merge cells',
    },
    {
      id: 'datetime',
      name: 'DateTimeExtractor',
      priority: 100,
      applyTo: '*.csv, *.xlsx, *.xls, *.tsv',
      summary: 'Formats: ISO8601, US, EU | Extract relative dates & times',
    },
    {
      id: 'pattern',
      name: 'PatternExtractor',
      priority: 100,
      applyTo: '*.py, *.js, *.java, *.cpp, *.c, *.h',
      summary:
        'Email, URL, IP, version + custom function/class definition patterns',
    },
    {
      id: 'heading',
      name: 'HeadingExtractor',
      priority: 100,
      applyTo: '*.md, *.markdown, README*',
      summary: 'Max level 6, include hierarchy & outline extraction',
    },
    {
      id: 'link',
      name: 'LinkExtractor',
      priority: 90,
      applyTo: '*.md, *.markdown, *.html, *.htm',
      summary: 'Extract URLs, emails, and domains',
    },
  ]

  const [activeTab, setActiveTab] = useState<'parsers' | 'extractors'>(
    'parsers'
  )
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const toggleRow = (id: string) => {
    setOpenRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getPriorityVariant = (
    p: number
  ): 'default' | 'secondary' | 'outline' => {
    if (p >= 100) return 'default'
    if (p >= 50) return 'secondary'
    return 'outline'
  }

  useEffect(() => {
    const handler = (e: Event) => {
      try {
        // @ts-ignore custom event
        const { strategyId: sid } = (e as CustomEvent).detail || {}
        if (sid && strategyId && sid === strategyId) {
          // force state update by reading localStorage
          setCurrentModel(prev => prev) // no-op to trigger rerender alongside below
        }
      } catch {}
    }
    window.addEventListener(
      'lf:strategyExtractionUpdated',
      handler as EventListener
    )
    return () =>
      window.removeEventListener(
        'lf:strategyExtractionUpdated',
        handler as EventListener
      )
  }, [strategyId])

  const hasChanges = useMemo(
    () => currentModel !== savedModel,
    [currentModel, savedModel]
  )

  const handleSave = () => {
    if (!strategyId || !hasChanges || saveState === 'loading') return
    setSaveState('loading')
    setTimeout(() => {
      try {
        localStorage.setItem(
          `lf_strategy_saved_embedding_model_${strategyId}`,
          currentModel
        )
      } catch {}
      setSavedModel(currentModel)
      setSaveState('success')
      setTimeout(() => setSaveState('idle'), 800)
    }, 1000)
  }

  return (
    <div className="w-full flex flex-col gap-3 pb-20">
      {/* Breadcrumb + Actions */}
      <div className="flex items-center justify-between mb-1">
        <nav className="text-sm md:text-base flex items-center gap-1.5">
          <button
            className="text-teal-600 dark:text-teal-400 hover:underline"
            onClick={() => navigate('/chat/rag')}
          >
            RAG
          </button>
          <span className="text-muted-foreground px-1">/</span>
          <span className="text-foreground">Processing strategies</span>
          <span className="text-muted-foreground px-1">/</span>
          <span className="text-foreground">{strategyName}</span>
        </nav>
        <PageActions mode={mode} onModeChange={setMode} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl font-medium">{strategyName}</h2>
          <button
            className="p-1 rounded-md hover:bg-accent text-muted-foreground"
            onClick={() => {
              setEditName(strategyName)
              setEditDescription(strategyDescription)
              setIsEditOpen(true)
            }}
            aria-label="Edit strategy"
            title="Edit strategy"
          >
            <FontIcon type="edit" className="w-4 h-4" />
          </button>
        </div>
      </div>
      {strategyDescription && (
        <div className="text-sm text-muted-foreground">
          {strategyDescription}
        </div>
      )}

      {/* Used by + Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs text-muted-foreground">Used by</div>
          {usedBy.map(u => (
            <Badge key={u} variant="secondary" size="sm" className="rounded-xl">
              {u}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm">
            <Plus className="w-4 h-4" /> Add Parser
          </Button>
          <Button variant="outline" size="sm">
            <Plus className="w-4 h-4" /> Add Extractor
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saveState === 'loading'}
          >
            {saveState === 'loading' && (
              <span className="mr-2 inline-flex">
                <Loader
                  size={14}
                  className="border-blue-400 dark:border-blue-100"
                />
              </span>
            )}
            {saveState === 'success' && (
              <span className="mr-2 inline-flex">
                <FontIcon type="checkmark-filled" className="w-4 h-4" />
              </span>
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Processing editors */}
      {/* Tabs header outside card */}
      <Tabs
        activeTab={activeTab}
        setActiveTab={t => setActiveTab(t as 'parsers' | 'extractors')}
        tabs={[
          { id: 'parsers', label: `Parsers (${parserRows.length})` },
          { id: 'extractors', label: `Extractors (${extractorRows.length})` },
        ]}
      />
      <section className="rounded-lg border border-border bg-card p-4">
        {activeTab === 'parsers' ? (
          <div className="flex flex-col gap-2">
            {parserRows.map(row => {
              const open = openRows.has(row.id)
              return (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-card p-3 hover:bg-accent/20 transition-colors"
                >
                  <button
                    className="w-full flex items-center gap-2 text-left"
                    onClick={() => toggleRow(row.id)}
                    aria-expanded={open}
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                    <div className="flex-1 text-sm font-medium">{row.name}</div>
                    <Badge
                      variant={getPriorityVariant(row.priority)}
                      size="sm"
                      className="rounded-xl mr-2"
                    >
                      Priority: {row.priority}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Configure parser"
                        onClick={e => {
                          e.stopPropagation()
                        }}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Remove parser"
                        onClick={e => {
                          e.stopPropagation()
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </button>
                  {open ? (
                    <div className="mt-2 rounded-md border border-border bg-accent/10 p-2 text-sm">
                      <div className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Include:
                        </span>{' '}
                        {row.include}{' '}
                        <span className="ml-2 font-medium text-foreground">
                          Exclude:
                        </span>{' '}
                        {row.exclude}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {row.summary}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {extractorRows.map(row => {
              const open = openRows.has(row.id)
              return (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-card p-3 hover:bg-accent/20 transition-colors"
                >
                  <button
                    className="w-full flex items-center gap-2 text-left"
                    onClick={() => toggleRow(row.id)}
                    aria-expanded={open}
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                    <div className="flex-1 text-sm font-medium">{row.name}</div>
                    <Badge
                      variant={getPriorityVariant(row.priority)}
                      size="sm"
                      className="rounded-xl mr-2"
                    >
                      Priority: {row.priority}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Configure extractor"
                        onClick={e => {
                          e.stopPropagation()
                        }}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Remove extractor"
                        onClick={e => {
                          e.stopPropagation()
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </button>
                  {open ? (
                    <div className="mt-2 rounded-md border border-border bg-accent/10 p-2 text-sm">
                      <div className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Apply to:
                        </span>{' '}
                        {row.applyTo}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {row.summary}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Edit Strategy Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg text-foreground">
              Edit strategy
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-1">
            <div>
              <label className="text-xs text-muted-foreground">
                Strategy name
              </label>
              <input
                className="w-full mt-1 bg-transparent rounded-lg py-2 px-3 border border-input text-foreground"
                placeholder="Enter name"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Description
              </label>
              <textarea
                rows={4}
                className="w-full mt-1 bg-transparent rounded-lg py-2 px-3 border border-input text-foreground"
                placeholder="Add a brief description"
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 text-sm"
              onClick={() => {
                if (!strategyId) return
                const ok = confirm(
                  'Are you sure you want to delete this strategy?'
                )
                if (ok) {
                  try {
                    localStorage.removeItem(
                      `lf_strategy_name_override_${strategyId}`
                    )
                    localStorage.removeItem(
                      `lf_strategy_description_${strategyId}`
                    )
                    // Mark strategy as deleted so it disappears from lists
                    const raw = localStorage.getItem('lf_strategy_deleted')
                    const arr = raw ? (JSON.parse(raw) as string[]) : []
                    const set = new Set(arr)
                    set.add(strategyId)
                    localStorage.setItem(
                      'lf_strategy_deleted',
                      JSON.stringify(Array.from(set))
                    )
                  } catch {}
                  setIsEditOpen(false)
                  setStrategyMetaTick(t => t + 1)
                  navigate('/chat/rag')
                  toast({ message: 'Strategy deleted', variant: 'default' })
                }
              }}
              type="button"
            >
              Delete
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <button
                className="px-3 py-2 rounded-md text-sm text-primary hover:underline"
                onClick={() => setIsEditOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm ${editName.trim().length > 0 ? 'bg-primary text-primary-foreground hover:opacity-90' : 'opacity-50 cursor-not-allowed bg-primary text-primary-foreground'}`}
                onClick={() => {
                  if (!strategyId || editName.trim().length === 0) return
                  try {
                    localStorage.setItem(
                      `lf_strategy_name_override_${strategyId}`,
                      editName.trim()
                    )
                    localStorage.setItem(
                      `lf_strategy_description_${strategyId}`,
                      editDescription
                    )
                  } catch {}
                  setIsEditOpen(false)
                  setStrategyMetaTick(t => t + 1)
                }}
                disabled={editName.trim().length === 0}
                type="button"
              >
                Save
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* End processing editors */}

      {/* Retrieval and Embedding moved to project-level settings. */}
    </div>
  )
}

export default StrategyView
