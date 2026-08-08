import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AppConfig } from '@outlet/config';
import type { CaptchaProvider } from '@outlet/auth';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from '@outlet/validation';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from '../../common/auth.guard';
import { SessionService } from '../../common/session.service';
import { CurrentUser, OptionalAuth } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { APP_CONFIG, CAPTCHA_PROVIDER } from '../../common/tokens';
import type { AuthedRequest, RequestUser } from '../../common/request-user';
import { BadRequestException } from '@nestjs/common';

@ApiTags('auth')
@Controller('auth')
@UseGuards(SessionAuthGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CAPTCHA_PROVIDER) private readonly captcha: CaptchaProvider,
  ) {}

  private async verifyCaptcha(token: string | undefined, ip?: string): Promise<void> {
    const ok = await this.captcha.verify(token, ip);
    if (!ok) throw new BadRequestException('Captcha verification failed.');
  }

  @Post('register')
  @OptionalAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a customer account and send a verification email' })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: AuthedRequest,
  ) {
    await this.verifyCaptcha(body.captchaToken, req.ip);
    await this.auth.register(body, req.ip);
    return { message: 'Registered. Check your email for a verification link.' };
  }

  @Post('verify-email')
  @OptionalAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify an email address using the emailed token' })
  async verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    await this.auth.verifyEmail(body.token);
    return { message: 'Email verified. You can now sign in.' };
  }

  @Post('login')
  @OptionalAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Log in; sets the HttpOnly session cookie' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.verifyCaptcha(body.captchaToken, req.ip);
    const result = await this.auth.login(body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      anonymousCartToken: req.cartToken,
    });
    this.sessions.setSessionCookie(res, result.token, result.expiresAt);
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log out and revoke the current session' })
  async logout(@CurrentUser() user: RequestUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    this.sessions.clearSessionCookie(res);
    return { message: 'Logged out.' };
  }

  @Post('forgot-password')
  @OptionalAuth()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request a password-reset email' })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: AuthedRequest,
  ) {
    await this.verifyCaptcha(body.captchaToken, req.ip);
    await this.auth.forgotPassword(body);
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  @OptionalAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset the password using the emailed token' })
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    await this.auth.resetPassword(body);
    return { message: 'Password updated. Please sign in.' };
  }

  @Post('change-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Change password (revokes other sessions)' })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword, user.sessionId);
    return { message: 'Password changed.' };
  }

  @Get('me')
  @OptionalAuth()
  @ApiOperation({ summary: 'Current session user (null when signed out)' })
  me(@CurrentUser({ required: false }) user?: RequestUser) {
    if (!user) return { user: null };
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
        roles: user.roles,
        permissions: [...user.permissions],
      },
    };
  }
}
