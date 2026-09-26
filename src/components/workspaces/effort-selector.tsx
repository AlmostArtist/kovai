'use client'

import { useState } from 'react'
import { Check, ChevronDown, TriangleAlert } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui'
import { EFFORTS, effortSpec, type Effort } from '@/lib/response-effort'
import { cn } from '@/lib/utils'

/**
 * How much answer to ask for.
 *
 * Sits beside the model, because it is the same kind of decision: the model is
 * who answers, this is how much of an answer you want. Both belong to the
 * message you are about to send rather than to a settings page.
 *
 * The current setting is named on the trigger rather than hidden behind an
 * icon. It changes the reply enough that finding out by sending is the wrong
 * way to learn it.
 */
export function EffortSelector({
  value,
  onChange,
  compact,
  className,
}: {
  value: Effort
  onChange: (effort: Effort) => void
  compact?: boolean
  className?: string
}) {
  const current = effortSpec(value)
  // Controlled, because a menu that stays open after you have chosen swallows
  // whatever you type next — the first keystroke of the message lands on the
  // list instead of the composer.
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-transparent text-ink-muted transition-colors duration-150 hover:bg-subtle hover:text-ink',
            compact ? 'h-[26px] px-1.5 text-[12px]' : 'h-[30px] px-2 text-[12.5px]',
            className,
          )}
          aria-label={`Response effort: ${current.label}`}
        >
          <span className="font-medium">{current.label}</span>
          <ChevronDown className="h-[11px] w-[11px] opacity-60" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[286px] p-1.5">
        <p className="px-2 pb-2 pt-1 text-[11.5px] leading-[1.5] text-ink-muted">
          Higher effort means a longer, more structured answer — more tables and charts, and more
          time to write.
        </p>

        {EFFORTS.map((effort) => {
          const selected = effort.id === value
          return (
            <button
              key={effort.id}
              onClick={() => {
                onChange(effort.id)
                setOpen(false)
              }}
              className="flex w-full items-start gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-subtle"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-ink">{effort.label}</span>
                  {effort.id === 'medium' && (
                    <span className="rounded-[5px] bg-subtle px-1.5 py-[1px] text-[10.5px] text-ink-faint">
                      Default
                    </span>
                  )}
                  {effort.caution && (
                    <span
                      className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-[1px] text-[10.5px] text-warn"
                      style={{ background: 'color-mix(in srgb, var(--color-warn) 16%, transparent)' }}
                    >
                      <TriangleAlert className="h-[9px] w-[9px]" />
                      Slower
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-ink-faint">
                  {effort.caution ?? effort.hint}
                </span>
              </span>

              {selected && <Check className="mt-[3px] h-[13px] w-[13px] shrink-0 text-accent" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
