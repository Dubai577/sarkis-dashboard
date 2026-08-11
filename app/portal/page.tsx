import { PORTAL_DISABLED } from '@/lib/portal/status'
import PortalPinForm from './PortalPinForm'

export default function PortalPage() {
  if (!PORTAL_DISABLED) return <PortalPinForm />

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 bg-gray-200 rounded-2xl mx-auto mb-5 flex items-center justify-center">
          <svg className="w-7 h-7 text-gray-500" fill="none" viewBox="0 0 24 24"
               stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">Back soon</h1>

        <p className="text-sm text-gray-500 mt-3 leading-relaxed">
          The task portal is temporarily unavailable while we make it more secure.
          Nothing you&rsquo;ve submitted has been lost.
        </p>

        <p className="text-sm text-gray-500 mt-4 leading-relaxed">
          Your project lead will send you a new sign-in when it&rsquo;s back.
        </p>
      </div>
    </main>
  )
}
