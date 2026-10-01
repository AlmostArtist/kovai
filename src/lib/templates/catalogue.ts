import type { Template, TemplateStyle } from './types'

/**
 * The templates.
 *
 * One for now. The shape is built for more: everything specific to a template
 * — its styles, its backgrounds, its prompt, its model — lives inside its own
 * entry, so a second template is an object in this array and nothing else.
 */

/**
 * The colour the subject is asked to stand against.
 *
 * Cutting a person out of an arbitrary background is a hard problem that needs
 * a matting model. Cutting them out of a flat, saturated colour nobody has in
 * their hair is arithmetic. So rather than solving the hard problem later, the
 * prompt avoids creating it: the model is told to put the subject on a single
 * uniform colour, and the cutout keys on whatever colour actually came back.
 *
 * Magenta rather than the traditional green because green spills onto skin and
 * reads as a colour cast, and because almost nothing in a portrait — hair,
 * skin, eyes, most clothing — is anywhere near it.
 */
export const MATTE_COLOUR = '#FF00C8'

/**
 * Shared direction, given to every style.
 *
 * Three jobs. Keep the person recognisable, because a stylised portrait that
 * is not of you is just a drawing. Produce something that can actually be cut
 * out: whole subject, nothing leaving the frame, one flat colour behind.
 * And leave the background empty of everything, including the shadow the
 * subject would cast on it — a shadow keys out as background and takes a bite
 * out of the shoulder with it.
 */
const COMMON = `You are redrawing a real person from the supplied photograph. This is a portrait of someone specific, not an illustration of a generic character.

IDENTITY — the single most important requirement:
Preserve what makes this face recognisably theirs. Match the proportions of the face, the shape of the jaw, nose, brow and lips, the eye shape and spacing, the hairline and the exact hairstyle, the skin tone, and any facial hair, glasses or distinctive features. Keep their clothing, its colour and its cut. Someone who knows this person must recognise them immediately. Do not beautify, do not slim, do not change their age, and do not substitute a conventionally attractive face.

FRAMING:
Single subject, facing the camera, in the same pose as the photograph. Head and shoulders through to mid-torso, centred, with clear space above the head and on both sides. Nothing may touch or cross the edge of the frame — no cropped shoulders, no hair leaving the top. The subject must sit entirely inside the image with room around them.

BACKGROUND — follow this exactly:
A single flat, uniform, fully saturated magenta (${MATTE_COLOUR}). The whole background, edge to edge, is this one colour. No gradient, no vignette, no texture, no pattern, no props, no scenery, no floor, no horizon line. No drop shadow and no contact shadow anywhere on the background — the subject must not cast a shadow onto it. Nothing behind the subject at all except that one flat colour.

EDGES:
Clean, deliberate separation between the subject and the background. Hair rendered as defined shapes and strands rather than a soft haze, so the outline stays readable. No motion blur, no glow, no bloom, no lens effects bleeding the subject into the background.

Do not write any text, letters, numbers, watermarks, signatures or logos anywhere in the image.`

const NEGATIVE = [
  'photorealistic skin texture where a drawn style was asked for',
  'extra people, duplicated limbs, extra fingers, malformed hands',
  'cropped head, cropped shoulders, subject touching the frame edge',
  'background scenery, furniture, props, floor, horizon, patterned backdrop',
  'gradient background, textured background, vignette',
  'drop shadow or contact shadow on the background',
  'text, watermark, signature, logo, caption',
  'different person, altered facial proportions, beautified or slimmed face',
  'blurry, low resolution, jpeg artifacts, oversaturated, heavy grain',
].join(', ')

