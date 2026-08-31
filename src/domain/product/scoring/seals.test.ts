// Octógonos de la Ley 27.642 — contraste contra lo que realmente lleva el
// envase en la góndola argentina.
//
// Estos sellos son distintos del resto del motor: el usuario puede dar vuelta
// el paquete y verificarlos. Si nuestro cálculo no coincide con el envase, la
// app pierde credibilidad de una forma que un puntaje discutible no provoca.
import { describe, expect, it } from 'vitest';
import { scoreProduct, type ProductInput } from './index';
import { computeWarningSeals } from './index';

const sellosDe = (p: ProductInput) => scoreProduct(p).warnings;

describe('productos que SÍ llevan sellos', () => {
  // Este caso esperaba SOLO azúcares, con el umbral de bebidas en 70 kcal/100ml.
  // Con el corte real de la Tabla 1 (25) una gaseosa de 42 kcal lleva las dos, y
  // es lo que corresponde: la expectativa vieja era una suposición, no una
  // observación verificada. Contrastado contra la calculadora oficial de ANMAT.
  it('una gaseosa cola azucarada lleva exceso en azúcares Y en calorías', () => {
    expect(sellosDe({
      ingredients_text: 'agua, azúcar, colorante caramelo, acidulante',
      categories: 'Bebidas, Gaseosas', nova_group: 4,
      nutriments: { 'energy-kcal_100g': 42, 'sugars_100g': 10.6, 'sodium_100g': 0.01 },
    })).toEqual(['EXCESO EN AZÚCARES', 'EXCESO EN CALORÍAS']);
  });

  it('una galletita dulce lleva varios', () => {
    const s = sellosDe({
      ingredients_text: 'harina de trigo, azúcar, aceite de girasol, sal', nova_group: 4,
      nutriments: { 'energy-kcal_100g': 470, 'sugars_100g': 30, 'saturated-fat_100g': 8, 'fat_100g': 20, 'sodium_100g': 0.4 },
    });
    expect(s).toContain('EXCESO EN AZÚCARES');
    expect(s).toContain('EXCESO EN GRASAS SATURADAS');
    expect(s).toContain('EXCESO EN CALORÍAS');
  });

  it('un snack salado lleva sodio y calorías', () => {
    const s = sellosDe({
      ingredients_text: 'papa, aceite de girasol, sal', nova_group: 4,
      nutriments: { 'energy-kcal_100g': 536, 'saturated-fat_100g': 4, 'fat_100g': 34, 'sodium_100g': 0.55 },
    });
    expect(s).toContain('EXCESO EN SODIO');
    expect(s).toContain('EXCESO EN CALORÍAS');
  });
});

describe('exención de la ley: sin nutrientes críticos añadidos', () => {
  // El error que casi se publica: la leche entera se llevaba dos sellos
  // porque la exención estaba atada al arquetipo de alimento entero, y la
  // leche sola no matchea ninguno. En la góndola no lleva ninguno.
  it('la leche entera no lleva sellos, aunque supere los umbrales de grasa', () => {
    expect(sellosDe({
      ingredients_text: 'leche entera', categories: 'Lácteos', nova_group: 1,
      nutriments: { 'energy-kcal_100g': 61, 'sugars_100g': 4.7, 'saturated-fat_100g': 1.9, 'fat_100g': 3.2 },
    })).toEqual([]);
  });

  it('la carne y el queso simple tampoco: su grasa es inherente', () => {
    expect(sellosDe({
      ingredients_text: 'carne vacuna', categories: 'Carnes', nova_group: 1,
      nutriments: { 'energy-kcal_100g': 250, 'saturated-fat_100g': 7, 'fat_100g': 18 },
    })).toEqual([]);
    expect(sellosDe({
      ingredients_text: 'leche entera, sal, cuajo, fermentos', categories: 'Quesos', nova_group: 3,
      nutriments: { 'energy-kcal_100g': 300, 'saturated-fat_100g': 16, 'fat_100g': 25, 'sodium_100g': 0.6 },
    })).toEqual([]);
  });

  it('el aceite de oliva no lleva sellos pese a ser 100% grasa', () => {
    expect(sellosDe({
      ingredients_text: 'aceite de oliva extra virgen', nova_group: 2,
      nutriments: { 'energy-kcal_100g': 884, 'fat_100g': 100, 'saturated-fat_100g': 14 },
    })).toEqual([]);
  });
});

