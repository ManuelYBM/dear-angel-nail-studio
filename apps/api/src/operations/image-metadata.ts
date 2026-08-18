export type SupportedImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageMetadata {
  mimeType: SupportedImageMime;
  width: number;
  height: number;
}

const JPEG_START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function readImageMetadata(buffer: Buffer): ImageMetadata | null {
  const png = readPng(buffer);
  if (png) return png;
  const jpeg = readJpeg(buffer);
  if (jpeg) return jpeg;
  return readWebp(buffer);
}

function readPng(buffer: Buffer): ImageMetadata | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
  if (buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return valid('image/png', width, height);
}

function readJpeg(buffer: Buffer): ImageMetadata | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length) {
    while (buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset]!;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (JPEG_START_OF_FRAME.has(marker) && length >= 7) {
      return valid('image/jpeg', buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
    }
    offset += length;
  }
  return null;
}

function readWebp(buffer: Buffer): ImageMetadata | null {
  if (
    buffer.length < 25 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  )
    return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return valid('image/webp', buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1);
  }
  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return valid('image/webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (
    chunk === 'VP8 ' &&
    buffer.length >= 30 &&
    buffer[23] === 0x9d &&
    buffer[24] === 0x01 &&
    buffer[25] === 0x2a
  ) {
    return valid('image/webp', buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
  }
  return null;
}

function valid(mimeType: SupportedImageMime, width: number, height: number): ImageMetadata | null {
  return width > 0 && height > 0 ? { mimeType, width, height } : null;
}
