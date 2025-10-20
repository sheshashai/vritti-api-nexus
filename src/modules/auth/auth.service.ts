import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './services/token.service';
import { SignupAttemptService } from './services/signup-attempt.service';
import {
  RefreshResponseDto,
  RefreshSuccessResponseDto,
  RefreshFailureResponseDto,
  UserDataDto,
} from './dto/refresh-response.dto';
import {
  SignupResponseDto,
  SignupSuccessResponseDto,
  SignupFailureResponseDto,
} from './dto/signup-response.dto';
import { SignupDto } from './dto/signup.dto';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly signupAttemptService: SignupAttemptService,
  ) {}

  /**
   * Refresh Application - Check refresh token and return access token
   */
  async refreshApplication(
    refreshToken?: string,
  ): Promise<RefreshResponseDto> {
    // No refresh token provided
    if (!refreshToken) {
      this.logger.warn('No refresh token provided');
      return {
        success: false,
        message: 'No session found',
        redirectTo: '/login',
      } as RefreshFailureResponseDto;
    }

    try {
      // Verify refresh token
      const payload = this.tokenService.verifyRefreshToken(refreshToken);

      // Check if token exists in database and is not revoked
      const tokenRecord = await this.prisma.refreshToken.findUnique({
        where: { id: payload.tokenId },
        include: { user: true },
      });

      if (!tokenRecord) {
        this.logger.warn(`Refresh token ${payload.tokenId} not found in DB`);
        return {
          success: false,
          message: 'Invalid session',
          redirectTo: '/login',
        } as RefreshFailureResponseDto;
      }

      if (tokenRecord.revoked) {
        this.logger.warn(`Refresh token ${payload.tokenId} has been revoked`);
        return {
          success: false,
          message: 'Session has been revoked',
          redirectTo: '/login',
        } as RefreshFailureResponseDto;
      }

      if (tokenRecord.expiresAt < new Date()) {
        this.logger.warn(`Refresh token ${payload.tokenId} has expired`);
        return {
          success: false,
          message: 'Session has expired',
          redirectTo: '/login',
        } as RefreshFailureResponseDto;
      }

      // Check if user is active
      const user = tokenRecord.user;
      if (user.status !== 'ACTIVE') {
        this.logger.warn(`User ${user.id} is not active: ${user.status}`);
        return {
          success: false,
          message: 'User account is not active',
          redirectTo: '/login',
        } as RefreshFailureResponseDto;
      }

      // Generate new access token
      const accessToken = this.tokenService.generateAccessToken(user);
      const expiresIn = this.tokenService.getAccessTokenExpiryInSeconds();

      // Check if refresh token should be rotated
      const shouldRotate = await this.tokenService.shouldRotateRefreshToken(
        payload.tokenId,
      );

      let newRefreshToken: string | undefined;
      if (shouldRotate) {
        this.logger.log(`Rotating refresh token for user ${user.id}`);
        const rotated = await this.tokenService.rotateRefreshToken(
          payload.tokenId,
          user.id,
        );
        newRefreshToken = rotated.token;
      }

      const userData: UserDataDto = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        status: user.status,
      };

      const response: RefreshSuccessResponseDto = {
        success: true,
        accessToken,
        user: userData,
        expiresIn,
      };

      // If token was rotated, include new refresh token in response
      // The controller will set this as a new cookie
      if (newRefreshToken) {
        (response as any).newRefreshToken = newRefreshToken;
      }

      this.logger.log(`Successfully refreshed application for user ${user.id}`);
      return response;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return {
          success: false,
          message: error.message,
          redirectTo: '/login',
        } as RefreshFailureResponseDto;
      }

      this.logger.error('Error refreshing application', error);
      return {
        success: false,
        message: 'An error occurred',
        redirectTo: '/login',
      } as RefreshFailureResponseDto;
    }
  }

  /**
   * Signup - Create or resume signup attempt
   */
  async signup(signupDto: SignupDto): Promise<SignupResponseDto> {
    const { email, firstName, lastName, password } = signupDto;

    try {
      // Check if user already exists
      const userExists = await this.signupAttemptService.checkUserExists(email);
      if (userExists) {
        this.logger.warn(`Signup attempt for existing user: ${email}`);
        return {
          success: false,
          message: 'An account with this email already exists',
          statusCode: 409,
        } as SignupFailureResponseDto;
      }

      // Check for existing in-progress signup attempt
      const existingAttempt =
        await this.signupAttemptService.findInProgressAttempt(email);

      if (existingAttempt) {
        // Resume existing attempt
        this.logger.log(`Resuming signup attempt for ${email}`);
        const resumedAttempt =
          await this.signupAttemptService.resumeSignupAttempt(existingAttempt);

        const signupToken = this.tokenService.generateSignupToken(
          resumedAttempt.id,
          resumedAttempt.email,
          resumedAttempt.currentStep,
        );

        return {
          success: true,
          signupToken,
          nextStep: resumedAttempt.currentStep,
          attemptId: resumedAttempt.id,
          resumedSession: true,
          completedSteps: resumedAttempt.completedSteps,
        } as SignupSuccessResponseDto;
      }

      // Create new signup attempt
      this.logger.log(`Creating new signup attempt for ${email}`);
      const attempt = await this.signupAttemptService.createSignupAttempt(
        email,
        firstName,
        lastName,
        password,
      );

      const signupToken = this.tokenService.generateSignupToken(
        attempt.id,
        attempt.email,
        attempt.currentStep,
      );

      return {
        success: true,
        signupToken,
        nextStep: attempt.currentStep,
        attemptId: attempt.id,
      } as SignupSuccessResponseDto;
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          success: false,
          message: error.message,
          statusCode: 409,
        } as SignupFailureResponseDto;
      }

      this.logger.error('Error during signup', error);
      return {
        success: false,
        message: 'An error occurred during signup',
        statusCode: 500,
      } as SignupFailureResponseDto;
    }
  }

  /**
   * Helper method to create user data DTO
   */
  private createUserData(user: User): UserDataDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerified: user.emailVerified,
      status: user.status,
    };
  }
}
