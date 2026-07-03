import { useEffect, useState } from 'react'
import { CalendarIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

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

const toDisplayValue = (v: string | undefined) => {
  const date = toDate(v)
  if (!date) return ''
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`
}

export function formatDateInput(input: string) {
  const iso = input.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/)
  if (iso) {
    return `${iso[2].padStart(2, '0')}/${iso[3].padStart(2, '0')}/${iso[1]}`
  }

  const digits = input.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function normalizeDateInput(input: string, fromYear: number, maxDate = new Date()) {
  const raw = input.trim()
  const iso = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/)
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const match = iso ?? us

  if (!match) return null

  const year = Number(iso ? match[1] : match[3])
  const month = Number(iso ? match[2] : match[1])
  const day = Number(iso ? match[3] : match[2])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date < new Date(fromYear, 0, 1) ||
    date > maxDate
  ) {
    return null
  }

  return toValue(date)
}

/**
 * Themed date picker. Decade-spanning backtests need fast year jumps, so the
 * calendar caption uses month + year dropdowns and the field also accepts
 * direct mm/dd/yyyy typing.
 */
export function DatePicker({ id, value, onChange, placeholder, fromYear = 1870 }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(toDisplayValue(value))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setInputValue(toDisplayValue(value))
    setInvalid(false)
  }, [value])

  const commit = (next: string | undefined) => {
    setInputValue(toDisplayValue(next))
    setInvalid(false)
    onChange(next)
  }

  const updateInput = (next: string) => {
    const formatted = formatDateInput(next)
    setInputValue(formatted)

    if (formatted.trim() === '') {
      commit(undefined)
      return
    }

    const normalized = normalizeDateInput(formatted, fromYear)
    if (normalized) {
      commit(normalized)
      return
    }

    setInvalid(formatted.replace(/\D/g, '').length >= 8)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            value={inputValue}
            placeholder={placeholder}
            aria-invalid={invalid}
            title="Use MM/DD/YYYY"
            className="pr-9 font-mono tnum"
            onFocus={() => setOpen(true)}
            onChange={(e) => updateInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
                setOpen(false)
              }
            }}
            onBlur={() => {
              if (invalid) {
                setInputValue(toDisplayValue(value))
                setInvalid(false)
              }
            }}
          />
          {value ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear date"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(undefined)}
            >
              <X />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Open calendar"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(true)}
            >
              <CalendarIcon />
            </Button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={toDate(value)}
          defaultMonth={toDate(value) ?? new Date()}
          captionLayout="dropdown"
          startMonth={new Date(fromYear, 0)}
          endMonth={new Date()}
          disabled={{ before: new Date(fromYear, 0, 1), after: new Date() }}
          onSelect={(d) => {
            commit(toValue(d ?? undefined))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
