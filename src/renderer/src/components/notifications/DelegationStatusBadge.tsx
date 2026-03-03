// Phase 19 Part B — Delegation Status Badge

import React from 'react'

type DelegationStatus = 'acknowledged' | 'shared' | 'verbal' | 'not_shared' | 'no_deadline'

interface DelegationStatusBadgeProps {
  status: DelegationStatus
  size?: 'sm' | 'md'
  showLabel?: boolean
  history?: Array<{ method: string; sharedAt: string; acknowledged: boolean }>
}

const STATUS_CONFIG: Record<DelegationStatus, {
  emoji: string; label: string; bg: string; text: string; border: string
}> = {
  acknowledged: {
    emoji: '🟢', label: 'Acknowledged',
    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200'
  },
  shared: {
    emoji: '🔵', label: 'Shared',
    bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200'
  },
  verbal: {
    emoji: '🟡', label: 'Verbal Only',
    bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200'
  },
  not_shared: {
    emoji: '🔴', label: 'Not Shared',
    bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200'
  },
  no_deadline: {
    emoji: '⚫', label: 'No Deadline',
    bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200'
  }
}

export function DelegationStatusBadge({
  status,
  size = 'sm',
  showLabel = true,
  history = []
}: DelegationStatusBadgeProps): React.JSX.Element {
  const [showTooltip, setShowTooltip] = React.useState(false)
  const cfg = STATUS_CONFIG[status]
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'

  return (
    <div className="relative inline-block">
      <span
        className={`
          inline-flex items-center gap-1 rounded-full border font-medium cursor-pointer
          ${sizeClass} ${cfg.bg} ${cfg.text} ${cfg.border}
        `}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span>{cfg.emoji}</span>
        {showLabel && <span>{cfg.label}</span>}
      </span>

      {/* Tooltip with delegation history */}
      {showTooltip && (
        <div className="absolute bottom-full mb-2 left-0 z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 min-w-[200px] shadow-lg">
          <p className="font-bold mb-1">{cfg.label}</p>
          {history.length > 0 ? (
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="text-gray-300">
                  <span className="capitalize">{h.method}</span>
                  {' · '}
                  {new Date(h.sharedAt).toLocaleDateString('en-IN')}
                  {h.acknowledged && <span className="text-emerald-400 ml-1">✓ ACK</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">No delegation history</p>
          )}
          <div className="absolute bottom-[-4px] left-3 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  )
}

// Determine status from boolean flags
export function getDelegationStatus(params: {
  wasShared: boolean
  wasDelegated: boolean
  isAcknowledged: boolean
  hasTimeline: boolean
  lastMethod?: string
}): DelegationStatus {
  if (!params.wasShared && !params.wasDelegated) return 'not_shared'
  if (!params.hasTimeline) return 'no_deadline'
  if (params.isAcknowledged) return 'acknowledged'
  if (params.lastMethod === 'verbal' || params.lastMethod === 'phone' || params.lastMethod === 'in-person') return 'verbal'
  return 'shared'
}
