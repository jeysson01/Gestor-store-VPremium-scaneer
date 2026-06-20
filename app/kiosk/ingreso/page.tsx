import { Suspense } from 'react';
import { KioskCodeEntry } from '@/components/kiosk-code-entry';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Cargando...</div>}>
      <KioskCodeEntry />
    </Suspense>
  );
}
