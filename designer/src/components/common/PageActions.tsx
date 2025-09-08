import React from 'react'
import ModeToggle, { Mode } from '../ModeToggle'
import { Button } from '../ui/button'

interface PageActionsProps {
  mode?: Mode
  onModeChange?: (m: Mode) => void
  showPackage?: boolean
  packageLabel?: string
  onPackageClick?: () => void
  className?: string
}

/**
 * Renders the standard page actions: Code/Designer switcher and Package button.
 * - Mode switcher appears only when both mode and onModeChange are provided.
 * - Package button is enabled by default and can be hidden via showPackage=false.
 */
const PageActions: React.FC<PageActionsProps> = ({
  mode,
  onModeChange,
  showPackage = true,
  packageLabel = 'Package',
  onPackageClick,
  className,
}) => {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      {mode && onModeChange ? (
        <ModeToggle mode={mode} onToggle={onModeChange} />
      ) : null}
      {showPackage ? (
        <Button variant="outline" size="sm" onClick={onPackageClick}>
          {packageLabel}
        </Button>
      ) : null}
    </div>
  )
}

export default PageActions
