/**
 * Templates.
 *
 * A template is a finished piece of work with two or three decisions left in
 * it. Everything else — which model runs, what it is asked, how the result is
 * cut out and assembled — is the template's business and never the user's.
 *
 * That split is the whole point, and it is enforced by the types rather than
 * by discipline: `Template` carries the model and the prompt builder and never
 * leaves the server, and `PublicTemplate` is what the interface is given. A
 * component cannot render a model id it was never sent.
 */

/** A look the subject can be rendered in. */
export interface TemplateStyle {
  id: string
  label: string
  /** One line, shown under the name in the picker. */
  hint: string
  /**
   * The part of the prompt that describes this look.
   *
   * Written as direction to an illustrator rather than as keywords: the
   * medium, the line, the colour, the shading. Keyword soup produces an
   * average of everything the words have ever meant, which is why so much
   * generated art looks like the same picture.
   */
  direction: string
}

/** One colour stop, positioned 0–1 along the gradient. */
export interface GradientStop {
  at: number
  color: string
}

/**
 * A background, described once.
 *
 * Not a CSS string. The picker renders these with CSS and the compositor
 * paints them onto a canvas, and a CSS string only serves the first — the
 * second would need it parsed back out again. Describing the gradient instead
 * means both renderers read the same numbers, so the image you export is the
 * swatch you chose rather than something close to it.
 */
export interface BackgroundSpec {
  kind: 'linear' | 'radial'
  /** Linear only. Degrees, CSS convention: 0 points up, 90 points right. */
  angle?: number
  /** Radial only. Centre and radii as fractions of the canvas. */
  cx?: number
  cy?: number
  rx?: number
  ry?: number
  stops: GradientStop[]
}

/** Something to stand the subject in front of. */
export interface TemplateBackground {
  id: string
  label: string
  spec: BackgroundSpec
  /** Rough brightness, so the cutout can be given a matching edge light. */
  tone: 'light' | 'dark'
}

/** What the browser is allowed to know about a template. */
export interface PublicTemplate {
  id: string
  name: string
  tagline: string
  description: string
  /** The card's artwork. */
  cover: BackgroundSpec
  steps: string[]
  styles: { id: string; label: string; hint: string }[]
  backgrounds: TemplateBackground[]
  /** What the subject photograph should be, in one line. */
  inputHint: string
}

/** The server-side definition. */
export interface Template extends Omit<PublicTemplate, 'styles'> {
  styles: TemplateStyle[]
  /**
   * Model ids in order of preference. The first one the provider actually
   * lists is used, so a newer model is picked up the moment the account has
   * it without anyone editing a constant.
   */
  models: string[]
  providerId: 'kie'
  /** Builds the instruction sent to the model. */
  buildPrompt(input: { style: TemplateStyle }): string
  /** Model parameters that are not the prompt. */
  params: Record<string, unknown>
}

/** Drops everything the interface has no business knowing. */
export function toPublic(template: Template): PublicTemplate {
  return {
    id: template.id,
    name: template.name,
    tagline: template.tagline,
    description: template.description,
    cover: template.cover,
    steps: template.steps,
    inputHint: template.inputHint,
    backgrounds: template.backgrounds,
    styles: template.styles.map((s) => ({ id: s.id, label: s.label, hint: s.hint })),
  }
}
