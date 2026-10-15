import { describe, expect, test } from 'bun:test';
import { detectUploadFormat, MAX_UPLOAD_BYTES, validateUpload, UploadValidationError } from '../upload-policy';

const pdf = new TextEncoder().encode('%PDF-1.7 ejemplo');
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const svg = new TextEncoder().encode('<svg onload="alert(1)"/>');
const html = new TextEncoder().encode('<script>alert(1)</script>');

describe('uploads seguros', () => {
  test('reconoce JPEG, PNG y PDF por firma real', () => {
    expect(detectUploadFormat(jpeg)?.ext).toBe('jpg');
    expect(detectUploadFormat(png)?.ext).toBe('png');
    expect(detectUploadFormat(pdf)?.ext).toBe('pdf');
  });
  test('bloquea HTML, SVG y contenido desconocido', () => {
    expect(() => validateUpload(html, html.length)).toThrow(UploadValidationError);
    expect(() => validateUpload(svg, svg.length)).toThrow(UploadValidationError);
    expect(detectUploadFormat(Uint8Array.from([0,1,2,3]))).toBeNull();
  });
  test('sólo permite imágenes en rutas de fotos', () => {
    expect(() => validateUpload(pdf, pdf.length, true)).toThrow();
    expect(validateUpload(jpeg, jpeg.length, true).mime).toBe('image/jpeg');
  });
  test('rechaza archivos vacíos y grandes antes de almacenarlos', () => {
    expect(() => validateUpload(jpeg, 0)).toThrow();
    expect(() => validateUpload(jpeg, MAX_UPLOAD_BYTES + 1)).toThrow('20 MB');
  });
  test('no confía en nombre ni tipo declarado por un navegador', () => {
    expect(detectUploadFormat(html)).toBeNull();
  });
});