const STYLES: TemplateStyle[] = [
  {
    id: 'anime',
    label: 'Anime',
    hint: 'Modern cel-shaded anime',
    direction: `Modern Japanese anime, in the register of a high-budget television production rather than a quick illustration. Clean confident linework of varying weight, heavier on the silhouette and lighter inside. Cel shading in two or three discrete tones per surface with hard-edged boundaries — no airbrushed gradients on the skin. Large expressive eyes with a visible iris gradient, a sharp specular highlight and a second smaller bounce light, but keep the eye spacing and shape true to the photograph. Hair drawn as grouped strands and wedges with a clear highlight band across the crown. Skin kept clean and flat with a soft blush at the cheeks and a single rim light along the jaw and shoulder.`,
  },
  {
    id: 'cartoon',
    label: 'Cartoon',
    hint: 'Western animation, bold and warm',
    direction: `Contemporary Western television animation. Bold, even outlines and simplified shapes — features reduced to their clearest form while staying unmistakably this person. Flat colour fills with one shadow tone and one highlight tone, no blending. Slightly enlarged head and eyes relative to the body, warm saturated palette, friendly open expression. The appeal of a well-designed character model sheet: every shape readable at a glance, nothing fussy.`,
  },
  {
    id: 'flat2d',
    label: '2D vector',
    hint: 'Flat editorial illustration',
    direction: `Flat 2D vector illustration in a modern editorial style. Built entirely from clean geometric shapes with no outlines at all — forms separated by colour alone. A tightly restricted palette of five or six flat colours, no gradients and no rendering. Shadows are single flat shapes at a consistent angle. Features reduced to their most essential marks while keeping the proportions of the real face. The poise of a good brand illustration: confident, graphic and deliberately simple.`,
  },
  {
    id: 'pixar',
    label: '3D animated',
    hint: 'Feature-film 3D character',
    direction: `Stylised 3D character rendering in the manner of a modern animated feature. Soft subsurface scattering through the skin, particularly the ears and the nose. Slightly exaggerated proportions — a marginally larger head and eyes — with a believable underlying skull. Hair as a sculpted, groomed mass rather than individual strands. Three-point studio lighting: a warm key, a cool fill and a clean rim separating the shoulders from behind. Soft, physically plausible shading with gentle specular falloff on the skin. Polished, warm and cinematic.`,
  },
  {
    id: 'comic',
    label: 'Comic book',
    hint: 'Inked panel with halftone',
    direction: `American comic book interior art. Confident brush-inked linework with real weight variation and deliberate spot blacks in the hair and under the jaw. Cross-hatching for the mid-tones. Flat colour over the ink with visible halftone dot texture in the shadow areas. Slightly heroic proportions and a strong graphic read, the whole thing lit as though by a hard single source from the upper left.`,
  },
  {
    id: 'watercolour',
    label: 'Watercolour',
    hint: 'Loose painted portrait',
    direction: `Traditional watercolour portrait on cold-pressed paper. Transparent washes that let the paper show through, with visible granulation and soft blooms where pigment has pooled. Loose confident edges that break and reform, left deliberately unfinished at the shoulders. A limited palette layered wet-on-wet for the skin, with the darkest accents dropped in at the last moment while the paper is still damp. Light, airy, and unmistakably hand-painted — no digital smoothness.`,
  },
  {
    id: 'pixel',
    label: 'Pixel art',
    hint: 'Hand-placed 16-bit sprite',
    direction: `Hand-crafted pixel art portrait in a 16-bit console register. A deliberately coarse pixel grid with every pixel placed on purpose — no resampling or scaling artefacts. A tight indexed palette of roughly sixteen colours. Dithering used sparingly for the gradients on the skin and hair. Clean anti-aliased pixel clusters on the curves, a dark outline hugging the silhouette, and the features reduced to a handful of well-chosen pixels that still read as this specific face.`,
  },
  {
    id: 'noir',
    label: 'Ink noir',
    hint: 'High-contrast black and white',
    direction: `High-contrast black and white ink illustration in a noir register. Almost no mid-tones — the image resolves into decisive pools of solid black and clean white paper, with hatching only where a transition is unavoidable. Dramatic single-source lighting raking across the face from one side, leaving half of it in shadow while keeping the eye on the dark side readable. Bold graphic shapes, heavy blacks in the hair and clothing, and a deliberate, almost woodcut-like confidence to every mark.`,
  },
]

const lin = (angle: number, stops: [number, string][]) => ({
  kind: 'linear' as const,
  angle,
  stops: stops.map(([at, color]) => ({ at, color })),
})

const rad = (rx: number, ry: number, cx: number, cy: number, stops: [number, string][]) => ({
  kind: 'radial' as const,
  rx,
  ry,
  cx,
  cy,
  stops: stops.map(([at, color]) => ({ at, color })),
})

