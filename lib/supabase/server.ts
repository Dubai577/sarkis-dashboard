import { cookies } from 'next/headers'

/**
 * Read the contributor access token from the HttpOnly cookie set by
 * /api/portal/auth. Portal pages resolve the contributor from this token
 * server-side and then query with the service-role client.
 *
 * The anon-key SSR client that used to live here was removed in Release 0:
 * nothing called it, and once RLS is enabled with no anon policies it would
 * return empty result sets anyway. Everything server-side now goes through
 * createAdminClient() with authorization enforced in lib/auth/guard.ts.
 */
export async function getContributorToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get('contributor_token')?.value
}
