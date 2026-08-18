import { describe, expect, it } from 'vitest';

import { readImageMetadata } from './image-metadata';

describe('readImageMetadata', () => {
  it('lee dimensiones PNG desde IHDR', () => {
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
    buffer.writeUInt32BE(13, 8);
    buffer.write('IHDR', 12, 'ascii');
    buffer.writeUInt32BE(512, 16);
    buffer.writeUInt32BE(512, 20);
    expect(readImageMetadata(buffer)).toEqual({ mimeType: 'image/png', width: 512, height: 512 });
  });

  it('lee dimensiones WebP VP8X', () => {
    const buffer = Buffer.alloc(30);
    buffer.write('RIFF', 0, 'ascii');
    buffer.write('WEBP', 8, 'ascii');
    buffer.write('VP8X', 12, 'ascii');
    buffer.writeUIntLE(511, 24, 3);
    buffer.writeUIntLE(511, 27, 3);
    expect(readImageMetadata(buffer)).toEqual({ mimeType: 'image/webp', width: 512, height: 512 });
  });

  it('rechaza contenido que no es una imagen soportada', () => {
    expect(readImageMetadata(Buffer.from('no es una imagen'))).toBeNull();
  });

  it('no acepta una firma PNG sin un encabezado IHDR', () => {
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
    buffer.writeUInt32BE(512, 16);
    buffer.writeUInt32BE(512, 20);
    expect(readImageMetadata(buffer)).toBeNull();
  });
});
