export class SignupSuccessResponseDto {
  success: true;
  signupToken: string;
  nextStep: string;
  attemptId: string;
  resumedSession?: boolean;
  completedSteps?: string[];
}

export class SignupFailureResponseDto {
  success: false;
  message: string;
  statusCode?: number;
}

export type SignupResponseDto =
  | SignupSuccessResponseDto
  | SignupFailureResponseDto;
