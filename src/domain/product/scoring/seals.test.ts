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

describe('octógono de calorías: exige DOS condiciones', () => {
  // Manual de Aplicación Rev. I (Disp. ANMAT 11362/2024, pág. 10 y 17): las
  // calorías no son un nutriente crítico. El sello sale solo si el producto YA
  // lleva alguno de los de azúcares / grasas totales / grasas saturadas Y
  // ademas supera el límite de energía.
  const sinOtroSello = { sugars100: 0, satFat100: 0, totalFat100: 0, sodiumMg100: 0, hasAddedSugar: false };
  // 30 g de azúcar sobre 300 kcal = 40% de la energía: dispara azúcares.
  const conAzucares = { sugars100: 30, satFat100: 0, totalFat100: 0, sodiumMg100: 0, hasAddedSugar: true };

  it('sólidos: >=275 kcal/100g, pero solo si ya hay otro sello', () => {
    expect(computeWarningSeals({ ...conAzucares, kcal100: 300, isLiquid: false }))
      .toContain('EXCESO EN CALORÍAS');
  });

  it('un sólido denso SIN otro sello no lleva calorías', () => {
    // Era el over-marking: el motor marcaba por energía sola.
    expect(computeWarningSeals({ ...sinOtroSello, kcal100: 500, isLiquid: false }))
      .not.toContain('EXCESO EN CALORÍAS');
  });

  it('el sodio NO habilita el sello de calorías', () => {
    // La norma nombra azúcares, grasas totales y saturadas. El sodio no está.
    const saladoYDenso = { ...sinOtroSello, sodiumMg100: 900 };
    const s = computeWarningSeals({ ...saladoYDenso, kcal100: 500, isLiquid: false });
    expect(s).toContain('EXCESO EN SODIO');
    expect(s).not.toContain('EXCESO EN CALORÍAS');
  });

  it('líquidos: el corte es 25 kcal/100ml, no 70', () => {
    // 70 no es ninguna de las dos etapas argentinas (50 y 25): es el valor
    // chileno. Con 70 se dejaba pasar toda la franja de jugos y gaseosas.
    expect(computeWarningSeals({ ...conAzucares, kcal100: 42, isLiquid: true }))
      .toContain('EXCESO EN CALORÍAS');
    expect(computeWarningSeals({ ...conAzucares, kcal100: 20, isLiquid: true }))
      .not.toContain('EXCESO EN CALORÍAS');
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

  it('no marca cuando ninguna de las tres se cumple', () => {
    // 200/500 = 0,4 < 1 y 200 < 300.
    expect(computeWarningSeals({ ...base, kcal100: 500, sodiumMg100: 200 }))
      .not.toContain('EXCESO EN SODIO');
  });

  it('bebida sin aporte energético: el umbral propio es 40 mg/100 ml', () => {
    // Tercera condición del Manual. Una saborizada sin calorías con 50 mg de
    // sodio no llega por ratio (energía ~0) ni por masa (<300), y sin esta
    // condición escapaba.
    expect(computeWarningSeals({ ...base, kcal100: 2, sodiumMg100: 50, isLiquid: true }))
      .toContain('EXCESO EN SODIO');
  });

  it('la condición de 40 mg no aplica a sólidos ni a bebidas con energía', () => {
    // 50/100 = 0,5 < 1 y 50 < 300: sin la condición (c) no hay sello. Un sólido
    // nunca la usa, y una bebida CON aporte energético tampoco.
    expect(computeWarningSeals({ ...base, kcal100: 100, sodiumMg100: 50, isLiquid: false }))
      .not.toContain('EXCESO EN SODIO');
    expect(computeWarningSeals({ ...base, kcal100: 100, sodiumMg100: 50, isLiquid: true }))
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
