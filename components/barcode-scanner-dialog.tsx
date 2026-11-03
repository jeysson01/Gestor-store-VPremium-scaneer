'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraIcon, Loader2Icon, ScanLineIcon, ZapIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { isTauriMobile } from '@/lib/data/platform';
import type { ScanEngine, ScanResult } from '@/lib/scanner/types';

type BarcodeScannerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
  title?: string;
  /** Modo kiosko: la cámara sigue abierta y cada código nuevo se agrega al instante. */
  continuous?: boolean;
};

const DUPLICATE_WINDOW_MS = 1500;
const ENGINE_LABEL: Record<ScanEngine, string> = {
  'ios-avfoundation': 'AVFoundation (nativo)',
  'barcode-detector': 'BarcodeDetector (nativo)',
  'zxing-wasm': 'ZXing-C++ WASM',
};

function feedback() {
  try {
    navigator.vibrate?.(40);
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    osc.frequency.value = 1800;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
    osc.onended = () => void ctx.close();
  } catch {
    // sin audio
  }
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = 'Escanear código',
  continuous = false,
}: BarcodeScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const doneRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [stats, setStats] = useState<{ ms: number; engine: ScanEngine } | null>(null);
  const [count, setCount] = useState(0);
  const native = typeof window !== 'undefined' && isTauriMobile();

  const handleResult = useCallback(
    (r: ScanResult) => {
      if (!r.text || doneRef.current) return;
      const now = Date.now();
      if (r.text === lastRef.current.text && now - lastRef.current.at < DUPLICATE_WINDOW_MS) return;
      lastRef.current = { text: r.text, at: now };
      feedback();
      onScan(r.text);
      if (continuous) {
        setCount((c) => c + 1);
      } else {
        doneRef.current = true;
        onOpenChange(false);
        toast.success(`Código detectado (${r.decodeMs.toFixed(1)} ms)`);
      }
    },
    [continuous, onOpenChange, onScan]
  );

  // iOS nativo: AVFoundation a pantalla completa (en modo continuo se relanza tras cada lectura).
  useEffect(() => {
    if (!open || !native) return;
    let cancelled = false;
    void (async () => {
      const { scanNativeIOS, cancelNativeIOS } = await import('@/lib/scanner/native-ios');
      try {
        do {
          const r = await scanNativeIOS();
          if (cancelled) break;
          if (r) {
            setStats({ ms: r.decodeMs, engine: r.engine });
            handleResult(r);
          }
        } while (continuous && !cancelled);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'No se pudo abrir la cámara');
      } finally {
        if (!continuous && !cancelled) onOpenChange(false);
      }
      return cancelNativeIOS;
    })();
    return () => {
      cancelled = true;
      void import('@/lib/scanner/native-ios').then((m) => m.cancelNativeIOS());
    };
  }, [open, native, continuous, handleResult, onOpenChange]);

  // macOS / navegador: cámara del dispositivo + decodificación en Web Worker.
  useEffect(() => {
    if (!open || native) return;
    doneRef.current = false;
    setCount(0);
    let scanner: import('@/lib/scanner/web-scanner').WebScanner | null = null;
    let cancelled = false;
    void (async () => {
      setStarting(true);
      try {
        const { WebScanner } = await import('@/lib/scanner/web-scanner');
        await new Promise((r) => requestAnimationFrame(r));
        if (cancelled || !videoRef.current) return;
        scanner = new WebScanner({
          video: videoRef.current,
          onResult: handleResult,
          onFrame: ({ decodeMs, engine }) => setStats({ ms: decodeMs, engine }),
        });
        await scanner.start();
        if (cancelled) scanner.stop();
      } catch {
        if (!cancelled) {
          toast.error('No se pudo acceder a la cámara. Verifica los permisos.');
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      scanner?.stop();
    };
  }, [open, native, handleResult, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {continuous ? <ZapIcon className="w-4 h-4" /> : <ScanLineIcon className="w-4 h-4" />}
            {continuous ? 'Escaneo continuo' : title}
          </DialogTitle>
          <DialogDescription>
            {continuous
              ? 'Pasa los productos frente a la cámara; cada código se agrega automáticamente'
              : 'Apunta la cámara al código QR o de barras del producto'}
          </DialogDescription>
        </DialogHeader>
        {native ? (
          <div className="rounded-lg bg-muted p-6 text-center text-sm text-muted-foreground">
            Cámara nativa activa…
          </div>
        ) : (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-x-[10%] inset-y-[20%] rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2Icon className="w-8 h-8 animate-spin text-white" />
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground" data-testid="scanner-stats">
          <span>{stats ? ENGINE_LABEL[stats.engine] : 'Iniciando cámara…'}</span>
          <span>
            {continuous && <span className="mr-3 font-medium text-foreground">{count} escaneados</span>}
            {stats && `${stats.ms.toFixed(1)} ms/frame`}
          </span>
        </div>
        {continuous && (
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Terminar
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

type BarcodeScanButtonProps = {
  onScan: (code: string) => void;
  label?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'icon';
  className?: string;
  continuous?: boolean;
};

export function BarcodeScanButton({
  onScan,
  label = 'Escanear',
  variant = 'outline',
  size = 'sm',
  className,
  continuous = false,
}: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false);
  const Icon = continuous ? ZapIcon : CameraIcon;
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Icon className="w-4 h-4" />
        {size !== 'icon' && label ? <span className="ml-2">{label}</span> : null}
      </Button>
      <BarcodeScannerDialog
        open={open}
        onOpenChange={setOpen}
        onScan={onScan}
        continuous={continuous}
      />
    </>
  );
}
