'use client'

import { Cloud, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Tooltip } from '@/components/ui'
import { useSettings } from '@/store/settings'
import { cn } from '@/lib/utils'

/**
 * The privacy switch.
 *
 * PRIVATE keeps chat, vision and embeddings on this machine — cloud text models
 * are not offered, and the browser streams straight to the local runtime.
 * Image generation still runs in the cloud, but only when the user asks for it
 * explicitly, and every generation carries a provider badge.
 */
export function PrivacyToggle({ collapsed }: { collapsed: boolean }) {
  const privacy = useSettings((s) => s.privacy)
  const set = useSettings((s) => s.set)
  const isPrivate = privacy === 'PRIVATE'

  const toggle = () => {
    const next = isPrivate ? 'ONLINE' : 'PRIVATE'
    set('privacy', next)
    toast(next === 'PRIVATE' ? 'Private mode on' : 'Online mode on', {
      description:
        next === 'PRIVATE'
          ? 'Chat and vision stay on this machine.'
          : 'Cloud models are available again.',
    })
  }

  const label = isPrivate ? 'Private' : 'Online'
  const description = isPrivate
    ? 'Chat and vision run locally. Nothing is sent to a cloud text model.'
    : 'Cloud models are in use for chat, vision and images.'

  if (collapsed) {
    return (
      <Tooltip content={`${label} mode`} side="right">
        <button
          onClick={toggle}
          className={cn(
            'flex h-8 w-full items-center justify-center rounded-[8px] border transition-colors duration-150',
            isPrivate
              ? 'border-local-soft bg-local-soft text-local'
              : 'border-cloud-soft bg-cloud-soft text-cloud',
          )}
          aria-label={`${label} mode`}
        >
          {isPrivate ? <Lock className="h-[13px] w-[13px]" /> : <Cloud className="h-[13px] w-[13px]" />}
        </button>
      </Tooltip>
    )
  }

  return (
    <Tooltip content={description} side="right">
      <button
        onClick={toggle}
        className={cn(
          'flex h-[34px] w-full items-center gap-2 rounded-[9px] border px-2.5 transition-colors duration-150',
          isPrivate
            ? 'border-transparent bg-local-soft text-local'
            : 'border-transparent bg-cloud-soft text-cloud',
        )}
      >
        {isPrivate ? <Lock className="h-[13px] w-[13px]" /> : <Cloud className="h-[13px] w-[13px]" />}
        <span className="flex-1 text-left text-[12px] font-semibold uppercase tracking-[0.05em]">
          {label} mode
        </span>
        <span
          className={cn(
            'h-[14px] w-[24px] rounded-full border p-[2px] transition-colors',
            isPrivate ? 'border-local' : 'border-cloud',
          )}
        >
          <span
            className={cn(
              'block h-[8px] w-[8px] rounded-full transition-transform duration-200',
              isPrivate ? 'translate-x-0 bg-local' : 'translate-x-[10px] bg-cloud',
            )}
          />
        </span>
      </button>
    </Tooltip>
  )
}

/** Compact badge used on messages and generations. */
export function ProviderBadge({
  providerId,
  model,
  className,
}: {
  providerId?: string
  model?: string
  className?: string
}) {
  if (!providerId) return null
  const local = providerId === 'local'
  const name = local ? 'LOCAL' : providerId === 'openrouter' ? 'OpenRouter' : providerId === 'higgsfield' ? 'Higgsfield' : 'KIE'

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px]', className)}>
      <span
        className={cn(
          'rounded-[5px] px-1.5 py-[1px] font-semibold uppercase tracking-[0.05em]',
          local
            ? 'bg-local-soft text-local'
            : 'bg-cloud-soft text-cloud',
        )}
      >
        {name}
      </span>
      {model && <span className="truncate text-ink-faint">{model}</span>}
    </span>
  )
}
