'use client'

import { ChatWorkspace } from './chat-workspace'
import type { Tab } from '@/store/workspace'

/**
 * Research is chat with a different posture: structured answers, explicit
 * uncertainty and no invented sources. It shares the transport and the
 * transcript so nothing is duplicated to achieve that.
 */
export function ResearchWorkspace({ tab }: { tab: Tab }) {
  return <ChatWorkspace tab={tab} mode="research" />
}
