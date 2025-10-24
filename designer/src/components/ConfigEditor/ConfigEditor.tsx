import { lazy, Suspense, useState, useEffect } from 'react'
import { useActiveProject } from '../../hooks/useActiveProject'
import { useFormattedConfig } from '../../hooks/useFormattedConfig'
import { useUpdateProject } from '../../hooks/useProjects'
import { useTheme } from '../../contexts/ThemeContext'
import yaml from 'yaml'
import ConfigLoading from './ConfigLoading'
import ConfigError from './ConfigError'
import Loader from '../../common/Loader'
import FontIcon from '../../common/FontIcon'

// Lazy load the CodeMirror editor
const CodeMirrorEditor = lazy(
  () => import('../CodeMirrorEditor/CodeMirrorEditor')
)

interface ConfigEditorProps {
  className?: string
}

const ConfigEditor: React.FC<ConfigEditorProps> = ({ className = '' }) => {
  // Get current project info using reactive hook
  const activeProject = useActiveProject()
  const { theme } = useTheme()

  // Use the extracted hook for all data fetching and formatting
  const { formattedConfig, isLoading, error, refetch, projectData } =
    useFormattedConfig()

  // Edit state
  const [editedContent, setEditedContent] = useState<string>(formattedConfig)
  const [isDirty, setIsDirty] = useState(false)

  // Update edited content when formatted config changes
  useEffect(() => {
    setEditedContent(formattedConfig)
    setIsDirty(false)
  }, [formattedConfig])

  // Update project mutation
  const updateProject = useUpdateProject()

  // Only show loading on initial load, not for subsequent fetches
  const isActuallyLoading = isLoading && !projectData

  // Handle content changes
  const handleChange = (newContent: string) => {
    setEditedContent(newContent)
    setIsDirty(newContent !== formattedConfig)
  }

  // Handle save
  const handleSave = async () => {
    if (!activeProject || !isDirty) return

    try {
      // Parse YAML first to check for syntax errors
      let configObj
      try {
        configObj = yaml.parse(editedContent)
      } catch (parseError) {
        alert(`YAML syntax error:\n\n${parseError instanceof Error ? parseError.message : 'Invalid YAML syntax'}\n\nPlease fix the syntax before saving.`)
        return
      }

      // Update project via API
      await updateProject.mutateAsync({
        namespace: activeProject.namespace,
        projectId: activeProject.project,
        request: {
          config: configObj
        }
      })

      // Refetch to get latest data
      await refetch()

      setIsDirty(false)
    } catch (err: any) {
      console.error('Failed to save config:', err)

      // Parse backend validation errors
      let errorMessage = 'Failed to save configuration'

      if (err.response?.data) {
        const data = err.response.data

        // Handle backend validation errors
        if (data.detail) {
          if (Array.isArray(data.detail)) {
            // Pydantic validation errors
            const backendErrors = data.detail
              .slice(0, 10)
              .map((e: any) => {
                const location = e.loc ? e.loc.join('.') : 'unknown'
                return `  ${location}: ${e.msg || e.message || 'validation error'}`
              })
              .join('\n')

            const moreErrors = data.detail.length > 10 ? `\n  ... and ${data.detail.length - 10} more errors` : ''
            errorMessage = `Backend validation errors:\n\n${backendErrors}${moreErrors}`
          } else if (typeof data.detail === 'string') {
            errorMessage = `Backend error: ${data.detail}`
          } else {
            errorMessage = `Backend error: ${JSON.stringify(data.detail)}`
          }
        } else if (data.message) {
          errorMessage = data.message
        }
      } else if (err.message) {
        errorMessage = err.message
      }

      alert(errorMessage)
    }
  }

  // Handle discard
  const handleDiscard = () => {
    setEditedContent(formattedConfig)
    setIsDirty(false)
  }

  if (isActuallyLoading) {
    return <ConfigLoading activeProject={activeProject} className={className} />
  }

  if (error) {
    return (
      <ConfigError
        error={error}
        activeProject={activeProject}
        onRetry={refetch}
        className={className}
      />
    )
  }

  return (
    <Suspense
      fallback={
        <div
          className={`config-editor w-full h-full min-h-0 max-h-full rounded-lg bg-card border border-border overflow-hidden flex flex-col ${className}`}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border bg-card flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FontIcon type="code" className="w-4 h-4 text-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Project Configuration
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({activeProject?.project || 'No project'})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Loading editor...
                </span>
              </div>
            </div>
          </div>

          {/* Loading editor */}
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader className="w-8 h-8" />
              <span className="text-sm text-muted-foreground">
                Loading code editor...
              </span>
            </div>
          </div>
        </div>
      }
    >
      <CodeMirrorEditor
        content={editedContent}
        className={`w-full h-full min-h-0 ${className}`}
        language="yaml"
        theme={theme}
        readOnly={false}
        onChange={handleChange}
        onSave={handleSave}
        onDiscard={handleDiscard}
        isDirty={isDirty}
        isSaving={updateProject.isPending}
      />
    </Suspense>
  )
}

export default ConfigEditor
