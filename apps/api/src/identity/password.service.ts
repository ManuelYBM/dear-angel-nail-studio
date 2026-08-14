import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await this.derive(password, salt, COST, BLOCK_SIZE, PARALLELIZATION);
    return [
      'scrypt',
      'v1',
      COST,
      BLOCK_SIZE,
      PARALLELIZATION,
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const parts = encoded.split('$');
    if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== 'v1') {
      return false;
    }

    const cost = Number(parts[2]);
    const blockSize = Number(parts[3]);
    const parallelization = Number(parts[4]);
    const saltPart = parts[5];
    const hashPart = parts[6];
    if (!saltPart || !hashPart || !cost || !blockSize || !parallelization) {
      return false;
    }

    const expected = Buffer.from(hashPart, 'base64url');
    const actual = await this.derive(
      password,
      Buffer.from(saltPart, 'base64url'),
      cost,
      blockSize,
      parallelization,
    );
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private derive(
    password: string,
    salt: Buffer,
    cost: number,
    blockSize: number,
    parallelization: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        KEY_LENGTH,
        { N: cost, r: blockSize, p: parallelization, maxmem: MAX_MEMORY },
        (error, key) => (error ? reject(error) : resolve(key)),
      );
    });
  }
}
