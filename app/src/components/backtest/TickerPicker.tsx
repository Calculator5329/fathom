import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { searchCatalog, searchTickers, type CatalogEntry } from '@/data/catalog'

interface TickerPickerProps {
  placeholder?: string
  exclude: string[]
  onPick: (entry: CatalogEntry) => void
  autoFocus?: boolean
}

/**
 * Autocomplete input: recognition over recall — ticker, full name, type badge.
 * Local catalog answers instantly; the API extends results to Tiingo's full
 * universe (marked "new" — their first load fetches and caches the history).
 */
export function TickerPicker({ placeholder, exclude, onPick, autoFocus }: TickerPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [results, setResults] = useState<CatalogEntry[]>(() => searchCatalog(''))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Show local matches immediately, then refine with API results.
    setResults(searchCatalog(query))
    const t = setTimeout(() => {
      let stale = false
      searchTickers(query).then((r) => {
        if (!stale) setResults(r)
      })
      return () => {
        stale = true
      }
    }, 180)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  const visible = results.filter((e) => !exclude.includes(e.ticker))

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
          if (!open || visible.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(h + 1, visible.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(visible[highlight])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && visible.length > 0 && (
        <ul className="animate-enter absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          {visible.map((e, i) => (
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
                {e.cached === false && (
                  <Badge variant="outline" className="shrink-0 border-chart-3/50 text-chart-3">
                    new
                  </Badge>
                )}
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
