import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  getAdminSessionFromRequest,
  getKioskSessionFromRequest,
} from '@/lib/auth/session';

const ADMIN_ROUTES = ['/', '/productos', '/compras', '/reportes', '/kiosk-panel'];
const KIOSK_ROUTES = ['/kiosk'];
const PUBLIC_ROUTES = ['/login', '/kiosk/ingreso'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieHeader = request.headers.get('cookie');

  if (
    pathname.startsWith('/api/yape') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );
  const isAdminRoute = ADMIN_ROUTES.some(
    (r) => pathname === r || (r !== '/' && pathname.startsWith(`${r}/`))
  );
  const isKioskRoute =
    KIOSK_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`)) &&
    !pathname.startsWith('/kiosk/ingreso') &&
    !pathname.startsWith('/kiosk-panel');

  const adminSession = getAdminSessionFromRequest(cookieHeader);
  const kioskSession = getKioskSessionFromRequest(cookieHeader);

  if (isPublic) {
    if (pathname === '/login' && adminSession) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    if (pathname === '/login' && kioskSession) {
      return NextResponse.redirect(new URL('/kiosk', request.url));
    }
    return NextResponse.next();
  }

  if (isAdminRoute) {
    if (!adminSession) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  if (isKioskRoute) {
    if (!kioskSession) {
      return NextResponse.redirect(new URL('/kiosk/ingreso', request.url));
    }
    return NextResponse.next();
  }

  if (!adminSession && !kioskSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
