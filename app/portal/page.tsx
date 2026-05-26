'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function PortalPinPage() {
  const router  = useRouter()
  const [pin, setPin]         = useState(['', '', '', ''])
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return
    const next = [...pin]
    next[index] = value.slice(-1)
    setPin(next)
    setError('')
    if (value && index < 3) inputs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    const next  = ['', '', '', '']
    text.split('').forEach((c, i) => { next[i] = c })
    setPin(next)
    inputs.current[Math.min(text.length, 3)]?.focus()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fullPin = pin.join('')
    if (fullPin.length < 4) { setError('Enter all 4 digits.'); return }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/portal/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pin: fullPin }),
      })

      if (res.ok) {
        router.push('/portal/dashboard')
      } else {
        const data = await res.json()
        setError(data.error ?? 'Incorrect PIN. Try again.')
        setPin(['', '', '', ''])
        inputs.current[0]?.focus()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0
                   00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0
                   012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">Enter your 4-digit access PIN</p>
        </div>

        <form onSubmit={handleSubmit}
              className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex justify-center gap-3 mb-6" onPaste={handlePaste}>
            {pin.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputs.current[i] = el }}
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className={`w-14 h-16 text-center text-2xl font-bold rounded-xl border-2
                            transition-colors outline-none
                            ${digit
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-gray-200 bg-gray-50 text-gray-900'}
                            focus:border-indigo-500 focus:bg-indigo-50`}
                autoFocus={i === 0}
                disabled={loading}
                aria-label={`PIN digit ${i + 1}`}
              />
            ))}
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center mb-4 font-medium" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || pin.join('').length < 4}
            className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl
                       hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors text-sm"
          >
            {loading ? 'Checking…' : 'Access my tasks'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Don't have a PIN? Contact your project lead.
        </p>
      </div>
    </main>
  )
}