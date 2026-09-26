'use client'

import { useRef, useState } from 'react'
import {
  Archive,
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  Command,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  Globe,
  Heart,
  Images,
  Info,
  KeyRound,
  Layers,
  MessageSquare,
  Palette,
  Plug,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Telescope,
  Type,
  Upload,
  UserCheck,
  Users,
  Workflow as WorkflowIcon,
  XCircle,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Input,
  Segmented,
  Select,
  Separator,
  StatusDot,
  Switch,
  Textarea,
} from '@/components/ui'
import { WorkspaceHeader, WorkspaceScroll } from './workspace-surface'
import { useProviders } from '@/hooks/use-providers'
import { useModels } from '@/hooks/use-models'
import { isFreeModel } from '@/lib/providers/descriptors'
import { useSettings } from '@/store/settings'
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  GROUNDS,
  READING_FONTS,
  TYPE_SCALES,
  type Appearance,
} from '@/lib/appearance'
import { EFFORTS } from '@/lib/response-effort'
import { cn, copyText, modKey } from '@/lib/utils'
import { useWorkspace, type Tab } from '@/store/workspace'
import type { ProviderState } from '@/hooks/use-providers'

/**
 * The settings, as a list of places.
 *
 * A rail rather than a row of pills. Pills wrap once there are more than four
 * and the wrapped row reads as two unrelated groups; a rail holds any number,
 * keeps the section you are in visible while you scroll the one beside it, and
 * matches how every other list in the app is navigated.
 *
 * Each entry says what it is for in a few words, because "Appearance" and
 * "Customisation" are not self-evidently different until someone tells you.
 */
const SECTIONS = [
  { value: 'customisation', label: 'Customisation', icon: Palette, line: 'Colour, type and scenery' },
  { value: 'output', label: 'Output', icon: Sparkles, line: 'How answers are written' },
  { value: 'providers', label: 'Providers', icon: Plug, line: 'Models and credentials' },
  { value: 'privacy', label: 'Privacy', icon: ShieldCheck, line: 'What leaves this machine' },
  { value: 'shortcuts', label: 'Shortcuts', icon: Command, line: 'Every key that does something' },
  { value: 'about', label: 'About', icon: Info, line: 'What this build is' },
] as const

type Section = (typeof SECTIONS)[number]['value']

