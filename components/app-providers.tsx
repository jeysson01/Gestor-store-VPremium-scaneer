'use client';

import { usePathname } from 'next/navigation';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { YapeNotifier } from '@/components/yape-notifier';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isKioskRoute = pathname?.startsWith('/kiosk') && !pathname?.startsWith('/kiosk-panel');
  const isLoginRoute = pathname === '/login';

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster position="top-center" richColors closeButton />
      {!isKioskRoute && !isLoginRoute && <YapeNotifier />}
    </ThemeProvider>
  );
}
