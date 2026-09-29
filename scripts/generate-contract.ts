/* Genera el contrato HTTP del server (ADR-0011, K-01).
 *
 *   npm run contract:generate   escribe contract/openapi.json
 *   npm run contract:check      falla si el archivo commiteado no coincide
 *                               con lo que generan los schemas (lo corre el CI)
 *
 * Arma la misma app que `main.ts` (`buildApp` + `registerModules`) con
 * @fastify/swagger adelante, sin escuchar puertos ni conectarse a nada, y
 * escribe el OpenAPI 3.1 que sale de los schemas TypeBox de las rutas. Los
 * schemas con `$id` quedan en `components.schemas` con ese nombre. `/health`
 * no es parte del contrato con la app (D-44) y queda afuera: `buildApp` la
 * registra antes que el plugin de swagger, que solo ve las rutas que se
 * agregan después (las de `registerModules`). Si igual apareciera, el
 * generador falla.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// La config del server exige estas variables al importarse; el generador no
// se conecta a nada, así que alcanza con valores de relleno.
process.env.SUPABASE_URL ??= 'https://contract.invalid';
process.env.SUPABASE_SECRET_KEY ??= 'contract';

const OUT = join(__dirname, '../contract/openapi.json');

async function generate(): Promise<string> {
  const { default: swagger } = await import('@fastify/swagger');
  const { buildApp } = await import('../src/platform/http/buildApp');
  const { registerModules } = await import('../src/registerModules');

  const app = await buildApp({ logger: false });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Fitogenix API',
        version: '0.1.0',
        description:
          'Contrato HTTP del server de Fitogenix, generado desde los schemas de las rutas (docs/adr/0011). Historial de cambios: contract/CHANGELOG.md.',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', description: 'Access token de Supabase Auth' },
        },
      },
    },
    refResolver: {
      buildLocalReference: (json, _baseUri, _fragment, i) => String(json.$id ?? `def-${i}`),
    },
  });
  await registerModules(app);
  await app.ready();

  const doc = app.swagger() as { paths?: Record<string, unknown> };
  await app.close();
  if (doc.paths && '/health' in doc.paths) {
    throw new Error('/health no es parte del contrato (D-44) y apareció en el OpenAPI');
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}

async function main(): Promise<void> {
  const generated = await generate();

  if (process.argv.includes('--check')) {
    let committed = '';
    try {
      committed = readFileSync(OUT, 'utf8');
    } catch {
      // sin archivo commiteado: cae en la diferencia de abajo
    }
    if (committed !== generated) {
      console.error(
        'contract/openapi.json no coincide con los schemas de las rutas.\n' +
          'Corré `npm run contract:generate`, revisá el diff y anotá el cambio en contract/CHANGELOG.md.',
      );
      process.exit(1);
    }
    console.log('contract/openapi.json al día.');
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, generated, 'utf8');
  console.log(`Escrito ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
