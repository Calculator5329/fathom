import { Button } from '@/components/ui/button'

/**
 * The house segmented control: a row of xs buttons where the active one is
 * `secondary`. Used for range pickers (All/10Y/5Y), metric toggles
 * (P/E · P/S · …), rolling windows, and mode switches.
 */
export function Segmented<T extends string>({
  options,
  scope,
  value,
  onChange,
}: {
  options: Array<{ v: T; label: string }>
  /** Stable owner scope when several instances render the same option values. */
  scope?: string
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="group" className="flex gap-1">
      {options.map((o) => (
        <Button
          key={o.v}
          data-testid={scope ? `ui.segmented.option-${scope}-${o.v}` : `ui.segmented.option-${o.v}`}
          variant={o.v === value ? 'secondary' : 'ghost'}
          size="xs"
          className="font-mono"
          aria-pressed={o.v === value}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}
