// Phase 16 — Meeting Code Badge Component

import React, { useState } from 'react'
import { meetingCodeGenerator, MeetingTypePrefix } from '../../../../shared/utils/meeting-code.utils'

interface MeetingCodeBadgeProps {
  code: string
  size?: 'sm' | 'md' | 'lg'
  showCopy?: boolean
  showType?: boolean
  meetingTitle?: string
  meetingDate?: string
}

export function MeetingCodeBadge({
  code,
  size = 'md',
  showCopy = true,
  showType = true,
  meetingTitle,
  meetingDate
}: MeetingCodeBadgeProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  // Extract type prefix from code (e.g., "PLN" from "MTG-2504-001-PLN")
  const typePrefix = code.match(/MTG-\d{4}-\d{3}-([A-Z]{3})/)?.[1] as MeetingTypePrefix | undefined
  const colors = typePrefix ? meetingCodeGenerator.getTypeColor(typePrefix) : {
    bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300'
  }
  const typeLabel = typePrefix ? meetingCodeGenerator.getPrefixLabel(typePrefix) : ''

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  }

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <div
        className={`
          inline-flex items-center gap-1.5 rounded-md border font-mono cursor-pointer
          transition-all duration-150 select-none
          ${sizeClasses[size]}
          ${colors.bg} ${colors.text} ${colors.border}
          hover:opacity-80 active:scale-95
        `}
        onClick={showCopy ? handleCopy : undefined}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={showCopy ? 'Click to copy meeting code' : code}
      >
        {/* Type prefix dot */}
        {showType && typePrefix && (
          <span className={`
            inline-block w-1.5 h-1.5 rounded-full
            ${typePrefix === 'PLN' ? 'bg-indigo-500' :
              typePrefix === 'FIN' ? 'bg-emerald-500' :
              typePrefix === 'SLS' ? 'bg-amber-500' :
              typePrefix === 'TEC' ? 'bg-cyan-500' :
              typePrefix === 'CLT' ? 'bg-sky-500' :
              typePrefix === 'HRM' ? 'bg-pink-500' :
              typePrefix === 'MGT' ? 'bg-rose-500' :
              'bg-gray-400'}
          `} />
        )}
        <span className="tracking-wide font-semibold">{code}</span>
        {showCopy && (
          <span className="text-xs opacity-60">
            {copied ? '✓' : '⎘'}
          </span>
        )}
      </div>

      {/* Type label */}
      {showType && typeLabel && (
        <span className={`text-xs ${colors.text} opacity-70 font-medium`}>
          [{typeLabel}]
        </span>
      )}

      {/* Tooltip */}
      {showTooltip && (meetingTitle || meetingDate) && (
        <div className="absolute bottom-full mb-2 left-0 z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
          {meetingTitle && <div className="font-semibold">{meetingTitle}</div>}
          {meetingDate && <div className="opacity-75">{meetingDate}</div>}
          <div className="opacity-60 mt-1">Use this code in emails to reference this meeting</div>
          <div className="absolute bottom-[-4px] left-3 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  )
}

// Compact item code badge (e.g., [ACT-03])
interface ItemCodeBadgeProps {
  code: string   // e.g., "ACT-03" or full "MTG-2504-001-PLN/ACT-03"
  type?: 'AGN' | 'DEC' | 'ACT' | 'HLT' | 'TML'
  size?: 'sm' | 'md'
}

export function ItemCodeBadge({ code, type, size = 'sm' }: ItemCodeBadgeProps): React.JSX.Element {
  const displayCode = code.includes('/') ? code.split('/')[1] : code
  const detectedType = type ?? (displayCode.match(/^(AGN|DEC|ACT|HLT|TML)/)?.[1] as ItemCodeBadgeProps['type'])

  const typeColors: Record<string, string> = {
    ACT: 'bg-blue-50 text-blue-700 border-blue-200',
    DEC: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    AGN: 'bg-purple-50 text-purple-700 border-purple-200',
    HLT: 'bg-amber-50 text-amber-700 border-amber-200',
    TML: 'bg-rose-50 text-rose-700 border-rose-200'
  }

  const colorClass = detectedType ? typeColors[detectedType] : 'bg-gray-50 text-gray-600 border-gray-200'
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1'

  return (
    <span className={`inline-block font-mono border rounded font-semibold ${colorClass} ${sizeClass}`}>
      [{displayCode}]
    </span>
  )
}
