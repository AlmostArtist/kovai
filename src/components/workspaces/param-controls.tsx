'use client'

import { useState } from 'react'
import { ChevronRight, Dice5 } from 'lucide-react'
import { Button, Input, Select, Switch, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { ParamSpec } from '@/lib/providers/types'

/**
 * Capability-driven settings.
 *
 * Nothing here knows about Higgsfield or KIE. A model declares the controls it
 * supports and this renders exactly those — so a model without a seed has no
 * seed field, and a new provider needs no UI work at all. Advanced controls stay
 * folded away until asked for.
 */
export function ParamControls({
  params,
  values,
  onChange,
  className,
}: {
  params: ParamSpec[]
  values: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  className?: string
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Reference images have their own surface above the prompt, not a form field.
  const visible = params.filter((p) => p.type !== 'images')
  const basic = visible.filter((p) => !p.advanced)
  const advanced = visible.filter((p) => p.advanced)

  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value })

  if (!visible.length) {
    return (
      <p className={cn('text-[12.5px] leading-relaxed text-ink-faint', className)}>
        This model takes a prompt and nothing else.
      </p>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {basic.map((param) => (
        <Field key={param.key} param={param} value={values[param.key]} onChange={(v) => set(param.key, v)} />
      ))}

      {advanced.length > 0 && (
        <div className="border-t border-line pt-3.5">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-1 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ChevronRight
              className={cn('h-[12px] w-[12px] transition-transform duration-150', advancedOpen && 'rotate-90')}
            />
            Advanced
          </button>
          {advancedOpen && (
            <div className="mt-3.5 space-y-4">
              {advanced.map((param) => (
                <Field
                  key={param.key}
                  param={param}
                  value={values[param.key]}
                  onChange={(v) => set(param.key, v)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({
  param,
  value,
  onChange,
}: {
  param: ParamSpec
  value: unknown
  onChange: (value: unknown) => void
}) {
  const label = (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label className="text-[12px] font-medium text-ink">{param.label}</label>
      {param.help && <span className="truncate text-[11px] text-ink-faint">{param.help}</span>}
    </div>
  )

  switch (param.type) {
    case 'enum':
      return (
        <div>
          {label}
          <Select
            value={String(value ?? param.default ?? param.options[0]?.value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          >
            {param.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      )

    case 'number': {
      const current = value ?? param.default ?? ''
      const isSeed = param.key === 'seed'
      return (
        <div>
          {label}
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              value={String(current)}
              min={param.min}
              max={param.max}
              step={param.step}
              placeholder={isSeed ? 'Random' : undefined}
              onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            />
            {isSeed && (
              <Button
                variant="secondary"
                size="icon"
                title="Randomise seed"
                onClick={() => onChange(Math.floor(Math.random() * 2_147_483_647))}
              >
                <Dice5 className="h-[14px] w-[14px]" />
              </Button>
            )}
          </div>
        </div>
      )
    }

    case 'text':
      return (
        <div>
          {label}
          {param.multiline ? (
            <Textarea
              rows={2}
              value={String(value ?? param.default ?? '')}
              placeholder={param.placeholder}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <Input
              value={String(value ?? param.default ?? '')}
              placeholder={param.placeholder}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </div>
      )

    case 'boolean':
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink">{param.label}</p>
            {param.help && (
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint">{param.help}</p>
            )}
          </div>
          <Switch
            checked={Boolean(value ?? param.default ?? false)}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      )

    default:
      return null
  }
}

/** Defaults for a model's declared params, used when a model is selected. */
export function defaultsFor(params: ParamSpec[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const param of params) {
    if (param.type === 'images') continue
    if ('default' in param && param.default !== undefined) out[param.key] = param.default
  }
  return out
}

/** How many reference images this model accepts, if any. */
export function referenceLimit(params: ParamSpec[] = []): { max: number; label: string } | null {
  const spec = params.find((p) => p.type === 'images')
  return spec && spec.type === 'images' ? { max: spec.max, label: spec.label } : null
}
