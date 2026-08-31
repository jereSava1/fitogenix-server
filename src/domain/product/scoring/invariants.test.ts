/* Invariantes que tienen que valer para CUALQUIER entrada, por rota que sea.
 *
 * Los datos de catálogo vienen de fuentes colaborativas y de OCR: el motor
 * tiene que devolver algo coherente o decir que no sabe, nunca romperse ni
 * emitir un desglose que no cierre.
 *
 * A diferencia del resto de la suite, acá no se afirma NINGÚN puntaje: solo
 * las propiedades que no pueden fallar nunca. Un caso nuevo se agrega a la
 * lista y listo.
 */
import { describe, expect, it } from 'vitest';
import { scoreProduct } from './index';

const ENTRADAS_ROTAS: unknown[] = [
  {},
  { ingredients_text: undefined },
  { ingredients_text: '' },
  { ingredients_text: '   ' },
  { ingredients_text: '(((((' },
  { ingredients_text: ')))' },
  { ingredients_text: ',,,,,,' },
  { ingredients_text: '()[]{}' },
  { ingredients_text: 'a'.repeat(50000) },
  { ingredients_text: Array.from({ length: 500 }, (_, i) => `ing${i}`).join(', ') },
  { ingredients_text: 'azucar', nutriments: { 'sugars_100g': 'NaN', 'energy-kcal_100g': null } },
  { ingredients_text: 'azucar', nutriments: { 'energy-kcal_100g': 0 } },
  { ingredients_text: 'azucar', nutriments: { 'energy-kcal_100g': -5, 'fat_100g': 1e9 } },
  { ingredients_text: 'agua', additives_tags: ['', 'en:', 'nope', 'en:e999999'] },
  { ingredients_text: 'agua', additives_tags: Array.from({ length: 200 }, (_, i) => `en:e${i}`) },
  { ingredients_text: 'leche (a (b (c (d)))), sal' },
  { ingredients_text: 'aceite de girasol y/o soja y/o palma y/o maiz' },
  { ingredients_text: 'azucar 200%, cacao 0%' },
  { ingredients_text: 'AZUCAR'.repeat(30) },
  { product_name: 'x'.repeat(10000), ingredients_text: 'agua' },
  { ingredients_text: 'agua', categories: 'x'.repeat(5000) },
  { ingredients_text: 'E1, E12, E123, E1234, E12345' },
  { ingredients_text: 'ingredientes: ingredientes: ingredientes: agua' },
  { ingredients_text: 'puede contener' },
  { ingredients_text: 'trazas de todo' },
];

describe('invariantes sobre entradas rotas', () => {
  for (const [i, product] of ENTRADAS_ROTAS.entries()) {
    const etiqueta = JSON.stringify(product).slice(0, 60);

    it(`caso ${i}: ${etiqueta}`, () => {
      const bd = scoreProduct(product as never);

      if (bd.score == null) {
        // No puntuar es una respuesta válida, pero siempre con su motivo.
        expect(bd.noScore).not.toBeNull();
        expect(bd.scoreAvailable).toBe(false);
      } else {
        expect(Number.isInteger(bd.score)).toBe(true);
        expect(bd.score).toBeGreaterThanOrEqual(0);
        expect(bd.score).toBeLessThanOrEqual(100);

        // El desglose cierra: cada delta mueve el corriente, y el último es
        // el puntaje.
        let previous: number | null = null;
        for (const step of bd.steps) {
          if (step.delta != null && previous != null) {
            expect(previous + step.delta, `paso "${step.label}"`).toBe(step.running);
          }
          previous = step.running;
        }
        expect(bd.steps.length).toBeGreaterThan(0);
        expect(bd.steps[bd.steps.length - 1].running).toBe(bd.score);
      }

      expect(bd.ingredients.every((g) => Number.isFinite(g.delta))).toBe(true);
      expect(bd.coverage).toBeGreaterThanOrEqual(0);
      expect(bd.coverage).toBeLessThanOrEqual(1);
    });
  }

  it('el motor nunca tarda de más en una lista patológica', () => {
    const enorme = Array.from({ length: 2000 }, (_, i) => `ingrediente ${i}`).join(', ');
    const inicio = Date.now();
    scoreProduct({ ingredients_text: enorme });
    expect(Date.now() - inicio).toBeLessThan(5000);
  });
});

/* Decisión de producto del 31/8/2026 (`CONTEXT.md §2.5`): el octógono resta
 * puntos y NO se muestra. El cálculo propio parte de la etiqueta, no de la
 * formulación, así que es una aproximación — y una aproximación no se puede
 * presentar como el dato que el usuario contrasta contra el envase.
 *
 * Este bloque protege la mitad frágil de esa decisión: el `warnings` del
 * contrato es fácil de no renderizar, pero el texto de los pasos se escribe a
 * mano y ahí ya se había filtrado el nombre de cada octógono.
 */
describe('los octógonos restan, pero no se nombran en texto de usuario', () => {
  /** Dispara los cinco octógonos a la vez. */
  const CON_OCTOGONOS = {
    product_name: 'Galletitas dulces rellenas',
    ingredients_text: 'harina de trigo, azucar, aceite vegetal, jarabe de glucosa, sal',
    nutriments: {
      'energy-kcal_100g': 480,
      'sugars_100g': 25,
      'fat_100g': 20,
      'saturated-fat_100g': 10,
      'sodium_100g': 0.6,
    },
  };

  /* Lo que jamás puede aparecer en algo que el usuario lee.
   *
   * "advertencia" a secas NO está en la lista, a propósito: el texto de la
   * anulación por colorantes azoicos dice "la UE exige la advertencia…", que es
   * verdadero y no tiene nada que ver con los octógonos. Y "sello" a secas
   * tampoco, porque el sello Fitogénico sí se muestra (`CONTEXT.md §3.2`). Lo
   * que se prohíbe es afirmar el octógono, no la palabra suelta. */
  const PROHIBIDO = [/EXCESO EN/i, /oct[óo]gono/i, /sellos? de advertencia/i, /27\.?642/, /151\/2022/];

  function textoDeUsuario(bd: ReturnType<typeof scoreProduct>): string {
    return [
      ...bd.steps.map((s) => `${s.label} ${s.detail ?? ''}`),
      ...bd.notices,
      bd.fitogenixView,
      bd.tierMessage,
      ...bd.ingredients.map((i) => `${i.name} ${i.desc} ${i.detail ?? ''}`),
    ].join(' | ');
  }

  it('el producto lleva los cinco octógonos y penaliza', () => {
    const bd = scoreProduct(CON_OCTOGONOS as never);
    expect(bd.warnings.length).toBe(5);
    const paso = bd.steps.find((s) => s.label === 'Panel nutricional');
    expect(paso, 'el paso nutricional tiene que existir').toBeDefined();
    expect(paso!.delta!).toBeLessThan(0);
  });

  it('ningún texto de usuario nombra el octógono', () => {
    const bd = scoreProduct(CON_OCTOGONOS as never);
    const texto = textoDeUsuario(bd);
    for (const patron of PROHIBIDO) {
      expect(patron.test(texto), `"${patron}" aparece en: ${texto}`).toBe(false);
    }
  });

  it('tampoco en ninguna de las entradas rotas', () => {
    for (const product of ENTRADAS_ROTAS) {
      const texto = textoDeUsuario(scoreProduct(product as never));
      for (const patron of PROHIBIDO) {
        expect(patron.test(texto), `"${patron}" en ${JSON.stringify(product).slice(0, 60)}`).toBe(false);
      }
    }
  });
});
