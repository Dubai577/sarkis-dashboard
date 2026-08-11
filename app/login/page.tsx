'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function LoginForm() {
  const params = useSearchParams()
  const next = params.get('next') || '/'

  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      })

      if (res.ok) {
        // Full navigation so the new cookie is present on the server render.
        window.location.href = next.startsWith('/') ? next : '/'
        return
      }

      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not sign in.')
      setPassword('')
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4"
    >
      <div>
        <label htmlFor="password" className="block text-sm text-gray-400 mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          disabled={loading}
          className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none text-base
                     text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !password}
        className="w-full bg-blue-600 rounded-xl py-3 font-medium text-white
                   disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">merc</h1>
          <p className="text-gray-400 text-sm">Sign in to continue.</p>
        </div>

        <Suspense fallback={<div className="h-48 rounded-2xl bg-gray-900 animate-pulse" />}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-gray-600 mt-6">
          Looking for your tasks?{' '}
          <a href="/portal" className="text-blue-400">Contributor portal</a>
        </p>
      </div>
    </main>
  )
}
