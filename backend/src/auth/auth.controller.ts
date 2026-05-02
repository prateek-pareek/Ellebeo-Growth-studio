import { Controller, Post, Body, Req, Res, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const { accessToken, refreshToken } = await this.authService.login(loginDto, ipAddress, userAgent);

    this.setRefreshTokenCookie(res, refreshToken);

    return { accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const oldRefreshToken = req.cookies['refresh_token'];
    if (!oldRefreshToken) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        success: false,
        error: { code: 'NO_TOKEN', message: 'No refresh token provided' },
      });
      return;
    }

    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const { accessToken, refreshToken } = await this.authService.refreshTokens(oldRefreshToken, ipAddress, userAgent);

    this.setRefreshTokenCookie(res, refreshToken);

    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refresh_token'];
    await this.authService.logout(refreshToken);

    res.clearCookie('refresh_token');
    return { message: 'Logged out successfully' };
  }

  @Post('verify-email')
  async verifyEmail(@Body('token') token: string) {
    return { message: 'Email verified successfully' };
  }

  @Post('resend-verification')
  async resendVerification(@Body('email') email: string) {
    return { message: 'Verification email sent' };
  }

  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return { message: 'Password reset link sent' };
  }

  @Post('reset-password')
  async resetPassword(@Body('token') token: string, @Body('password') password: string) {
    return { message: 'Password reset successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Req() req: any) {
    // The user object is attached by JwtStrategy
    return {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
    };
  }

  private setRefreshTokenCookie(res: Response, token: string) {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }
}
