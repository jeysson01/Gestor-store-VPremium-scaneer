'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, QrCodeIcon, Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { loginWithKioskCode, loginWithKioskQr } from '@/lib/actions/auth';
import { toast } from 'sonner';

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'gs_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function KioskCodeEntry() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const qrHandled = useRef(false);

  useEffect(() => {
    const qr = searchParams.get('qr');
    if (!qr || qrHandled.current) return;
    qrHandled.current = true;

    (async () => {
      setLoading(true);
      const result = await loginWithKioskQr(qr, getDeviceId());
      if (result.success) {
        toast.success('Acceso concedido');
        router.push('/kiosk');
        router.refresh();
      } else {
        toast.error(result.error || 'QR inválido');
      }
      setLoading(false);
    })();
  }, [searchParams, router]);

  const handleSubmit = async () => {
    if (code.length !== 3) {
      toast.error('Ingresa los 3 dígitos del código');
      return;
    }
    setLoading(true);
    try {
      const result = await loginWithKioskCode(code, getDeviceId());
      if (result.success) {
        toast.success('Acceso concedido');
        router.push('/kiosk');
        router.refresh();
      } else {
        toast.error(result.error || 'Código inválido');
        setCode('');
      }
    } catch {
      toast.error('Error al validar código');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <QrCodeIcon className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Acceso Kiosko</CardTitle>
          <CardDescription>
            Ingresa el código de 3 dígitos que muestra el administrador o escanea el QR
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center">
            <InputOTP
              maxLength={3}
              value={code}
              onChange={setCode}
              disabled={loading}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className="w-14 h-16 text-2xl font-bold" />
                <InputOTPSlot index={1} className="w-14 h-16 text-2xl font-bold" />
                <InputOTPSlot index={2} className="w-14 h-16 text-2xl font-bold" />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button
            className="w-full h-12 text-base"
            onClick={handleSubmit}
            disabled={loading || code.length !== 3}
          >
            {loading ? (
              <>
                <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                Validando...
              </>
            ) : (
              'Ingresar'
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            El código expira en 3 minutos y solo puede usarse una vez
          </p>

          <Button variant="ghost" className="w-full gap-2" asChild>
            <Link href="/login">
              <ArrowLeftIcon className="w-4 h-4" />
              Volver al inicio
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
