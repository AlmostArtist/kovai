'use client'

import { useMemo, useState } from 'react'
import { Table2, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Charts inside an assistant response.
 *
 * A model can emit a ```chart fence holding a small JSON spec, and it is drawn
 * rather than printed as a code block. Everything is inline SVG — no charting
 * dependency, and it inherits the theme.
 *
 * The palette below is validated for colour-vision deficiency and contrast in
 * both light and dark surfaces. Slots are assigned in fixed order and never
 * cycled: a chart with more series than slots folds the tail into "Other"
 * instead of inventing hues that stop being distinguishable.
 */

const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']

export interface ChartSpec {
  type: 'bar' | 'line' | 'donut'
  title?: string
  /** Shown under the title; use it to state units or the source. */
  caption?: string
  series: { name: string; data: { label: string; value: number }[] }[]
}

export function parseChartSpec(source: string): ChartSpec | null {
  try {
    const raw = JSON.parse(source) as Partial<ChartSpec>
    if (!raw.type || !Array.isArray(raw.series) || !raw.series.length) return null
    const series = raw.series
      .filter((s) => Array.isArray(s?.data) && s.data.length)
      .map((s) => ({
        name: String(s.name ?? 'Series'),
        data: s.data
          .filter((d) => d && Number.isFinite(Number(d.value)))
          .map((d) => ({ label: String(d.label ?? ''), value: Number(d.value) })),
      }))
    if (!series.length) return null
    return { type: raw.type, title: raw.title, caption: raw.caption, series }
  } catch {
    return null
  }
}

export function ChartBlock({ spec }: { spec: ChartSpec }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [hover, setHover] = useState<{ x: number; y: number; label: string; rows: string[] } | null>(null)

  // Slots are fixed; a sixth series would not be distinguishable, so it is not drawn.
  const series = spec.series.slice(0, 5)
  const labels = useMemo(
    () => [...new Set(series.flatMap((s) => s.data.map((d) => d.label)))],
    [series],
  )
  const max = Math.max(...series.flatMap((s) => s.data.map((d) => d.value)), 0)
  const showLegend = series.length >= 2

  return (
    <figure className="not-prose my-4 overflow-hidden rounded-[14px] border border-line bg-surface">
      <header className="flex items-start gap-3 px-4 pb-1 pt-3.5">
        <div className="min-w-0 flex-1">
          {spec.title && (
            <figcaption className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-ink">
              {spec.title}
            </figcaption>
          )}
          {spec.caption && <p className="mt-0.5 text-[11.5px] text-ink-faint">{spec.caption}</p>}
        </div>
        <button
          onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
          title={view === 'chart' ? 'Show the numbers' : 'Show the chart'}
          className="shrink-0 rounded-[7px] border border-line p-1.5 text-ink-faint transition-colors hover:text-ink"
        >
          {view === 'chart' ? <Table2 className="h-3 w-3" /> : <BarChart3 className="h-3 w-3" />}
        </button>
      </header>

      {showLegend && (
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 px-4 pb-1 pt-1.5">
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
              <span
                className="h-[8px] w-[8px] shrink-0 rounded-[2px]"
                style={{ background: `var(--viz-${i})` }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}

      <div
        className="relative px-4 pb-4 pt-2"
        style={
          Object.fromEntries(
            SERIES_LIGHT.map((c, i) => [`--viz-${i}`, c]),
          ) as React.CSSProperties
        }
      >
        {/* The dark steps are chosen for the dark surface, not flipped from light. */}
        <style>{`.dark figure [style*="--viz-0"]{${SERIES_DARK.map((c, i) => `--viz-${i}:${c};`).join('')}}`}</style>

        {view === 'table' ? (
          <ChartTable labels={labels} series={series} />
        ) : spec.type === 'donut' ? (
          <Donut series={series} onHover={setHover} />
        ) : spec.type === 'line' ? (
          <Lines labels={labels} series={series} max={max} onHover={setHover} />
        ) : (
          <Bars labels={labels} series={series} max={max} onHover={setHover} />
        )}

        {hover && view === 'chart' && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[9px] border border-line bg-elevated px-2.5 py-1.5 shadow-[--shadow-float]"
            style={{ left: hover.x, top: hover.y - 8 }}
          >
            <p className="text-[11px] font-medium text-ink">{hover.label}</p>
            {hover.rows.map((row) => (
              <p key={row} className="text-[11px] text-ink-muted">
                {row}
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}

type HoverFn = (h: { x: number; y: number; label: string; rows: string[] } | null) => void

const format = (n: number) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(Math.round(n * 100) / 100)

function Bars({
  labels,
  series,
  max,
  onHover,
}: {
  labels: string[]
  series: ChartSpec['series']
  max: number
  onHover: HoverFn
}) {
  const H = 170
  const groupWidth = 100 / Math.max(labels.length, 1)
  // A 2px gap between adjacent fills keeps neighbouring bars from reading as one.
  const barWidth = groupWidth / series.length

  return (
    <div className="relative" style={{ height: H + 26 }}>
      {[0, 0.5, 1].map((t) => (
        <div
          key={t}
          className="absolute inset-x-0 border-t border-line"
          style={{ top: H - t * H }}
          aria-hidden
        />
      ))}

      <div className="absolute inset-x-0" style={{ height: H }}>
        {labels.map((label, li) =>
          series.map((s, si) => {
            const value = s.data.find((d) => d.label === label)?.value ?? 0
            const height = max > 0 ? (value / max) * H : 0
            return (
              <div
                key={`${label}-${s.name}`}
                className="absolute bottom-0 cursor-default transition-[height] duration-500"
                style={{
                  left: `calc(${li * groupWidth + si * barWidth}% + 1px)`,
                  width: `calc(${barWidth}% - 2px)`,
                  height: Math.max(height, value > 0 ? 3 : 0),
                  background: `var(--viz-${si})`,
                  borderRadius: '4px 4px 0 0',
                }}
                onMouseEnter={(e) => {
                  const box = e.currentTarget.getBoundingClientRect()
                  const parent = e.currentTarget.offsetParent?.getBoundingClientRect()
                  onHover({
                    x: box.left - (parent?.left ?? 0) + box.width / 2,
                    y: box.top - (parent?.top ?? 0),
                    label,
                    rows: series.map(
                      (t) => `${t.name}: ${format(t.data.find((d) => d.label === label)?.value ?? 0)}`,
                    ),
                  })
                }}
                onMouseLeave={() => onHover(null)}
              />
            )
          }),
        )}
      </div>

      <div className="absolute inset-x-0 flex" style={{ top: H + 6 }}>
        {labels.map((label) => (
          <span
            key={label}
            className="truncate text-center text-[10.5px] text-ink-faint"
            style={{ width: `${groupWidth}%` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function Lines({
  labels,
  series,
  max,
  onHover,
}: {
  labels: string[]
  series: ChartSpec['series']
  max: number
  onHover: HoverFn
}) {
  const H = 170
  const W = 100

  return (
    <div className="relative" style={{ height: H + 26 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }}>
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1="0"
            x2={W}
            y1={H - t * H}
            y2={H - t * H}
            stroke="var(--color-line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map((s, si) => {
          const points = labels.map((label, i) => {
            const value = s.data.find((d) => d.label === label)?.value ?? 0
            return [
              labels.length > 1 ? (i / (labels.length - 1)) * W : W / 2,
              max > 0 ? H - (value / max) * H : H,
            ] as const
          })
          return (
            <polyline
              key={s.name}
              points={points.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke={`var(--viz-${si})`}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>

      {/* Markers sit outside the stretched SVG so they stay circular. */}
      <div className="pointer-events-none absolute inset-x-0" style={{ height: H }}>
        {series.map((s, si) =>
          labels.map((label, i) => {
            const value = s.data.find((d) => d.label === label)?.value ?? 0
            return (
              <span
                key={`${s.name}-${label}`}
                className="pointer-events-auto absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: labels.length > 1 ? `${(i / (labels.length - 1)) * 100}%` : '50%',
                  top: max > 0 ? H - (value / max) * H : H,
                  background: `var(--viz-${si})`,
                  boxShadow: '0 0 0 2px var(--color-surface)',
                }}
                onMouseEnter={(e) => {
                  const box = e.currentTarget.getBoundingClientRect()
                  const parent = e.currentTarget.offsetParent?.getBoundingClientRect()
                  onHover({
                    x: box.left - (parent?.left ?? 0) + 4,
                    y: box.top - (parent?.top ?? 0),
                    label,
                    rows: series.map(
                      (t) => `${t.name}: ${format(t.data.find((d) => d.label === label)?.value ?? 0)}`,
                    ),
                  })
                }}
                onMouseLeave={() => onHover(null)}
              />
            )
          }),
        )}
      </div>

      <div className="absolute inset-x-0 flex justify-between" style={{ top: H + 6 }}>
        {labels.map((label) => (
          <span key={label} className="text-[10.5px] text-ink-faint">
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function Donut({ series, onHover }: { series: ChartSpec['series']; onHover: HoverFn }) {
  const data = series[0]?.data ?? []
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const R = 62
  const STROKE = 22
  const circumference = 2 * Math.PI * R

  let offset = 0

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 160 160" className="h-[160px] w-[160px] shrink-0 -rotate-90">
        {data.slice(0, 5).map((d, i) => {
          const fraction = total > 0 ? d.value / total : 0
          // A 2px gap keeps adjacent segments from merging into one shape.
          const length = Math.max(fraction * circumference - 2, 0)
          const dash = `${length} ${circumference - length}`
          const element = (
            <circle
              key={d.label}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={`var(--viz-${i})`}
              strokeWidth={STROKE}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              className="cursor-default transition-[stroke-dasharray] duration-500"
              onMouseEnter={(e) => {
                const box = e.currentTarget.getBoundingClientRect()
                const parent = e.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect()
                onHover({
                  x: box.left - (parent?.left ?? 0) + box.width / 2,
                  y: box.top - (parent?.top ?? 0) + 20,
                  label: d.label,
                  rows: [`${format(d.value)} · ${Math.round(fraction * 100)}%`],
                })
              }}
              onMouseLeave={() => onHover(null)}
            />
          )
          offset += fraction * circumference
          return element
        })}
      </svg>

      {/* Direct labels, so identity never rests on colour alone. */}
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.slice(0, 5).map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-[12px]">
            <span
              className="h-[8px] w-[8px] shrink-0 rounded-[2px]"
              style={{ background: `var(--viz-${i})` }}
            />
            <span className="min-w-0 flex-1 truncate text-ink">{d.label}</span>
            <span className="shrink-0 font-mono text-[11.5px] text-ink-muted">
              {total > 0 ? `${Math.round((d.value / total) * 100)}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The numbers behind the picture — always reachable, never a separate export. */
function ChartTable({ labels, series }: { labels: string[]; series: ChartSpec['series'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-line">
            <th className="py-1.5 pr-3 text-left font-medium text-ink-muted">Label</th>
            {series.map((s) => (
              <th key={s.name} className="py-1.5 pl-3 text-right font-medium text-ink-muted">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label) => (
            <tr key={label} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-3 text-ink">{label}</td>
              {series.map((s) => (
                <td key={s.name} className="py-1.5 pl-3 text-right font-mono text-ink-muted">
                  {format(s.data.find((d) => d.label === label)?.value ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { cn }
