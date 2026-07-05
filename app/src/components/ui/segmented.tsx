import { Button } from '@/components/ui/button'

/**
 * The house segmented control: a row of xs buttons where the active one is
 * `secondary`. Used for range pickers (All/10Y/5Y), metric toggles
 * (P/E · P/S · …), rolling windows, and mode switches.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ v: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <Button
          key={o.v}
          variant={o.v === value ? 'secondary' : 'ghost'}
          size="xs"
          className="font-mono"
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}
