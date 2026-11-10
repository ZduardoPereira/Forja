import pino from 'pino';

/** Logs JSON. Nunca registramos corpo de requisição, query string, senhas ou tokens. */
export function createLogger(level: string) {
  return pino({
    level,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.currentPassword', '*.newPassword', '*.token', '*.passwordHash', '*.accessToken', '*.refreshToken'],
      censor: '[REDACTED]',
    },
  });
}
