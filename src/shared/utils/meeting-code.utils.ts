// Phase 16.1 — Meeting Code Generator
// Auto-generates structured, human-readable meeting codes and item sub-codes

export interface MeetingCode {
  full: string           // "MTG-2504-001-PLN"
  year: string           // "25" (2-digit year)
  month: string          // "04"
  sequential: string     // "001" (zero-padded)
  typePrefix: MeetingTypePrefix
  displayLabel: string   // "Planning Meeting #1 (Apr 2025)"
  shortCode: string      // "#2504-001"
}

export interface ItemCode {
  parentMTGCode: string  // "MTG-2504-001-PLN"
  itemType: ItemCodeType // 'AGN' | 'DEC' | 'ACT' | 'HLT' | 'TML'
  sequence: number
  full: string           // "MTG-2504-001-PLN/ACT-03"
  compact: string        // "#2504-001/A3"
  displayLabel: string   // "[ACT-03] Assign vendor by Rahul"
}

export type ItemCodeType = 'AGN' | 'DEC' | 'ACT' | 'HLT' | 'TML'

export type MeetingTypePrefix =
  | 'PLN' | 'RVW' | 'OPS' | 'CLT' | 'FIN'
  | 'SLS' | 'HRM' | 'TEC' | 'MGT' | 'GEN'

const TYPE_LABELS: Record<MeetingTypePrefix, string> = {
  PLN: 'Planning',
  RVW: 'Review',
  OPS: 'Operations',
  CLT: 'Client',
  FIN: 'Finance',
  SLS: 'Sales',
  HRM: 'HR/People',
  TEC: 'Technical',
  MGT: 'Management',
  GEN: 'General'
}

const MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'
]

// Keyword → type prefix detection map (order matters — first match wins)
const TYPE_KEYWORD_MAP: Array<[RegExp, MeetingTypePrefix]> = [
  [/plan|planning|strategy|roadmap|strateg/, 'PLN'],
  [/review|retrospect|audit|assess|retro/, 'RVW'],
  [/daily|standup|sync|ops|operation/, 'OPS'],
  [/client|customer|vendor|partner|external/, 'CLT'],
  [/budget|financ|accounts|p&l|billing/, 'FIN'],
  [/sales|target|pipeline|deal|crm/, 'SLS'],
  [/hr|hiring|recruit|apprais|performance|people/, 'HRM'],
  [/tech|engineer|dev|sprint|release|deploy/, 'TEC'],
  [/board|management|executive|leadership/, 'MGT'],
]

class MeetingCodeGenerator {
  // Generate the primary MTG code
  generate(config: {
    meetingDate: Date
    title: string
    sequentialNumber: number
    overridePrefix?: MeetingTypePrefix
  }): MeetingCode {
    const year = String(config.meetingDate.getFullYear()).slice(-2)
    const month = String(config.meetingDate.getMonth() + 1).padStart(2, '0')
    const seq = String(config.sequentialNumber).padStart(3, '0')
    const prefix = config.overridePrefix ?? this.detectTypePrefix(config.title)
    const full = `MTG-${year}${month}-${seq}-${prefix}`
    return {
      full,
      year,
      month,
      sequential: seq,
      typePrefix: prefix,
      displayLabel: this.buildDisplayLabel(config.meetingDate, config.sequentialNumber, prefix),
      shortCode: `#${year}${month}-${seq}`
    }
  }

  // Auto-detect meeting type from title keywords
  detectTypePrefix(title: string): MeetingTypePrefix {
    const t = title.toLowerCase()
    for (const [pattern, prefix] of TYPE_KEYWORD_MAP) {
      if (pattern.test(t)) return prefix
    }
    return 'GEN'
  }

  // Generate item sub-code within a meeting
  generateItemCode(mtgCode: string, type: ItemCodeType, sequence: number): ItemCode {
    const compactParts = mtgCode.match(/MTG-(\d{4})-(\d{3})/)
    const seqStr = String(sequence).padStart(2, '0')
    const compact = compactParts
      ? `#${compactParts[1]}-${compactParts[2]}/${type[0]}${sequence}`
      : `${mtgCode}/${type}-${seqStr}`
    return {
      parentMTGCode: mtgCode,
      itemType: type,
      sequence,
      full: `${mtgCode}/${type}-${seqStr}`,
      compact,
      displayLabel: `[${type}-${seqStr}]`
    }
  }

