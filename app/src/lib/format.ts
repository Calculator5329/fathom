const USD_FULL = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const COMPACT_SUFFIXES = [
  { value: 1_000_000_000_000, suffix: 'T' },
  { value: 1_000_000_000, suffix: 'B' },
  { value: 1_000_000, suffix: 'M' },
  { value: 1_000, suffix: 'K' },
]

function trimDecimals(value: number) {
  return value.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')
}

export function formatUsd(value: number) {
  return USD_FULL.format(value)
}

export function formatUsdCompact(value: number) {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const scale = COMPACT_SUFFIXES.find((item) => abs >= item.value)

  if (!scale) return USD_FULL.format(value)

  return `${sign}$${trimDecimals(abs / scale.value)}${scale.suffix}`
}
