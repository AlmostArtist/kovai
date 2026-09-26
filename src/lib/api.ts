import 'server-only'

import { NextResponse } from 'next/server'
import { ProviderError, toProviderError } from './providers/types'

/** Uniform JSON response helpers so every route fails the same way. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function fail(error: unknown, status?: number) {
  const providerError = error instanceof ProviderError ? error : toProviderError(error)
  return NextResponse.json(
    { error: providerError.toJSON() },
    { status: status ?? statusFor(providerError) },
  )
}

function statusFor(err: ProviderError): number {
  switch (err.code) {
    case 'UNCONFIGURED':
      return 428 // Precondition Required — the interface renders a setup state.
    case 'INVALID_KEY':
      return 401
    case 'RATE_LIMIT':
      return 429
    case 'BAD_REQUEST':
      return 400
    case 'MODEL_UNAVAILABLE':
      return 404
    case 'RUNTIME_OFFLINE':
      return 503
    case 'TIMEOUT':
      return 504
    default:
      return 502
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new ProviderError({ code: 'BAD_REQUEST', message: 'The request body was not valid JSON.' })
  }
}

/**
 * Process-control endpoints are only honoured for requests originating on this
 * machine, so a deployed instance can never be made to spawn a runtime.
 */
export function assertLocalRequest(req: Request) {
  const host = new URL(req.url).hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
  if (!isLocal) {
    throw new ProviderError({
      code: 'BAD_REQUEST',
      message: 'The local runtime can only be controlled from this machine.',
      detail: `Request host was "${host}".`,
      retryable: false,
    })
  }
}