const BACKGROUNDS = [
  {
    id: 'studio-warm',
    label: 'Warm studio',
    tone: 'light' as const,
    spec: rad(0.6, 0.48, 0.5, 0.18, [
      [0, '#FFF3E2'],
      [0.38, '#FFD9A8'],
      [0.72, '#E9A864'],
      [1, '#C07E3F'],
    ]),
  },
  {
    id: 'studio-cool',
    label: 'Cool studio',
    tone: 'light' as const,
    spec: rad(0.6, 0.48, 0.5, 0.2, [
      [0, '#F4F8FF'],
      [0.4, '#D8E6FA'],
      [0.74, '#A8C4E8'],
      [1, '#7A9BC4'],
    ]),
  },
  {
    id: 'sunset',
    label: 'Sunset',
    tone: 'dark' as const,
    spec: lin(170, [
      [0, '#2B1055'],
      [0.28, '#6B2D7B'],
      [0.56, '#C64D76'],
      [0.8, '#F28C5A'],
      [1, '#FFCF7A'],
    ]),
  },
  {
    id: 'deep-space',
    label: 'Deep space',
    tone: 'dark' as const,
    spec: rad(0.55, 0.4, 0.5, 0.3, [
      [0, '#2A2F6B'],
      [0.42, '#161A3C'],
      [1, '#080A18'],
    ]),
  },
  {
    id: 'neon',
    label: 'Neon city',
    tone: 'dark' as const,
    spec: lin(145, [
      [0, '#0B0A1F'],
      [0.34, '#1B0E3C'],
      [0.62, '#5A1A6B'],
      [0.84, '#C21E8A'],
      [1, '#FF4FA3'],
    ]),
  },
  {
    id: 'pastel',
    label: 'Soft pastel',
    tone: 'light' as const,
    spec: lin(150, [
      [0, '#FFE5F1'],
      [0.34, '#E6E1FF'],
      [0.68, '#D9F2FF'],
      [1, '#E8FFF4'],
    ]),
  },
  {
    id: 'forest',
    label: 'Forest',
    tone: 'dark' as const,
    spec: rad(0.58, 0.45, 0.48, 0.24, [
      [0, '#4F7A52'],
      [0.4, '#2E5236'],
      [1, '#16301F'],
    ]),
  },
  {
    id: 'onyx',
    label: 'Onyx & gold',
    tone: 'dark' as const,
    spec: rad(0.55, 0.42, 0.5, 0.26, [
      [0, '#3A3226'],
      [0.46, '#1E1A14'],
      [1, '#0A0908'],
    ]),
  },
]

export const TEMPLATES: Template[] = [
  {
    id: 'portrait-studio',
    name: 'Portrait Studio',
    tagline: 'Your photo, redrawn and placed',
    description:
      'Upload a photograph, choose how it should be drawn and what it should stand in front of. The portrait is restyled, cut out, and set onto the background you picked — then handed to you as layers you can still move.',
    cover: lin(135, [
      [0, '#2B1055'],
      [0.3, '#6B2D7B'],
      [0.58, '#C64D76'],
      [0.82, '#F28C5A'],
      [1, '#FFCF7A'],
    ]),
    inputHint: 'A clear, well-lit photo of one person, facing the camera.',
    steps: [
      'Redraw the subject in the chosen style',
      'Lift them off the background',
      'Set them onto your scene',
    ],
    providerId: 'kie',
    // Preference order. Whichever of these the account actually has is used,
    // so a newer release is picked up without editing this file.
    models: ['bytedance/seedream-v5', 'bytedance/seedream-v4'],
    styles: STYLES,
    backgrounds: BACKGROUNDS,
    params: {
      imageSize: '2K',
      aspectRatio: '3:4',
      negativePrompt: NEGATIVE,
    },
    buildPrompt: ({ style }) =>
      `${COMMON}\n\nSTYLE — render the portrait in this and nothing else:\n${style.direction}\n\nProduce one image: this person, in that style, centred on a flat ${MATTE_COLOUR} magenta background, with no shadow on the background and nothing touching the frame edge.`,
  },
]

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
