import type { NormalizedBrokerImport } from './types'
import { decodeCsvRows, MAX_FILE_BYTES, MAX_TOTAL_ROWS } from './csv'
import { detectPresetForText, presetIdFromChoice } from './detect'
import { buildActionClassifier, buildActivityMapper, buildPositionMapper } from './mapping'
import { normalizeBrokerRows } from './normalize'

interface ParseOptions {
  maxBytes?: number
  maxRows?: number
}

export interface BrokerCsvParseResult {
  detectedKind: 'positions' | 'activity' | 'unknown'
  detectedPreset: 'fidelity' | 'schwab' | 'vanguard' | 'generic'
  mappingKind: 'positions' | 'activity'
  import: NormalizedBrokerImport
}

function emptyImport(reason: string): BrokerCsvParseResult {
  return {
    detectedKind: 'unknown',
    detectedPreset: 'generic',
    mappingKind: 'positions',
    import: {
      schemaVersion: 1,
      positions: [],
      trades: [],
      dividends: [],
      cashFlows: [],
      provenance: {
        brokers: [],
        fileKinds: [],
        importedAt: new Date().toISOString(),
        dateRange: null,
        counts: {
          positions: 0,
          buys: 0,
          sells: 0,
          dividends: 0,
          cashFlows: 0,
          ignoredRows: 0,
          unsupportedRows: 0,
        },
      },
      report: {
        errors: [reason],
        warnings: [],
        counts: {
          positions: 0,
          buys: 0,
          sells: 0,
          dividends: 0,
          cashFlows: 0,
          ignoredRows: 0,
          unsupportedRows: 0,
        },
        blocked: true,
      },
    },
  }
}

function firstNonEmptyRow(rows: string[][]): number | null {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((cell) => cell.trim().length > 0)) return i
  }
  return null
}

function detectKind(headers: string[]): 'positions' | 'activity' {
  const normalized = headers.map((cell) => cell.toLowerCase())
  const hasDate = normalized.some((c) => c.includes('date') || c.includes('run'))
  const hasTicker = normalized.some((c) => c.includes('symbol') || c.includes('ticker'))
  const hasAction = normalized.some((c) => c.includes('action') || c.includes('type') || c.includes('side'))
  const hasShares = normalized.some((c) => c.includes('shares') || c.includes('qty') || c.includes('quantity'))

  if (hasDate && hasTicker && (hasAction || hasShares)) return 'activity'
  if (hasTicker && hasShares) return 'positions'
  return 'activity'
}

export function parseBrokerCsvText(rawText: string, options: ParseOptions = {}): BrokerCsvParseResult {
  let decoded
  try {
    decoded = decodeCsvRows(rawText, {
      maxBytes: options.maxBytes ?? MAX_FILE_BYTES,
      maxRows: options.maxRows ?? MAX_TOTAL_ROWS,
    })
  } catch (err) {
    return emptyImport(err instanceof Error ? err.message : 'Could not decode CSV text')
  }

  if (decoded.rows.length === 0) return emptyImport('No parseable rows')

  const headerIdx = firstNonEmptyRow(decoded.rows)
  if (headerIdx == null) return emptyImport('No header or data rows')

  const headers = decoded.rows[headerIdx].map((c) => c.trim())
  const dataRows = decoded.rows.slice(headerIdx + 1).filter((row) => row.some((cell) => cell.trim().length > 0))
  if (dataRows.length === 0) return emptyImport('No data rows')

  const kind = detectKind(headers)
  const choice = detectPresetForText(headers, dataRows.slice(0, 40), kind)
  const mapping = choice.mapping ?? (kind === 'activity' ? buildActivityMapper(headers) : buildPositionMapper(headers))
  const normalizeKind = mapping.kind === 'activity' ? 'activity' : kind
  const normalized = normalizeBrokerRows(
    normalizeKind,
    { ...mapping, kind: normalizeKind },
    headers,
    dataRows,
    buildActionClassifier(mapping),
    choice.preset.ignoreRow.bind(choice.preset),
  )

  const preset = presetIdFromChoice(choice)
  normalized.provenance.brokers = normalized.provenance.brokers.length > 0 ? [preset] : []
  normalized.provenance.fileKinds = [normalizeKind]

  return {
    detectedKind: dataRows.length > 0 ? normalizeKind : 'unknown',
    detectedPreset: preset,
    mappingKind: normalizeKind,
    import: normalized,
  }
}
