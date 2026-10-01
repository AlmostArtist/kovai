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


/* ── Story Scene ──────────────────────────────────────────────

  The second template, and the simpler one. No cutout, no compositing, no
  flat backdrop: the model draws the whole picture, scene included, and what
  comes back is what you get. Fewer moving parts is the point — the only
  thing that has to go right is the face.
*/

/**
 * Keeping the likeness while changing everything else.
 *
 * The hard part of this template is that the two instructions pull against
 * each other: "make them a superhero mid-leap over a burning city" and "this
 * must still look like the person in the photograph". Models resolve that
 * tension by drifting towards a generic heroic face, so the identity clause
 * is stated first, stated concretely, and stated as non-negotiable.
 */
const STORY_COMMON = `You are drawing a scene from a brief, starring the real person in the supplied photograph.

IDENTITY — this overrides everything below:
The character is this specific person. Keep the proportions of their face, the shape of the jaw, nose, brow and lips, the eye shape, spacing and colour, the hairline and hairstyle, the skin tone, and any facial hair, glasses or distinctive features. Their face must be clearly visible and unobstructed, and someone who knows them must recognise them at a glance. Do not beautify, slim, age, de-age, or substitute a more conventionally heroic face. Where the brief and the likeness conflict, the likeness wins.

THE SCENE:
Build the whole picture from the brief — the action, the setting, the wardrobe, the time of day, the weather, the mood. Put the person in it as the subject rather than a bystander: they should be the clear focal point, well lit, and large enough in frame that the face reads. A single figure unless the brief explicitly calls for more. Compose it like a frame from a film rather than a portrait with a backdrop pasted behind it — the light on the person must match the light in the scene, including its colour, direction and hardness.

CRAFT:
Deliberate composition with a clear focal point and depth. Consistent perspective. Anatomically sound hands and limbs. Readable silhouette. No text, letters, numbers, watermarks, signatures or logos anywhere in the image.`

const STORY_NEGATIVE = [
  'a different person, altered facial proportions, generic or idealised face',
  'face obscured, turned away, cropped, in deep shadow or behind a mask',
  'extra people, duplicated limbs, extra fingers, malformed hands',
  'flat pasted-on subject whose lighting does not match the scene',
  'text, watermark, signature, logo, caption, speech bubble',
  'blurry, low resolution, jpeg artifacts, heavy grain, oversaturated',
].join(', ')

/**
 * The same looks, aimed at a whole scene rather than a portrait.
 *
 * Separate from the portrait styles on purpose: "cel shading on the skin with
 * a rim light along the jaw" is direction for a face, and says nothing useful
 * about how to draw a burning city behind it.
 */
const STORY_STYLES: TemplateStyle[] = [
  {
    id: 'anime',
    label: 'Anime',
    hint: 'Cinematic anime key frame',
    direction: `A key frame from a high-budget anime feature. Cel-shaded characters with clean varied linework over richly painted backgrounds — the contrast between flat character art and detailed scenery is the look. Dramatic perspective, speed lines or motion smears where there is movement, expressive lighting with visible god rays, lens flare and atmospheric haze. Saturated skies, hand-painted clouds, and the deep colour grading of a film rather than a television episode.`,
  },
  {
    id: 'cartoon',
    label: 'Cartoon',
    hint: 'Western animated feature',
    direction: `A frame from a modern Western animated feature. Bold confident outlines, simplified but purposeful shapes, flat colour with one shadow and one highlight tone. Exaggerated, readable poses with real weight and follow-through. Warm saturated palette, friendly stylisation, and staging that reads instantly at thumbnail size.`,
  },
  {
    id: 'action',
    label: 'Action film',
    hint: 'Live-action blockbuster still',
    direction: `A photographic still from a big-budget action film. Shot on anamorphic lenses — shallow depth of field, oval bokeh, horizontal flares. Hard directional key light with strong practical sources, deep contrast, teal-and-amber grade. Real atmosphere in the air: smoke, dust, embers, rain, backlit. Motion caught at a decisive moment with slight motion blur in the extremities. Photoreal skin and fabric, grounded physics, the gravity of a real camera on a real set.`,
  },
  {
    id: 'comic',
    label: 'Comic book',
    hint: 'Inked and coloured panel',
    direction: `A full-bleed comic book panel. Brush-inked linework with heavy weight variation and decisive spot blacks. Dynamic foreshortened perspective, heroic proportions, a low camera for scale. Flat colour over the ink with halftone texture in the shadows and bold complementary colour holds. The staging of a splash page — one unmistakable focal point, everything else driving the eye to it.`,
  },
  {
    id: 'pixar',
    label: '3D animated',
    hint: 'Feature-film 3D render',
    direction: `A frame from a modern 3D animated feature. Stylised but physically plausible: subsurface scattering in the skin, groomed hair, believable cloth simulation. Cinematic three-point lighting with warm key, cool bounce and a clean rim. Soft global illumination, gentle depth of field, polished surfacing. Appealing, warm, and rendered to the standard of a finished shot rather than a test.`,
  },
  {
    id: 'noir',
    label: 'Film noir',
    hint: 'High-contrast black and white',
    direction: `A black and white frame in the noir tradition. Hard single-source key light raking across the scene, venetian-blind shadows, deep inky blacks and specular highlights with almost nothing in between. Wet streets, rising steam, cigarette haze catching the light. Dutch angles and low cameras. Grainy, high-contrast monochrome stock with crushed shadows that still hold the face.`,
  },
  {
    id: 'watercolour',
    label: 'Watercolour',
    hint: 'Loose painted illustration',
    direction: `A watercolour illustration on cold-pressed paper. Transparent layered washes with visible granulation, blooms and hard-edged drying marks. Loose confident brushwork that leaves the paper breathing at the edges of the composition. A limited harmonious palette, wet-on-wet skies, and the darkest accents dropped in last. Hand-made throughout — no digital smoothness anywhere.`,
  },
  {
    id: 'pixel',
    label: 'Pixel art',
    hint: '16-bit scene',
    direction: `A detailed pixel art scene in a 16-bit console register. A deliberate pixel grid with every pixel placed on purpose. A tight indexed palette, dithered gradients in the sky and lighting, parallax-style depth with distinct foreground, midground and background layers. Clean readable character sprites with dark outlines, and the composed staging of a cutscene rather than a gameplay screenshot.`,
  },
]

