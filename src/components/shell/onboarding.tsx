'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Cloud, Copy, Layers, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Input, StatusDot } from '@/components/ui'
import { KovaiMark } from './kovai-mark'
import { useSettings } from '@/store/settings'
import { useProviders } from '@/hooks/use-providers'
import { cn, copyText } from '@/lib/utils'

type Choice = 'LOCAL' | 'ONLINE' | 'BOTH'

/**
 * First launch.
 *
 * Two decisions, both reversible: what to call you, and where your intelligence
 * lives. Provider keys are environment configuration, so this step shows what is
 * connected and what to add rather than asking for secrets in a web form.
 */
export function Onboarding() {
  const complete = useSettings((s) => s.complete)
  const [step, setStep] = useState<0 | 1>(0)
  const [name, setName] = useState('')
  const [choice, setChoice] = useState<Choice>('BOTH')

  const finish = () => {
    complete(name, choice === 'ONLINE' ? 'ONLINE' : choice === 'LOCAL' ? 'PRIVATE' : 'ONLINE')
  }

  return (
    <div className="pb-safe pt-safe fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-canvas px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[560px]"
      >
        {step === 0 ? (
          <>
            <div className="mb-8 flex flex-col items-center text-center">
              <KovaiMark className="mb-5 h-7 w-7" />
              <h1 className="text-[22px] font-medium tracking-[-0.025em] text-ink sm:text-[26px]">
                Welcome to KOVAI.
              </h1>
              <p className="mt-2 text-[14.5px] text-ink-muted">
                Choose where your intelligence lives.
              </p>
            </div>

            <div className="space-y-2">
              <ChoiceCard
                icon={Lock}
                title="Local"
                line="Private · Offline · Your hardware"
                detail="Chat, vision and embeddings run on this machine. Nothing is sent anywhere."
                selected={choice === 'LOCAL'}
                onSelect={() => setChoice('LOCAL')}
              />
              <ChoiceCard
                icon={Cloud}
                title="Online"
                line="More models · Cloud powered"
                detail="Hosted models for chat and vision, plus image generation."
                selected={choice === 'ONLINE'}
                onSelect={() => setChoice('ONLINE')}
              />
              <ChoiceCard
                icon={Layers}
                title="Both"
                line="Local and cloud, side by side"
                detail="Switch between local and cloud at any time. Private mode is one keystroke away."
                selected={choice === 'BOTH'}
                onSelect={() => setChoice('BOTH')}
                recommended
              />
            </div>

            <div className="mt-6 flex items-center gap-2">
              <Input
                placeholder="What should KOVAI call you?"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setStep(1)}
                className="h-10 flex-1"
              />
              <Button variant="primary" size="lg" onClick={() => setStep(1)}>
                Continue
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <ProviderStep onBack={() => setStep(0)} onFinish={finish} />
        )}
      </motion.div>
    </div>
  )
}

function ChoiceCard({
  icon: Icon,
  title,
  line,
  detail,
  selected,
  recommended,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  line: string
  detail: string
  selected: boolean
  recommended?: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3.5 rounded-[12px] border p-4 text-left transition-all duration-150',
        selected
          ? 'border-ink bg-surface'
          : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <div
        className={cn(
          'mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border',
          selected ? 'border-transparent bg-ink text-canvas' : 'border-line text-ink-faint',
        )}
      >
        <Icon className="h-[15px] w-[15px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-medium tracking-[-0.01em] text-ink">{title}</p>
          {recommended && (
            <span className="rounded-[5px] bg-accent-soft px-1.5 py-[1px] text-[10.5px] font-medium text-accent">
              Recommended
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">{line}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-faint">{detail}</p>
      </div>
      {selected && <Check className="mt-1 h-4 w-4 shrink-0 text-ink" />}
    </button>
  )
}

function ProviderStep({ onBack, onFinish }: { onBack: () => void; onFinish: () => void }) {
  const { data: providers, isLoading } = useProviders()

  return (
    <>
      <div className="mb-7 text-center">
        <h1 className="text-[22px] font-medium tracking-[-0.02em] text-ink">Connect providers</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
          Credentials live in <code className="font-mono text-[12.5px]">.env.local</code> on the server, never
          in the browser. Add what you have — you can finish this later.
        </p>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
        {isLoading && <p className="px-4 py-6 text-[13px] text-ink-faint">Checking providers…</p>}
        {providers?.map((provider, index) => {
          const ready = provider.status.state === 'READY'
          const missing = provider.status.state === 'UNCONFIGURED' ? provider.status.missing : []

          return (
            <div
              key={provider.descriptor.id}
              className={cn('px-4 py-3.5', index > 0 && 'border-t border-line')}
            >
              <div className="flex items-center gap-2.5">
                <StatusDot state={ready ? 'ready' : provider.status.state === 'ERROR' ? 'error' : 'offline'} />
                <p className="text-[13.5px] font-medium text-ink">{provider.descriptor.name}</p>
                <span className="ml-auto text-[12px] text-ink-faint">
                  {ready
                    ? 'Connected'
                    : provider.status.state === 'UNCONFIGURED'
                      ? 'Not configured'
                      : provider.status.state === 'OFFLINE'
                        ? 'Offline'
                        : 'Error'}
                </span>
              </div>
              <p className="mt-1 pl-[16px] text-[12.5px] leading-relaxed text-ink-muted">
                {provider.descriptor.summary}
              </p>

              {missing.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[16px]">
                  {missing.map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        void copyText(`${key}=`)
                        toast.success(`${key} copied`, { description: 'Paste it into .env.local' })
                      }}
                      className="inline-flex items-center gap-1 rounded-[5px] border border-line bg-subtle px-1.5 py-[2px] font-mono text-[11px] text-ink-muted transition-colors hover:text-ink"
                    >
                      {key}
                      <Copy className="h-[9px] w-[9px]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Button variant="ghost" size="lg" onClick={onBack}>
          Back
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="lg" onClick={onFinish}>
          Skip for now
        </Button>
        <Button variant="primary" size="lg" onClick={onFinish}>
          Enter KOVAI
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </>
  )
}
