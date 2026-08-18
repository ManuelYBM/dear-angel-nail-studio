import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import {
  AllowPasswordChangeRequired,
  CurrentSessionId,
  CurrentUser,
  Public,
} from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/auth.types';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterClientDto,
  ResendVerificationDto,
  ResetPasswordDto,
  UpdateOwnProfileDto,
  VerifyCodeDto,
} from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register/client')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  registerClient(@Body() dto: RegisterClientDto, @Req() request: Request) {
    return this.auth.registerClient(dto, request);
  }

  @Public()
  @Post('verify-phone')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyPhone(
    @Body() dto: VerifyCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.verifyPhone(dto, request, response);
  }

  @Public()
  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto.challengeId);
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(dto, request, response);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    return this.auth.resetPassword(dto, request);
  }

  @Get('me')
  @AllowPasswordChangeRequired()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOwnProfileDto,
    @Req() request: Request,
  ) {
    return this.auth.updateProfile(user, dto, request);
  }

  @Post('change-password')
  @AllowPasswordChangeRequired()
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentSessionId() sessionId: string,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ) {
    return this.auth.changePassword(user, sessionId, dto, request);
  }

  @Post('logout')
  @AllowPasswordChangeRequired()
  logout(@CurrentSessionId() sessionId: string, @Res({ passthrough: true }) response: Response) {
    return this.auth.logout(sessionId, response);
  }

  @Post('logout-all')
  @AllowPasswordChangeRequired()
  logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logoutAll(user.id, response);
  }
}
