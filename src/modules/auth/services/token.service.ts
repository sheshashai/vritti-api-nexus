import {
  Injectable,
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { User } from '@prisma/client';
import * as crypto from 'crypto';

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string; // user id
  tokenId: string; // refresh token id in database
  type: 'refresh';
}

export interface SignupTokenPayload {
  attemptId: string;
  email: string;
  type: 'signup';
  currentStep: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate access token (15 min expiry)
   */
  generateAccessToken(user: User): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
    };

    return this.jwtService.sign(
      payload as any,
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRY') || '15m',
      } as any,
    );
  }

  /**
   * Generate refresh token and store in database (30 day expiry)
   */
  async generateRefreshToken(userId: string): Promise<{
    token: string;
    expiresAt: Date;
    tokenId: string;
  }> {
    try {
      const tokenId = crypto.randomUUID();
      const expiryDays = parseInt(
        this.configService
          .get<string>('JWT_REFRESH_EXPIRY', '30d')
          .replace('d', ''),
        10,
      );
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);

      const payload: RefreshTokenPayload = {
        sub: userId,
        tokenId,
        type: 'refresh',
      };

      const token = this.jwtService.sign(
        payload as any,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRY') || '30d',
        } as any,
      );

      // Store refresh token in database
      await this.prisma.refreshToken.create({
        data: {
          id: tokenId,
          token,
          userId,
          expiresAt,
        },
      });

      this.logger.log(`Generated refresh token for user ${userId}`);

      return { token, expiresAt, tokenId };
    } catch (error) {
      this.logger.error('Failed to generate refresh token', error);
      throw new InternalServerErrorException('Failed to generate refresh token');
    }
  }

  /**
   * Generate signup token (2 hour expiry)
   */
  generateSignupToken(
    attemptId: string,
    email: string,
    currentStep: string,
  ): string {
    const payload: SignupTokenPayload = {
      attemptId,
      email,
      type: 'signup',
      currentStep,
    };

    return this.jwtService.sign(
      payload as any,
      {
        secret: this.configService.getOrThrow<string>('JWT_SIGNUP_SECRET'),
        expiresIn: this.configService.get<string>('JWT_SIGNUP_EXPIRY') || '2h',
      } as any,
    );
  }

  /**
   * Verify and decode access token
   */
  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = this.jwtService.verify<AccessTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        } as any,
      );

      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }

      return payload;
    } catch (error) {
      this.logger.warn(`Invalid access token: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /**
   * Verify and decode refresh token
   */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        } as any,
      );

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      return payload;
    } catch (error) {
      this.logger.warn(`Invalid refresh token: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Verify and decode signup token
   */
  verifySignupToken(token: string): SignupTokenPayload {
    try {
      const payload = this.jwtService.verify<SignupTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_SIGNUP_SECRET'),
        } as any,
      );

      if (payload.type !== 'signup') {
        throw new UnauthorizedException('Invalid token type');
      }

      return payload;
    } catch (error) {
      this.logger.warn(`Invalid signup token: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired signup token');
    }
  }

  /**
   * Check if refresh token needs rotation (older than 7 days)
   */
  async shouldRotateRefreshToken(tokenId: string): Promise<boolean> {
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
    });

    if (!refreshToken) {
      return false;
    }

    const rotationDays = parseInt(
      this.configService.get<string>('REFRESH_TOKEN_ROTATION_DAYS', '7'),
      10,
    );

    const daysSinceCreation =
      (Date.now() - refreshToken.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceCreation >= rotationDays;
  }

  /**
   * Rotate refresh token - revoke old and generate new
   */
  async rotateRefreshToken(
    oldTokenId: string,
    userId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    try {
      // Revoke old token
      await this.prisma.refreshToken.update({
        where: { id: oldTokenId },
        data: { revoked: true },
      });

      this.logger.log(
        `Rotated refresh token ${oldTokenId} for user ${userId}`,
      );

      // Generate new token
      const { token, expiresAt } = await this.generateRefreshToken(userId);
      return { token, expiresAt };
    } catch (error) {
      this.logger.error('Failed to rotate refresh token', error);
      throw new InternalServerErrorException('Failed to rotate refresh token');
    }
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(tokenId: string): Promise<void> {
    try {
      await this.prisma.refreshToken.update({
        where: { id: tokenId },
        data: { revoked: true },
      });

      this.logger.log(`Revoked refresh token ${tokenId}`);
    } catch (error) {
      this.logger.error('Failed to revoke refresh token', error);
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    try {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });

      this.logger.log(`Revoked all refresh tokens for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to revoke all refresh tokens', error);
    }
  }

  /**
   * Get access token expiry in seconds
   */
  getAccessTokenExpiryInSeconds(): number {
    const expiry = this.configService.get<string>('JWT_ACCESS_EXPIRY', '15m');
    // Parse expiry string like '15m', '2h', '7d'
    const value = parseInt(expiry.slice(0, -1), 10);
    const unit = expiry.slice(-1);

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 900; // default 15 minutes
    }
  }
}
