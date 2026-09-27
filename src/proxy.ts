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

  const pathname = request.nextUrl.pathname
  const isLoginRoute = pathname === '/login'
  const isVerifyOtpRoute = pathname === '/verify-otp'
  const isResetPasswordRoute = pathname === '/reset-password'
  const isLandingRoute = pathname === '/'
  const isApiRoute = pathname.startsWith('/api')

  const isPublicAuthRoute = isLoginRoute || isVerifyOtpRoute || isResetPasswordRoute
  const isProtectedRoute = pathname.startsWith('/dashboard') || (!isPublicAuthRoute && !isApiRoute && !isLandingRoute)

  // Helper to preserve cookies set during getUser() on redirect
  const redirectWithCookies = (url: URL) => {
    const res = NextResponse.redirect(url)
    for (const cookie of supabaseResponse.cookies.getAll()) {
      res.cookies.set(cookie.name, cookie.value, cookie)
    }
    return res
  }

  // 1. Unauthenticated users (no user session)
  if (!user) {
    if (isProtectedRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return redirectWithCookies(url)
    }
    return supabaseResponse
  }

  // 2. Authenticated user: Check if email is verified
  const isEmailVerified = Boolean(user.email_confirmed_at || (user as any).confirmed_at)

  if (!isEmailVerified) {
    // If user is already on /verify-otp, allow them access to enter OTP
    if (isVerifyOtpRoute) {
      // If email parameter is missing from the query string, automatically attach it
      if (!request.nextUrl.searchParams.get('email') && user.email) {
        const url = request.nextUrl.clone()
        url.searchParams.set('email', user.email)
        return redirectWithCookies(url)
      }
      return supabaseResponse
    }

    // Allow password reset or api routes if needed
    if (isResetPasswordRoute || isApiRoute) {
      return supabaseResponse
    }

    // CRITICAL GUARD: Intercept access to /dashboard (or any protected route or /login)
    // and redirect immediately to /verify-otp with user's email
    const url = request.nextUrl.clone()
    url.pathname = '/verify-otp'
    if (user.email) {
      url.searchParams.set('email', user.email)
    }
    return redirectWithCookies(url)
  }

  // 3. Authenticated & Verified user:
  // Visiting login or verify-otp redirects to dashboard
  if (isLoginRoute || isVerifyOtpRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return redirectWithCookies(url)
  }

  return supabaseResponse
}

export default proxy

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}