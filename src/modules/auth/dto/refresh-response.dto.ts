export class UserDataDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  status: string;
}

export class RefreshSuccessResponseDto {
  success: true;
  accessToken: string;
  user: UserDataDto;
  expiresIn: number; // seconds
}

export class RefreshFailureResponseDto {
  success: false;
  message: string;
  redirectTo?: string;
}

export type RefreshResponseDto =
  | RefreshSuccessResponseDto
  | RefreshFailureResponseDto;
