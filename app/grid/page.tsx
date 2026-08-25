import { Grid } from '@/components/Grid'

export const dynamic = 'force-dynamic'

/**
 * Everything, in one editable table.
 *
 * The rest of the app is opinionated about what deserves your attention. This
 * is deliberately not: it shows every row and lets you change any field where
 * it sits, because organising a hundred things is a different job from working
 * through them, and a spreadsheet was still winning that one.
 */
export default function GridPage() {
  return <Grid />
}
