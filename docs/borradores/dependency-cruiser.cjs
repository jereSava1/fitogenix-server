/**
 * BORRADOR — Fase 2 (docs/02-arquitectura.md §6).
 *
 * Destino: raíz del repo como `.dependency-cruiser.cjs`, en el PR que cree
 * `src/modules/` (Fase 5). Hasta entonces las reglas de módulos y capas no
 * matchean nada: la estructura todavía no existe.
 *
 * Uso previsto:
 *   npx depcruise src etl scripts --config .dependency-cruiser.cjs
 *   (como script: "lint:deps")
 */

/** Módulos de negocio bajo src/modules/. */
const MODULES = ['scoring', 'catalog', 'user-library', 'account', 'auth', 'feedback'];

/** Regex que matchea cualquier archivo dentro de un módulo que NO sea su index.ts. */
const insideOf = (mod) => `^src/modules/${mod}/(?!index\\.ts$)`;

module.exports = {
  forbidden: [
    /* ── Generales ─────────────────────────────────────────────────────── */
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Sin ciclos de dependencias (ADR-0001).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Archivos que nadie importa: candidatos a código muerto.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '\\.test\\.ts$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$',
          '^src/main\\.ts$',
          '^etl/jobs/',
          '^scripts/',
          '^vitest\\.config\\.ts$',
        ],
      },
      to: {},
    },
    {
      name: 'no-importar-tests',
      severity: 'error',
      comment: 'El código de producción no importa archivos de test.',
      from: { pathNot: '\\.test\\.ts$' },
      to: { path: '\\.test\\.ts$' },
    },

    /* ── Fronteras de módulos (ADR-0001) ──────────────────────────────── */
    ...MODULES.map((mod) => ({
      name: `modulo-solo-por-index:${mod}`,
      severity: 'error',
      comment: `Desde afuera de "${mod}" solo se importa src/modules/${mod}/index.ts.`,
      from: { pathNot: `^src/modules/${mod}/` },
      to: { path: insideOf(mod) },
    })),
    {
      name: 'scoring-es-puro',
      severity: 'error',
      comment:
        'El motor no depende de nada fuera de sí mismo: ni platform, ni otros módulos, ni npm, ni builtins de Node (ADR-0003).',
      from: { path: '^src/modules/scoring/' },
      to: {
        pathNot: '^src/modules/scoring/',
      },
    },
    {
      name: 'catalog-no-conoce-consumidores',
      severity: 'error',
      comment:
        'catalog no importa user-library, account ni feedback. El registro del escaneo se inyecta desde main.ts (02-arquitectura.md §3.3).',
      from: { path: '^src/modules/catalog/' },
      to: { path: '^src/modules/(user-library|account|auth|feedback)/' },
    },
    {
      name: 'account-auth-feedback-aislados',
      severity: 'error',
      comment: 'account, auth y feedback no dependen de otros módulos de negocio (feedback puede usar catalog).',
      from: { path: '^src/modules/(account|auth|feedback)/' },
      to: { path: '^src/modules/(user-library|account|auth|feedback)/', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'platform-no-importa-modulos',
      severity: 'error',
      comment: 'La infraestructura compartida no conoce el negocio.',
      from: { path: '^src/platform/' },
      to: { path: '^src/modules/' },
    },

    /* ── Capas dentro de cada módulo (ADR-0002) ───────────────────────── */
    {
      name: 'domain-puro',
      severity: 'error',
      comment: 'domain/ no importa application, infrastructure, routes ni platform.',
      from: { path: '^src/modules/([^/]+)/domain/' },
      to: {
        path: [
          '^src/modules/[^/]+/(application|infrastructure|routes)/',
          '^src/platform/',
        ],
      },
    },
    {
      name: 'application-sin-infra',
      severity: 'error',
      comment: 'application/ define puertos: no importa infrastructure ni routes.',
      from: { path: '^src/modules/([^/]+)/application/' },
      to: { path: '^src/modules/[^/]+/(infrastructure|routes)/' },
    },
    {
      name: 'routes-sin-infra',
      severity: 'error',
      comment: 'routes/ habla con application/, nunca con los adaptadores.',
      from: { path: '^src/modules/([^/]+)/routes/' },
      to: { path: '^src/modules/[^/]+/infrastructure/' },
    },

    /* ── Dependencias externas por capa ───────────────────────────────── */
    {
      name: 'supabase-redis-solo-en-infra',
      severity: 'error',
      comment: 'Los SDK de datos solo en infrastructure/ y platform/.',
      from: {
        path: '^src/',
        pathNot: ['^src/modules/[^/]+/infrastructure/', '^src/platform/'],
      },
      to: { dependencyTypes: ['npm'], path: 'node_modules/@(supabase|upstash)/' },
    },
    {
      name: 'fastify-fuera-de-domain-y-application',
      severity: 'error',
      comment: 'El framework HTTP no entra al dominio ni a los casos de uso.',
      from: { path: '^src/modules/[^/]+/(domain|application)/' },
      to: { path: 'node_modules/(fastify|@fastify/)' },
    },
    {
      name: 'anthropic-solo-en-etl',
      severity: 'error',
      comment: 'La IA es solo del ETL (ADR-0004, D-05).',
      from: { pathNot: '^etl/' },
      to: { path: 'node_modules/@anthropic-ai/' },
    },

    /* ── Runtime vs. ETL y scripts (ADR-0004) ─────────────────────────── */
    {
      name: 'src-no-importa-etl-ni-scripts',
      severity: 'error',
      comment: 'El server nunca carga código del ETL ni de scripts.',
      from: { path: '^src/' },
      to: { path: '^(etl|scripts)/' },
    },
    {
      name: 'etl-solo-apis-publicas',
      severity: 'error',
      comment: 'El ETL usa solo las APIs públicas de catalog y scoring.',
      from: { path: '^etl/' },
      to: {
        path: '^src/',
        pathNot: '^src/modules/(catalog|scoring)/index\\.ts$',
      },
    },
    {
      name: 'scripts-solo-apis-publicas',
      severity: 'error',
      comment: 'Los scripts de análisis usan solo las APIs públicas de catalog y scoring.',
      from: { path: '^scripts/' },
      to: {
        path: '^src/',
        pathNot: '^src/modules/(catalog|scoring)/index\\.ts$',
      },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    // node_modules NO va en exclude: sacaría las dependencias npm del análisis
    // y las reglas de SDKs (supabase, upstash, anthropic, fastify) no dispararían.
    exclude: { path: '^(dist|docs)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
