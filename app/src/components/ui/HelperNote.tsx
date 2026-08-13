import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HelperNoteProps {
  children: ReactNode
  className?: string
}

/**
 * A subordinate contextual aside for methodology hints and history limits.
 * The shared treatment keeps these notes readable while visually secondary.
 */
export function HelperNote({ children, className }: HelperNoteProps) {
  return (
    <p
      className={cn(
        'tnum flex items-start gap-1.5 text-sm leading-snug text-muted-foreground/60',
        className,
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  )
}
