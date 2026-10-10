/* npm run contract:generate   escribe contract/openapi.json y contract/scoring-bands.json.
 * npm run contract:check      falla si no coinciden con los schemas y el motor (CI).
 * `/health` no es parte del contrato: si aparece en el OpenAPI, falla. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// La config del server exige estas variables al importarse; el generador no
// se conecta a nada, así que alcanza con valores de relleno.
process.env.SUPABASE_URL ??= 'https://contract.invalid';
process.env.SUPABASE_SECRET_KEY ??= 'contract';

const CONTRACT_DIR = join(__dirname, '../contract');

async function generateOpenApi(): Promise<string> {
  const { default: swagger } = await import('@fastify/swagger');
  const { buildApp } = await import('../src/platform/http/buildApp');
  const { registerModules } = await import('../src/registerModules');

  const app = await buildApp({ logger: false });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Fitogenix API',
        version: '0.14.0',
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

async function generateScoringBands(): Promise<string> {
  const { scoringBands } = await import('../src/modules/scoring');
  return `${JSON.stringify(scoringBands(), null, 2)}\n`;
}

async function main(): Promise<void> {
  const files: Record<string, string> = {
    'openapi.json': await generateOpenApi(),
    'scoring-bands.json': await generateScoringBands(),
  };

  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([name, generated]) => {
      try {
        return readFileSync(join(CONTRACT_DIR, name), 'utf8') !== generated;
      } catch {
        return true; // sin archivo commiteado
      }
    });
    if (stale.length > 0) {
      for (const [name] of stale) {
        console.error(`contract/${name} no coincide con lo que generan los schemas y el motor.`);
      }
      console.error('Corré `npm run contract:generate`, revisá el diff y anotá el cambio en contract/CHANGELOG.md.');
      process.exit(1);
    }
    console.log('contract/ al día.');
    return;
  }

  mkdirSync(CONTRACT_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(CONTRACT_DIR, name), content, 'utf8');
    console.log(`Escrito contract/${name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
