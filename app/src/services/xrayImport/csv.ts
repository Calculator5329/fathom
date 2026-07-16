export const MAX_FILE_BYTES = 25_000_000
export const MAX_TOTAL_ROWS = 100_000

export type CsvDelimiter = ',' | ';' | '\t'

export interface DecodedCsv {
  delimiter: CsvDelimiter
  rows: string[][]
}

export interface CsvDecodeOptions {
  maxBytes?: number
  maxRows?: number
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function countDelimiter(line: string, delim: CsvDelimiter): number {
  let inQuotes = false
  let count = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && ch === delim) count += 1
  }
  return count
}

function detectDelimiter(lines: string[]): CsvDelimiter {
  const candidates: CsvDelimiter[] = [',', ';', '\t']
  const scored = candidates.map((delim) => ({
    delim,
    count: lines.reduce((n, line) => n + countDelimiter(line, delim), 0),
  }))
  scored.sort((a, b) => b.count - a.count)
  return scored[0]!.count > 0 ? scored[0]!.delim : ','
}

function parseLineToRows(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"'
        i += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }

    if (!inQuotes && (ch === '\r' || ch === '\n')) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      rows.push(row.concat(field))
      row = []
      field = ''
      continue
    }

    if (!inQuotes && ch === delimiter) {
      row.push(field)
      field = ''
      continue
    }

    field += ch
  }

  rows.push(row.concat(field))
  while (rows.length > 0 && rows[rows.length - 1]?.every((cell) => cell.trim().length === 0)) {
    rows.pop()
  }
  return rows.map((r) => r.map((cell) => cell.trim()))
}

export function decodeCsvRows(rawText: string, options: CsvDecodeOptions = {}): DecodedCsv {
  const maxBytes = options.maxBytes ?? MAX_FILE_BYTES
  const maxRows = options.maxRows ?? MAX_TOTAL_ROWS

  const sizeBytes = new TextEncoder().encode(rawText).length
  if (sizeBytes > maxBytes) {
    throw new Error(`CSV exceeds size cap (${maxBytes} bytes)`)
  }

  const text = stripBom(rawText)
  const sample = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 12)

  if (sample.length === 0) return { delimiter: ',', rows: [] }

  const delimiter = detectDelimiter(sample)
  const rows = parseLineToRows(text, delimiter)

  if (rows.length > maxRows) throw new Error(`CSV exceeds row cap (${maxRows} rows)`)

  return { delimiter, rows }
}
