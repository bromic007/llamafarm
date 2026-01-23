import { useState } from 'react'
import {
  Activity,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { useServiceHealth, AggregateStatus, ServiceDisplay } from '../hooks/useServiceHealth'
import { cn } from '../lib/utils'

/**
 * Status dot colors for the trigger icon
 */
const DOT_COLORS: Record<NonNullable<AggregateStatus>, string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  unhealthy: 'bg-red-500',
}

/**
 * Banner styles based on aggregate status
 */
const BANNER_STYLES: Record<NonNullable<AggregateStatus>, string> = {
  healthy: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  degraded: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  unhealthy: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

/**
 * Banner messages based on aggregate status
 */
const BANNER_MESSAGES: Record<NonNullable<AggregateStatus>, string> = {
  healthy: 'All services operational',
  degraded: 'Some services need attention',
  unhealthy: 'Service issues detected',
}

/**
 * Status icon component
 */
function StatusIcon({ status }: { status: ServiceDisplay['status'] }) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
    case 'degraded':
      return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
    case 'unhealthy':
      return <XCircle className="w-4 h-4 text-red-500 shrink-0" />
  }
}

/**
 * Service row component
 */
function ServiceRow({ service }: { service: ServiceDisplay }) {
  return (
    <div className="flex items-start justify-between py-3 px-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <StatusIcon status={service.status} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">
            {service.displayName}
          </span>
          <span className="text-xs text-muted-foreground">
            {service.message}
          </span>
        </div>
      </div>
      {service.latencyMs !== undefined && (
        <span className="text-xs text-muted-foreground shrink-0 ml-2">
          {service.latencyMs}ms
        </span>
      )}
    </div>
  )
}

/**
 * Loading spinner component
 */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full w-6 h-6 border-2 border-primary border-t-transparent" />
    </div>
  )
}

/**
 * Error state component
 */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-6 px-4 text-center">
      <XCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
      <p className="text-sm text-muted-foreground mb-3">
        Unable to fetch service status
      </p>
      <button
        onClick={onRetry}
        className="text-sm text-primary hover:underline"
      >
        Retry
      </button>
    </div>
  )
}

/**
 * Service Status Panel component
 *
 * Displays health status of core LlamaFarm services in a dropdown panel.
 * Auto-refreshes every 30 seconds while open.
 */
export function ServiceStatusPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const { services, aggregateStatus, isLoading, error, refresh } =
    useServiceHealth(isOpen)

  const showLoading = isLoading && services.length === 0
  const showError = error && services.length === 0

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative w-8 h-7 flex items-center justify-center rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          title="Service Status"
        >
          <Activity className="w-4 h-4" />
          {aggregateStatus && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full',
                DOT_COLORS[aggregateStatus]
              )}
            />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {aggregateStatus && (
              <AlertTriangle
                className={cn(
                  'w-4 h-4',
                  aggregateStatus === 'healthy'
                    ? 'text-emerald-500'
                    : aggregateStatus === 'degraded'
                      ? 'text-amber-500'
                      : 'text-red-500'
                )}
              />
            )}
            <span className="text-sm font-semibold text-foreground">
              Service Status
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.preventDefault()
                refresh()
              }}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              disabled={isLoading}
              title="Refresh"
            >
              <RefreshCw
                className={cn('w-4 h-4', isLoading && 'animate-spin')}
              />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {showLoading ? (
          <LoadingSpinner />
        ) : showError ? (
          <ErrorState onRetry={refresh} />
        ) : (
          <>
            {/* Summary Banner */}
            {aggregateStatus && (
              <div
                className={cn(
                  'px-4 py-2 text-sm font-medium',
                  BANNER_STYLES[aggregateStatus]
                )}
              >
                {BANNER_MESSAGES[aggregateStatus]}
              </div>
            )}

            {/* Service List */}
            <div className="divide-y divide-border">
              {services.map((service) => (
                <ServiceRow key={service.id} service={service} />
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-3">
              <a
                href="https://docs.llamafarm.ai/troubleshooting"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Troubleshooting docs
              </a>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
