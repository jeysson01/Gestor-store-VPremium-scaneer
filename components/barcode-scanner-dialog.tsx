'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CameraIcon, Loader2Icon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type BarcodeScannerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
  title?: string;
};

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = 'Escanear código',
}: BarcodeScannerDialogProps) {
  const regionId = useId().replace(/:/g, '');
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const handledRef = useRef(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) {
      handledRef.current = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    (async () => {
      setStarting(true);
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        const scanner = new Html5Qrcode(regionId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decoded) => {
            if (handledRef.current) return;
            handledRef.current = true;
            const value = decoded.trim();
            if (!value) return;
            onScan(value);
            onOpenChange(false);
            toast.success('Código detectado');
          },
          () => undefined
        );
      } catch {
        toast.error('No se pudo acceder a la cámara. Verifica los permisos.');
        onOpenChange(false);
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, [open, onOpenChange, onScan, regionId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Apunta la cámara al código QR o de barras del producto
          </DialogDescription>
        </DialogHeader>
        <div className="relative rounded-lg overflow-hidden bg-black min-h-[280px]">
          <div id={regionId} className="w-full" />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2Icon className="w-8 h-8 animate-spin text-white" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type BarcodeScanButtonProps = {
  onScan: (code: string) => void;
  label?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'icon';
  className?: string;
};

export function BarcodeScanButton({
  onScan,
  label = 'Escanear',
  variant = 'outline',
  size = 'sm',
  className,
}: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <CameraIcon className="w-4 h-4" />
        {size !== 'icon' && label ? <span className="ml-2">{label}</span> : null}
      </Button>
      <BarcodeScannerDialog open={open} onOpenChange={setOpen} onScan={onScan} />
    </>
  );
}
