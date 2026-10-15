// Política de archivos subidos: validar el contenido, nunca la extensión aportada por el navegador.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export class UploadValidationError extends Error {
  constructor(message: string, public status: 400 | 413 = 400) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

const starts = (b: Uint8Array, sig: number[]) =>
  b.length >= sig.length && sig.every((v, i) => b[i] === v);
const ascii = (b: Uint8Array, offset: number, len: number) =>
  String.fromCharCode(...b.slice(offset, offset + len));

export function detectUploadFormat(bytes: Uint8Array): { ext: string; mime: string; image: boolean } | null {
  if (starts(bytes, [0xff, 0xd8, 0xff])) return { ext: 'jpg', mime: 'image/jpeg', image: true };
  if (starts(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return { ext: 'png', mime: 'image/png', image: true };
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')
    return { ext: 'gif', mime: 'image/gif', image: true };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP')
    return { ext: 'webp', mime: 'image/webp', image: true };
  if (ascii(bytes, 0, 5) === '%PDF-') return { ext: 'pdf', mime: 'application/pdf', image: false };
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1'].includes(brand))
      return { ext: 'heic', mime: 'image/heic', image: true };
    if (['avif', 'avis'].includes(brand))
      return { ext: 'avif', mime: 'image/avif', image: true };
  }
  return null;
}

export function validateUpload(bytes: Uint8Array, size: number, imagesOnly = false) {
  if (!Number.isFinite(size) || size < 1) throw new UploadValidationError('Archivo vacío o inválido.');
  if (size > MAX_UPLOAD_BYTES) throw new UploadValidationError('El archivo supera el límite de 20 MB.', 413);
  const format = detectUploadFormat(bytes);
  if (!format || (imagesOnly && !format.image)) {
    throw new UploadValidationError(imagesOnly
      ? 'Sólo se permiten imágenes JPEG, PNG, GIF, WebP, HEIC o AVIF.'
      : 'Sólo se permiten imágenes o archivos PDF válidos.');
  }
  return format;
}
