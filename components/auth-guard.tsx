'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/data/hooks';

const ADMIN_PREFIXES = ['/productos', '/compras', '/reportes', '/kiosk-panel'];
const PUBLIC_ROUTES = ['/login', '/kiosk/ingreso'];

export function stripTrailingSlashes(path: string) {
  let end = path.length;
  while (end > 1 && path[end - 1] === '/') end--;
  return path.slice(0, end);
}

function routeKind(path: string): 'public' | 'admin' | 'kiosk' {
  const p = stripTrailingSlashes(path);
  if (PUBLIC_ROUTES.includes(p)) return 'public';
  if (p === '/kiosk') return 'kiosk';
  if (p === '/' || ADMIN_PREFIXES.some((r) => p === r || p.startsWith(`${r}/`))) return 'admin';
  return 'public';
}

/** Reemplaza el middleware de servidor (proxy.ts): protege rutas según la sesión local. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const session = useSession();
  const kind = routeKind(pathname);

  const allowed =
    kind === 'public' ||
    (kind === 'admin' && session?.role === 'admin') ||
    (kind === 'kiosk' && session?.role === 'kiosk');

  useEffect(() => {
    if (session === undefined || allowed) return;
    if (kind === 'kiosk') router.replace('/kiosk/ingreso/');
    else router.replace(`/login/?from=${encodeURIComponent(pathname)}`);
  }, [session, allowed, kind, pathname, router]);

  if (session === undefined || !allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }
  return <>{children}</>;
}
