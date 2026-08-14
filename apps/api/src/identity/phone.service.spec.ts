import { describe, expect, it } from 'vitest';

import { PhoneService } from './phone.service';

describe('PhoneService', () => {
  const service = new PhoneService();

  it('normaliza números mexicanos al formato E.164', () => {
    expect(service.normalize('999 123 4567')).toBe('+529991234567');
  });

  it('acepta números internacionales', () => {
    expect(service.normalize('+1 202 555 0123')).toBe('+12025550123');
  });

  it('rechaza texto y números incompletos', () => {
    expect(() => service.normalize('123')).toThrow();
  });
});
