import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Update the incoming request cookies
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          
          supabaseResponse = NextResponse.next({
            request,
          })
          
          // Forward the updated cookies to the browser
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Securely fetch the user session from the Supabase server
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginRoute = request.nextUrl.pathname === '/login'
  const isVerifyOtpRoute = request.nextUrl.pathname === '/verify-otp'
  const isResetPasswordRoute = request.nextUrl.pathname === '/reset-password'
  const isLandingRoute = request.nextUrl.pathname === '/'
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  const isPublicAuthRoute = isLoginRoute || isVerifyOtpRoute || isResetPasswordRoute

  // 1. If no user and not on public auth, api, or landing routes -> kick to login
  if (!user && !isPublicAuthRoute && !isApiRoute && !isLandingRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. If user exists and tries to view login or verify-otp -> kick to dashboard
  // (Keep /reset-password accessible when user has active recovery session)
  if (user && (isLoginRoute || isVerifyOtpRoute)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}