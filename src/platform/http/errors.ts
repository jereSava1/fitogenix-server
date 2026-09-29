/* Errores HTTP con el formato único del contrato: `{ error, code }` (K-03,
 * 03-contratos §B.2).
 *
 * Los handlers responden sus errores con `apiError`. Lo que no responde un
 * handler —la validación de ajv, los 4xx propios de Fastify (JSON roto, body
 * demasiado grande, content-type no soportado), el rate limit, una ruta que no
 * existe y cualquier excepción— lo arma `registerErrorHandling`, que `buildApp`
 * instala en la raíz. Al cliente le llega un mensaje en español; el detalle
 * técnico va solo al log. El 503 ante una dependencia caída se suma en H-01.
 */

import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiError, ErrorCode } from './schemas';

export const VALIDATION_MESSAGE = 'La solicitud no es válida.';
export const RATE_LIMITED_MESSAGE = 'Demasiadas solicitudes. Intentá de nuevo en un momento.';
export const NOT_FOUND_ROUTE_MESSAGE = 'La ruta no existe.';
export const INTERNAL_MESSAGE = 'Ocurrió un error inesperado. Intentá de nuevo en un momento.';

export function apiError(code: ErrorCode, error: string): ApiError {
  return { error, code };
}

/**
 * Lo que tira `@fastify/rate-limit` al pasarse del límite (`errorResponseBuilder`).
 * Tiene que llevar `statusCode`: sin él, Fastify lo trataba como un error
 * interno y respondía 500 (caracterizado en M-02).
 */
export function rateLimitedError(statusCode: number): FastifyError {
  return Object.assign(new Error(RATE_LIMITED_MESSAGE), {
    statusCode,
    code: 'RATE_LIMITED',
    name: 'RateLimitedError',
  });
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((err, request, reply) => {
    if (err.validation) {
      request.log.info(
        { validation: err.validation, context: err.validationContext },
        'Request inválida: %s',
        err.message,
      );
      return reply.status(400).send(apiError('VALIDATION_ERROR', VALIDATION_MESSAGE));
    }

    const status = err.statusCode ?? 500;
    if (status === 429) {
      return reply.status(429).send(apiError('RATE_LIMITED', RATE_LIMITED_MESSAGE));
    }
    // Los 4xx que arma Fastify antes de llegar al handler: el cliente mandó
    // algo que no se puede procesar (JSON roto, 413, 415…).
    if (status >= 400 && status < 500) {
      request.log.info({ code: err.code }, 'Request rechazada por Fastify: %s', err.message);
      return reply.status(status).send(apiError('VALIDATION_ERROR', VALIDATION_MESSAGE));
    }

    request.log.error(err, 'Error no manejado');
    return reply.status(500).send(apiError('INTERNAL', INTERNAL_MESSAGE));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(apiError('NOT_FOUND', NOT_FOUND_ROUTE_MESSAGE)),
  );
}
