/// <reference lib="webworker" />
// Decodificador ZXing-C++ (WebAssembly) en un Web Worker: nunca bloquea el hilo de la UI.
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? new URL('/zxing_reader.wasm', self.location.href).href : prefix + path,
  },
  fireImmediately: true,
});

const options: ReaderOptions = {
  formats: [
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
  ],
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  tryDownscale: true,
  maxNumberOfSymbols: 1,
};

type Req = { id: number; image: ImageData };

self.onmessage = async (event: MessageEvent<Req>) => {
  const { id, image } = event.data;
  const t0 = performance.now();
  try {
    const results = await readBarcodes(image, options);
    const hit = results.find((r) => r.isValid && r.text);
    self.postMessage({
      id,
      ms: performance.now() - t0,
      text: hit?.text ?? null,
      format: hit?.format ?? null,
    });
  } catch (error) {
    self.postMessage({ id, ms: performance.now() - t0, text: null, error: String(error) });
  }
};

export {};
