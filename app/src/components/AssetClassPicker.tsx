import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ASSET_CLASSES } from '@/data/assetClasses'

interface AssetClassPickerProps {
  /** Asset-class ids already in the portfolio (hidden from the list). */
  exclude: string[]
  onPick: (id: string) => void
  autoFocus?: boolean
}

/**
 * Autocomplete picker for asset classes — same interaction as the ticker
 * picker (type to filter, arrow keys, click to add). Replaces the Radix
 * Select, which read as a confusing dropdown/plus hybrid.
 */
export function AssetClassPicker({ exclude, onPick, autoFocus }: AssetClassPickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const results = ASSET_CLASSES.filter(
    (a) => !exclude.includes(a.id) && (q === '' || a.label.toLowerCase().includes(q)),
  )

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  const pick = (id: string) => {
    onPick(id)
    setQuery('')
    setHighlight(0)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Plus className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          placeholder="Add asset class"
          autoFocus={autoFocus}
          className="pl-9"
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
              pick(results[highlight].id)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
      </div>
      {open && results.length > 0 && (
        <ul className="animate-enter absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          {results.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${
                  i === highlight ? 'bg-surface-3' : ''
                }`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(a.id)}
              >
                <span>{a.label}</span>
                <span className="shrink-0 font-mono text-sm text-muted-foreground">
                  {a.startDate.slice(0, 4)}&ndash;
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