export const TEMPLATES: Template[] = [
  {
    id: 'story-scene',
    name: 'Story Scene',
    tagline: 'Put yourself in the story',
    description:
      'Upload a photo, choose a look, and write what happens. You are drawn into the scene you describe — the action, the setting, the light — with your own face.',
    cover: lin(160, [
      [0, '#0B1026'],
      [0.3, '#1C2A5E'],
      [0.6, '#C1440E'],
      [0.85, '#F07B3F'],
      [1, '#FFD460'],
    ]),
    inputHint: 'A clear, well-lit photo of your face, looking at the camera.',
    steps: ['Describe the scene', 'Pick how it should be drawn', 'You are the subject of it'],
    story: {
      label: 'The story',
      placeholder:
        'A rooftop at dusk, rain coming down, cape snapping in the wind — standing over a city that has just been saved…',
      hint: 'What happens, where, and how it should feel. Detail helps.',
      examples: [
        'A superhero landing in a crater on a rain-slick street, cape torn, city burning behind, lit by emergency lights',
        'A lone astronaut on a red desert planet at sunrise, helmet under one arm, two moons in the sky',
        'A 1940s detective in a smoky office, rain on the window, a single desk lamp, hat tipped low',
        'A samurai standing in falling cherry blossom at dawn, hand resting on the hilt, mist across the valley',
      ],
    },
    providerId: 'kie',
    models: [
      'seedream/5-pro-image-to-image',
      'seedream/5-flash-image-to-image',
      'seedream/5-lite-image-to-image',
      'seedream/4.5-edit',
      'bytedance/seedream-v4-edit',
    ],
    styles: STORY_STYLES,
    // Not used — this template composes nothing — but the picker shows the
    // first as the card's accent and the type requires a list.
    backgrounds: BACKGROUNDS,
    params: {
      aspectRatio: '16:9',
      quality: 'high',
      outputFormat: 'png',
    },
    buildPrompt: ({ style, story }) =>
      [
        STORY_COMMON,
        `THE BRIEF — this is the scene to draw:\n${(story ?? '').trim()}`,
        `STYLE — render the whole image in this and nothing else:\n${style.direction}`,
        `AVOID: ${STORY_NEGATIVE}.`,
        'Produce one finished image of this scene, with the person from the photograph as its subject and their face clearly recognisable.',
      ].join('\n\n'),
  },
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
    // Preference order, resolved against the account's live catalogue.
    //
    // Image-to-image, not text-to-image: the whole job is to redraw a
    // photograph that the user supplied, and a text-to-image model given a
    // reference is a different and much weaker operation. The earlier version
    // of this list named models KIE has never heard of, which is why every run
    // came back "the model name you specified is not supported".
    models: [
      'seedream/5-pro-image-to-image',
      'seedream/5-flash-image-to-image',
      'seedream/5-lite-image-to-image',
      'seedream/4.5-edit',
      'bytedance/seedream-v4-edit',
    ],
    styles: STYLES,
    backgrounds: BACKGROUNDS,
    /*
      Exactly the keys this model documents, and no others.

      `image_size` was wrong — Seedream 5 image-to-image takes `quality`, and a
      key a model does not recognise is quietly ignored rather than refused, so
      the wrong one costs you a worse picture and tells you nothing.

      PNG rather than JPEG matters more than it looks: the cutout keys on the
      flat backdrop, and JPEG ringing around a high-contrast edge is exactly
      the artefact that leaves a halo behind.
    */
    params: {
      aspectRatio: '3:4',
      quality: 'high',
      outputFormat: 'png',
    },
    buildPrompt: ({ style }) =>
      [
        COMMON,
        `STYLE — render the portrait in this and nothing else:\n${style.direction}`,
        `AVOID: ${NEGATIVE}.`,
        `Produce one image: this person, in that style, centred on a flat ${MATTE_COLOUR} magenta background, with no shadow on the background and nothing touching the frame edge.`,
      ].join('\n\n'),
  },
]

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
