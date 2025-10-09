import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog'
import FontIcon from '../../../common/FontIcon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu'

export type PromptModalMode = 'create' | 'edit'

interface PromptModalProps {
  isOpen: boolean
  mode: PromptModalMode
  initialText?: string
  initialRole?: 'system' | 'assistant' | 'user'
  onClose: () => void
  onSave: (text: string, role: 'system' | 'assistant' | 'user') => void
  onDelete?: () => void
}

const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  mode,
  initialText = '',
  initialRole = 'system',
  onClose,
  onSave,
  onDelete,
}) => {
  const [text, setText] = useState(initialText)
  const [role, setRole] = useState<'system' | 'assistant' | 'user'>(initialRole)

  useEffect(() => {
    if (isOpen) {
      setText(initialText)
      setRole(initialRole)
    }
  }, [isOpen, initialText, initialRole])

  const title = mode === 'create' ? 'Create prompt' : 'Edit prompt'
  const cta = mode === 'create' ? 'Create' : 'Save'
  const isValid = text.trim().length > 0

  const handleDelete = () => {
    if (!onDelete) return
    const ok = confirm('Delete this prompt?')
    if (ok) onDelete()
  }

  return (
    <Dialog open={isOpen} onOpenChange={v => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg text-foreground">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-1">
          <div>
            <label className="text-xs text-muted-foreground">Role</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full h-9 rounded-md border border-input bg-background px-3 text-left flex items-center justify-between mt-1">
                  <span className="text-sm">{role}</span>
                  <FontIcon type="chevron-down" className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64">
                {(['system', 'assistant', 'user'] as const).map(opt => (
                  <DropdownMenuItem
                    key={opt}
                    className="w-full justify-start text-left"
                    onClick={() => setRole(opt)}
                  >
                    {opt}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Prompt text</label>
            <textarea
              rows={10}
              className="w-full mt-1 bg-transparent rounded-lg py-2 px-3 border border-input text-foreground font-mono text-sm"
              placeholder="Enter the system or instruction prompt"
              value={text}
              onChange={e => setText(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-between sm:justify-between gap-2">
          {mode === 'edit' ? (
            <button
              className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 text-sm"
              onClick={handleDelete}
              type="button"
            >
              Delete
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              className="px-3 py-2 rounded-md text-sm text-primary hover:underline"
              onClick={onClose}
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
              onClick={() => isValid && onSave(text.trim(), role)}
            >
              {cta}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PromptModal
