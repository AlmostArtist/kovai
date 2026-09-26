'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ImageUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, EmptyState } from '@/components/ui'
import { PromptComposer } from './prompt-composer'
import { ChatMessageView } from './chat-message'
import { ErrorState } from './error-state'
import { useChat, type ChatMessage } from '@/hooks/use-chat'
import { useModels } from '@/hooks/use-models'
import { useWorkspace, type Tab } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { routeModel } from '@/lib/providers/router'
import { cn, fileToDataUrl, titleFrom } from '@/lib/utils'
import type { ChatAttachment, ModelChoice } from '@/lib/providers/types'

interface VisionState {
  images: ChatAttachment[]
  messages: ChatMessage[]
  draft: string
  model: ModelChoice | null
  question?: string
  seedConsumed?: boolean
}

const PROMPTS = [
  "What's happening here?",
  'Analyse the composition',
  'Identify the lighting setup',
  'Extract the product details',
  'Turn this into a cinematic prompt',
  'Describe the colour palette',
]

/**
 * Vision.
 *
 * Images are the subject, so they stay pinned at the top while the conversation
 * runs beneath them. In private mode the picture is read as a data URL and sent
 * straight to the local model — it is never uploaded anywhere.
 */
export function VisionWorkspace({ tab }: { tab: Tab }) {
  const state = tab.state as Partial<VisionState>
  const patchState = useWorkspace((s) => s.patchState)
  const renameTab = useWorkspace((s) => s.renameTab)
  const privacy = useSettings((s) => s.privacy)

  const images = useMemo(() => state.images ?? [], [state.images])
  const messages = useMemo(() => state.messages ?? [], [state.messages])
  const draft = state.draft ?? ''
  const model = state.model ?? null

  const patch = useCallback((next: Partial<VisionState>) => patchState(tab.id, next), [patchState, tab.id])
  const { data: catalogue } = useModels('VISION')
  const { send, stop, busy } = useChat(tab.id, messages)
  const fileRef = useRef<HTMLInputElement>(null)

  const route = useMemo(
    () =>
      routeModel({
        task: 'vision',
        privacy,
        preferred: model,
        intent: 'vision',
        available: catalogue?.models ?? [],
      }),
    [privacy, model, catalogue?.models],
  )

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const next: ChatAttachment[] = []
      for (const file of [...files].filter((f) => f.type.startsWith('image/')).slice(0, 5)) {
        try {
          if (privacy === 'PRIVATE') {
            next.push({ url: await fileToDataUrl(file), mimeType: file.type, name: file.name })
          } else {
            const form = new FormData()
            form.append('file', file)
            const res = await fetch('/api/upload', { method: 'POST', body: form })
            const body = (await res.json()) as { url?: string; error?: { message: string } }
            if (!res.ok || !body.url) {
              toast.error(body.error?.message ?? 'That image could not be used.')
              continue
            }
            next.push({ url: body.url, mimeType: file.type, name: file.name })
          }
        } catch {
          toast.error('That image could not be read.')
        }
      }
      if (next.length) patch({ images: [...images, ...next] })
    },
    [images, patch, privacy],
  )

  const ask = useCallback(
    async (question: string) => {
      if (!route.ok || !images.length) return
      patch({ draft: '' })
      if (!messages.length) renameTab(tab.id, `Vision — ${titleFrom(question, 'Image')}`)

      await send({
        text: question,
        // Every turn carries the images, so follow-up questions still see them.
        attachments: images,
        providerId: route.providerId,
        model: route.model.id,
        modelName: route.model.name,
      })
    },
    [route, images, patch, messages.length, renameTab, tab.id, send],
  )

  useEffect(() => {
    if (!state.question || state.seedConsumed || !route.ok || !images.length) return
    patch({ seedConsumed: true })
    void ask(state.question)
  }, [state.question, state.seedConsumed, route.ok, images.length, patch, ask])

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line bg-surface px-5">
        <span
          className={cn(
            'rounded-[5px] px-1.5 py-[2px] text-[10.5px] font-semibold uppercase tracking-[0.05em]',
            route.ok && route.providerId === 'local'
              ? 'bg-local-soft text-local'
              : 'bg-cloud-soft text-cloud',
          )}
        >
          {route.ok && route.providerId === 'local' ? 'Local vision' : 'Online vision'}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[780px] px-8 py-6">
          {images.length === 0 ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void addFiles(e.dataTransfer.files)
              }}
              onPaste={(e) => e.clipboardData.files.length && void addFiles(e.clipboardData.files)}
              className="mt-8 rounded-[14px] border border-dashed border-line"
            >
              <EmptyState
                icon={ImageUp}
                title="Drop an image to begin."
                line="Drag a file in, paste from the clipboard, or choose one. Up to five at a time."
                action={
                  <Button variant="primary" size="md" onClick={() => fileRef.current?.click()}>
                    Choose image
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap gap-2.5">
                {images.map((image, index) => (
                  <div
                    key={`${image.url}-${index}`}
                    className="group relative overflow-hidden rounded-[11px] border border-line"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={image.name ?? `Image ${index + 1}`}
                      className="h-[128px] w-auto max-w-[220px] object-cover"
                    />
                    <button
                      onClick={() => patch({ images: images.filter((_, i) => i !== index) })}
                      className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      <X className="h-[10px] w-[10px]" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex h-[128px] w-[84px] items-center justify-center rounded-[11px] border border-dashed border-line text-ink-faint transition-colors hover:text-ink"
                  aria-label="Add image"
                >
                  <ImageUp className="h-[16px] w-[16px]" />
                </button>
              </div>

              {messages.length === 0 && (
                <div className="mb-6 flex flex-wrap gap-1.5">
                  {PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => void ask(prompt)}
                      disabled={!route.ok}
                      className="rounded-[8px] border border-line bg-surface px-2.5 py-[6px] text-[12.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((message) => (
                <ChatMessageView key={message.id} message={message} />
              ))}
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 px-8 pb-6">
        <div className="mx-auto max-w-[780px]">
          {!route.ok && images.length > 0 && (
            <ErrorState
              className="mb-2.5"
              compact
              error={{
                code: privacy === 'PRIVATE' ? 'RUNTIME_OFFLINE' : 'UNCONFIGURED',
                message: route.message,
                detail:
                  privacy === 'PRIVATE'
                    ? 'Install a vision model (for example a VL or LLaVA model) in the local runtime, or switch off private mode.'
                    : 'Connect OpenRouter in Settings → Providers to use a hosted vision model.',
                retryable: false,
              }}
            />
          )}

          <PromptComposer
            value={draft}
            onChange={(draft) => patch({ draft })}
            onSubmit={() => void ask(draft)}
            onStop={stop}
            busy={busy}
            capability="VISION"
            model={model}
            onModelChange={(model) => patch({ model })}
            placeholder={images.length ? 'Ask about these images…' : 'Add an image first'}
          />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
