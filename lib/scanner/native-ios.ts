import type { ScanResult } from './types';

/**
 * iOS (Tauri): plugin oficial barcode-scanner → AVCaptureMetadataOutput (detección de
 * códigos por hardware/Vision en el pipeline de la cámara, típicamente < 10 ms por frame).
 */
export async function scanNativeIOS(): Promise<ScanResult | null> {
  const plugin = await import('@tauri-apps/plugin-barcode-scanner');
  let permission = await plugin.checkPermissions();
  if (permission !== 'granted') permission = await plugin.requestPermissions();
  if (permission !== 'granted') throw new Error('Permiso de cámara denegado');
  const { Format } = plugin;
  const t0 = performance.now();
  const scanned = await plugin.scan({
    windowed: false,
    cameraDirection: 'back',
    formats: [
      Format.QRCode,
      Format.EAN13,
      Format.EAN8,
      Format.UPC_A,
      Format.UPC_E,
      Format.Code128,
      Format.Code39,
      Format.Code93,
    ],
  });
  if (!scanned?.content) return null;
  return {
    text: scanned.content.trim(),
    format: String(scanned.format),
    decodeMs: performance.now() - t0,
    engine: 'ios-avfoundation',
  };
}

export async function cancelNativeIOS() {
  const { cancel } = await import('@tauri-apps/plugin-barcode-scanner');
  await cancel().catch(() => undefined);
}