export function SettingsWorkspace({ tab }: { tab: Tab }) {
  const [section, setSection] = useState<Section>((tab.state.section as Section) ?? 'customisation')
  const current = SECTIONS.find((s) => s.value === section)!

  return (
    /*
      A rail beside the content on a desktop; a strip of tabs above it on a
      phone. The rail cannot simply narrow — at 390px a 228px column and the
      settings it points at would each get half a screen, and neither would be
      usable. So below `md` it turns on its side: same entries, same order,
      scrolling horizontally, with the explanatory line dropped because a tab
      row is read at a glance rather than studied.
    */
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-surface md:w-[228px] md:border-b-0 md:border-r">
        <div className="hidden px-4 pb-2 pt-5 md:block">
          <p className="text-[15px] font-medium tracking-[-0.015em] text-ink">Settings</p>
        </div>

        <nav className="flex min-h-0 flex-row gap-1 overflow-x-auto px-2 py-2 no-scrollbar md:flex-1 md:flex-col md:gap-0 md:overflow-x-visible md:overflow-y-auto md:py-0 md:pb-4">
          {SECTIONS.map((entry) => {
            const Icon = entry.icon
            const active = section === entry.value
            return (
              <button
                key={entry.value}
                onClick={() => setSection(entry.value)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-[9px] px-3 py-2 text-left transition-colors md:w-full md:items-start md:gap-2.5 md:px-2',
                  active ? 'bg-subtle' : 'hover:bg-subtle',
                )}
              >
                <Icon
                  className={cn(
                    'h-[14px] w-[14px] shrink-0 md:mt-[2px]',
                    active ? 'text-accent' : 'text-ink-faint',
                  )}
                />
                <span className="min-w-0">
                  <span className={cn('block whitespace-nowrap text-[13px] md:whitespace-normal', active ? 'text-ink' : 'text-ink-muted')}>
                    {entry.label}
                  </span>
                  <span className="mt-0.5 hidden text-[11px] leading-[1.35] text-ink-faint md:block">
                    {entry.line}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="pb-safe mx-auto max-w-[680px] px-4 py-5 md:px-8 md:py-7">
          <header className="mb-6">
            <h1 className="text-[21px] font-medium tracking-[-0.022em] text-ink">{current.label}</h1>
            <p className="mt-1 text-[13px] text-ink-muted">{current.line}</p>
          </header>

          {section === 'customisation' && <CustomisationSection />}
          {section === 'output' && <OutputSection />}
          {section === 'providers' && <ProvidersSection />}
          {section === 'privacy' && <PrivacySection />}
          {section === 'shortcuts' && <ShortcutsSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

/**
 * Provider configuration.
 *
 * KOVAI never shows a key, not even masked, and has no form to type one into:
 * credentials are read from the server environment and never travel to the
 * browser. This screen reports what is connected and names exactly what to add.
 */
function ProvidersSection() {
  const { data: providers, isLoading, refetch, isFetching } = useProviders()

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-[11px] border border-line bg-surface p-4">
        <ShieldCheck className="mt-[1px] h-[15px] w-[15px] shrink-0 text-local" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink">Credentials stay on the server</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            Keys live in <code className="font-mono text-[12px]">.env.local</code> and are read only by the
            backend. Every request to a cloud provider is proxied — nothing sensitive is ever sent to the
            browser, and no key is stored in the database.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => void refetch()} aria-label="Recheck">
          <RefreshCw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
        </Button>
      </div>

      <FreeModelsToggle />

      {isLoading
        ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[92px] rounded-[11px] shimmer" />)
        : providers?.map((provider) => <ProviderCard key={provider.descriptor.id} provider={provider} />)}
    </div>
  )
}

/**
 * OpenRouter's catalogue runs to hundreds of models, most of them billed. This
 * narrows it to the ones that cost nothing — which, with local models, is often
 * the whole set someone wants to choose between.
 */
function FreeModelsToggle() {
  const onlyFree = useSettings((s) => s.onlyFreeModels)
  const set = useSettings((s) => s.set)
  const { data } = useModels()

  const total = data?.models.length ?? 0
  const free = (data?.models ?? []).filter(isFreeModel).length

  return (
    <div className="rounded-[11px] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">Show free models only</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            Hides cloud models that charge. Local models always stay — they run on your hardware. A model
            whose provider publishes no price is treated as unknown, not free.
          </p>
        </div>
        <Switch checked={onlyFree} onCheckedChange={(value) => set('onlyFreeModels', value)} />
      </div>

      <Segmented
        className="mt-3"
        value={onlyFree ? 'free' : 'all'}
        onChange={(value) => set('onlyFreeModels', value === 'free')}
        options={[
          { value: 'all', label: `All models${total && !onlyFree ? ` · ${total}` : ''}` },
          { value: 'free', label: `Free only${onlyFree ? ` · ${free}` : ''}` },
        ]}
      />
    </div>
  )
}

function ProviderCard({ provider }: { provider: ProviderState }) {
  const { descriptor, status } = provider
  const ready = status.state === 'READY'

  return (
    <div className="rounded-[11px] border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13.5px] font-medium text-ink">{descriptor.name}</p>
            <Badge tone={descriptor.kind === 'LOCAL' ? 'local' : 'cloud'}>
              {descriptor.kind === 'LOCAL' ? 'local' : 'cloud'}
            </Badge>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{descriptor.summary}</p>

          <div className="mt-2.5 flex flex-wrap gap-1">
            {descriptor.capabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-[5px] border border-line bg-subtle px-1.5 py-[1px] text-[10.5px] lowercase text-ink-muted"
              >
                {capability.replace(/_/g, ' ').toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <StatusDot
            state={
              ready ? 'ready' : status.state === 'ERROR' ? 'error' : status.state === 'OFFLINE' ? 'offline' : 'offline'
            }
          />
          <span className="text-[12px] text-ink-muted">
            {ready
              ? 'Connected'
              : status.state === 'UNCONFIGURED'
                ? 'Not configured'
                : status.state === 'OFFLINE'
                  ? 'Offline'
                  : 'Error'}
          </span>
        </div>
      </div>

      {ready && status.detail && (
        <p className="mt-2.5 text-[12px] text-ink-faint">
          {status.detail}
          {status.latencyMs !== undefined && ` · ${status.latencyMs}ms`}
        </p>
      )}

      {status.state === 'ERROR' && (
        <p className="mt-2.5 rounded-[8px] bg-danger-soft px-2.5 py-2 text-[12px] leading-relaxed text-danger">
          {status.detail}
        </p>
      )}

      {status.state === 'UNCONFIGURED' && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[12px] text-ink-muted">
            <KeyRound className="h-[12px] w-[12px]" />
            Add to <code className="font-mono text-[11.5px]">.env.local</code>, then restart the dev server:
          </p>
          <div className="space-y-1">
            {status.missing.map((key) => (
              <button
                key={key}
                onClick={() => {
                  void copyText(`${key}=`)
                  toast.success(`${key} copied`)
                }}
                className="flex w-full items-center gap-2 rounded-[7px] border border-line bg-subtle px-2.5 py-1.5 text-left font-mono text-[11.5px] text-ink-muted transition-colors hover:text-ink"
              >
                <span className="flex-1">{key}=</span>
                <Copy className="h-[11px] w-[11px]" />
              </button>
            ))}
          </div>
          {descriptor.docsUrl && (
            <a
              href={descriptor.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
            >
              Where to get these
              <ExternalLink className="h-[10px] w-[10px]" />
            </a>
          )}
        </div>
      )}

      {status.state === 'OFFLINE' && descriptor.id === 'local' && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-muted">
          {status.detail} Start it from the sidebar, or run{' '}
          <code className="font-mono text-[11.5px]">scripts/start-local.sh</code>.
        </p>
      )}
    </div>
  )
}

function PrivacySection() {
  const settings = useSettings()

  return (
    <div className="space-y-3">
      <div className="rounded-[11px] border border-line bg-surface p-4">
        <p className="text-[13.5px] font-medium text-ink">Intelligence mode</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          In private mode, chat, vision and embeddings run on this machine, streamed directly from the browser
          to the local runtime. Cloud text models are not offered at all — not merely hidden.
        </p>
        <Segmented
          className="mt-3"
          value={settings.privacy}
          onChange={(privacy) => settings.set('privacy', privacy)}
          options={[
            { value: 'PRIVATE', label: 'Private' },
            { value: 'ONLINE', label: 'Online' },
          ]}
        />
      </div>

      <Row
        title="Use project context"
        line="Include the active project's brand and creative direction with requests."
      >
        <Switch
          checked={settings.useProjectContext}
          onCheckedChange={(v) => settings.set('useProjectContext', v)}
        />
      </Row>

      <div className="rounded-[11px] border border-line bg-surface p-4">
        <p className="text-[13px] font-medium text-ink">Local runtime address</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          Where KOVAI looks for the FastAPI runtime.
        </p>
        <Input
          className="mt-2.5 font-mono text-[12.5px]"
          value={settings.localRuntimeUrl}
          onChange={(e) => settings.set('localRuntimeUrl', e.target.value.replace(/\/$/, ''))}
        />
      </div>
    </div>
  )
}

/** A titled block. Everything in Customisation is one of these. */
function Panel({
  title,
  line,
  children,
  action,
}: {
  title: string
  line?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="rounded-[12px] border border-line bg-surface p-3.5 md:p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink">{title}</p>
          {line && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{line}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A label in a fixed column, so every control in a panel lines up. */
function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    /*
      Label beside the control, until there is not room — then above it. A
      fixed 82px column plus a segmented control with four options overflows a
      390px screen, and the control is the part that has to stay whole.
    */
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 text-[12.5px] text-ink-muted sm:w-[82px]">{label}</span>
      {children}
    </div>
  )
}

function CustomisationSection() {
  const settings = useSettings()
  const appearance = { ...DEFAULT_APPEARANCE, ...(settings.appearance ?? {}) }
  const set = (patch: Partial<Appearance>) => settings.set('appearance', { ...appearance, ...patch })

  const fontRef = useRef<HTMLInputElement>(null)
  const paperRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'font' | 'wallpaper' | null>(null)

  /** Sends one file to the store and hands back where it landed. */
  const upload = async (file: File): Promise<string | null> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const body = (await res.json()) as { url?: string; error?: { message: string; detail?: string } }
    if (!res.ok || !body.url) {
      toast.error(body.error?.message ?? 'That file could not be read.', {
        description: body.error?.detail,
      })
      return null
    }
    return body.url
  }

  const addFont = async (file: File) => {
    setBusy('font')
    try {
      const url = await upload(file)
      if (!url) return
      // The file name is the family name, which is what someone looking at a
      // list of their own fonts expects to see.
      const family = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Custom'
      if (appearance.fonts.some((f) => f.family === family)) {
        toast.error(`${family} is already imported.`)
        return
      }
      set({ fonts: [...appearance.fonts, { family, url }] })
      toast.success(`${family} imported.`)
    } finally {
      setBusy(null)
    }
  }

  const addWallpaper = async (file: File) => {
    setBusy('wallpaper')
    try {
      const url = await upload(file)
      if (url) set({ wallpaper: url })
    } finally {
      setBusy(null)
    }
  }

  const families = ['ui-sans-serif', ...appearance.fonts.map((f) => f.family)]

  return (
    <div className="space-y-3">
      <Panel title="Theme" line="Follows the system unless you choose.">
        <Segmented
          value={settings.theme}
          onChange={(theme) => settings.set('theme', theme)}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Panel>

      <Panel
        title="Accent"
        line="Links, selection, highlighted phrases. Each carries its own pair of values, so it stays readable in both themes."
      >
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((swatch) => (
            <Swatch
              key={swatch.id}
              label={swatch.label}
              colour={swatch.light.accent}
              chosen={appearance.accent === swatch.id}
              onClick={() => set({ accent: swatch.id })}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Background"
        line="The colour everything sits on. Only the canvas moves — cards and panels keep their own tone, so nothing that sits on it can break."
      >
        <div className="flex flex-wrap gap-2">
          {GROUNDS.map((ground) => (
            <Swatch
              key={ground.id}
              label={ground.label}
              colour={ground.light}
              second={ground.dark}
              chosen={appearance.ground === ground.id}
              onClick={() => set({ ground: ground.id })}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Wallpaper"
        line="Behind Home. The pair that ships changes with the theme; one of your own replaces both."
        action={
          <Button variant="secondary" size="sm" onClick={() => paperRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {busy === 'wallpaper' ? 'Reading…' : 'Upload'}
          </Button>
        }
      >
        <input
          ref={paperRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void addWallpaper(file)
            e.target.value = ''
          }}
        />

        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <WallpaperTile
              label="Scene"
              preview="/backdrops/home-light.webp"
              previewDark="/backdrops/home-dark.webp"
              chosen={appearance.wallpaper === 'scene'}
              onClick={() => set({ wallpaper: 'scene' })}
            />
            <WallpaperTile
              label="None"
              chosen={appearance.wallpaper === 'none'}
              onClick={() => set({ wallpaper: 'none' })}
            />
            {appearance.wallpaper !== 'scene' && appearance.wallpaper !== 'none' && (
              <WallpaperTile label="Yours" preview={appearance.wallpaper} chosen onClick={() => {}} />
            )}
          </div>

          {appearance.wallpaper !== 'none' && (
            <Setting label="Strength">
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={appearance.wallpaperStrength}
                onChange={(e) => set({ wallpaperStrength: Number(e.target.value) })}
                className="h-[3px] flex-1 accent-[var(--color-accent)]"
              />
              <span className="w-[34px] shrink-0 text-right text-[11.5px] tabular-nums text-ink-faint">
                {appearance.wallpaperStrength}%
              </span>
            </Setting>
          )}
        </div>
      </Panel>

      <Panel
        title="Fonts"
        line="Bring your own. A .woff2, .woff, .ttf or .otf is checked by its signature, stored with your files, and served back to the browser."
        action={
          <Button variant="secondary" size="sm" onClick={() => fontRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {busy === 'font' ? 'Reading…' : 'Import'}
          </Button>
        }
      >
        <input
          ref={fontRef}
          type="file"
          accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void addFont(file)
            e.target.value = ''
          }}
        />

        <div className="space-y-2.5">
          <Setting label="Interface">
            <Select
              value={appearance.interfaceFont ?? 'ui-sans-serif'}
              onChange={(e) =>
                set({ interfaceFont: e.target.value === 'ui-sans-serif' ? null : e.target.value })
              }
              className="flex-1"
            >
              {families.map((family) => (
                <option key={family} value={family}>
                  {family === 'ui-sans-serif' ? 'Default' : family}
                </option>
              ))}
            </Select>
          </Setting>

          <Setting label="Reading">
            <Select
              value={appearance.customReadingFont ?? appearance.readingFont}
              onChange={(e) => {
                const value = e.target.value
                if (READING_FONTS.some((f) => f.id === value))
                  set({ readingFont: value, customReadingFont: null })
                else set({ customReadingFont: value })
              }}
              className="flex-1"
            >
              {READING_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
              {appearance.fonts.map((f) => (
                <option key={f.family} value={f.family}>
                  {f.family}
                </option>
              ))}
            </Select>
          </Setting>

          {appearance.fonts.length > 0 && (
            <div className="rounded-[9px] border border-line">
              {appearance.fonts.map((font) => (
                <div
                  key={font.family}
                  className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-0"
                >
                  <span
                    className="min-w-0 flex-1 truncate text-[13px] text-ink"
                    style={{ fontFamily: `"${font.family}"` }}
                  >
                    {font.family} — The quick brown fox
                  </span>
                  <button
                    onClick={() =>
                      set({
                        fonts: appearance.fonts.filter((f) => f.family !== font.family),
                        interfaceFont:
                          appearance.interfaceFont === font.family ? null : appearance.interfaceFont,
                        customReadingFont:
                          appearance.customReadingFont === font.family
                            ? null
                            : appearance.customReadingFont,
                      })
                    }
                    className="shrink-0 text-[11.5px] text-ink-faint transition-colors hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Reading" line="How answers are set. The interface keeps its own size, so this never moves buttons.">
        <div className="space-y-2.5">
          <Setting label="Size">
            <Segmented
              size="sm"
              value={appearance.typeScale}
              onChange={(typeScale) => set({ typeScale })}
              options={TYPE_SCALES.map((t) => ({ value: t.id, label: t.label }))}
            />
          </Setting>
          <Setting label="Leading">
            <Segmented
              size="sm"
              value={appearance.airy ? 'airy' : 'normal'}
              onChange={(v) => set({ airy: v === 'airy' })}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'airy', label: 'Airy' },
              ]}
            />
          </Setting>
        </div>

        <div
          className="prose-kovai mt-3.5 rounded-[10px] border border-line bg-subtle px-3.5 py-3"
          style={{ maxWidth: 'none' }}
        >
          <p>
            The 35mm lens offers a <strong>natural, environmental perspective</strong>, capturing
            more context around your subject.
          </p>
        </div>
      </Panel>

      <Panel title="Identity" line="What KOVAI calls you, and whether the rail starts collapsed.">
        <div className="space-y-2.5">
          <Setting label="Name">
            <Input
              className="flex-1"
              value={settings.displayName}
              placeholder="Your name"
              onChange={(e) => settings.set('displayName', e.target.value)}
            />
          </Setting>
          <Setting label="Sidebar">
            <Switch
              checked={settings.sidebarCollapsed}
              onCheckedChange={(v) => settings.set('sidebarCollapsed', v)}
            />
            <span className="text-[12px] text-ink-faint">Start collapsed ({modKey()} B)</span>
          </Setting>
        </div>
      </Panel>

      <div className="flex justify-end pt-1">
        <Button
          variant="ghost"
          size="md"
          onClick={() => {
            settings.set('appearance', DEFAULT_APPEARANCE)
            toast.success('Back to defaults.')
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset customisation
        </Button>
      </div>
    </div>
  )
}

/**
 * One choice in a colour row.
 *
 * A ground is given both its values, split on the diagonal, because the six
 * light tints are within a few percent of one another and at 14px they would
 * be six identical dots — the pairing is what actually tells them apart, and
 * it also shows what the choice does in the theme you are not currently in.
 */
function Swatch({
  label,
  colour,
  second,
  chosen,
  onClick,
}: {
  label: string
  colour: string
  second?: string
  chosen: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={chosen}
      className={cn(
        'flex items-center gap-2 rounded-[9px] border px-2.5 py-1.5 text-[12.5px] transition-colors',
        chosen ? 'border-ink text-ink' : 'border-line text-ink-muted hover:border-line-strong',
      )}
    >
      <span
        className={cn(
          'h-[15px] w-[15px] border border-line-strong',
          second ? 'rounded-[4px]' : 'rounded-full',
        )}
        style={{
          background: second
            ? `linear-gradient(135deg, ${colour} 0 50%, ${second} 50% 100%)`
            : colour,
        }}
      />
      {label}
    </button>
  )
}

/**
 * One wallpaper to choose from.
 *
 * The built-in scene is two images, so its tile is two images too — stacked and
 * swapped on the `dark` class, the same way Home swaps them. A tile that only
 * ever showed the night picture would be telling you the wrong thing about half
 * the time you were looking at it.
 */
function WallpaperTile({
  label,
  preview,
  previewDark,
  chosen,
  onClick,
}: {
  label: string
  preview?: string
  previewDark?: string
  chosen: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={chosen}
      className={cn(
        'overflow-hidden rounded-[9px] border transition-colors',
        chosen ? 'border-ink' : 'border-line hover:border-line-strong',
      )}
    >
      <span className="relative block h-[52px] w-full bg-subtle">
        {preview && (
          <img
            src={preview}
            alt=""
            className={cn(
              'absolute inset-0 h-full w-full object-cover',
              previewDark && 'dark:opacity-0',
            )}
          />
        )}
        {previewDark && (
          <img
            src={previewDark}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-0 dark:opacity-100"
          />
        )}
      </span>
      <span className="block px-2 py-1 text-[11.5px] text-ink-muted">{label}</span>
    </button>
  )
}

function OutputSection() {
  const settings = useSettings()

  return (
    <div className="space-y-3">
      <Panel title="Effort" line="How much answer to ask for by default. Every chat starts here and can be changed per conversation.">
        <Segmented
          size="sm"
          value={settings.responseEffort ?? 'medium'}
          onChange={(responseEffort) => settings.set('responseEffort', responseEffort)}
          options={EFFORTS.map((e) => ({ value: e.id, label: e.label, title: e.hint }))}
        />
      </Panel>

      <Panel
        title="Standing instructions"
        line="Added to every conversation, after the house style, so these win where they disagree. Keep it short: it competes for room with the conversation itself."
      >
        <Textarea
          rows={4}
          value={settings.customInstructions ?? ''}
          onChange={(e) => settings.set('customInstructions', e.target.value)}
          placeholder="A language to answer in, a house style, things never to do."
        />
      </Panel>
    </div>
  )
}

function ShortcutsSection() {
  const shortcuts: [string, string][] = [
    [`${modKey()} K`, 'Command palette'],
    [`${modKey()} /`, 'Search everything'],
    [`${modKey()} T`, 'New workspace tab'],
    [`${modKey()} W`, 'Close tab'],
    [`${modKey()} ⇧ T`, 'Reopen closed tab'],
    [`${modKey()} ⇧ P`, 'New project'],
    [`${modKey()} ↵`, 'Generate'],
    [`${modKey()} B`, 'Collapse sidebar'],
    [`${modKey()} 1–9`, 'Jump to tab'],
    ['Ctrl Tab', 'Next tab'],
    ['Esc', 'Close overlay'],
  ]

  return (
    <div className="overflow-hidden rounded-[11px] border border-line bg-surface">
      {shortcuts.map(([keys, label], index) => (
        <div key={keys}>
          {index > 0 && <Separator />}
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[13px] text-ink">{label}</span>
            <kbd className="rounded-[5px] border border-line bg-subtle px-1.5 py-[2px] font-mono text-[11.5px] text-ink-muted">
              {keys}
            </kbd>
          </div>
        </div>
      ))}
    </div>
  )
}

function Row({
  title,
  line,
  children,
}: {
  title: string
  line: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[11px] border border-line bg-surface p-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{line}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/* ── About ─────────────────────────────────────────────────── */

/* ── About ─────────────────────────────────────────────────── */

const FEATURE_BADGES: {
  label: string
  command?: string
  kind: 'chat' | 'create' | 'vision' | 'research' | 'workflow' | 'models' | 'prompts' | 'assets'
  icon: React.ComponentType<{ className?: string }>
  colorVar: string
  softVar: string
  description: string
}[] = [
  { label: 'Chat & Reason', command: '/chat', kind: 'chat', icon: MessageSquare, colorVar: 'var(--color-badge-chat)', softVar: 'var(--color-badge-chat-soft)', description: 'Conversational LLMs' },
  { label: 'Create Image', command: '/image', kind: 'create', icon: Sparkles, colorVar: 'var(--color-badge-create)', softVar: 'var(--color-badge-create-soft)', description: 'SDXL, Flux & DALL-E' },
  { label: 'Visual Charts', command: '/chart', kind: 'create', icon: BarChart3, colorVar: 'var(--color-badge-asset)', softVar: 'var(--color-badge-asset-soft)', description: 'Data & Architecture' },
  { label: 'Vision Analysis', command: '/vision', kind: 'vision', icon: Layers, colorVar: 'var(--color-badge-vision)', softVar: 'var(--color-badge-vision-soft)', description: 'Multimodal OCR & Inspect' },
  { label: 'Deep Research', command: '/research', kind: 'research', icon: Telescope, colorVar: 'var(--color-badge-research)', softVar: 'var(--color-badge-research-soft)', description: 'Synthesized Web Sources' },
  { label: 'Workflows', command: '/workflow', kind: 'workflow', icon: WorkflowIcon, colorVar: 'var(--color-badge-workflow)', softVar: 'var(--color-badge-workflow-soft)', description: 'Multi-node Automation' },
  { label: 'Local Models', kind: 'models', icon: Boxes, colorVar: 'var(--color-badge-model)', softVar: 'var(--color-badge-model-soft)', description: 'Ollama & GGUF Engine' },
  { label: 'Prompt Library', kind: 'prompts', icon: Type, colorVar: 'var(--color-badge-prompt)', softVar: 'var(--color-badge-prompt-soft)', description: 'Curated Templates' },
  { label: 'Asset Vault', kind: 'assets', icon: Images, colorVar: 'var(--color-badge-asset)', softVar: 'var(--color-badge-asset-soft)', description: 'Generated Media History' },
]

/** Reference 4: Tactile status badges */
const STATUS_TAGS = [
  { label: 'Synced', icon: Cloud, color: '#0e7490', bg: 'var(--color-badge-vision-soft)', border: 'var(--color-badge-vision)' },
  { label: 'Approved', icon: CheckCircle2, color: '#059669', bg: 'var(--color-badge-prompt-soft)', border: 'var(--color-badge-prompt)' },
  { label: 'In Review', icon: Info, color: '#2563eb', bg: 'var(--color-badge-chat-soft)', border: 'var(--color-badge-chat)' },
  { label: 'Pending', icon: Clock, color: '#d97706', bg: 'var(--color-badge-research-soft)', border: 'var(--color-badge-research)' },
  { label: 'Private Engine', icon: ShieldCheck, color: '#7c3aed', bg: 'var(--color-badge-create-soft)', border: 'var(--color-badge-create)' },
  { label: 'Hardware MPS', icon: Cpu, color: '#ea580c', bg: 'var(--color-badge-asset-soft)', border: 'var(--color-badge-asset)' },
  { label: 'Archived', icon: Archive, color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)', border: '#64748b' },
]

/** Reference 2: Team / Agent role pills */
const SPECIALIST_ROLES = [
  {
    name: 'KOVAI Orchestrator',
    status: 'Online',
    statusColor: 'var(--color-badge-chat)',
    role: 'Project Manager',
    icon: Users,
    roleColor: '#059669',
    roleSoft: 'var(--color-badge-prompt-soft)',
    roleBorder: 'var(--color-badge-prompt)',
  },
  {
    name: 'Canvas Visualizer',
    status: 'Active',
    statusColor: 'var(--color-local)',
    role: 'Designer',
    icon: Palette,
    roleColor: '#7c3aed',
    roleSoft: 'var(--color-badge-create-soft)',
    roleBorder: 'var(--color-badge-create)',
  },
  {
    name: 'System & Code Architect',
    status: 'Active',
    statusColor: 'var(--color-local)',
    role: 'Engineer',
    icon: Cpu,
    roleColor: '#d97706',
    roleSoft: 'var(--color-badge-research-soft)',
    roleBorder: 'var(--color-badge-research)',
  },
  {
    name: 'Generative Media Engine',
    status: 'Active',
    statusColor: 'var(--color-local)',
    role: 'Creator',
    icon: Sparkles,
    roleColor: '#4f46e5',
    roleSoft: 'var(--color-badge-model-soft)',
    roleBorder: 'var(--color-badge-model)',
  },
]

/** Reference 3: Dual pill styles (Subtle Outline vs Solid Vibrant) */
const DUAL_PILLS = [
  {
    leftLabel: 'Local Ollama',
    leftIcon: Cpu,
    leftColor: '#38bdf8',
    leftBg: 'rgba(56, 189, 248, 0.12)',
    leftBorder: '#38bdf8',
    rightLabel: 'OpenAI API',
    rightIcon: Globe,
    rightBg: '#2563eb',
    rightText: '#ffffff',
  },
  {
    leftLabel: 'Private GGUF',
    leftIcon: Shield,
    leftColor: '#c084fc',
    leftBg: 'rgba(192, 132, 252, 0.12)',
    leftBorder: '#c084fc',
    rightLabel: 'Claude 3.5',
    rightIcon: Zap,
    rightBg: '#8b5cf6',
    rightText: '#ffffff',
  },
  {
    leftLabel: 'PyTorch MPS',
    leftIcon: Layers,
    leftColor: '#f472b6',
    leftBg: 'rgba(244, 114, 182, 0.12)',
    leftBorder: '#f472b6',
    rightLabel: 'Flux.1 Studio',
    rightIcon: Sparkles,
    rightBg: '#ec4899',
    rightText: '#ffffff',
  },
  {
    leftLabel: 'Zero Leak',
    leftIcon: ShieldCheck,
    leftColor: '#fbbf24',
    leftBg: 'rgba(251, 191, 36, 0.12)',
    leftBorder: '#fbbf24',
    rightLabel: 'Gemini Flash',
    rightIcon: Telescope,
    rightBg: '#eab308',
    rightText: '#18181b',
  },
  {
    leftLabel: 'Local SQLite',
    leftIcon: Boxes,
    leftColor: '#fb923c',
    leftBg: 'rgba(251, 146, 60, 0.12)',
    leftBorder: '#fb923c',
    rightLabel: 'Replicate Cloud',
    rightIcon: Cloud,
    rightBg: '#ea580c',
    rightText: '#ffffff',
  },
]

const TECH_STACK = [
  'Next.js 15', 'React 19', 'Tailwind CSS', 'Zustand', 'Prisma',
  'FastAPI', 'Python', 'Tauri', 'TypeScript', 'Lucide Icons',
]

function AboutSection() {
  const openTab = useWorkspace((s) => s.openTab)

  return (
    <div className="space-y-6">
      {/* Identity & Status Tag Bar (Reference 4 style) */}
      <div className="rounded-[12px] border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[12px] bg-gradient-to-br from-ink to-ink-muted shadow-sm">
              <span className="text-[18px] font-bold text-canvas">K</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-ink">KOVAI</h2>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent border border-accent/20">
                  v0.1.0
                </span>
              </div>
              <p className="text-[12.5px] text-ink-muted">Local-first Creative Studio & AI Workspace</p>
            </div>
          </div>

          {/* Quick tactile status pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold shadow-2xs"
              style={{
                color: '#059669',
                backgroundColor: 'var(--color-badge-prompt-soft)',
                borderColor: 'var(--color-badge-prompt)',
              }}
            >
              <CheckCircle2 className="h-[12px] w-[12px]" />
              Approved
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold shadow-2xs"
              style={{
                color: '#0e7490',
                backgroundColor: 'var(--color-badge-vision-soft)',
                borderColor: 'var(--color-badge-vision)',
              }}
            >
              <Cloud className="h-[12px] w-[12px]" />
              Synced
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold shadow-2xs"
              style={{
                color: '#7c3aed',
                backgroundColor: 'var(--color-badge-create-soft)',
                borderColor: 'var(--color-badge-create)',
              }}
            >
              <ShieldCheck className="h-[12px] w-[12px]" />
              Private Runtime
            </span>
          </div>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
          KOVAI unifies high-performance cloud APIs with completely local open-source models.
          Every generation, prompt, and asset remains private on your machine unless you choose to proxy through cloud providers.
        </p>
      </div>

      {/* Capabilities with Color Highlights (Reference 1 & 5 style) */}
      <div className="rounded-[12px] border border-line bg-surface p-5 shadow-sm">
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <p className="text-[13.5px] font-semibold text-ink">Capabilities & Workspaces</p>
            <p className="text-[12px] text-ink-faint">Click any capability badge to navigate directly</p>
          </div>
          <span className="text-[11.5px] font-medium text-accent">9 Modules</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {FEATURE_BADGES.map((feat) => {
            const Icon = feat.icon
            return (
              <button
                key={feat.label}
                onClick={() => {
                  if (feat.kind === 'workflow') {
                    openTab({ kind: 'workflows', title: 'Workflows' })
                  } else {
                    openTab({ kind: feat.kind, title: feat.label })
                  }
                }}
                className="group flex items-center justify-between rounded-[10px] border p-2.5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-xs cursor-pointer"
                style={{
                  backgroundColor: feat.softVar,
                  borderColor: feat.colorVar,
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] transition-transform duration-200 group-hover:scale-110"
                    style={{ backgroundColor: 'var(--color-surface)', color: feat.colorVar }}
                  >
                    <Icon className="h-[14px] w-[14px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold" style={{ color: feat.colorVar }}>
                      {feat.label}
                    </p>
                    <p className="truncate text-[11px] text-ink-muted">{feat.description}</p>
                  </div>
                </div>
                {feat.command && (
                  <span
                    className="rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-mono font-semibold"
                    style={{ color: feat.colorVar, backgroundColor: 'rgba(255,255,255,0.4)' }}
                  >
                    {feat.command}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Dual Badge Showcase (Reference 3 exact style) */}
      <div className="rounded-[12px] border border-line bg-surface p-5 shadow-sm">
        <div className="mb-3.5">
          <p className="text-[13.5px] font-semibold text-ink">Engine & Provider Badge Styles</p>
          <p className="text-[12px] text-ink-faint">
            Matching subtle translucent pills (left) and solid vibrant pills (right) from design references
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Subtle Outline Pill Style
            </span>
            {DUAL_PILLS.map((pill) => {
              const LeftIcon = pill.leftIcon
              return (
                <div
                  key={pill.leftLabel}
                  className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium shadow-2xs transition-transform duration-150 hover:scale-[1.02]"
                  style={{
                    backgroundColor: pill.leftBg,
                    borderColor: pill.leftBorder,
                    color: pill.leftColor,
                  }}
                >
                  <LeftIcon className="h-[13px] w-[13px]" />
                  <span>{pill.leftLabel}</span>
                </div>
              )
            })}
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Solid Vibrant Pill Style
            </span>
            {DUAL_PILLS.map((pill) => {
              const RightIcon = pill.rightIcon
              return (
                <div
                  key={pill.rightLabel}
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold shadow-xs transition-transform duration-150 hover:scale-[1.02]"
                  style={{
                    backgroundColor: pill.rightBg,
                    color: pill.rightText,
                  }}
                >
                  <RightIcon className="h-[13px] w-[13px]" />
                  <span>{pill.rightLabel}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Team & Persona Badges (Reference 2 exact style) */}
      <div className="rounded-[12px] border border-line bg-surface p-5 shadow-sm">
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <p className="text-[13.5px] font-semibold text-ink">AI Specialist Roles</p>
            <p className="text-[12px] text-ink-faint">Autonomous agents orchestrated within KOVAI</p>
          </div>
          <span className="rounded-full bg-subtle border border-line px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            4 Personas
          </span>
        </div>

        <div className="divide-y divide-line/60">
          {SPECIALIST_ROLES.map((spec) => {
            const RoleIcon = spec.icon
            return (
              <div
                key={spec.name}
                className="flex items-center justify-between py-2.5 transition-colors duration-150 hover:bg-subtle/50 px-2 rounded-[8px]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-subtle border border-line text-[12px] font-bold text-ink">
                    {spec.name.slice(0, 1)}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-ink">{spec.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: spec.statusColor }}
                      />
                      <span className="text-[11px] text-ink-faint">{spec.status}</span>
                    </div>
                  </div>
                </div>

                {/* The role badge as shown in Reference 2 */}
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold shadow-2xs"
                  style={{
                    color: spec.roleColor,
                    backgroundColor: spec.roleSoft,
                    borderColor: spec.roleBorder,
                  }}
                >
                  <RoleIcon className="h-[12px] w-[12px]" />
                  {spec.role}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tactile Status Palette (Reference 4 full collection) */}
      <div className="rounded-[12px] border border-line bg-surface p-5 shadow-sm">
        <p className="mb-1 text-[13.5px] font-semibold text-ink">Tactile Status Tags</p>
        <p className="mb-3.5 text-[12px] text-ink-faint">
          Full palette of soft tactile tags with matching hue borders
        </p>

        <div className="flex flex-wrap gap-2">
          {STATUS_TAGS.map((tag) => {
            const TagIcon = tag.icon
            return (
              <span
                key={tag.label}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold shadow-2xs transition-transform duration-150 hover:scale-[1.04]"
                style={{
                  color: tag.color,
                  backgroundColor: tag.bg,
                  borderColor: tag.border,
                }}
              >
                <TagIcon className="h-[13px] w-[13px]" />
                {tag.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Tech Stack */}
      <div className="rounded-[12px] border border-line bg-surface p-5 shadow-sm">
        <p className="mb-3 text-[13.5px] font-semibold text-ink">Built With</p>
        <div className="flex flex-wrap gap-1.5">
          {TECH_STACK.map((tech) => (
            <span
              key={tech}
              className="rounded-[7px] border border-line bg-subtle px-2.5 py-1 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink hover:border-line-strong"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* Credits & External Links */}
      <div className="rounded-[12px] border border-line bg-surface p-5 shadow-sm">
        <p className="mb-2 text-[13.5px] font-semibold text-ink">Credits & Community</p>
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          Made with <Heart className="inline h-[12px] w-[12px] text-danger" /> by the KOVAI team.
          Powered by open-source vision, diffusion, and LLM architectures.
        </p>
        <div className="mt-3.5 flex gap-3">
          <a
            href="https://github.com/kovai"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft hover:border-accent"
          >
            GitHub
            <ExternalLink className="h-[11px] w-[11px]" />
          </a>
          <a
            href="https://docs.kovai.dev"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft hover:border-accent"
          >
            Documentation
            <ExternalLink className="h-[11px] w-[11px]" />
          </a>
        </div>
      </div>

      <p className="pb-4 text-center text-[11px] text-ink-faint">
        © {new Date().getFullYear()} KOVAI · All rights reserved
      </p>
    </div>
  )
}
