export type ScanResult = {
  text: string;
  format: string;
  /** Tiempo de decodificación del frame (ms). */
  decodeMs: number;
  engine: ScanEngine;
};

export type ScanEngine = 'ios-avfoundation' | 'barcode-detector' | 'zxing-wasm';

export const BARCODE_FORMATS = [
  'QRCode',
  'EAN-13',
  'EAN-8',
  'UPC-A',
  'UPC-E',
  'Code128',
  'Code39',
  'Code93',
  'ITF',
  'Codabar',
  'DataMatrix',
] as const;
