import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { searchCatalog, type CatalogEntry } from '@/data/catalog'

interface TickerPickerProps {
  placeholder?: string
  exclude: string[]
  onPick: (entry: CatalogEntry) => void
  autoFocus?: boolean
}

/** Autocomplete input: recognition over recall — ticker, full name, type badge. */
export function TickerPicker({ placeholder, exclude, onPick, autoFocus }: TickerPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const results = searchCatalog(query).filter((e) => !exclude.includes(e.ticker))

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  const pick = (entry: CatalogEntry) => {
    onPick(entry)
    setQuery('')
    setHighlight(0)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={query}
        placeholder={placeholder ?? 'Add ticker — e.g. VTI, AAPL, VTSAX'}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(h + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(results[highlight])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && results.length > 0 && (
        <ul className="animate-enter absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          {results.map((e, i) => (
            <li key={e.ticker}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                  i === highlight ? 'bg-surface-3' : ''
                }`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(e)}
              >
                <span className="w-16 shrink-0 font-mono font-medium">{e.ticker}</span>
                <span className="flex-1 truncate text-sm text-muted-foreground">{e.name}</span>
                <Badge variant="secondary" className="shrink-0">
                  {e.type}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
