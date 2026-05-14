export async function GET() {
  return Response.json({ 
    ok: true, 
    hasResendKey: !!process.env.RESEND_API_KEY,
    keyPrefix: process.env.RESEND_API_KEY?.slice(0, 5) || 'none'
  })
}