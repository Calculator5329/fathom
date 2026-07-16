import type { BrokerId, ImportFileKind, BrokerPreset } from './types'
import { buildActivityMapper, buildPositionMapper } from './mapping'
import { fidelityPreset } from './presets/fidelity'

const genericPreset: BrokerPreset = {
  id: 'vanguard',
  score(headers) {
    const lower = headers.map((h) => h.toLowerCase())
    return lower.includes('symbol') || lower.includes('ticker') ? 5 : 0
  },
  suggest(kind: ImportFileKind, headers) {
    return kind === 'positions' ? buildPositionMapper(headers) : buildActivityMapper(headers)
  },
  classifyAction(raw) {
    const lower = raw.toLowerCase()
    if (/buy|bought|reinvest/.test(lower)) return 'buy'
    if (/sell|sold|spinoff/.test(lower)) return 'sell'
    if (/dividend|distribution/.test(lower)) return 'dividend'
    if (/foreign tax/.test(lower)) return 'foreignTax'
    if (/electronic funds transfer|direct deposit|wire|ach/i.test(lower)) return 'deposit'
    if (/withdraw|fee|purchased/.test(lower)) return 'withdrawal'
    return 'ignore'
  },
  ignoreRow() {
    return null
  },
}

interface PresetChoice {
  preset: BrokerPreset
  score: number
  mapping: ReturnType<BrokerPreset['suggest']>
  kind: ImportFileKind
}

export function detectPreset(headers: string[], sampleRows: string[][]): PresetChoice[] {
  const candidates: BrokerPreset[] = [fidelityPreset, genericPreset]
  const kinds: ImportFileKind[] = ['positions', 'activity']
  const choices: PresetChoice[] = []

  for (const preset of candidates) {
    for (const kind of kinds) {
      const mapping = preset.suggest(kind, headers)
      if (!mapping) continue
      const score = preset.score(headers, sampleRows)
      choices.push({ preset, score, mapping, kind })
    }
  }

  return choices.sort((a, b) => b.score - a.score)
}

export function detectPresetForText(
  headers: string[],
  sampleRows: string[][],
  desiredKind: ImportFileKind,
): PresetChoice {
  const choices = detectPreset(headers, sampleRows).filter((item) => item.mapping != null)
  if (choices.length === 0) {
    return {
      preset: genericPreset,
      score: 0,
      mapping: buildPositionMapper(headers),
      kind: 'positions',
    }
  }
  const preferred = choices.filter((item) => item.kind === desiredKind)
  const ranked = preferred.length > 0 ? preferred : choices
  const top = ranked[0]!
  return {
    ...ranked[0]!,
    mapping: top.mapping ?? buildPositionMapper(headers),
    preset: (ranked[0]!.preset.id === 'fidelity' ? ranked[0]!.preset : genericPreset) as BrokerPreset,
    kind: ranked[0]!.kind,
  }
}

export function isFidelity(headers: string[]): boolean {
  const lower = headers.map((h) => h.toLowerCase())
  return lower.includes('account number') || lower.includes('cash balance ($)')
}

export function presetIdFromChoice(choice: PresetChoice): BrokerId {
  if (choice.preset.id === 'fidelity') return 'fidelity'
  return 'generic'
}
