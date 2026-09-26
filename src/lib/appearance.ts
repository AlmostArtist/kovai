/**
 * The parts of the look a person can change.
 *
 * Every one of these resolves to CSS custom properties set on the document,
 * because that is where the whole interface already reads its colour and type
 * from. Nothing here is a class an individual component has to opt into, so a
 * screen written last week picks up a new accent without being touched.
 */

export interface Swatch {
  id: string
  label: string
  /** The accent, per theme, plus the soft ground it sits on. */
  light: { accent: string; soft: string }
  dark: { accent: string; soft: string }
}

/**
 * Accents, not a colour picker.
 *
 * Each of these is paired with a soft ground that holds up behind text in its
 * own theme. An arbitrary hex would break that pairing — the same purple that
 * reads well on white is unreadable at 12% on near-black — and a control that
 * lets you make the interface illegible is not a feature.
 */
export const ACCENTS: Swatch[] = [
  { id: 'indigo', label: 'Indigo', light: { accent: '#5751e0', soft: '#eeedfd' }, dark: { accent: '#8b87f5', soft: '#1d1b3a' } },
  { id: 'ocean', label: 'Ocean', light: { accent: '#0d74c4', soft: '#e5f1fb' }, dark: { accent: '#5aaef0', soft: '#0f2238' } },
  { id: 'jade', label: 'Jade', light: { accent: '#0a7d5a', soft: '#e2f4ec' }, dark: { accent: '#3dbf92', soft: '#0c2820' } },
  { id: 'amber', label: 'Amber', light: { accent: '#a96a06', soft: '#fbefdd' }, dark: { accent: '#e0a33f', soft: '#2e2110' } },
  { id: 'rose', label: 'Rose', light: { accent: '#c0355f', soft: '#fce8ee' }, dark: { accent: '#f0708f', soft: '#33141f' } },
  { id: 'graphite', label: 'Graphite', light: { accent: '#3f3f46', soft: '#eeeef0' }, dark: { accent: '#b4b4bd', soft: '#232327' } },
]

export interface TypeScale {
  id: string
  label: string
  /** Base size for answers, in px. The rest of the interface is unaffected. */
  reading: number
}

export const TYPE_SCALES: TypeScale[] = [
  { id: 'compact', label: 'Compact', reading: 14.5 },
  { id: 'default', label: 'Default', reading: 15.5 },
  { id: 'relaxed', label: 'Relaxed', reading: 16.5 },
  { id: 'large', label: 'Large', reading: 18 },
]

export interface ReadingFont {
  id: string
  label: string
  stack: string
}

export const READING_FONTS: ReadingFont[] = [
  { id: 'sans', label: 'Sans', stack: 'var(--font-sans)' },
  {
    id: 'serif',
    label: 'Serif',
    stack: 'ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif',
  },
  { id: 'mono', label: 'Mono', stack: 'var(--font-mono)' },
]

/**
 * The ground everything sits on.
 *
 * Only the canvas moves, never the surfaces above it. Tinting cards and panels
 * as well would leave every border and shadow tuned for a neutral ground
 * looking wrong, and the interface would need re-checking for contrast at every
 * option. Shifting the backdrop alone changes the whole feel and cannot break
 * anything sitting on it.
 */
export interface Ground {
  id: string
  label: string
  light: string
  dark: string
}

export const GROUNDS: Ground[] = [
  { id: 'neutral', label: 'Neutral', light: '#f6f6f5', dark: '#08080a' },
  { id: 'paper', label: 'Paper', light: '#f7f4ee', dark: '#0d0b08' },
  { id: 'slate', label: 'Slate', light: '#f1f3f6', dark: '#080a0e' },
  { id: 'moss', label: 'Moss', light: '#f1f5f1', dark: '#070b08' },
  { id: 'plum', label: 'Plum', light: '#f6f2f6', dark: '#0b070c' },
  { id: 'ink', label: 'Ink', light: '#eeeeee', dark: '#000000' },
]

/** A font the person brought themselves. */
export interface CustomFont {
  /** The family name the stylesheet will use. */
  family: string
  /** Where the file is served from. */
  url: string
}

export interface Appearance {
  accent: string
  typeScale: string
  readingFont: string
  /** Line height for answers — the other half of how dense a page feels. */
  airy: boolean
  /** Which canvas colour everything sits on. */
  ground: string
  /**
   * Home's scenery. 'scene' is the pair that ships; a URL is one they uploaded;
   * 'none' leaves the drawn gradient on its own.
   */
  wallpaper: 'scene' | 'none' | string
  /** How much of the wallpaper shows through, 0–100. */
  wallpaperStrength: number
  /** Imported fonts, and which of them is used where. */
  fonts: CustomFont[]
  interfaceFont: string | null
  customReadingFont: string | null
}

export const DEFAULT_APPEARANCE: Appearance = {
  accent: 'indigo',
  typeScale: 'default',
  readingFont: 'sans',
  airy: false,
  ground: 'neutral',
  wallpaper: 'scene',
  wallpaperStrength: 100,
  fonts: [],
  interfaceFont: null,
  customReadingFont: null,
}

/**
 * Writes the choices onto the document.
 *
 * Called again whenever the theme flips, because the accent has a different
 * value in each theme and the stylesheet's own `.dark` block would otherwise
 * win back the variable it set.
 */
export function applyAppearance(input: Appearance | undefined, dark: boolean): void {
  const appearance = { ...DEFAULT_APPEARANCE, ...(input ?? {}) }
  const root = document.documentElement

  const swatch = ACCENTS.find((a) => a.id === appearance.accent) ?? ACCENTS[0]
  const tones = dark ? swatch.dark : swatch.light
  const scale = TYPE_SCALES.find((t) => t.id === appearance.typeScale) ?? TYPE_SCALES[1]
  const ground = GROUNDS.find((g) => g.id === appearance.ground) ?? GROUNDS[0]

  const reading = appearance.customReadingFont
    ? `"${appearance.customReadingFont}", var(--font-sans)`
    : (READING_FONTS.find((f) => f.id === appearance.readingFont) ?? READING_FONTS[0]).stack

  root.style.setProperty('--color-accent', tones.accent)
  root.style.setProperty('--color-accent-soft', tones.soft)
  root.style.setProperty('--color-canvas', dark ? ground.dark : ground.light)
  root.style.setProperty('--reading-size', `${scale.reading}px`)
  root.style.setProperty('--reading-font', reading)
  root.style.setProperty('--reading-leading', appearance.airy ? '1.85' : '1.72')

  // The interface face is applied to the sans token itself, so every screen
  // picks it up without knowing anything about this setting.
  root.style.setProperty(
    '--font-sans',
    appearance.interfaceFont
      ? `"${appearance.interfaceFont}", ui-sans-serif, system-ui, sans-serif`
      : '',
  )

  applyFontFaces(appearance.fonts)
}

/**
 * Declares the imported fonts, in one style element that is rewritten whole.
 *
 * Appending a rule per font would leave the old ones behind every time the list
 * changed, and a family removed from settings would go on being loadable — so
 * the block is replaced rather than added to.
 */
function applyFontFaces(fonts: CustomFont[]): void {
  const id = 'kovai-custom-fonts'
  let style = document.getElementById(id) as HTMLStyleElement | null

  if (!fonts.length) {
    style?.remove()
    return
  }

  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }

  style.textContent = fonts
    .map(
      (font) =>
        `@font-face{font-family:"${font.family}";src:url("${font.url}");font-display:swap;font-weight:100 900}`,
    )
    .join('\n')
}
