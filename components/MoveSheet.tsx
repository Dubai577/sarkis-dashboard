'use client'

import { useMemo, useState } from 'react'
import { Sheet, Button, inputClass } from '@/components/ui/primitives'
import type { TreeNode } from '@/components/Drill'

/**
 * Move selected items somewhere — including into a group created right here.
 *
 * Organising departments has to be possible from the site, so this does both
 * jobs in one place: pick an existing parent, or type a new department name
 * and have it created and used in the same action. Otherwise "make a
 * department" and "put things in it" are two trips.
 */
export function MoveSheet({
  open,
  ids,
  tree,
  suggestedParent,
  onClose,
  onMoved,
}: {
  open: boolean
  /** The items being moved. */
  ids: string[]
  tree: TreeNode[]
  /** The level the selection came from — the natural place to make a group. */
  suggestedParent: TreeNode | null
  onClose: () => void
  onMoved: () => void
}) {
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const byId = useMemo(() => new Map(tree.map(n => [n.id, n])), [tree])

  /** Full path, so two departments called "Website" are distinguishable. */
  const pathOf = (n: TreeNode): string => {
    const parts = [n.title]
    let cursor = n.parent_id
    const guard = new Set<string>()
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor)
      const p = byId.get(cursor)
      if (!p) break
      parts.unshift(p.title)
      cursor = p.parent_id
    }
    return parts.join(' / ')
  }

  const targets = useMemo(() => {
    const q = query.trim().toLowerCase()
    const moving = new Set(ids)
    return tree
      .filter(n => !moving.has(n.id))
      .map(n => ({ node: n, path: pathOf(n) }))
      .filter(t => !q || t.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 60)
  }, [tree, query, ids])

  async function move(parentId: string | null) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/items/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, parent_id: parentId }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not move those.')
      onMoved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move those.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Move ${ids.length} item${ids.length === 1 ? '' : 's'}`}>
      {error && <p className="mb-2 text-[12px] text-dropped">{error}</p>}

      {suggestedParent && (
        <div className="mb-3 rounded-md border border-line p-2">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-3">
            New department under {suggestedParent.title}
          </span>
          <div className="flex gap-1.5">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newName.trim() && createAndMove()}
              placeholder="Buildings, Website, Hymns…"
              className={inputClass}
            />
            <Button variant="primary" disabled={busy || !newName.trim()} onClick={createAndMove}>
              Create
            </Button>
          </div>
        </div>
      )}

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search for an existing group…"
        className={`${inputClass} mb-2`}
      />

      <div className="max-h-64 overflow-y-auto">
        <button
          onClick={() => move(null)}
          disabled={busy}
          className="flex w-full items-center border-b border-line/60 py-2 text-left text-[13px]"
        >
          Top level
        </button>
        {targets.map(({ node, path }) => (
          <button
            key={node.id}
            onClick={() => move(node.id)}
            disabled={busy}
            className="flex w-full items-center gap-2 border-b border-line/60 py-2 text-left last:border-b-0"
          >
            <span className="h-3 w-[2px] shrink-0 rounded-full"
                  style={{ background: node.color ?? 'var(--border-2)' }} />
            <span className="clamp-1 flex-1 text-[12.5px]">{path}</span>
            {node.childCount > 0 && (
              <span className="shrink-0 text-[10px] tnum text-ink-3">{node.childCount}</span>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  )

  async function createAndMove() {
    const title = newName.trim()
    if (!title || !suggestedParent) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_id: suggestedParent.id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not create that group.')
      setNewName('')
      await move(body.item.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that group.')
      setBusy(false)
    }
  }
}
