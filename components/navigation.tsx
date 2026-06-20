'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  PackageIcon,
  ShoppingCartIcon,
  BarChart3Icon,
  SettingsIcon,
  ChevronDownIcon,
  MonitorIcon,
  LogOutIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout } from '@/lib/actions/auth';

const links = [
  { href: '/', label: 'Dashboard', icon: BarChart3Icon },
  { href: '/productos', label: 'Productos', icon: PackageIcon },
  { href: '/compras', label: 'Compras', icon: ShoppingCartIcon },
  { href: '/reportes', label: 'Reportes', icon: SettingsIcon },
  { href: '/kiosk-panel', label: 'Kiosko', icon: MonitorIcon },
];

export function Navigation() {
  const pathname = usePathname();
  const currentPage = links.find((l) => l.href === pathname);

  return (
    <nav className="border-b border-border bg-background sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16">
          <div className="flex items-center gap-0.5 min-w-0">
            <Link
              href="/"
              className="font-bold text-base sm:text-lg text-foreground truncate max-w-[140px] sm:max-w-none"
            >
              Inventario Pro
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-0.5 px-1.5 shrink-0 md:hidden"
                  aria-label="Abrir menú de navegación"
                >
                  <span className="text-xs text-muted-foreground max-w-[72px] truncate">
                    {currentPage?.label ?? 'Menú'}
                  </span>
                  <ChevronDownIcon className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {links.map((link) => {
                  const isActive = pathname === link.href;
                  const Icon = link.icon;
                  return (
                    <DropdownMenuItem key={link.href} asChild>
                      <Link
                        href={link.href}
                        className={cn(
                          'flex items-center gap-2 cursor-pointer',
                          isActive && 'bg-accent font-medium'
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {link.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="hidden md:flex items-center gap-1 ml-6">
              {links.map((link) => {
                const isActive = pathname === link.href;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-muted-foreground shrink-0"
            onClick={() => logout()}
          >
            <LogOutIcon className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Salir</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
