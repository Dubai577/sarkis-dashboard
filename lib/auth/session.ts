/**
 * Admin session tokens — HMAC-signed, stateless, no database round trip.
 *
 * Uses Web Crypto so this module works unchanged in the Node.js runtime
 * (route handlers, server actions) and in Proxy, which in Next 16 defaults
 * to Node but is documented as CDN-deployable.
 *
 * Token shape:  v1.<expiry-ms>.<nonce>.<signature>
 * The signature covers "v1.<expiry>.<nonce>", so the expiry cannot be edited.
 */

const enc = new TextEncoder()

export const SESSION_COOKIE = 'merc_admin'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days, in seconds

// ── base64url ────────────────────────────────────────────────────

function toB64Url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(value: string): ArrayBuffer {
  let s = value.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4 !== 0) s += '='
  const binary = atob(s)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return buffer
}

// ── keys ─────────────────────────────────────────────────────────

let cachedKey: Promise<CryptoKey> | null = null

function signingKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey

  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET is missing or shorter than 32 characters. ' +
      'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }

  cachedKey = crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  return cachedKey
}

// ── tokens ───────────────────────────────────────────────────────

export async function createSessionToken(): Promise<string> {
  const expiry  = Date.now() + SESSION_MAX_AGE * 1000
  const nonce   = toB64Url(crypto.getRandomValues(new Uint8Array(16)))
  const payload = `v1.${expiry}.${nonce}`
  const sig     = await crypto.subtle.sign('HMAC', await signingKey(), enc.encode(payload))
  return `${payload}.${toB64Url(sig)}`
}

/** Constant-time via crypto.subtle.verify. Returns false rather than throwing. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false

  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') return false

  const expiry = Number(parts[1])
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false

  try {
    return await crypto.subtle.verify(
      'HMAC',
      await signingKey(),
      fromB64Url(parts[3]),
      enc.encode(`${parts[0]}.${parts[1]}.${parts[2]}`),
    )
  } catch {
    return false
  }
}

// ── password ─────────────────────────────────────────────────────

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Compares SHA-256 digests so the comparison does not leak length or prefix. */
export async function checkAdminPassword(candidate: unknown): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) throw new Error('ADMIN_PASSWORD is not set.')
  if (typeof candidate !== 'string' || candidate.length === 0) return false
  if (candidate.length > 512) return false

  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(candidate)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  return constantTimeEqual(new Uint8Array(a), new Uint8Array(b))
}
