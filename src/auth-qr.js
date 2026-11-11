import jsQR from './vendor/jsqr.cjs';
import QRCode from './vendor/qrcode.cjs';

async function scan(file) {
  if (file.size > 15 * 1024 * 1024) throw new Error('authFileSizeError');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('authQrError'); }
  try {
    if (bitmap.width * bitmap.height > 24 * 1024 * 1024) throw new Error('authFileSizeError');
    if ('BarcodeDetector' in globalThis) {
      try {
        const codes = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bitmap);
        const values = codes.map(code => code.rawValue).filter(Boolean);
        if (values.length) return values;
      } catch { /* Fall back to the bundled offline scanner. */ }
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
    if (result?.data) return [result.data];
    // Match the screenshot-cropping fallback used by Quick 2FA.
    const side = Math.min(canvas.width, canvas.height);
    for (const ratio of [.96, .84, .7]) {
      const size = Math.floor(side * ratio);
      for (const y of [0, .25, .5, .75, 1]) for (const x of [0, .5, 1]) {
        const region = context.getImageData(Math.round((canvas.width - size) * x), Math.round((canvas.height - size) * y), size, size);
        const found = jsQR(region.data, size, size, { inversionAttempts: 'attemptBoth' });
        if (found?.data) return [found.data];
      }
    }
    throw new Error('authQrError');
  } finally { bitmap.close(); }
}
globalThis.dinkitAuthQr = { scan, toDataURL: (value, options) => QRCode.toDataURL(value, options) };
