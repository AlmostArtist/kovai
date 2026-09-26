import { POST as chatPOST } from '../chat/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Vision is chat with image attachments. It has its own route so the interface
 * and the usage ledger can distinguish the two, but the transport is identical
 * — including the rule that local vision never passes through this process.
 */
export const POST = chatPOST
