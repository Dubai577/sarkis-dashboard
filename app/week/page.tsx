import { redirect } from 'next/navigation'

/**
 * /week folded into the calendar.
 *
 * It was a separate page reading a separate endpoint, which is exactly why the
 * two felt unrelated. The week is now one of three views over the same range
 * endpoint, so this is a permanent redirect rather than a second surface.
 */
export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>
}) {
  const { start } = await searchParams
  redirect(start ? `/calendar?view=week&date=${start}` : '/calendar?view=week')
}
