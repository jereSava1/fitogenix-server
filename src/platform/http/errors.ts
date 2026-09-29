// Errores con el formato único `{ error, code }`. Lo que no responde un handler (validación,
// 4xx de Fastify, rate limit, ruta inexistente, excepciones) lo arma `registerErrorHandling`:
// al cliente, un mensaje en español; el detalle, al log.

import type { FastifyError, FastifyInstance } from 'fastify';
import { DependencyUnavailableError } from '../dependencyError';
import type { ApiError, ErrorCode } from './schemas';

export const VALIDATION_MESSAGE = 'La solicitud no es válida.';
export const RATE_LIMITED_MESSAGE = 'Demasiadas solicitudes. Intentá de nuevo en un momento.';
export const NOT_FOUND_ROUTE_MESSAGE = 'La ruta no existe.';
export const INTERNAL_MESSAGE = 'Ocurrió un error inesperado. Intentá de nuevo en un momento.';
export const UNAVAILABLE_MESSAGE = 'El servicio no está disponible en este momento. Intentá de nuevo en un rato.';
/** Segundos que se le sugieren al cliente antes de reintentar un 503. */
export const UNAVAILABLE_RETRY_AFTER_S = 10;

export function apiError(code: ErrorCode, error: string): ApiError {
  return { error, code };
}

/** Para `errorResponseBuilder` del rate limit: sin `statusCode`, Fastify respondía 500. */
export function rateLimitedError(statusCode: number): FastifyError {
  return Object.assign(new Error(RATE_LIMITED_MESSAGE), {
    statusCode,
    code: 'RATE_LIMITED',
    name: 'RateLimitedError',
  });
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((err, request, reply) => {
    if (err instanceof DependencyUnavailableError) {
      request.log.warn({ err, dependency: err.dependency }, 'Dependencia no disponible');
      return reply
        .status(503)
        .header('retry-after', String(UNAVAILABLE_RETRY_AFTER_S))
        .send(apiError('DEPENDENCY_UNAVAILABLE', UNAVAILABLE_MESSAGE));
    }
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
