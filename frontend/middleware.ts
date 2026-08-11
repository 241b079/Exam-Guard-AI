import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const role = request.cookies.get('user_role')?.value;
  const token = request.cookies.get('auth_token')?.value;
  const isAuthenticated = Boolean(token && role);

  const isStudentRoute = pathname.startsWith('/student');
  const isFacultyRoute = pathname.startsWith('/faculty');
  const isAdminRoute = pathname.startsWith('/admin');
  const isProtected = isStudentRoute || isFacultyRoute || isAdminRoute;

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register');

  // 1. Redirect unauthenticated users trying to access protected routes to /login
  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Redirect authenticated users away from auth pages (/login, /register) to their dashboard
  if (isAuthRoute && isAuthenticated && role) {
    if (role === 'STUDENT') return NextResponse.redirect(new URL('/student/dashboard', request.url));
    if (role === 'FACULTY') return NextResponse.redirect(new URL('/faculty/dashboard', request.url));
    if (role === 'ADMIN') return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  // 3. Role protection: check if role matches path
  if (isAuthenticated && isProtected && role) {
    if (isStudentRoute && role !== 'STUDENT') {
      return NextResponse.redirect(new URL(getRoleDashboard(role), request.url));
    }
    if (isFacultyRoute && role !== 'FACULTY') {
      return NextResponse.redirect(new URL(getRoleDashboard(role), request.url));
    }
    if (isAdminRoute && role !== 'ADMIN') {
      return NextResponse.redirect(new URL(getRoleDashboard(role), request.url));
    }
  }

  return NextResponse.next();
}

function getRoleDashboard(role?: string): string {
  switch (role) {
    case 'STUDENT': return '/student/dashboard';
    case 'FACULTY': return '/faculty/dashboard';
    case 'ADMIN': return '/admin/dashboard';
    default: return '/login';
  }
}

export const config = {
  matcher: [
    '/student/:path*',
    '/faculty/:path*',
    '/admin/:path*',
    '/login',
    '/register',
  ],
};
