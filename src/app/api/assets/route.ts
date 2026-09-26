import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { Asset } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams
    const db = await store()
    const assets = await db.assets.list({
      projectId: params.get('projectId') ?? undefined,
      kind: (params.get('kind') as Asset['kind']) ?? undefined,
      origin: (params.get('origin') as Asset['origin']) ?? undefined,
      favorite: params.get('favorite') === 'true' ? true : undefined,
    })
    return ok({ assets })
  } catch (err) {
    return fail(err)
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<Asset>>(req)
    const db = await store()
    const asset: Asset = {
      id: body.id ?? randomUUID(),
      name: body.name ?? 'Untitled',
      description: body.description,
      kind: body.kind ?? 'image',
      url: body.url ?? '',
      thumbnailUrl: body.thumbnailUrl,
      origin: body.origin ?? 'upload',
      providerId: body.providerId,
      model: body.model,
      projectId: body.projectId,
      favorite: body.favorite ?? false,
      width: body.width,
      height: body.height,
      sizeBytes: body.sizeBytes,
      mimeType: body.mimeType,
      generation: body.generation,
      createdAt: body.createdAt ?? Date.now(),
    }
    return ok({ asset: await db.assets.upsert(asset) }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
