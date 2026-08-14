import { BadRequestException, Injectable } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

@Injectable()
export class PhoneService {
  normalize(input: string): string {
    const phone = parsePhoneNumberFromString(input.trim(), {
      defaultCountry: 'MX',
      extract: false,
    });
    if (!phone?.isValid()) {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'Escribe un número válido con lada; por ejemplo, +52 999 123 4567.',
      });
    }
    return phone.number;
  }

  mask(input: string): string {
    const visible = input.slice(-4);
    return `${input.slice(0, Math.min(3, input.length - 4))}${'•'.repeat(
      Math.max(4, input.length - visible.length - 3),
    )}${visible}`;
  }
}
