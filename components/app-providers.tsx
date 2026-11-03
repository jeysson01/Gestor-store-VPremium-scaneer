'use client';

import { usePathname } from 'next/navigation';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { YapeNotifier, PURCHASES_REFRESH_EVENT_NAME } from '@/components/yape-notifier';
import { AuthGuard } from '@/components/auth-guard';
import { useDataVersion } from '@/lib/data/hooks';
import { useEffect } from 'react';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isKioskRoute = pathname?.startsWith('/kiosk') && !pathname?.startsWith('/kiosk-panel');
  const isLoginRoute = pathname?.replace(/\/+$/, '') === '/login';
  const purchasesVersion = useDataVersion(['purchases', 'purchase_details', 'products']);

  // Cambios remotos (Realtime/pull) → las listas existentes se recargan desde la base local.
  useEffect(() => {
    if (purchasesVersion > 0) window.dispatchEvent(new CustomEvent(PURCHASES_REFRESH_EVENT_NAME));
  }, [purchasesVersion]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthGuard>{children}</AuthGuard>
      <Toaster position="top-center" richColors closeButton />
      {!isKioskRoute && !isLoginRoute && <YapeNotifier />}
    </ThemeProvider>
  );
}
