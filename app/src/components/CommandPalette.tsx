import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChartCandlestick,
  LayoutGrid,
  LineChart,
  ScanSearch,
  Search,
  Sigma,
  TrendingUp,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { loadCatalog, searchCatalog, type CatalogEntry } from '@/data/catalog'

/**
 * ⌘K / Ctrl+K command palette: jump to any tool or straight to a ticker's
 * research page. Ticker list comes from the already-warmed catalog.
 */
export function CommandPalette({ accountTools }: { accountTools: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [catalogReady, setCatalogReady] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open || catalogReady) return
    loadCatalog()
      .then(() => setCatalogReady(true))
      .catch(() => {})
  }, [open, catalogReady])

  const go = (to: string) => {
    setOpen(false)
    setQuery('')
    navigate(to)
  }

  const tools = useMemo(
    () => [
      { to: '/backtest', label: 'Backtest', icon: TrendingUp },
      { to: '/allocation', label: 'Asset allocation', icon: LayoutGrid },
      { to: '/montecarlo', label: 'Monte Carlo', icon: Sigma },
      { to: '/stock', label: 'Research', icon: ChartCandlestick },
      ...(accountTools
        ? [
            { to: '/projections', label: 'Projections', icon: LineChart },
            { to: '/xray', label: 'Portfolio X-ray', icon: ScanSearch },
            { to: '/links', label: 'Links', icon: Search },
          ]
        : []),
    ],
    [accountTools],
  )

  const tickerMatches: CatalogEntry[] = useMemo(
    () => (catalogReady && query.trim() ? searchCatalog(query, 8) : []),
    [catalogReady, query],
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setQuery('')
      }}
    >
      <CommandInput
        placeholder="Jump to a tool or type a ticker…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        {tickerMatches.length > 0 && (
          <>
            <CommandGroup heading="Research">
              {tickerMatches.map((e) => (
                <CommandItem
                  key={e.ticker}
                  value={`${e.ticker} ${e.name ?? ''}`}
                  onSelect={() => go(`/stock/${e.ticker}`)}
                >
                  <span className="font-mono font-medium">{e.ticker}</span>
                  <span className="truncate text-muted-foreground">{e.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading="Tools">
          {tools.map((t) => (
            <CommandItem key={t.to} value={t.label} onSelect={() => go(t.to)}>
              <t.icon className="text-muted-foreground" />
              {t.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
