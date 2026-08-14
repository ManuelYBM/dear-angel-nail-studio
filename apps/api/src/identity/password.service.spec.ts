import { describe, expect, it } from 'vitest';

import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('genera hashes diferentes y verificables', async () => {
    const first = await service.hash('CartaSegura2026');
    const second = await service.hash('CartaSegura2026');

    expect(first).not.toBe(second);
    await expect(service.verify('CartaSegura2026', first)).resolves.toBe(true);
    await expect(service.verify('incorrecta', first)).resolves.toBe(false);
  });

  it('rechaza formatos desconocidos', async () => {
    await expect(service.verify('secreto', 'texto-plano')).resolves.toBe(false);
  });
});
