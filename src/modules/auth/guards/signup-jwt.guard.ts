import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { TokenService } from '../services/token.service';
import { SignupAttemptService } from '../services/signup-attempt.service';
import { AttemptStatus } from '@prisma/client';

@Injectable()
export class SignupJwtGuard implements CanActivate {
  private readonly logger = new Logger(SignupJwtGuard.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly signupAttemptService: SignupAttemptService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // Extract token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Missing or invalid Authorization header');
      throw new UnauthorizedException('Signup token required');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Verify token
      const payload = this.tokenService.verifySignupToken(token);

      // Fetch signup attempt from database
      const attempt = await this.signupAttemptService.getSignupAttempt(
        payload.attemptId,
      );

      if (!attempt) {
        this.logger.warn(`Signup attempt ${payload.attemptId} not found`);
        throw new UnauthorizedException('Signup attempt not found');
      }

      if (attempt.status !== AttemptStatus.IN_PROGRESS) {
        this.logger.warn(
          `Signup attempt ${payload.attemptId} is not in progress: ${attempt.status}`,
        );
        throw new UnauthorizedException('Signup attempt is not in progress');
      }

      if (attempt.expiresAt < new Date()) {
        this.logger.warn(`Signup attempt ${payload.attemptId} has expired`);
        throw new UnauthorizedException('Signup attempt has expired');
      }

      // Attach signup attempt to request
      (request as any).signupAttempt = attempt;
      (request as any).signupToken = payload;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error('Signup token verification failed', error);
      throw new UnauthorizedException('Invalid signup token');
    }
  }
}
