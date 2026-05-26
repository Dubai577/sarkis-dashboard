import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Standard SSR Supabase client — respects RLS via the anon key.
 * Use this in contributor-facing Server Components and Route Handlers.
 *
 * For contributor API calls, also pass the x-contributor-token header
 * so that the get_contributor_id() RLS helper can resolve the session.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name)              { return cookieStore.get(name)?.value },
        set(name, value, opts) { try { cookieStore.set({ name, value, ...opts }) } catch {} },
        remove(name, opts)     { try { cookieStore.set({ name, value: '', ...opts }) } catch {} },
      },
    }
  )
}

/** Read the contributor access token from the HttpOnly cookie. */
export async function getContributorToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get('contributor_token')?.value
}
