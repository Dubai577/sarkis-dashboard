/**
 * Portal kill switch.
 *
 * The portal is paused until the Release 5 rebuild replaces its session and
 * PIN handling — hashed session tokens, expiry, a dedicated sessions table,
 * one-way PIN hashing and rate limiting. Every existing credential is reissued
 * as part of that work, so pausing is cleaner than a partial fix here.
 *
 * The pause covers the whole surface, not just sign-in, because an existing
 * session cookie would otherwise still reach the dashboard.
 *
 * A constant rather than an env var on purpose: re-opening the portal should be
 * a reviewed code change, not a dashboard toggle someone flips by accident.
 */
export const PORTAL_DISABLED = true

export const PORTAL_DISABLED_MESSAGE =
  'The contributor portal is temporarily unavailable while it is being rebuilt.'
