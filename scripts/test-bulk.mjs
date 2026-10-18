/**
 * The bulk parser, against the shapes people actually paste.
 *   node scripts/test-bulk.mjs
 * Fixtures are synthetic — the repo is public and nobody's real list goes in it.
 */
import { parseBulk, countRows } from '../lib/bulk.ts'

let fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(54)}${ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`)
}

console.log('\n── bullets are top level, not children ──')
// The old parser nested all of these under the first row.
const bullets = parseBulk('- one\n- two\n- three')
eq('three bulleted lines -> three rows', bullets.length, 3)
eq('and none of them nested', bullets.every(r => r.children.length === 0), true)

console.log('\n── a header gathers the bare lines under it ──')
const grouped = parseBulk('Site A:\nAlice\nBob\nSite B:\nCarol\n- unrelated task')
eq('two groups plus one task', grouped.length, 3)
eq('first group named', grouped[0].title, 'Site A')
eq('  with two under it', grouped[0].children.map(c => c.title), ['Alice', 'Bob'])
eq('second group named', grouped[1].title, 'Site B')
eq('  with one under it', grouped[1].children.map(c => c.title), ['Carol'])
eq('a bullet closes the group', grouped[2].title, 'unrelated task')
eq('  and is not a child', grouped[2].children.length, 0)

console.log('\n── urls ──')
const u = parseBulk('- buy a thing\nhttps://example.com/x')
eq('a bare url attaches to the row above', u.length, 1)
eq('  as its link', u[0].link, 'https://example.com/x')
const u2 = parseBulk('- check this https://example.com/y')
eq('a url in a line keeps the words', u2[0].title, 'check this')
eq('  and takes the link', u2[0].link, 'https://example.com/y')
const u3 = parseBulk('https://example.com/z')
eq('a url with nothing above becomes its own row', u3[0].title, 'https://example.com/z')

console.log('\n── indentation still nests ──')
const ind = parseBulk('Parent thing\n  child one\n  child two')
eq('two children', ind[0].children.map(c => c.title), ['child one', 'child two'])

console.log('\n── a lone header is just a task ──')
eq('"Notes:" with nothing under it', parseBulk('Notes:').map(r => r.isGroup), [false])

console.log('\n── a messy paste, the shape people actually send ──')
const messy = parseBulk([
  '- first errand',
  '- order: mats, weights, screen protector',
  'Venue:',
  'Person one',
  'Person two',
  'Other venue:',
  'Person three',
  '- call someone',
  '- look at this https://example.com/a',
  'https://example.com/b',
  'Bare line task',
  'Another bare line',
  '- last one',
].join('\n'))
const tops = messy.filter(r => !r.isGroup).length
eq('groups found', messy.filter(r => r.isGroup).length, 2)
// 13 lines in, 12 rows out: the bare url is absorbed as a link, which is
// the point of it.
eq('nothing lost but the absorbed url', countRows(messy), 12)
eq('the colon line with a list is a task, not a group',
   messy.find(r => r.title.startsWith('order'))?.isGroup ?? false, false)
eq('bare lines after a bullet stay top level',
   messy.filter(r => r.title === 'Bare line task' && r.children.length === 0).length, 1)

console.log(`\n${fail === 0 ? '✅  bulk parser verified' : `❌  ${fail} failed`}\n`)
process.exitCode = fail === 0 ? 0 : 1
