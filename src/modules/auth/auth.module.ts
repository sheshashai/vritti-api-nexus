import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { SignupAttemptService } from './services/signup-attempt.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SignupJwtGuard } from './guards/signup-jwt.guard';

@Module({
  imports: [
    JwtModule.register({
      global: false, // We'll use specific secrets for different token types
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SignupAttemptService,
    JwtAuthGuard,
    SignupJwtGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    SignupAttemptService,
    JwtAuthGuard,
    SignupJwtGuard,
  ],
})
export class AuthModule {}
