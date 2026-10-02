// Un solo logger (pino) para Fastify y los módulos: JSON y sin datos sensibles.

import pino from 'pino';

/** Lo que nunca va a los logs (los serializadores de Fastify no loguean headers, pero un
 *  `log.info({ headers })` sí). */
export const LOG_REDACT = ['req.headers.authorization', 'req.headers.cookie', 'headers.authorization', 'headers.cookie'];

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', redact: LOG_REDACT });
