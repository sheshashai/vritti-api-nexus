import {
  Injectable,
  Logger,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { SignupAttempt, AttemptStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SignupAttemptService {
  private readonly logger = new Logger(SignupAttemptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if user already exists
   */
  async checkUserExists(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    return !!user;
  }

  /**
   * Find existing in-progress signup attempt
   */
  async findInProgressAttempt(email: string): Promise<SignupAttempt | null> {
    try {
      const attempt = await this.prisma.signupAttempt.findFirst({
        where: {
          email: email.toLowerCase(),
          status: AttemptStatus.IN_PROGRESS,
          expiresAt: {
            gt: new Date(), // not expired
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return attempt;
    } catch (error) {
      this.logger.error('Error finding in-progress attempt', error);
      return null;
    }
  }

  /**
   * Create new signup attempt
   */
  async createSignupAttempt(
    email: string,
    firstName: string,
    lastName: string,
    password: string,
  ): Promise<SignupAttempt> {
    try {
      // Check if user already exists
      const userExists = await this.checkUserExists(email);
      if (userExists) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }

      // Hash password
      const saltRounds = parseInt(
        this.configService.get<string>('BCRYPT_SALT_ROUNDS', '10'),
        10,
      );
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Calculate expiry (2 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 2);

      // Create signup attempt
      const attempt = await this.prisma.signupAttempt.create({
        data: {
          email: email.toLowerCase(),
          firstName,
          lastName,
          passwordHash,
          currentStep: 'email_verification',
          status: AttemptStatus.IN_PROGRESS,
          expiresAt,
        },
      });

      this.logger.log(`Created signup attempt for ${email}`);

      return attempt;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error('Failed to create signup attempt', error);
      throw new InternalServerErrorException('Failed to create signup attempt');
    }
  }

  /**
   * Resume existing signup attempt
   */
  async resumeSignupAttempt(
    existingAttempt: SignupAttempt,
  ): Promise<SignupAttempt> {
    try {
      // Update attempt count
      const updatedAttempt = await this.prisma.signupAttempt.update({
        where: { id: existingAttempt.id },
        data: {
          attemptCount: existingAttempt.attemptCount + 1,
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `Resumed signup attempt ${existingAttempt.id} for ${existingAttempt.email}`,
      );

      return updatedAttempt;
    } catch (error) {
      this.logger.error('Failed to resume signup attempt', error);
      throw new InternalServerErrorException('Failed to resume signup attempt');
    }
  }

  /**
   * Update signup attempt step
   */
  async updateSignupStep(
    attemptId: string,
    newStep: string,
    completedStep?: string,
  ): Promise<SignupAttempt> {
    try {
      const updateData: any = {
        currentStep: newStep,
        updatedAt: new Date(),
      };

      if (completedStep) {
        const attempt = await this.prisma.signupAttempt.findUnique({
          where: { id: attemptId },
        });

        if (attempt && !attempt.completedSteps.includes(completedStep)) {
          updateData.completedSteps = [
            ...attempt.completedSteps,
            completedStep,
          ];
        }
      }

      const updatedAttempt = await this.prisma.signupAttempt.update({
        where: { id: attemptId },
        data: updateData,
      });

      this.logger.log(`Updated signup attempt ${attemptId} to step: ${newStep}`);

      return updatedAttempt;
    } catch (error) {
      this.logger.error('Failed to update signup step', error);
      throw new InternalServerErrorException('Failed to update signup step');
    }
  }

  /**
   * Mark signup attempt as completed
   */
  async completeSignupAttempt(attemptId: string): Promise<void> {
    try {
      await this.prisma.signupAttempt.update({
        where: { id: attemptId },
        data: {
          status: AttemptStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      this.logger.log(`Completed signup attempt ${attemptId}`);
    } catch (error) {
      this.logger.error('Failed to complete signup attempt', error);
      throw new InternalServerErrorException(
        'Failed to complete signup attempt',
      );
    }
  }

  /**
   * Mark expired signup attempts
   */
  async markExpiredAttempts(): Promise<number> {
    try {
      const result = await this.prisma.signupAttempt.updateMany({
        where: {
          status: AttemptStatus.IN_PROGRESS,
          expiresAt: {
            lt: new Date(),
          },
        },
        data: {
          status: AttemptStatus.EXPIRED,
        },
      });

      if (result.count > 0) {
        this.logger.log(`Marked ${result.count} signup attempts as expired`);
      }

      return result.count;
    } catch (error) {
      this.logger.error('Failed to mark expired attempts', error);
      return 0;
    }
  }

  /**
   * Get signup attempt by ID
   */
  async getSignupAttempt(attemptId: string): Promise<SignupAttempt | null> {
    try {
      return await this.prisma.signupAttempt.findUnique({
        where: { id: attemptId },
      });
    } catch (error) {
      this.logger.error('Failed to get signup attempt', error);
      return null;
    }
  }

  /**
   * Verify password matches stored hash
   */
  async verifyPassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Hash password
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = parseInt(
      this.configService.get<string>('BCRYPT_SALT_ROUNDS', '10'),
      10,
    );
    return bcrypt.hash(password, saltRounds);
  }
}
