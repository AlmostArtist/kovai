import 'server-only'

import { fileStore } from './file-store'
import type { KovaiStore } from './types'

export type * from './types'

let cached: Promise<KovaiStore> | null = null

/**
 * Returns the active store: Postgres when DATABASE_URL is configured and the
 * Prisma client has been generated, otherwise the built-in file store.
 *
 * The fallback is announced once rather than failing the request — a missing
 * database should never take the workspace down.
 */
export function store(): Promise<KovaiStore> {
  cached ??= resolve()
  return cached
}

async function resolve(): Promise<KovaiStore> {
  if (!process.env.DATABASE_URL?.trim()) return fileStore
  try {
    const { createPrismaStore } = await import('./prisma-store')
    return await createPrismaStore()
  } catch (err) {
    console.warn(
      '[kovai] DATABASE_URL is set but the Prisma client is unavailable — falling back to the file store.\n' +
        '       Run `npx prisma generate && npx prisma db push` to enable Postgres.\n',
      err instanceof Error ? err.message : err,
    )
    return fileStore
  }
}
