'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { RefreshCwIcon, MonitorIcon, ClockIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getKioskCodesForAdmin } from '@/lib/actions/auth';
import {
  getKioskAppBaseUrl,
  getKioskQrImageUrl,
  isLocalhostKioskUrl,
} from '@/lib/kiosk-utils';
import type { KioskCodeDisplay } from '@/lib/kiosk-utils';

const KioskCodeCard = memo(function KioskCodeCard({
  item,
  index,
  appBaseUrl,
}: {
  item: KioskCodeDisplay;
  index: number;
  appBaseUrl: string;
}) {
  return (
    <div className="flex flex-col items-center p-4 rounded-xl border bg-muted/30 gap-3">
      <span className="text-xs text-muted-foreground font-medium">Código {index + 1}</span>
      <span className="text-4xl font-bold tracking-[0.3em] font-mono text-primary">
        {item.code}
      </span>
      <div className="bg-white p-2 rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getKioskQrImageUrl(item.qrToken, appBaseUrl)}
          alt={`QR código ${item.code}`}
          width={140}
          height={140}
          loading="lazy"
        />
      </div>
    </div>
  );
});

export function KioskCodesPanel() {
  const [codes, setCodes] = useState<KioskCodeDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [appBaseUrl, setAppBaseUrl] = useState('');

  useEffect(() => {
    setAppBaseUrl(getKioskAppBaseUrl());
  }, []);

  const loadCodes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getKioskCodesForAdmin();
      if (result.success && result.data) {
        setCodes(result.data);
        const minLeft = Math.min(...result.data.map((c) => c.secondsLeft));
        setSecondsLeft(minLeft);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          loadCodes();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loadCodes]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MonitorIcon className="w-5 h-5" />
              Códigos de Acceso Kiosko
            </CardTitle>
            <CardDescription>
              4 códigos de 3 dígitos que se renuevan automáticamente cada 3 minutos
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <ClockIcon className="w-3 h-3" />
              {formatTime(secondsLeft)}
            </Badge>
            <Button variant="outline" size="sm" onClick={loadCodes} disabled={loading}>
              <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && codes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Generando códigos...</div>
        ) : appBaseUrl ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {codes.map((item, idx) => (
              <KioskCodeCard
                key={item.id}
                item={item}
                index={idx}
                appBaseUrl={appBaseUrl}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">Preparando códigos QR...</div>
        )}
        {appBaseUrl && isLocalhostKioskUrl(appBaseUrl) && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-4 text-center">
            Para escanear desde el celular, abre este panel con la IP de tu PC (ej.{' '}
            <span className="font-mono">http://192.168.x.x:3002/kiosk-panel</span>) o configura{' '}
            <span className="font-mono">NEXT_PUBLIC_APP_URL</span> en .env.local
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          Muestra estos códigos al cliente para que ingrese al panel kiosko
        </p>
      </CardContent>
    </Card>
  );
}
