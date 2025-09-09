import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useRef,
} from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import FontIcon from '../common/FontIcon'

type PackageModalContextValue = {
  openPackageModal: () => void
  closePackageModal: () => void
}

const PackageModalContext = createContext<PackageModalContextValue | undefined>(
  undefined
)

export const usePackageModal = (): PackageModalContextValue => {
  const ctx = useContext(PackageModalContext)
  if (!ctx) {
    throw new Error(
      'usePackageModal must be used within a PackageModalProvider'
    )
  }
  return ctx
}

type ProviderProps = {
  children: React.ReactNode
}

export const PackageModalProvider: React.FC<ProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [version, setVersion] = useState<string>('v1.0.1')
  const [versionError, setVersionError] = useState<string>('')
  const [savingTo, setSavingTo] = useState<string>(() => {
    try {
      // Best-effort default path; OS-agnostic fallback
      const home =
        (typeof window !== 'undefined' && (window as any).process?.env?.HOME) ||
        '/Users/you'
      return `${home}/Downloads/`
    } catch {
      return '/Users/you/Downloads/'
    }
  })
  const [description, setDescription] = useState<string>('')
  const [changesOpen, setChangesOpen] = useState<boolean>(false)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [isPackaging, setIsPackaging] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [currentStep, setCurrentStep] = useState<string>('')
  const packagingTimerRef = useRef<number | null>(null)

  const openFolderPicker = useCallback(async () => {
    try {
      const anyWindow = window as any
      if (anyWindow && typeof anyWindow.showDirectoryPicker === 'function') {
        const handle = await anyWindow.showDirectoryPicker({
          mode: 'readwrite',
        })
        // Full absolute path is not exposed for privacy; show selected folder name
        setSavingTo(`${handle.name}/`)
        return
      }
    } catch {
      // ignore and fall back
    }
    try {
      folderInputRef.current?.click()
    } catch {}
  }, [])

  const openPackageModal = useCallback(() => setIsOpen(true), [])
  const closePackageModal = useCallback(() => setIsOpen(false), [])

  const value = useMemo(
    () => ({ openPackageModal, closePackageModal }),
    [openPackageModal, closePackageModal]
  )

  return (
    <PackageModalContext.Provider value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="sm:max-w-2xl top-[45%]"
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-lg text-foreground">
              {isPackaging
                ? 'Packaging Your LlamaFarm Project...'
                : 'Package Your LlamaFarm Project'}
            </DialogTitle>
            {!isPackaging ? (
              <DialogDescription>
                Generate a deployable version of your config file with all
                inputs, prompts, and model settings baked in. Export it to run
                locally, test in staging, or hand it off to your team.
              </DialogDescription>
            ) : (
              <DialogDescription>Leave this window open</DialogDescription>
            )}
          </DialogHeader>
          {!isPackaging ? (
            <div className="flex flex-col gap-3">
              {/* Version */}
              <div>
                <label className="text-xs text-muted-foreground">Version</label>
                <div className="mt-1 grid grid-cols-3 gap-2 items-center">
                  <Input
                    value={version}
                    onChange={e => {
                      const v = e.target.value
                      setVersion(v)
                      if (/^[a-zA-Z0-9._-]+$/.test(v)) {
                        setVersionError('')
                      } else {
                        setVersionError(
                          'Use letters, numbers, dashes (-), underscores (_), or dots (.) only'
                        )
                      }
                    }}
                    className={`col-span-2 ${versionError ? 'border-red-500 dark:border-red-300' : ''}`}
                    placeholder="v1.0.1"
                    aria-invalid={versionError ? true : undefined}
                    data-invalid={versionError ? true : undefined}
                  />
                  <div className="col-span-1 text-sm text-muted-foreground truncate">
                    .llamafarm
                  </div>
                </div>
              </div>
              <div className="h-2 -mt-1">
                {versionError ? (
                  <div className="text-xs leading-3 mt-0 text-red-500 dark:text-red-300">
                    {versionError}
                  </div>
                ) : null}
              </div>

              {/* Saving to (read-only) */}
              <div className="-mt-2">
                <label className="text-xs text-muted-foreground">
                  Saving to
                </label>
                <div className="mt-0 grid grid-cols-[1fr_auto] gap-2 items-center">
                  <Input value={savingTo} readOnly className="truncate" />
                  <button
                    type="button"
                    className="w-9 h-9 inline-flex items-center justify-center rounded-md border border-input text-white hover:bg-accent/30 leading-none"
                    aria-label="Change folder"
                    onClick={openFolderPicker}
                  >
                    <FontIcon type="folder" className="w-5 h-5" />
                  </button>
                  {/* Hidden input fallback for browsers without showDirectoryPicker */}
                  <input
                    ref={folderInputRef}
                    type="file"
                    // @ts-expect-error Non-standard attribute supported in Blink/WebKit
                    webkitdirectory=""
                    style={{ display: 'none' }}
                    onChange={e => {
                      try {
                        const files = e.target.files
                        if (files && files.length > 0) {
                          const first: any = files[0]
                          const rel: string = first?.webkitRelativePath || ''
                          const top = rel.split('/')[0] || 'Selected folder'
                          setSavingTo(`${top}/`)
                        }
                        ;(e.target as HTMLInputElement).value = ''
                      } catch {}
                    }}
                  />
                </div>
              </div>

              {/* Description (optional) */}
              <div>
                <label className="text-xs text-muted-foreground">
                  Description (optional)
                </label>
                <Input
                  className="mt-1"
                  placeholder="Add a short description of what’s included in this package"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              {/* What's changed (accordion) */}
              <section className="rounded-lg border border-border bg-card">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 text-left"
                  onClick={() => setChangesOpen(o => !o)}
                  aria-expanded={changesOpen}
                >
                  <div className="text-sm font-medium">
                    What’s changed since v1.0.0
                  </div>
                  <FontIcon
                    type="chevron-down"
                    className={`w-4 h-4 transition-transform ${changesOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {changesOpen ? (
                  <div className="px-3 pb-3">
                    <div className="rounded-md border border-border bg-background p-3 text-xs">
                      <div className="mb-1 font-medium">
                        Prompts (3 modified)
                      </div>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>
                          <span className="font-mono">system_prompt.txt</span> –
                          updated instructions
                        </li>
                        <li>
                          <span className="font-mono">
                            few_shot_examples.txt
                          </span>{' '}
                          – added 2 examples
                        </li>
                        <li>
                          <span className="font-mono">
                            validation_prompt.txt
                          </span>{' '}
                          – fixed typos
                        </li>
                      </ul>
                      <div className="mt-3 font-medium">Datasets (1 added)</div>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>
                          <span className="font-mono">
                            dataset_telemetry_2025.csv
                          </span>
                        </li>
                      </ul>
                      <div className="mt-3 font-medium">Model</div>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Hyperparameters tuned for retrieval fidelity</li>
                      </ul>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="w-full rounded-md border border-border p-3 bg-card">
                <div className="h-2 w-full rounded-full bg-accent/20">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {currentStep}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Estimated size ~2.3GB
              </div>
            </div>
          )}
          <DialogFooter>
            {!isPackaging ? (
              <div className="w-full flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  Estimated size ~2.3GB
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded-md text-sm text-primary hover:underline"
                    onClick={closePackageModal}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="px-3 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:opacity-90"
                    onClick={() => {
                      setIsPackaging(true)
                      setProgress(0)
                      const steps = [
                        'Validating configuration...',
                        'Collecting prompts and inputs...',
                        'Embedding and compressing model files...',
                        'Bundling datasets and assets...',
                        'Generating package metadata...',
                      ]
                      let stepIndex = 0
                      setCurrentStep(steps[stepIndex])
                      const id = window.setInterval(() => {
                        setProgress(p => {
                          const next = Math.min(100, p + Math.random() * 6 + 2)
                          if (
                            next > (stepIndex + 1) * 20 &&
                            stepIndex < steps.length - 1
                          ) {
                            stepIndex += 1
                            setCurrentStep(steps[stepIndex])
                          }
                          if (next >= 100) {
                            window.clearInterval(id)
                            packagingTimerRef.current = null
                            setTimeout(() => {
                              setIsPackaging(false)
                              closePackageModal()
                            }, 600)
                          }
                          return next
                        })
                      }, 300)
                      packagingTimerRef.current = id
                    }}
                    type="button"
                  >
                    Package
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full flex items-center justify-end">
                <button
                  className="px-3 py-2 rounded-md text-sm bg-secondary text-secondary-foreground border border-input hover:bg-secondary/80"
                  onClick={() => {
                    if (packagingTimerRef.current) {
                      window.clearInterval(packagingTimerRef.current)
                      packagingTimerRef.current = null
                    }
                    setIsPackaging(false)
                    setProgress(0)
                    setCurrentStep('')
                  }}
                  type="button"
                >
                  Stop
                </button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PackageModalContext.Provider>
  )
}
