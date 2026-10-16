import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('adminToken')?.value

  const publicPaths = ['/', '/api/admin/auth/login']
  const isPublicPath = publicPaths.some((path) => request.nextUrl.pathname === path)

  if (!token && !isPublicPath) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (token && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
