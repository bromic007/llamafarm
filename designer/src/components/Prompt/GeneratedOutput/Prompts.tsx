import { useMemo, useState } from 'react'
import FontIcon from '../../../common/FontIcon'
import { Button } from '../../ui/button'
import { useActiveProject } from '../../../hooks/useActiveProject'
import { useProject } from '../../../hooks/useProjects'
import projectService from '../../../api/projectService'
import PromptModal, { PromptModalMode } from './PromptModal'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog'
import { useToast } from '../../ui/toast'
import {
  parsePromptSets,
  serializePromptSets,
  type PromptSet,
} from '../../../utils/promptSets'

const Prompts = () => {
  const activeProject = useActiveProject()
  const { data: projectResponse, refetch } = useProject(
    activeProject?.namespace || '',
    activeProject?.project || '',
    !!activeProject?.namespace && !!activeProject?.project
  )
  const { toast } = useToast()

  const promptSets: PromptSet[] = useMemo(() => {
    const prompts = projectResponse?.project?.config?.prompts as
      | Array<{ role?: string; content: string }>
      | undefined
    const { sets } = parsePromptSets(prompts)
    return sets
  }, [projectResponse])

  // (preview rows removed; table renders directly from sets)

  // Add prompt modal state
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<PromptModalMode>('create')
  const [initialText, setInitialText] = useState('')
  const [initialRole, setInitialRole] = useState<
    'system' | 'assistant' | 'user'
  >('system')
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [currentSetIndex, setCurrentSetIndex] = useState<number | null>(null)

  // Create set dialog
  const [isCreateSetOpen, setIsCreateSetOpen] = useState(false)
  const [newSetName, setNewSetName] = useState('')

  // Edit set modal
  const [isEditSetOpen, setIsEditSetOpen] = useState(false)
  const [editSetIndex, setEditSetIndex] = useState<number | null>(null)
  const [editSetName, setEditSetName] = useState('')
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false)

  const handleSavePrompt = async (
    text: string,
    role: 'system' | 'assistant' | 'user'
  ) => {
    if (!activeProject || !projectResponse?.project?.config) return
    const { config } = projectResponse.project
    const { sets } = parsePromptSets(
      (config.prompts as Array<{ role?: string; content: string }>) || []
    )
    const setIdx = currentSetIndex ?? sets.findIndex(s => s.active) ?? 0
    const idx = setIdx >= 0 ? setIdx : 0
    const nextSets = [...sets]
    const target = { ...nextSets[idx] }
    target.items = [...target.items]

    if (
      mode === 'edit' &&
      editIndex != null &&
      editIndex >= 0 &&
      editIndex < target.items.length
    ) {
      target.items[editIndex] = { role, content: text }
    } else {
      target.items.unshift({ role, content: text })
    }
    nextSets[idx] = target

    const prompts = serializePromptSets(nextSets)
    const request = { config: { ...config, prompts } }
    try {
      await projectService.updateProject(
        activeProject.namespace,
        activeProject.project,
        request
      )
      await refetch()
      setIsOpen(false)
      setEditIndex(null)
      setCurrentSetIndex(null)
      toast({ message: 'Prompt saved', variant: 'default' })
    } catch (e) {
      console.error('Failed to save prompt', e)
      toast({ message: 'Failed to save prompt', variant: 'destructive' })
    }
  }

  // openCreatePrompt removed (unused)

  const openEditPrompt = (index: number, setIndex: number) => {
    const set = promptSets[setIndex]
    const item = set?.items[index]
    setMode('edit')
    setEditIndex(index)
    setCurrentSetIndex(setIndex)
    setInitialText(item?.content || '')
    setInitialRole((item?.role as 'system' | 'assistant' | 'user') || 'system')
    setIsOpen(true)
  }

  const performDeletePrompt = async (
    setIndex: number,
    index: number
  ): Promise<boolean> => {
    if (!activeProject || !projectResponse?.project?.config) return false
    const { config } = projectResponse.project
    const { sets } = parsePromptSets(
      (config.prompts as Array<{ role?: string; content: string }>) || []
    )
    if (setIndex < 0 || setIndex >= sets.length) return false
    const nextSets = [...sets]
    const target = { ...nextSets[setIndex] }
    target.items = [...target.items]
    if (index < 0 || index >= target.items.length) return false
    target.items.splice(index, 1)
    nextSets[setIndex] = target

    const prompts = serializePromptSets(nextSets)
    const request = { config: { ...config, prompts } }
    try {
      await projectService.updateProject(
        activeProject.namespace,
        activeProject.project,
        request
      )
      await refetch()
      toast({ message: 'Prompt deleted', variant: 'default' })
      return true
    } catch (e) {
      console.error('Failed to delete prompt', e)
      toast({ message: 'Failed to delete prompt', variant: 'destructive' })
      return false
    }
  }

  const openDeletePrompt = (index: number, setIndex: number) => {
    setDeleteIndex(index)
    setCurrentSetIndex(setIndex)
    setIsDeleteOpen(true)
  }

  const confirmDeletePrompt = async () => {
    if (deleteIndex == null) return
    const sIdx = currentSetIndex ?? promptSets.findIndex(s => s.active) ?? 0
    const success = await performDeletePrompt(sIdx >= 0 ? sIdx : 0, deleteIndex)
    if (success) {
      setIsDeleteOpen(false)
      setDeleteIndex(null)
      setCurrentSetIndex(null)
    }
  }

  // Removed makeActive per updated UX

  const createSet = async () => {
    if (!activeProject || !projectResponse?.project?.config) return
    const name = newSetName.trim() || 'Untitled'
    const { config } = projectResponse.project
    const { sets } = parsePromptSets(
      (config.prompts as Array<{ role?: string; content: string }>) || []
    )
    const next = [
      ...sets,
      { id: `set-${Date.now()}`, name, active: sets.length === 0, items: [] },
    ]
    const prompts = serializePromptSets(next)
    const request = { config: { ...config, prompts } }
    try {
      await projectService.updateProject(
        activeProject.namespace,
        activeProject.project,
        request
      )
      await refetch()
      setIsCreateSetOpen(false)
      setNewSetName('')
      toast({ message: 'Prompt set created', variant: 'default' })
    } catch (e) {
      console.error('Failed to create prompt set', e)
      toast({ message: 'Failed to create set', variant: 'destructive' })
    }
  }

  const deleteSet = async (index: number) => {
    if (!activeProject || !projectResponse?.project?.config) return
    const { config } = projectResponse.project
    const { sets } = parsePromptSets(
      (config.prompts as Array<{ role?: string; content: string }>) || []
    )
    if (index < 0 || index >= sets.length) return
    const next = sets.filter((_, i) => i !== index)
    if (next.length > 0 && !next.some(s => s.active)) {
      next[0].active = true
    }
    const prompts = serializePromptSets(next)
    const request = { config: { ...config, prompts } }
    try {
      await projectService.updateProject(
        activeProject.namespace,
        activeProject.project,
        request
      )
      await refetch()
      toast({ message: 'Prompt set deleted', variant: 'default' })
    } catch (e) {
      console.error('Failed to delete set', e)
      toast({ message: 'Failed to delete set', variant: 'destructive' })
    }
  }

  const openEditSet = (index: number, currentName: string) => {
    setEditSetIndex(index)
    setEditSetName(currentName)
    setIsEditSetOpen(true)
  }

  const saveEditSet = async () => {
    if (
      editSetIndex == null ||
      !activeProject ||
      !projectResponse?.project?.config
    )
      return
    const { config } = projectResponse.project
    const { sets } = parsePromptSets(
      (config.prompts as Array<{ role?: string; content: string }>) || []
    )
    if (editSetIndex < 0 || editSetIndex >= sets.length) return
    const next = [...sets]
    next[editSetIndex] = {
      ...next[editSetIndex],
      name: editSetName.trim() || 'Untitled',
    }
    const prompts = serializePromptSets(next)
    const request = { config: { ...config, prompts } }
    try {
      await projectService.updateProject(
        activeProject.namespace,
        activeProject.project,
        request
      )
      await refetch()
      setIsEditSetOpen(false)
      setEditSetIndex(null)
      setEditSetName('')
      toast({ message: 'Set updated', variant: 'default' })
    } catch (e) {
      console.error('Failed to update set', e)
      toast({ message: 'Failed to update set', variant: 'destructive' })
    }
  }

  const confirmDeleteSet = async () => {
    if (editSetIndex == null) return
    await deleteSet(editSetIndex)
    setIsConfirmDeleteOpen(false)
    setIsEditSetOpen(false)
    setEditSetIndex(null)
    setEditSetName('')
  }

  return (
    <div className="w-full h-full">
      <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-3">
        <p className="text-sm text-muted-foreground w-full">
          Manage multiple named prompt sets. One set is active and used by
          tools. Each set contains role:prompt pairs you can add, edit, or
          delete.
        </p>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            onClick={() => setIsCreateSetOpen(true)}
            className="whitespace-nowrap w-full sm:w-auto"
          >
            New prompt set
          </Button>
          {/* Removed top-level New pair per updated UX */}
        </div>
      </div>

      {promptSets.map((set, sIdx) => (
        <div
          key={set.id}
          className="w-full border border-white dark:border-blue-600 rounded-md mb-4"
        >
          <div className="flex items-center justify-between px-3 py-2">
            <div className="text-sm font-medium">{set.name}</div>
            <div className="flex items-center gap-3">
              <FontIcon
                type="edit"
                isButton
                className="w-4 h-4 text-muted-foreground inline-block mr-2"
                handleOnClick={() => openEditSet(sIdx, set.name)}
              />
              {/* Removed Make active button per updated UX */}
              {/* Removed Delete set from header; available in edit modal */}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setMode('create')
                  setInitialText('')
                  setInitialRole('system')
                  setEditIndex(null)
                  setCurrentSetIndex(sIdx)
                  setIsOpen(true)
                }}
              >
                Add prompt
              </Button>
            </div>
          </div>

          <table className="w-full">
            <thead className="bg-white dark:bg-blue-600 font-normal">
              <tr>
                <th className="text-left w-[15%] py-2 px-3 font-normal">
                  Role
                </th>
                <th className="text-left py-2 px-3 font-normal">Preview</th>
                <th className="text-right w-[1%] py-2 px-3 font-normal">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {set.items.map((prompt, index) => (
                <tr
                  key={index}
                  className={`border-b border-solid border-white dark:border-blue-600 text-sm font-mono leading-4 tracking-[0.32px]${
                    index === set.items.length - 1 ? 'border-b-0' : 'border-b'
                  }`}
                >
                  <td className="align-top p-3">{prompt.role || '—'}</td>
                  <td className="align-top p-3">
                    <div className="whitespace-pre-line break-words line-clamp-6">
                      {prompt.content}
                    </div>
                  </td>
                  <td className="align-top p-3 text-right whitespace-nowrap">
                    <FontIcon
                      type="edit"
                      isButton
                      className="w-4 h-4 text-muted-foreground inline-block mr-3"
                      handleOnClick={() => openEditPrompt(index, sIdx)}
                    />
                    <FontIcon
                      type="trashcan"
                      isButton
                      className="w-4 h-4 text-muted-foreground inline-block"
                      handleOnClick={() => openDeletePrompt(index, sIdx)}
                    />
                  </td>
                </tr>
              ))}
              {set.items.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="align-top p-3 text-sm text-muted-foreground"
                  >
                    No prompts in this set.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
      <PromptModal
        isOpen={isOpen}
        mode={mode}
        initialText={initialText}
        initialRole={initialRole}
        onClose={() => setIsOpen(false)}
        onSave={handleSavePrompt}
      />

      <Dialog
        open={isDeleteOpen}
        onOpenChange={v => (!v ? setIsDeleteOpen(false) : undefined)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg text-foreground">
              Delete prompt
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This will remove the prompt from your project configuration. This
            action cannot be undone.
          </div>
          <DialogFooter className="flex flex-row items-center justify-between sm:justify-between gap-2">
            <div />
            <div className="flex items-center gap-2 ml-auto">
              <button
                className="px-3 py-2 rounded-md text-sm text-primary hover:underline"
                onClick={() => setIsDeleteOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 text-sm"
                onClick={confirmDeletePrompt}
                type="button"
              >
                Delete
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateSetOpen}
        onOpenChange={v => (!v ? setIsCreateSetOpen(false) : undefined)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg text-foreground">
              New prompt set
            </DialogTitle>
          </DialogHeader>
          <Label className="text-sm text-muted-foreground mb-0">Name</Label>
          <Input
            value={newSetName}
            onChange={e => setNewSetName(e.target.value)}
            placeholder="Default"
            className="mb-4"
          />
          <DialogFooter className="flex flex-row items-center justify-between sm:justify-between gap-2">
            <div />
            <div className="flex items-center gap-2 ml-auto">
              <button
                className="px-3 py-2 rounded-md text-sm text-primary hover:underline"
                onClick={() => setIsCreateSetOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm"
                onClick={createSet}
                type="button"
              >
                Create
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditSetOpen}
        onOpenChange={v => (!v ? setIsEditSetOpen(false) : undefined)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg text-foreground">
              Edit prompt set
            </DialogTitle>
          </DialogHeader>
          <Label className="text-sm text-muted-foreground mb-0">Name</Label>
          <Input
            value={editSetName}
            onChange={e => setEditSetName(e.target.value)}
            placeholder="Untitled"
            className="mb-4"
          />
          <DialogFooter className="flex flex-row items-center justify-between sm:justify-between gap-2">
            <div>
              <button
                className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 text-sm"
                onClick={() => setIsConfirmDeleteOpen(true)}
                type="button"
              >
                Delete set
              </button>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                className="px-3 py-2 rounded-md text-sm text-primary hover:underline"
                onClick={() => setIsEditSetOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm"
                onClick={saveEditSet}
                type="button"
              >
                Save
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isConfirmDeleteOpen}
        onOpenChange={v => {
          if (!v) {
            setIsConfirmDeleteOpen(false)
            setIsEditSetOpen(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg text-foreground">
              Delete prompt set
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This will remove this prompt set and all prompts within it. This
            action cannot be undone.
          </div>
          <DialogFooter className="flex flex-row items-center justify-between sm:justify-between gap-2">
            <div />
            <div className="flex items-center gap-2 ml-auto">
              <button
                className="px-3 py-2 rounded-md text-sm text-primary hover:underline"
                onClick={() => {
                  setIsConfirmDeleteOpen(false)
                  setIsEditSetOpen(false)
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 text-sm"
                onClick={confirmDeleteSet}
                type="button"
              >
                Delete
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Prompts
