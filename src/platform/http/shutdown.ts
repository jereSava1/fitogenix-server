// Apagado ordenado: Render manda SIGTERM al redeployar. `close()` deja de aceptar conexiones,
// responde 503 a las nuevas y espera a que terminen los requests en curso.

import type { FastifyInstance } from 'fastify';

type Exit = (code: number) => void;

export function closeOnSignals(
  app: FastifyInstance,
  { signals = ['SIGTERM', 'SIGINT'] as NodeJS.Signals[], exit = process.exit as Exit } = {},
): void {
  let closing = false;
  for (const signal of signals) {
    process.once(signal, () => {
      if (closing) return;
      closing = true;
      app.log.info({ signal }, 'Cerrando el server');
      app.close().then(
        () => exit(0),
        (err: unknown) => {
          app.log.error({ err }, 'Falló el cierre ordenado');
          exit(1);
        },
      );
    });
  }
}
