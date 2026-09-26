import type { TabKind } from '@/store/workspace'

/**
 * Which animated icon belongs to each destination.
 *
 * One map so the sidebar and the tab strip cannot drift apart. A kind with no
 * file here simply keeps its static icon — the animation is an enhancement, not
 * a requirement for a destination to exist.
 *
 * The icons are drawn in their own colours; nothing here recolours them. The
 * illustration is what tells one destination from another, and mapping all of
 * them onto a single interface hue threw that away.
 */
export const NAV_ICONS: Partial<Record<TabKind, string>> = {
  home: 'Home',
  chat: 'chat',
  create: 'create',
  vision: 'Vision',
  research: 'Research',
  projects: 'projects',
  project: 'projects',
  assets: 'assets',
  album: 'book_12756524',
  history: 'calendar_15542020',
  workflows: 'Workflows',
  workflow: 'Workflows',
  models: 'models',
  skills: 'copywriting_12756478',
  prompts: 'prompts',
  notes: 'notes',
  agents: 'Agents',
}
