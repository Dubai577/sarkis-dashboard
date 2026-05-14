'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

export default function NotesPage() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')

  useEffect(() => { fetchNotes() }, [])

  async function fetchNotes() {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setNotes(data)
    setLoading(false)
  }

  async function addNote() {
    if (!newNote.trim()) return
    const { data, error } = await supabase
      .from('notes')
      .insert([{ content: newNote }])
      .select()
    if (!error) {
      setNotes([...data, ...notes])
      setNewNote('')
    }
  }

  async function saveEdit(id) {
    await supabase.from('notes')
      .update({ content: editContent, updated_at: new Date().toISOString() })
      .eq('id', id)
    setNotes(notes.map(n => n.id === id ? { ...n, content: editContent } : n))
    setEditingId(null)
  }

  async function deleteNote(id) {
    await supabase.from('notes').delete().eq('id', id)
    setNotes(notes.filter(n => n.id !== id))
  }

  function formatDate(str) {
    return new Date(str).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    })
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 text-2xl">←</Link>
          <h1 className="text-2xl font-bold">Notes</h1>
        </div>

        <div className="mb-6">
          <textarea
            className="w-full bg-gray-800 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none text-base"
            rows={3}
            placeholder="Write a note..."
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
          />
          <button
            onClick={addNote}
            className="w-full mt-2 bg-blue-600 active:bg-blue-700 rounded-2xl py-3 font-semibold text-base transition"
          >Save Note</button>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="space-y-3">
            {notes.length === 0 && <p className="text-gray-500 text-center py-8">No notes yet.</p>}
            {notes.map(note => (
              <div key={note.id} className="bg-gray-800 rounded-2xl p-4">
                {editingId === note.id ? (
                  <div>
                    <textarea
                      className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none resize-none text-base"
                      rows={3}
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => saveEdit(note.id)} className="flex-1 bg-blue-600 rounded-xl py-2 text-sm font-medium">Save</button>
                      <button onClick={() => setEditingId(null)} className="flex-1 bg-gray-700 rounded-xl py-2 text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-base whitespace-pre-wrap leading-relaxed">{note.content}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-gray-500">{formatDate(note.created_at)}</span>
                      <div className="flex gap-3">
                        <button
                          onClick={() => { setEditingId(note.id); setEditContent(note.content) }}
                          className="text-gray-400 text-sm py-1 px-2"
                        >Edit</button>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="text-red-400 text-sm py-1 px-2"
                        >Delete</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}