// Copia el binario WASM de ZXing-C++ a /public para servirlo localmente (sin CDN → funciona offline).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.cwd(), 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm');
if (existsSync(src)) {
  mkdirSync('public', { recursive: true });
  copyFileSync(src, join('public', 'zxing_reader.wasm'));
} else {
  console.warn('[copy-zxing-wasm] zxing_reader.wasm no encontrado');
}
