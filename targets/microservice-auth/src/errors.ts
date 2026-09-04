export class AuthError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message = 'Invalid email or password') {
    super(message, 'INVALID_CREDENTIALS', 401);
  }
}

export class TokenExpiredError extends AuthError {
  constructor(message = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED', 401);
  }
}

export class RateLimitExceededError extends AuthError {
  constructor(message = 'Too many authentication attempts') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
  }
}
