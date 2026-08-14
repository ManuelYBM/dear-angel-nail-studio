import { HttpException, HttpStatus } from '@nestjs/common';

export class TooManyRequestsException extends HttpException {
  constructor(response: { code: string; message: string }) {
    super(response, HttpStatus.TOO_MANY_REQUESTS);
  }
}
