'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Button ───────────────────────────────────────────────── */

const button = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-all duration-150 select-none disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-kovai',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-canvas hover:opacity-90 active:opacity-80',
        secondary:
          'bg-surface text-ink border border-line hover:border-line-strong hover:bg-subtle',
        ghost: 'text-ink-muted hover:text-ink hover:bg-subtle',
        accent: 'bg-accent text-white hover:opacity-90',
        danger: 'text-danger hover:bg-danger-soft',
      },
      size: {
        xs: 'h-7 px-2.5 text-[12px] rounded-[7px]',
        sm: 'h-8 px-3 text-[13px] rounded-[8px]',
        md: 'h-9 px-3.5 text-[13.5px] rounded-[9px]',
        lg: 'h-11 px-5 text-[14.5px] rounded-[11px]',
        icon: 'h-8 w-8 rounded-[8px]',
        'icon-sm': 'h-7 w-7 rounded-[7px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'sm' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'

/* ── Inputs ───────────────────────────────────────────────── */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-[9px] border border-line bg-surface px-3 text-[13.5px]',
        'placeholder:text-ink-faint transition-colors duration-150',
        'hover:border-line-strong focus:border-line-strong focus:outline-none focus:ring-kovai',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full resize-none rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed',
      'placeholder:text-ink-faint transition-colors duration-150',
      'hover:border-line-strong focus:border-line-strong focus:outline-none focus:ring-kovai',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

/** Native select styled to match — no portal, no layout shift. */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'h-9 w-full appearance-none rounded-[9px] border border-line bg-surface pl-3 pr-8 text-[13.5px]',
        'transition-colors duration-150 hover:border-line-strong focus:outline-none focus:ring-kovai',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <svg
      className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint"
      viewBox="0 0 12 12"
      fill="none"
    >
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  </div>
))
Select.displayName = 'Select'

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative h-[20px] w-[34px] shrink-0 rounded-full border border-transparent transition-colors duration-200',
        'bg-line-strong data-[state=checked]:bg-ink focus-visible:ring-kovai',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-[16px] w-[16px] translate-x-[2px] rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-[16px]" />
    </SwitchPrimitive.Root>
  )
}

/* ── Segmented control ────────────────────────────────────── */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode; title?: string }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-[10px] border border-line bg-subtle p-0.5',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative rounded-[8px] font-medium transition-all duration-150',
            size === 'sm' ? 'h-6 px-2 text-[11.5px]' : 'h-7 px-2.5 text-[12.5px]',
            value === option.value
              ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'text-ink-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ── Badge ────────────────────────────────────────────────── */

const badge = cva(
  'inline-flex items-center gap-1 rounded-[6px] px-1.5 py-[2px] text-[10.5px] font-medium uppercase tracking-[0.04em]',
  {
    variants: {
      tone: {
        neutral: 'bg-subtle text-ink-muted border border-line',
        local: 'bg-local-soft text-local',
        cloud: 'bg-cloud-soft text-cloud',
        accent: 'bg-accent-soft text-accent',
        danger: 'bg-danger-soft text-danger',
        warn: 'bg-subtle text-warn border border-line',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />
}

/* ── Tooltip ──────────────────────────────────────────────── */

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({
  children,
  content,
  side = 'bottom',
  shortcut,
}: {
  children: React.ReactNode
  content: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  shortcut?: string
}) {
  if (!content) return <>{children}</>
  return (
    <TooltipPrimitive.Root delayDuration={400}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-[7px] border border-line bg-elevated px-2 py-1 text-[12px] text-ink shadow-float data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95"
        >
          {content}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[4px] border border-line bg-subtle px-[4px] py-[1px] font-mono text-[10.5px] text-ink-faint">
      {children}
    </kbd>
  )
}

/* ── Dialog ───────────────────────────────────────────────── */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  children,
  className,
  title,
  description,
  width = 'md',
}: {
  children: React.ReactNode
  className?: string
  title: string
  description?: string
  width?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 dark:bg-black/50" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
          'rounded-[14px] border border-line bg-elevated shadow-float',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
          widths[width],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[14.5px] font-medium tracking-[-0.01em]">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </Button>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/* ── Popover ──────────────────────────────────────────────── */

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-[12px] border border-line bg-elevated p-1 shadow-float',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

export function Separator({
  className,
  orientation = 'horizontal',
}: {
  className?: string
  orientation?: 'horizontal' | 'vertical'
}) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      className={cn(
        'shrink-0 bg-line',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  )
}

/* ── Structural pieces ────────────────────────────────────── */

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'px-2 text-[11px] font-medium uppercase tracking-[0.07em] text-ink-faint',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Empty states are part of the product, not a gap in it: each one names what is
 * missing and offers the single action that resolves it.
 */
export function EmptyState({
  icon: Icon,
  title,
  line,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  line?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[11px] border border-line bg-surface">
          <Icon className="h-[17px] w-[17px] text-ink-faint" />
        </div>
      )}
      <p className="text-[14px] font-medium tracking-[-0.01em] text-ink">{title}</p>
      {line && <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-muted">{line}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5 animate-spin', className)} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.6" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A quiet 1px progress line — used for generation, never a spinner farm. */
export function ProgressLine({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-[2px] w-full overflow-hidden rounded-full bg-line', className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function StatusDot({
  state,
  className,
}: {
  state: 'ready' | 'busy' | 'offline' | 'error'
  className?: string
}) {
  const tone = {
    ready: 'bg-local',
    busy: 'bg-accent breathe',
    offline: 'bg-ink-faint',
    error: 'bg-danger',
  }[state]
  return <span className={cn('inline-block h-[6px] w-[6px] shrink-0 rounded-full', tone, className)} />
}
