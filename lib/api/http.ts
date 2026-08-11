import { NextResponse } from 'next/server'

/** Longest accepted free-text value. Guards against unbounded writes. */
export const MAX_TEXT = 8000

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export function serverError(context: string, err: unknown) {
  console.error(`[${context}]`, err)
  return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
}

/**
 * Copy only the allowed keys from an untrusted body.
 *
 * Empty strings become null so the UI can clear an optional field; `undefined`
 * keys are omitted entirely so a PATCH never blanks what it did not send.
 */
export function pick<K extends string>(
  body: Record<string, unknown>,
  fields: readonly K[],
): Partial<Record<K, unknown>> {
  const out: Partial<Record<K, unknown>> = {}
  for (const field of fields) {
    if (!(field in body)) continue
    const value = body[field]
    out[field] = value === '' ? null : value
  }
  return out
}

/** Rejects oversized strings and non-scalar values before they reach the database. */
export function validateScalars(patch: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) continue
    if (typeof value === 'string') {
      if (value.length > MAX_TEXT) return `${key} is too long (max ${MAX_TEXT} characters).`
      continue
    }
    if (typeof value === 'number' || typeof value === 'boolean') continue
    return `${key} must be text, a number, or true/false.`
  }
  return null
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** Basic YYYY-MM-DD shape check for query params that reach a date column. */
export function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}
