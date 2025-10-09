import { useMemo, useState } from 'react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog'
import { Badge } from '../ui/badge'
import {
  sampleProjects,
  type SuggestedDataset,
} from '../../data/sampleProjects'

type Kind = NonNullable<SuggestedDataset['kind']>

type FlattenedDataset = {
  uid: string
  id: string
  name: string
  kind: Kind | undefined
  size?: string
  projectId: string
  projectTitle: string
  defaultStrategy: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (payload: {
    name: string
    rag_strategy: string
    sourceProjectId: string
  }) => void
}

const mapKindToStrategy = (kind?: Kind): string => {
  switch (kind) {
    case 'pdf':
      return 'PDF Simple'
    case 'markdown':
      return 'Markdown'
    case 'csv':
      return 'Tabular (CSV)'
    case 'images':
      return 'Image OCR'
    case 'json':
      return 'JSON (records)'
    case 'timeseries':
      return 'Timeseries (basic)'
    default:
      return 'default'
  }
}

function ImportSampleDatasetModal({ open, onOpenChange, onImport }: Props) {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'all' | Kind>('all')
  const [selected, setSelected] = useState<string>('')
  const [includeStrategy, setIncludeStrategy] = useState(true)

  const allDatasets: FlattenedDataset[] = useMemo(() => {
    const items: FlattenedDataset[] = []
    for (const p of sampleProjects) {
      for (const d of p.suggestedDatasets || []) {
        const uid = `${p.id}:${d.id}`
        items.push({
          uid,
          id: d.id,
          name: d.name,
          kind: d.kind,
          size: (d as any).size as string | undefined,
          projectId: p.id,
          projectTitle: p.title,
          defaultStrategy: mapKindToStrategy(d.kind),
        })
      }
    }
    return items
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allDatasets.filter(ds => {
      const byKind = kind === 'all' || ds.kind === kind
      const byTerm = term
        ? ds.name.toLowerCase().includes(term) ||
          ds.projectTitle.toLowerCase().includes(term)
        : true
      return byKind && byTerm
    })
  }, [allDatasets, kind, search])

  const selectedObj = useMemo(
    () =>
      filtered.find(d => d.uid === selected) ||
      allDatasets.find(d => d.uid === selected),
    [filtered, allDatasets, selected]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl -translate-y-[50%] md:-translate-y-[55%] h-[100dvh] sm:h-auto max-h-[100vh] md:max-h-[85vh] overflow-hidden"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Import sample dataset</DialogTitle>
        </DialogHeader>
        {/* Use grid rows so the scroll region can grow properly inside DialogContent's inherent grid */}
        <div className="grid grid-rows-[auto_1fr] gap-3 min-h-0">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search datasets or projects"
            aria-label="Search datasets or projects"
            className="text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                'all',
                'pdf',
                'csv',
                'markdown',
                'images',
                'json',
                'timeseries',
              ] as const
            ).map(k => (
              <button
                key={k}
                type="button"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs transition-colors ${
                  kind === k
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-input hover:bg-accent/30'
                }`}
                onClick={() => setKind(k as any)}
              >
                <span>{k === 'all' ? 'All types' : k}</span>
              </button>
            ))}
          </div>
          {/* Scroll region */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0 overflow-auto">
            {filtered.length === 0 ? (
              <div className="col-span-full text-sm text-muted-foreground p-2">
                No datasets match your search.
              </div>
            ) : (
              filtered.map(ds => {
                const isSelected = ds.uid === selected
                return (
                  <button
                    key={ds.uid}
                    type="button"
                    className={`w-full text-left rounded-md border p-3 transition-colors ${
                      isSelected
                        ? 'border-primary bg-accent/30'
                        : 'border-input bg-card hover:bg-accent/20'
                    }`}
                    onClick={() => setSelected(ds.uid)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-sm font-medium">{ds.name}</div>
                      {ds.kind ? (
                        <Badge size="sm" className="rounded-xl capitalize">
                          {ds.kind}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      From {ds.projectTitle}
                    </div>
                    <div className="mt-2 text-xs text-foreground/80 flex items-center gap-2">
                      <span className="font-mono">{ds.size || '—'}</span>
                      <span className="text-muted-foreground">•</span>
                      <span>Default strategy: {ds.defaultStrategy}</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
        <DialogFooter className="sticky bottom-0 bg-card pt-2 flex-col gap-3">
          <div className="flex items-center justify-between w-full">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-current"
                checked={includeStrategy}
                onChange={e => setIncludeStrategy(e.target.checked)}
              />
              Include processing strategy
            </label>
            {selectedObj ? (
              <div className="text-xs text-muted-foreground">
                Selected: {selectedObj.name}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedObj}
              onClick={() => {
                if (!selectedObj) return
                const rag = includeStrategy
                  ? selectedObj.defaultStrategy
                  : 'default'
                onImport({
                  name: selectedObj.name,
                  rag_strategy: rag,
                  sourceProjectId: selectedObj.projectId,
                })
              }}
              className="w-full sm:w-auto"
            >
              Import
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ImportSampleDatasetModal
