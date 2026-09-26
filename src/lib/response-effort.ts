/**
 * How much answer to ask for.
 *
 * One control, five settings, from a one-line reply to a full treatment with
 * tables and charts. It changes two things and nothing else: the ceiling on the
 * reply, and the shape the model is asked to use.
 *
 * What it must never do is ask for padding. A question with a one-line answer
 * has a one-line answer at every setting — Max means "leave nothing out that
 * matters", not "write more". Every directive below says so explicitly, because
 * a model told to be thorough will otherwise invent thoroughness, and three
 * paragraphs of preamble around a single fact is a worse answer, not a longer
 * one.
 */

export type Effort = 'low' | 'medium' | 'high' | 'extra' | 'max'

export interface EffortSpec {
  id: Effort
  label: string
  /** One line under the label in the menu. */
  hint: string
  /**
   * Ceiling on the generation, in tokens.
   *
   * A safety net on cost and time, not the thing that decides length — the
   * directive does that. It sits well above what each setting should actually
   * produce, because a reasoning model spends this same budget thinking before
   * it writes: set it tight enough to be the real limit and a thoughtful model
   * runs out mid-sentence, which is a broken answer rather than a short one.
   */
  maxTokens: number
  /** Appended to the response style. */
  directive: string
  /** A warning worth reading before choosing it. */
  caution?: string
}

export const EFFORTS: EffortSpec[] = [
  {
    id: 'low',
    label: 'Low',
    hint: 'A sentence or two',
    maxTokens: 700,
    directive: `Reply with one or two sentences of plain prose and stop.

No headings. No bullet lists. No tables. No charts. No preamble and no summary of what you just said.
A prompt, caption or copy fence is the exception and is still wanted: it is how the person gets the text out, not decoration. Put the text in one and say nothing else around it.
If the question genuinely cannot be answered that briefly, give the shortest honest answer and name what you left out in the same breath.`,
  },
  {
    id: 'medium',
    label: 'Medium',
    hint: 'A few paragraphs where they help',
    maxTokens: 1_600,
    directive: `Answer directly in the first sentence, then develop it in a few short paragraphs.

Reach for a heading, a table or a chart only where one genuinely earns its place. Most answers at this length need none.
A quick factual question gets a quick factual answer — do not inflate it to fill the space.`,
  },
  {
    id: 'high',
    label: 'High',
    hint: 'Sections, and a table where one fits',
    maxTokens: 3_200,
    directive: `Lead with the direct answer, then work through it under ## headings.

Answer the obvious follow-up question before it is asked.
Depth here means covering more ground, not decorating it: reach for a table or a chart only if the content is already tabular or already a series. Prose remains the default.`,
  },
  {
    id: 'extra',
    label: 'Extra',
    hint: 'Full treatment with tables and charts',
    maxTokens: 6_000,
    directive: `Lead with the direct answer in two or three sentences, then give the full treatment under ## headings.

Name the assumptions you are working from, and the cases where the answer would be different.
Close with a short "What I would do" — your actual recommendation, not a restatement of the options.
Length comes from substance. A table or a chart is still only for content that is genuinely tabular or genuinely numeric; do not add one to make the answer look thorough.`,
  },
  {
    id: 'max',
    label: 'Max',
    hint: 'Exhaustive — every angle, slowly',
    maxTokens: 12_000,
    caution: 'Much slower, and heavy on a local model',
    directive: `Treat this as the definitive answer. Lead with the direct answer, then go through it exhaustively under ## headings.
Cover edge cases, failure modes, alternatives you rejected and why, and what you are uncertain about.
Show your working where it is load-bearing. Tables and charts stay optional even here — use one only where the content is already a comparison across shared axes, or already a series of real figures.
Depth must come from substance. If a section would only restate another one, leave it out — a shorter honest answer beats a padded one even here.`,
  },
]

export const DEFAULT_EFFORT: Effort = 'medium'

export function effortSpec(effort: Effort | undefined): EffortSpec {
  return EFFORTS.find((e) => e.id === effort) ?? EFFORTS.find((e) => e.id === DEFAULT_EFFORT)!
}

/** The style prompt with this setting's shape instructions applied. */
export function withEffort(style: string, effort: Effort | undefined): string {
  const spec = effortSpec(effort)
  return `${style}

## Length and depth for this answer — "${spec.label}"

${spec.directive}`
}
