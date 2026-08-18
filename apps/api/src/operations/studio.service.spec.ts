import { describe, expect, it, vi } from 'vitest';

import { StudioService } from './studio.service';

function png(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('StudioService icon upload', () => {
  it('rechaza iconos que no midan exactamente 512 por 512', async () => {
    const prisma = { studioSettings: { upsert: vi.fn() } };
    const service = new StudioService(prisma as never, {} as never, {} as never);
    const buffer = png(512, 256);

    await expect(
      service.uploadBrandAsset(
        {} as never,
        'icon',
        {
          buffer,
          mimetype: 'image/png',
          originalname: 'icon.png',
          size: buffer.length,
        },
        {} as never,
      ),
    ).rejects.toThrow(/512/);
    expect(prisma.studioSettings.upsert).not.toHaveBeenCalled();
  });
});
