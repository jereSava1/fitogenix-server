import { describe, expect, it } from 'vitest';
import { checkIngredientsText, findBrandInName, findIngredientsTextIssues } from './qualityHeuristics';
// findImplausibleNutrients se testea en quality/nutrientPlausibility.test.ts.

describe('checkIngredientsText', () => {
  it('no marca una lista de ingredientes normal', () => {
    const result = checkIngredientsText('harina de trigo, azúcar, cacao, manteca, sal');
    expect(result.suspect).toBe(false);
  });

  it('no marca un ingrediente único corto (falso positivo típico)', () => {
    const result = checkIngredientsText('Agua');
    expect(result.suspect).toBe(false);
  });

  it('marca texto con "elaborado por"', () => {
    const result = checkIngredientsText('Elaborado por Molinos SA, Ruta 9 Km 50, Buenos Aires');
    expect(result.suspect).toBe(true);
    expect(result.reasons.some((r) => r.includes('elaborado por/en'))).toBe(true);
  });

  it('marca texto con código postal argentino (CPA)', () => {
    const result = checkIngredientsText('Establecimiento habilitado, B1875ABC Wilde, Pcia. Buenos Aires');
    expect(result.suspect).toBe(true);
  });

  it('marca texto largo sin comas cuando ya hay otra señal', () => {
    const result = checkIngredientsText(
      'Elaborado en establecimiento habilitado por el organismo de contralor correspondiente en la provincia',
    );
    expect(result.suspect).toBe(true);
    expect(result.reasons.some((r) => r.includes('poca estructura de lista'))).toBe(true);
  });

  it('devuelve suspect=false para texto vacío o null', () => {
    expect(checkIngredientsText('').suspect).toBe(false);
    expect(checkIngredientsText(null).suspect).toBe(false);
    expect(checkIngredientsText(undefined).suspect).toBe(false);
  });
});

describe('findBrandInName', () => {
  it('encuentra una marca conocida embebida en el nombre', () => {
    const result = findBrandInName('Leche Entera La Serenísima 1L', ['La Serenísima', 'Sancor', 'Ilolay']);
    expect(result).toBe('La Serenísima');
  });

  it('devuelve null si ninguna marca conocida aparece', () => {
    const result = findBrandInName('Producto genérico sin marca', ['Sancor', 'Ilolay']);
    expect(result).toBeNull();
  });

  it('prefiere la marca más larga/específica si hay solapamiento', () => {
    const result = findBrandInName('Aceite Molinos Río de la Plata 900ml', ['Molinos Río de la Plata', 'Molinos']);
    expect(result).toBe('Molinos Río de la Plata');
  });

  it('hace match de palabra completa, no substring parcial', () => {
    // "Sol" no debería matchear dentro de "Solera" u otra palabra que la contenga.
    const result = findBrandInName('Vino Solera Reserva', ['Sol']);
    expect(result).toBeNull();
  });

  it('devuelve null si product_name es null', () => {
    expect(findBrandInName(null, ['Sancor'])).toBeNull();
  });

  it('ignora marcas candidatas demasiado cortas (< 3 caracteres)', () => {
    const result = findBrandInName('Yerba La Merced', ['La']);
    expect(result).toBeNull();
  });
});

describe('findIngredientsTextIssues', () => {
  const rules = (text: string) => findIngredientsTextIssues(text).map((i) => i.rule);

  it('no marca una lista limpia ni texto vacío', () => {
    expect(findIngredientsTextIssues('harina de trigo, azúcar, sal')).toEqual([]);
    expect(findIngredientsTextIssues('')).toEqual([]);
    expect(findIngredientsTextIssues(null)).toEqual([]);
  });

  it('detecta el rótulo "Ingredientes:" con su posición', () => {
    const [issue] = findIngredientsTextIssues('Ingredientes: agua, sal');
    expect(issue).toMatchObject({ rule: 'rotulo', kind: 'contaminacion', start: 0 });
  });

  it('una declaración de alérgenos es "declaracion", no contaminación', () => {
    const [issue] = findIngredientsTextIssues('harina, azúcar. Contiene leche y soja.');
    expect(issue).toMatchObject({ rule: 'alergenos', kind: 'declaracion' });
  });

  it('"no contiene" no es una declaración de alérgenos', () => {
    expect(rules('agua, sal. No contiene gluten')).not.toContain('alergenos');
  });

  it('detecta conservación, fabricante, fortificación, sin TACC y unidades sueltas', () => {
    expect(rules('agua. Una vez abierto, mantener refrigerado')).toContain('conservacion');
    expect(rules('agua, sal. Elaborado por Molinos SA')).toContain('fabricante');
    expect(rules('harina de trigo. Harina enriquecida según la ley 25.630')).toContain('fortificacion');
    expect(rules('almidón de maíz. Sin T.A.C.C.')).toContain('sin_gluten');
    expect(rules('harina 5 mg/kg, agua')).toContain('unidades');
  });

  it('conserva una cantidad dentro del paréntesis de su ingrediente', () => {
    expect(rules('agua, sucralosa (5mg/100g), sal')).not.toContain('unidades');
  });

  it('detecta la abreviatura "art." que parte el ingrediente', () => {
    expect(rules('agua, art. a vainilla, sal')).toContain('abreviatura');
  });

  it('detecta paréntesis sin cerrar, saltos de línea e INS repetido', () => {
    expect(rules('agua, colorante (INS 102')).toContain('parentesis');
    expect(rules('agua\nsal')).toContain('saltos');
    expect(rules('colorante (INS 102), estabilizante INS 102')).toContain('ins_repetido');
  });

  it('no usa la regla de OCR de los ocho casos de control', () => {
    expect(findIngredientsTextIssues('Aguo, SINT, RALLAD0')).toEqual([]);
  });
});
