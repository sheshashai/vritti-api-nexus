import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User, SignupAttempt } from '@prisma/client';

/**
 * Decorator to extract current user from request
 * Used with JwtAuthGuard
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

/**
 * Decorator to extract signup attempt from request
 * Used with SignupJwtGuard
 */
export const CurrentSignupAttempt = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): SignupAttempt => {
    const request = ctx.switchToHttp().getRequest();
    return request.signupAttempt;
  },
);

/**
 * Decorator to extract signup token payload from request
 * Used with SignupJwtGuard
 */
export const SignupToken = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.signupToken;
  },
);
