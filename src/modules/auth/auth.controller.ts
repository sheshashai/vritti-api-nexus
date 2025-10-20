import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import {
  RefreshSuccessResponseDto,
  RefreshFailureResponseDto,
} from './dto/refresh-response.dto';
import {
  SignupSuccessResponseDto,
  SignupFailureResponseDto,
} from './dto/signup-response.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * GET /auth/refresh-application
   * Check for refresh token in cookie and return access token
   */
  @Get('refresh-application')
  async refreshApplication(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    // Extract refresh token from cookie
    const refreshToken = req.cookies?.session;

    this.logger.log('Refresh application request received');

    const result = await this.authService.refreshApplication(refreshToken);

    if (!result.success) {
      const failureResult = result as RefreshFailureResponseDto;
      return res.status(HttpStatus.UNAUTHORIZED).send(failureResult);
    }

    const successResult = result as RefreshSuccessResponseDto;

    // If token was rotated, update the cookie
    if ((successResult as any).newRefreshToken) {
      const newRefreshToken = (successResult as any).newRefreshToken;
      delete (successResult as any).newRefreshToken;

      res.setCookie('session', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/',
      });

      this.logger.log('Refresh token rotated and cookie updated');
    }

    return res.status(HttpStatus.OK).send(successResult);
  }

  /**
   * POST /auth/signup
   * Create or resume signup attempt
   */
  @Post('signup')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async signup(
    @Body() signupDto: SignupDto,
    @Res() res: FastifyReply,
  ) {
    this.logger.log(`Signup request received for email: ${signupDto.email}`);

    const result = await this.authService.signup(signupDto);

    if (!result.success) {
      const failureResult = result as SignupFailureResponseDto;
      const statusCode = failureResult.statusCode || HttpStatus.BAD_REQUEST;
      return res.status(statusCode).send(failureResult);
    }

    const successResult = result as SignupSuccessResponseDto;
    return res.status(HttpStatus.OK).send(successResult);
  }
}
