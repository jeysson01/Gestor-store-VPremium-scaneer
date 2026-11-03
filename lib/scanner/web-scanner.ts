import type { ScanEngine, ScanResult } from './types';
import { decodeWithZxing, warmUpZxing } from './zxing-client';

type DetectorLike = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string; format: string }>> };

/** ROI centrada (zona del recuadro guía) y reescalada: menos píxeles → decodificación más rápida. */
const ROI_W = 0.8;
const ROI_H = 0.6;
const MAX_ROI_WIDTH = 960;

async function createDetector(): Promise<DetectorLike | null> {
  const BD = (globalThis as unknown as { BarcodeDetector?: any }).BarcodeDetector;
  if (!BD) return null;
  try {
    const supported: string[] = await BD.getSupportedFormats();
    const wanted = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'data_matrix'];
    const formats = wanted.filter((f) => supported.includes(f));
    return formats.length ? new BD({ formats }) : null;
  } catch {
    return null;
  }
}

export type WebScannerOptions = {
  video: HTMLVideoElement;
  onResult: (r: ScanResult) => void;
  onFrame?: (stats: { decodeMs: number; engine: ScanEngine }) => void;
};

/**
 * Escáner con la cámara del dispositivo (getUserMedia → WKWebView/AVFoundation en macOS).
 * Cada frame nuevo (requestVideoFrameCallback) se recorta y se envía al decodificador:
 * BarcodeDetector nativo si existe, si no ZXing-C++ WASM en un Web Worker.
 * Solo hay un frame en vuelo a la vez, así la cámara nunca se encola.
 */
export class WebScanner {
  private stream: MediaStream | null = null;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private detector: DetectorLike | null = null;
  private running = false;
  private busy = false;
  private frameHandle = 0;

  constructor(private readonly opts: WebScannerOptions) {}

  get engine(): ScanEngine {
    return this.detector ? 'barcode-detector' : 'zxing-wasm';
  }

  async start() {
    warmUpZxing();
    const [stream, detector] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60 },
        },
      }),
      createDetector(),
    ]);
    this.stream = stream;
    this.detector = detector;
    const { video } = this.opts;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    this.running = true;
    this.schedule();
  }

  stop() {
    this.running = false;
    const v = this.opts.video as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void };
    if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(this.frameHandle);
    else cancelAnimationFrame(this.frameHandle);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.opts.video.srcObject = null;
  }

  private schedule() {
    if (!this.running) return;
    const v = this.opts.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    this.frameHandle = v.requestVideoFrameCallback
      ? v.requestVideoFrameCallback(() => this.tick())
      : requestAnimationFrame(() => this.tick());
  }

  private tick() {
    if (!this.running) return;
    if (!this.busy) {
      this.busy = true;
      void this.decodeFrame().finally(() => {
        this.busy = false;
      });
    }
    this.schedule();
  }

  private async decodeFrame() {
    const video = this.opts.video;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const sw = Math.round(vw * ROI_W);
    const sh = Math.round(vh * ROI_H);
    const scale = Math.min(1, MAX_ROI_WIDTH / sw);
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);
    if (this.canvas.width !== dw) this.canvas.width = dw;
    if (this.canvas.height !== dh) this.canvas.height = dh;
    this.ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, dw, dh);

    const t0 = performance.now();
    let text: string | null = null;
    let format = '';
    if (this.detector) {
      const codes = await this.detector.detect(this.canvas);
      text = codes[0]?.rawValue ?? null;
      format = codes[0]?.format ?? '';
    } else {
      const res = await decodeWithZxing(this.ctx.getImageData(0, 0, dw, dh));
      text = res.text;
      format = res.format ?? '';
    }
    const decodeMs = performance.now() - t0;
    this.opts.onFrame?.({ decodeMs, engine: this.engine });
    if (text && this.running) {
      this.opts.onResult({ text: text.trim(), format, decodeMs, engine: this.engine });
    }
  }
}
