import { Type } from '@sinclair/typebox';

/** D-48: `/auth/*` con 10 pedidos por minuto por IP (el general es 60). */
export const AUTH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

export const Email = Type.String({ format: 'email', maxLength: 254 });
export const Password = Type.String({ minLength: 8, maxLength: 72 });
