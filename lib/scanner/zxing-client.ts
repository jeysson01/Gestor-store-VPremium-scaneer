type Pending = { resolve: (r: { text: string | null; format: string | null; ms: number }) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./zxing.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; text: string | null; format: string | null; ms: number }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      p.resolve(e.data);
    };
  }
  return worker;
}

/** Precarga el WASM (≈900 KB) para que el primer escaneo no pague la inicialización. */
export function warmUpZxing() {
  if (typeof window === 'undefined') return;
  const canvas = new OffscreenCanvas(8, 8);
  const ctx = canvas.getContext('2d')!;
  void decodeWithZxing(ctx.getImageData(0, 0, 8, 8));
}

export function decodeWithZxing(image: ImageData) {
  const id = ++seq;
  return new Promise<{ text: string | null; format: string | null; ms: number }>((resolve) => {
    pending.set(id, { resolve });
    // El buffer se transfiere (zero-copy) al worker.
    getWorker().postMessage({ id, image }, [image.data.buffer]);
  });
}
