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
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-gray-400 hover:text-white">← Back</Link>
          <h1 className="text-2xl font-bold">Notes</h1>
        </div>

        <div className="mb-6">
          <textarea
            className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            rows={3}
            placeholder="Write a note..."
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.ctrlKey) addNote()
            }}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-500">Ctrl+Enter to save</span>
            <button
              onClick={addNote}
              className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm font-medium transition"
            >
              Save Note
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="space-y-3">
            {notes.length === 0 && <p className="text-gray-500">No notes yet.</p>}
            {notes.map(note => (
              <div key={note.id} className="bg-gray-800 rounded-xl p-4 group">
                {editingId === note.id ? (
                  <div>
                    <textarea
                      className="w-full bg-gray-700 rounded-lg px-3 py-2 outline-none resize-none"
                      rows={3}
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => saveEdit(note.id)}
                        className="bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-1 text-sm transition"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-1 text-sm transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-gray-500">{formatDate(note.created_at)}</span>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => { setEditingId(note.id); setEditContent(note.content) }}
                          className="text-gray-400 hover:text-white text-xs transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="text-gray-400 hover:text-red-400 text-xs transition"
                        >
                          Delete
                        </button>
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
