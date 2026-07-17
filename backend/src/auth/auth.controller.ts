import { Controller, Post, Body, Req, Res, Get, UseGuards, HttpCode, HttpStatus, UploadedFile, UseInterceptors, UnauthorizedException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// Shape JwtStrategy.validate() attaches to req.user once JwtAuthGuard passes.
interface AuthenticatedRequest extends Request {
  user: { userId: string; role: string; tenantId?: string };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 * 15 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const { accessToken, refreshToken } = await this.authService.login(loginDto, ipAddress, userAgent);

    this.setRefreshTokenCookie(res, refreshToken);

    return { accessToken, refreshToken };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60_000 * 15 } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const oldRefreshToken = req.cookies['refresh_token'] || req.body.refreshToken;
    if (!oldRefreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const { accessToken, refreshToken } = await this.authService.refreshTokens(oldRefreshToken, ipAddress, userAgent);

    this.setRefreshTokenCookie(res, refreshToken);

    return { accessToken, refreshToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refresh_token'];
    await this.authService.logout(refreshToken);

    res.clearCookie('refresh_token');
    return { message: 'Logged out successfully' };
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleLogin(
    @Body('firebaseIdToken') firebaseIdToken: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.firebaseLogin(
      firebaseIdToken, req.ip, req.headers['user-agent'],
    );
    this.setRefreshTokenCookie(res, refreshToken);
    return { accessToken, refreshToken };
  }

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  async appleLogin(
    @Body('firebaseIdToken') firebaseIdToken: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.firebaseLogin(
      firebaseIdToken, req.ip, req.headers['user-agent'],
    );
    this.setRefreshTokenCookie(res, refreshToken);
    return { accessToken, refreshToken };
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
  @Throttle({ default: { limit: 5, ttl: 60_000 * 15 } })
  async forgotPassword(@Body('email') email: string) {
    return { message: 'Password reset link sent' };
  }

  @Post('reset-password')
  async resetPassword(@Body('token') token: string, @Body('password') password: string) {
    return { message: 'Password reset successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('accept-terms')
  @HttpCode(HttpStatus.OK)
  async acceptTerms(@Req() req: AuthenticatedRequest) {
    return this.authService.acceptTerms(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload-avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File) {
    return this.authService.uploadAvatar(req.user.userId, file);
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
