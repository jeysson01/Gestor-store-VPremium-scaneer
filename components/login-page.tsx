'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MonitorIcon, ShieldCheckIcon, ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loginAdmin } from '@/lib/actions/auth';
import { toast } from 'sonner';

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showAdmin = searchParams.get('mode') === 'admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await loginAdmin(email, password);
      if (result.success) {
        toast.success('Bienvenido, administrador');
        router.push('/');
        router.refresh();
      } else {
        toast.error(result.error || 'Error al iniciar sesión');
      }
    } catch {
      toast.error('Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  if (showAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheckIcon className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Acceso Administrador</CardTitle>
            <CardDescription>Ingresa tus credenciales para acceder al panel completo</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Ingresando...' : 'Ingresar'}
              </Button>
            </form>
            <Button variant="ghost" className="w-full mt-3 gap-2" asChild>
              <Link href="/login">
                <ArrowLeftIcon className="w-4 h-4" />
                Volver
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4 gap-6">
      <div className="text-center mb-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Inventario Pro</h1>
        <p className="text-muted-foreground mt-1">Selecciona cómo deseas ingresar</p>
      </div>

      <Link
        href="/kiosk/ingreso"
        className="w-full max-w-md group"
      >
        <Card className="border-2 border-primary/20 hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer">
          <CardContent className="flex flex-col items-center justify-center py-12 px-6 gap-4">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <MonitorIcon className="w-10 h-10 text-primary" />
            </div>
            <div className="text-center">
              <h2 className="text-xl sm:text-2xl font-bold">Panel Kiosko</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                Modo cliente controlado — escanea productos y registra compras con código temporal
              </p>
            </div>
            <Button size="lg" className="w-full max-w-xs h-12 text-base">
              Ingresar como Cliente
            </Button>
          </CardContent>
        </Card>
      </Link>

      <Link href="/login?mode=admin" className="w-full max-w-xs">
        <Button variant="outline" size="sm" className="w-full gap-2 h-9 text-xs">
          <ShieldCheckIcon className="w-3.5 h-3.5" />
          Acceso Administrador
        </Button>
      </Link>
    </div>
  );
}
