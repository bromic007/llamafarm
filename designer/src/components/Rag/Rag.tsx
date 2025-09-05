import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FontIcon from '../../common/FontIcon'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import SearchInput from '../ui/search-input'
import { defaultStrategies } from './strategies'
import { useToast } from '../ui/toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

type RagStrategy = import('./strategies').RagStrategy

function Rag() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { toast } = useToast()

  const [metaTick, setMetaTick] = useState(0)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editId, setEditId] = useState<string>('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  // Derive display strategies with local overrides
  const strategies: RagStrategy[] = defaultStrategies
  const resetStrategies = () => {
    try {
      localStorage.removeItem('lf_strategy_deleted')
      defaultStrategies.forEach(s => {
        localStorage.removeItem(`lf_strategy_name_override_${s.id}`)
        localStorage.removeItem(`lf_strategy_description_${s.id}`)
      })
    } catch {}
    setMetaTick(t => t + 1)
    toast({ message: 'Strategies reset', variant: 'default' })
  }
  const getDeletedSet = (): Set<string> => {
    try {
      const raw = localStorage.getItem('lf_strategy_deleted')
      if (!raw) return new Set()
      const arr = JSON.parse(raw) as string[]
      return new Set(arr)
    } catch {
      return new Set()
    }
  }
  const saveDeletedSet = (s: Set<string>) => {
    try {
      localStorage.setItem('lf_strategy_deleted', JSON.stringify(Array.from(s)))
    } catch {}
  }
  const markDeleted = (id: string) => {
    const set = getDeletedSet()
    set.add(id)
    saveDeletedSet(set)
    setMetaTick(t => t + 1)
  }
  const display = useMemo(() => {
    const deleted = getDeletedSet()
    return strategies
      .filter(s => !deleted.has(s.id))
      .map(s => {
        let name = s.name
        let description = s.description
        try {
          const n = localStorage.getItem(`lf_strategy_name_override_${s.id}`)
          if (n && n.trim().length > 0) name = n
          const d = localStorage.getItem(`lf_strategy_description_${s.id}`)
          if (d !== null) description = d
        } catch {}
        return { ...s, name, description }
      })
  }, [metaTick])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return display
    return display.filter(s =>
      [s.name, s.description].some(v => v.toLowerCase().includes(q))
    )
  }, [query, display])

  return (
    <>
      <div className="w-full flex flex-col gap-4 pb-32">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl">RAG</h2>
        </div>

        <div className="text-sm text-muted-foreground mb-1">
          simple description – these can be applied to datasets
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Default RAG strategies</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={resetStrategies}>
                Reset list
              </Button>
              <Button size="sm" onClick={() => navigate('/chat/rag#create')}>
                Create new
              </Button>
            </div>
          </div>

          <div className="mb-3 max-w-xl">
            <SearchInput
              placeholder="Search RAG Strategies"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filtered.map(s => (
              <div
                key={s.id}
                className="w-full bg-card rounded-lg border border-border flex flex-col gap-2 p-4 relative hover:bg-accent/20 hover:cursor-pointer transition-colors"
                onClick={() => navigate(`/chat/rag/${s.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate(`/chat/rag/${s.id}`)
                  }
                }}
              >
                <div className="absolute top-2 right-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="w-6 h-6 grid place-items-center rounded-md text-muted-foreground hover:bg-accent/30"
                        onClick={e => e.stopPropagation()}
                      >
                        <FontIcon type="overflow" className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="min-w-[10rem] w-[10rem]"
                    >
                      <DropdownMenuItem
                        onClick={e => {
                          e.stopPropagation()
                          e.preventDefault()
                          setEditId(s.id)
                          setEditName(s.name)
                          setEditDescription(s.description)
                          setIsEditOpen(true)
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => navigate(`/chat/rag/${s.id}`)}
                      >
                        Configure
                      </DropdownMenuItem>
                      <DropdownMenuItem>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={e => {
                          e.stopPropagation()
                          e.preventDefault()
                          const ok = confirm(
                            'Are you sure you want to delete this strategy?'
                          )
                          if (ok) {
                            try {
                              localStorage.removeItem(
                                `lf_strategy_name_override_${s.id}`
                              )
                              localStorage.removeItem(
                                `lf_strategy_description_${s.id}`
                              )
                            } catch {}
                            markDeleted(s.id)
                            toast({
                              message: 'Strategy deleted',
                              variant: 'default',
                            })
                          }
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="text-sm font-medium">{s.name}</div>
                <button
                  className="text-xs text-primary text-left hover:underline w-fit"
                  onClick={e => e.stopPropagation()}
                >
                  {s.description}
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  {s.isDefault ? (
                    <Badge variant="default" size="sm" className="rounded-xl">
                      Default
                    </Badge>
                  ) : (
                    <Badge
                      variant="default"
                      size="sm"
                      className="rounded-xl bg-emerald-600 text-emerald-50 dark:bg-emerald-400 dark:text-emerald-900"
                    >
                      Custom
                    </Badge>
                  )}
                  <Badge
                    variant={s.datasetsUsing > 0 ? 'default' : 'secondary'}
                    size="sm"
                    className={`rounded-xl ${s.datasetsUsing > 0 ? 'bg-emerald-600 text-emerald-50 dark:bg-emerald-400 dark:text-emerald-900' : ''}`}
                  >
                    {`${s.datasetsUsing} datasets using`}
                  </Badge>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-3"
                    onClick={e => {
                      e.stopPropagation()
                      navigate(`/chat/rag/${s.id}`)
                    }}
                  >
                    Configure
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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
          <DialogFooter className="flex items-center justify-between gap-2">
            <button
              className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 text-sm"
              onClick={() => {
                if (!editId) return
                const ok = confirm(
                  'Are you sure you want to delete this strategy?'
                )
                if (ok) {
                  try {
                    localStorage.removeItem(
                      `lf_strategy_name_override_${editId}`
                    )
                    localStorage.removeItem(`lf_strategy_description_${editId}`)
                  } catch {}
                  markDeleted(editId)
                  setIsEditOpen(false)
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
                  if (!editId || editName.trim().length === 0) return
                  try {
                    localStorage.setItem(
                      `lf_strategy_name_override_${editId}`,
                      editName.trim()
                    )
                    localStorage.setItem(
                      `lf_strategy_description_${editId}`,
                      editDescription
                    )
                  } catch {}
                  setIsEditOpen(false)
                  setMetaTick(t => t + 1)
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
    </>
  )
}

export default Rag
