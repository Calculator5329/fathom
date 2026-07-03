import { useState } from 'react'
import { CalendarIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  id?: string
  /** yyyy-mm-dd or undefined = "max available history". */
  value: string | undefined
  onChange: (value: string | undefined) => void
  /** Shown when no date is chosen, e.g. "Earliest". */
  placeholder: string
  fromYear?: number
}

const toDate = (v: string | undefined) => (v ? new Date(`${v}T00:00:00`) : undefined)
const toValue = (d: Date | undefined) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : undefined

const display = (v: string) =>
  new Date(`${v}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

/**
 * Themed date picker. Decade-spanning backtests need fast year jumps, so the
 * calendar caption uses month + year dropdowns instead of arrow-only paging.
 * Clearing a date means "use all available history".
 */
export function DatePicker({ id, value, onChange, placeholder, fromYear = 1970 }: DatePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className={cn(
              'w-full justify-start bg-transparent font-mono font-normal tnum',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="text-muted-foreground" />
            {value ? display(value) : placeholder}
          </Button>
        </PopoverTrigger>
        {value && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Clear date"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onChange(undefined)
            }}
          >
            <X />
          </Button>
        )}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={toDate(value)}
          defaultMonth={toDate(value) ?? new Date()}
          captionLayout="dropdown"
          startMonth={new Date(fromYear, 0)}
          endMonth={new Date()}
          disabled={{ after: new Date() }}
          onSelect={(d) => {
            onChange(toValue(d ?? undefined))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
