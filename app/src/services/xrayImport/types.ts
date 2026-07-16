import type { CashFlowInput, DividendInput, PositionInput, TradeInput } from '@/xray/parse'

export type BrokerId = 'fidelity' | 'schwab' | 'vanguard' | 'generic'
export type ImportFileKind = 'positions' | 'activity' | 'unknown'

export type ActionKind = 'buy' | 'sell' | 'dividend' | 'foreignTax' | 'deposit' | 'withdrawal' | 'ignore'

export interface ColumnMapping {
  kind: 'positions' | 'activity'
  columns: Partial<Record<'date' | 'ticker' | 'action' | 'shares' | 'price' | 'amount' | 'positionAsOf', string>>
  actionValues: Record<string, ActionKind>
  decimalConvention: 'us'
}

export interface ImportCounts {
  positions: number
  buys: number
  sells: number
  dividends: number
  cashFlows: number
  ignoredRows: number
  unsupportedRows: number
}

export interface ImportReport {
  errors: string[]
  warnings: string[]
  counts: ImportCounts
  blocked: boolean
}

export interface NormalizedBrokerImport {
  schemaVersion: 1
  positions: PositionInput[]
  trades: TradeInput[]
  dividends: DividendInput[]
  cashFlows: CashFlowInput[]
  provenance: {
    brokers: BrokerId[]
    fileKinds: Array<'positions' | 'activity'>
    importedAt: string
    dateRange: { start: string; end: string } | null
    counts: ImportCounts
  }
  report: ImportReport
}

export interface BrokerPreset {
  id: Exclude<BrokerId, 'generic'>
  score(headers: string[], sampleRows: string[][]): number
  suggest(kind: ImportFileKind, headers: string[]): ColumnMapping | null
  classifyAction(raw: string): ActionKind
  ignoreRow(raw: string[]): string | null
}
