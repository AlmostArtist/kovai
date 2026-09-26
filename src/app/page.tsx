import { AppShell } from '@/components/shell/app-shell'

/**
 * KOVAI runs as a single application surface. Navigation happens through tabs
 * inside the shell rather than page transitions, so state — a streaming answer,
 * a canvas, a half-written prompt — survives every move the user makes.
 */
export default function Page() {
  return <AppShell />
}