  // Parse a code string back into its components
  parse(codeString: string): {
    mtgCode: string
    itemType?: ItemCodeType
    itemSequence?: number
  } | null {
    const mtgPattern = /^MTG-(\d{4})-(\d{3})-([A-Z]{3})$/
    const fullPattern = /^(MTG-\d{4}-\d{3}-[A-Z]{3})\/(AGN|DEC|ACT|HLT|TML)-(\d{2})$/
    const shortPattern = /^#(\d{4})-(\d{3})$/

    if (fullPattern.test(codeString)) {
      const m = codeString.match(fullPattern)!
      return {
        mtgCode: m[1],
        itemType: m[2] as ItemCodeType,
        itemSequence: parseInt(m[3])
      }
    }
    if (mtgPattern.test(codeString) || shortPattern.test(codeString)) {
      return { mtgCode: codeString }
    }
    return null
  }

  // Assign sequential item codes to all items in a MOM document object
  assignAllItemCodes<T extends MinimalMOMDoc>(doc: T, mtgCode: string): T {
    let agnIdx = 0, decIdx = 0, actIdx = 0, hltIdx = 0, tmlIdx = 0

    if (Array.isArray(doc.agenda)) {
      doc.agenda = doc.agenda.map((item) =>
        Object.assign({}, item as object, { itemCode: this.generateItemCode(mtgCode, 'AGN', ++agnIdx) })
      )
    }
    if (Array.isArray(doc.keyDecisions)) {
      doc.keyDecisions = doc.keyDecisions.map((dec) =>
        Object.assign({}, dec as object, { itemCode: this.generateItemCode(mtgCode, 'DEC', ++decIdx) })
      )
    }
    if (Array.isArray(doc.tasks)) {
      doc.tasks = doc.tasks.map((task) =>
        Object.assign({}, task as object, {
          itemCode: this.generateItemCode(mtgCode, 'ACT', ++actIdx),
          mtgCodeRef: mtgCode
        })
      )
    }
    if (Array.isArray(doc.highlights)) {
      doc.highlights = doc.highlights.map((h) =>
        Object.assign({}, h as object, { itemCode: this.generateItemCode(mtgCode, 'HLT', ++hltIdx) })
      )
    }
    if (Array.isArray(doc.timelines)) {
      doc.timelines = doc.timelines.map((tl) =>
        Object.assign({}, tl as object, { itemCode: this.generateItemCode(mtgCode, 'TML', ++tmlIdx) })
      )
    }
    return doc
  }

  // Get display-friendly prefix label
  getPrefixLabel(prefix: MeetingTypePrefix): string {
    return TYPE_LABELS[prefix] ?? 'General'
  }

  // Color mapping by type prefix (Tailwind classes)
  getTypeColor(prefix: MeetingTypePrefix): { bg: string; text: string; border: string } {
    const colorMap: Record<MeetingTypePrefix, { bg: string; text: string; border: string }> = {
      PLN: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
      RVW: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
      OPS: { bg: 'bg-slate-100',  text: 'text-slate-800',  border: 'border-slate-300'  },
      CLT: { bg: 'bg-sky-100',    text: 'text-sky-800',    border: 'border-sky-300'    },
      FIN: { bg: 'bg-emerald-100',text: 'text-emerald-800',border: 'border-emerald-300'},
      SLS: { bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300'  },
      HRM: { bg: 'bg-pink-100',   text: 'text-pink-800',   border: 'border-pink-300'   },
      TEC: { bg: 'bg-cyan-100',   text: 'text-cyan-800',   border: 'border-cyan-300'   },
      MGT: { bg: 'bg-rose-100',   text: 'text-rose-800',   border: 'border-rose-300'   },
      GEN: { bg: 'bg-gray-100',   text: 'text-gray-800',   border: 'border-gray-300'   }
    }
    return colorMap[prefix]
  }

  private buildDisplayLabel(date: Date, seq: number, prefix: MeetingTypePrefix): string {
    const month = MONTH_NAMES[date.getMonth()]
    const year = date.getFullYear()
    return `${TYPE_LABELS[prefix]} Meeting #${seq} (${month} ${year})`
  }
}

// Minimal shape required for assignAllItemCodes
interface MinimalMOMDoc {
  agenda?: unknown[]
  keyDecisions?: unknown[]
  tasks?: unknown[]
  highlights?: unknown[]
  timelines?: unknown[]
}

export const meetingCodeGenerator = new MeetingCodeGenerator()
export { TYPE_LABELS, MONTH_NAMES }