describe('azúcares libres vs. totales', () => {
  // La ley habla de azúcares LIBRES; el panel declara TOTALES. Aplicarlo
  // crudo le pone "EXCESO EN AZÚCARES" a la fruta y a la leche.
  it('no marca azúcar cuando no hay azúcar añadida en el listado', () => {
    expect(computeWarningSeals({
      kcal100: 52, sugars100: 10, satFat100: 0, totalFat100: 0.2, sodiumMg100: 1,
      isLiquid: false, hasAddedSugar: false,
    })).toEqual([]);
  });

  it('la marca cuando el listado delata azúcar añadida', () => {
    expect(computeWarningSeals({
      kcal100: 52, sugars100: 10, satFat100: 0, totalFat100: 0.2, sodiumMg100: 1,
      isLiquid: false, hasAddedSugar: true,
    })).toContain('EXCESO EN AZÚCARES');
  });
});

describe('umbral de calorías según estado físico', () => {
  const base = { sugars100: 0, satFat100: 0, totalFat100: 0, sodiumMg100: 0, hasAddedSugar: false };

  // El corte de bebidas era 70 en este archivo. Setenta no es ninguna de las dos
  // etapas argentinas (50 y 25): es el valor final del modelo chileno. La
  // calculadora oficial de ANMAT devuelve «Calorías 21 <25 N/A» para una bebida.
  it('líquidos: 25 kcal/100ml', () => {
    expect(computeWarningSeals({ ...base, kcal100: 30, isLiquid: true })).toContain('EXCESO EN CALORÍAS');
    expect(computeWarningSeals({ ...base, kcal100: 20, isLiquid: true })).toEqual([]);
  });

  it('una bebida entre 25 y 70 kcal/100ml SÍ lleva el octógono', () => {
    // Es el rango que el umbral viejo dejaba pasar entero: jugos, saborizadas,
    // gaseosas comunes. Este caso es la regresión de N-6.
    expect(computeWarningSeals({ ...base, kcal100: 42, isLiquid: true })).toContain('EXCESO EN CALORÍAS');
  });

  it('sólidos: 275 kcal/100g', () => {
    expect(computeWarningSeals({ ...base, kcal100: 300, isLiquid: false })).toContain('EXCESO EN CALORÍAS');
    expect(computeWarningSeals({ ...base, kcal100: 200, isLiquid: false })).toEqual([]);
  });
});

describe('sodio: las dos condiciones de la Tabla 1', () => {
  const base = { sugars100: 0, satFat100: 0, totalFat100: 0, isLiquid: false, hasAddedSugar: false };

  it('marca por ratio: >=1 mg de sodio por kcal', () => {
    expect(computeWarningSeals({ ...base, kcal100: 100, sodiumMg100: 120 }))
      .toContain('EXCESO EN SODIO');
  });

  it('marca por masa: >=300 mg/100g aunque el ratio no llegue', () => {
    // Un snack salado y muy calórico diluye su ratio (350/500 = 0,7 < 1) y con
    // la condición sola escapaba a un sello que el envase sí lleva.
    expect(computeWarningSeals({ ...base, kcal100: 500, sodiumMg100: 350 }))
      .toContain('EXCESO EN SODIO');
  });

  it('no marca cuando ninguna de las dos se cumple', () => {
    // 200/500 = 0,4 < 1 y 200 < 300. (El producto igual lleva calorías por los
    // 500 kcal: acá se afirma sobre el sodio, no sobre el resto del panel.)
    expect(computeWarningSeals({ ...base, kcal100: 500, sodiumMg100: 200 }))
      .not.toContain('EXCESO EN SODIO');
  });
});

describe('sin panel nutricional no hay sellos', () => {
  it('no se inventan sellos cuando falta la energía declarada', () => {
    expect(computeWarningSeals({
      kcal100: null, sugars100: 50, satFat100: 20, totalFat100: 40, sodiumMg100: 900,
      isLiquid: false, hasAddedSugar: true,
    })).toEqual([]);
  });

  it('tampoco por la vía del sodio por masa', () => {
    // La condición de >=300 mg/100g no necesita energía para calcularse, pero
    // igual la exige: sin panel no hay sellos es regla del archivo, y un umbral
    // nuevo no la rompe.
    expect(computeWarningSeals({
      kcal100: null, sugars100: 0, satFat100: 0, totalFat100: 0, sodiumMg100: 900,
      isLiquid: false, hasAddedSugar: false,
    })).toEqual([]);
  });
});
