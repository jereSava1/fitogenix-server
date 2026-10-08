# Chequeos de fase A — 08/10/2026

Repositorio: jereSava1/fitogenix-server. Rama etl-validacion. Commit 53cbc6e9cf72113f983cdc195dff3030564d68e7. Node 22.23.3, npm 10.9.9.

Instalación local: npm ci --ignore-scripts --no-audit --no-fund. Los chequeos usan claves ficticias, sin .env, con un guard que bloquea TCP externo y permite loopback para el test local. No consultan ni escriben Supabase. El servidor de la rama no se modificó; los nuevos scripts de revisión se verificaron aparte.

El clon Windows convirtió los JSON del contrato a CRLF. El primer contract:check falló por comparación de texto; el segundo normalizó CRLF a LF solo al leer contract/openapi.json y contract/scoring-bands.json en memoria. No se editaron ni regeneraron esos archivos. La copia quedó limpia en etl-validacion.

## npm run typecheck

Código de salida: 0. Salida (ruta personal reemplazada por <copia-local>):

```text
> fitogenix-server@1.0.0 typecheck
> tsc --noEmit && tsc -p tsconfig.scripts.json
```

## npm run lint:deps

Código de salida: 0. Salida (ruta personal reemplazada por <copia-local>):

```text
> fitogenix-server@1.0.0 lint:deps
> depcruise src scripts etl --config .dependency-cruiser.cjs


✔ no dependency violations found (203 modules, 649 dependencies cruised)
```

## npm run lint:unused

Código de salida: 0. Salida (ruta personal reemplazada por <copia-local>):

```text
> fitogenix-server@1.0.0 lint:unused
> knip --production
```

## npm run test

Código de salida: 0. Salida (ruta personal reemplazada por <copia-local>):

```text
> fitogenix-server@1.0.0 test
> vitest run

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 <copia-local>/fitogenix-server-validacion


 Test Files  63 passed (63)
      Tests  1036 passed (1036)
   Start at  12:24:50
   Duration  20.41s (transform 4.75s, setup 0ms, import 15.72s, tests 47.38s, environment 12ms)
```

## npm run contract:check — copia CRLF

Código de salida: 1. Salida (ruta personal reemplazada por <copia-local>):

```text
> fitogenix-server@1.0.0 contract:check
> tsx scripts/generate-contract.ts --check

contract/openapi.json no coincide con lo que generan los schemas y el motor.
contract/scoring-bands.json no coincide con lo que generan los schemas y el motor.
Corré `npm run contract:generate`, revisá el diff y anotá el cambio en contract/CHANGELOG.md.
```

## npm run contract:check — lectura normalizada LF

Código de salida: 0. Salida (ruta personal reemplazada por <copia-local>):

```text
> fitogenix-server@1.0.0 contract:check
> tsx scripts/generate-contract.ts --check

contract/ al día.
```

## Scripts de revisión

comparar.mjs --self-test, ejecutado con Node 22: código 0.

```text
6 chequeos propios: OK (ausencia, cero, diferencia, conflicto y unidades).
```

auditar-etiquetas-a.mjs se ejecutó sobre propuestas-fase-a-completas.json y generó controles-fase-a-completas.json. Exit 0 significa salida generada. Resultado: 2 fallas de candidatos comunitarios y 5 fotos pendientes/complementarias.

- rhodesia: added-sugars <= sugars; {"added-sugars":53.31,"sugars":47.6190476190476}; 100 g; fuente https://world.openfoodfacts.org/api/v2/product/77995681.json.
- monster: added-sugars <= sugars; {"added-sugars":23,"sugars":11.5}; 100 ml; fuente https://world.openfoodfacts.org/api/v2/product/0070847017332.json.

Pruebas negativas del auditor: tres entradas peligrosas rechazadas con código 1 y sin crear salida (selección de un conflicto, 100 ml en 100 g y declaración cualitativa como cero). Las diferencias energéticas se informan sin tolerancia inventada. Los errores iniciales de configuración del entorno temporal se resolvieron antes de los resultados anteriores. No se ejecutaron migraciones ni validación de fase B.
