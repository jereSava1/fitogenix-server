/* Blindaje de robustez — cada bloque congela la corrección de un defecto
 * concreto que el motor tuvo con productos reales de OFF y de los retailers.
 *
 * El hilo común: el motor no puede afirmar más de lo que sabe, y lo que el
 * usuario LEE no puede contradecir lo que el motor calculó.
 */
import { describe, expect, it } from 'vitest';
import { analyzeIngredients, scoreProduct } from './index';
import { matchesPhrase, normalizeText, resolveLabelAbbreviation } from './index';

const ings = (t: string) => analyzeIngredients({ ingredients_text: t });
const nameOf = (t: string, needle: string) =>
  ings(t).find((i) => normalizeText(i.name).includes(normalizeText(needle)));

describe('matching por palabra completa', () => {
  // El alias "sal" (sin penalización) matcheaba dentro de "salame",
  // "salchicha" y "salsa de soja" con includes(). Un embutido puntuaba como
  // sal de mesa — y encima la anulación por curado depende de reconocer
  // embutidos.
  it('no matchea un alias dentro de otra palabra', () => {
    expect(matchesPhrase('salame', 'sal')).toBe(false);
    expect(matchesPhrase('salchicha', 'sal')).toBe(false);
    expect(matchesPhrase('salsa de soja', 'sal')).toBe(false);
    expect(matchesPhrase('trabajo', 'ajo')).toBe(false);
    expect(matchesPhrase('ajonjoli', 'ajo')).toBe(false);
  });

  it('sí matchea la palabra completa y su plural', () => {
    expect(matchesPhrase('sal', 'sal')).toBe(true);
    expect(matchesPhrase('sal marina fina', 'sal')).toBe(true);
    expect(matchesPhrase('azucares totales', 'azucar')).toBe(true);
  });

  it('el acento no puede cambiar la clasificación', () => {
    const con = scoreProduct({ ingredients_text: 'azúcar, agua' }).score;
    const sin = scoreProduct({ ingredients_text: 'AZUCAR, AGUA' }).score;
    expect(con).toBe(sin);
  });

  it('el alias más largo gana sobre el más corto', () => {
    // "azúcar de coco" es azúcar tradicional; "azúcar" a secas es refinada.
    expect(nameOf('avena, azúcar de coco', 'coco')).toBeDefined();
    // "aceite de oliva extra virgen" no puede caer en "aceite de oliva
    // refinado" ni al revés.
    expect(nameOf('aceite de oliva extra virgen', 'oliva')!.impact).toBe('none');
    expect(nameOf('aceite de oliva refinado, sal', 'oliva')!.impact).toBe('medio');
  });
});

describe('el nombre mostrado y su color salen del mismo match', () => {
  // Caso real (Sprite). El OCR se comió las comas y "AGUA CARBONATADA
  // AZUCARES" quedó como un solo fragmento. Se emitía UNA entrada con el
  // nombre de la primera sustancia y el color de la peor: al usuario le
  // aparecía "Agua" pintada de ROJO. El puntaje estaba bien; lo que leía era
  // falso, que en un producto sensible cuesta más caro que el número.
  it('un fragmento mal parseado se muestra con el nombre de lo que lo penalizó', () => {
    const lista = ings('NGE AGUA CARBONATADA AZUCARES, CONS BENZOATO BE SODIO');
    const rojo = lista.find((i) => i.sev === 'red')!;
    expect(normalizeText(rojo.name)).toContain('azucar');
    // Nunca más "Agua" en rojo.
    expect(lista.some((i) => normalizeText(i.name) === 'agua' && i.sev === 'red')).toBe(false);
  });

  it('conserva el texto de la etiqueta cuando es más específico', () => {
    const nombres = ings('cuero de cerdo, cebolla de verdeo, sal').map((i) => i.name);
    expect(nombres).toContain('Cuero de cerdo');
    expect(nombres).toContain('Cebolla de verdeo');
  });

  it('muestra en español lo que la etiqueta trajo en inglés', () => {
    const nombres = ings('sugar, palm oil, hazelnuts').map((i) => i.name.toLowerCase());
    expect(nombres).toContain('azúcar');
    expect(nombres).toContain('aceite de palma');
    expect(nombres).not.toContain('palm oil');
  });

  it('el rotulado en mayúsculas se muestra en oración', () => {
    const i = nameOf('AGUA, SAL, ZZQXWRRP', 'zzqx')!;
    expect(i.name).toBe('Zzqxwrrp');
  });
});

describe('abreviaturas del rotulado argentino', () => {
  it('resuelve la clase y el número INS', () => {
    expect(resolveLabelAbbreviation('COL 150 d')).toMatchObject({ label: 'Colorante E150' });
    expect(resolveLabelAbbreviation('ACI 338')).toMatchObject({ label: 'Acidulante E338' });
    expect(resolveLabelAbbreviation('ARO')).toMatchObject({ label: 'Aroma', impact: 'medio' });
    expect(resolveLabelAbbreviation('azúcar')).toBeNull();
  });

  it('el número manda sobre la clase: COL 102 es tartrazina, impacto alto', () => {
    expect(resolveLabelAbbreviation('COL 102')?.impact).toBe('alto');
  });

  it('los aditivos abreviados se muestran resueltos, no como alimento', () => {
    const nombres = ings('Agua, Azúcar, COL 150 d, ARO, ACI 338').map((i) => i.name);
    expect(nombres).toContain('Colorante E150');
    expect(nombres).toContain('Acidulante E338');
    for (const n of ['Colorante E150', 'Aroma', 'Acidulante E338']) {
      expect(ings('Agua, Azúcar, COL 150 d, ARO, ACI 338').find((i) => i.name === n)!.sev)
        .not.toBe('green');
    }
  });

  // El caso que lo destapó: la Coca-Cola de OFF, con los tres aditivos en
  // notación abreviada, salía 72 ("Buena opción").
  it('una gaseosa azucarada con aditivos abreviados no llega a Bueno', () => {
    const bd = scoreProduct({
      ingredients_text: 'Agua, Azúcar, COL 150 d, ARO, ACI 338',
      categories: 'Bebidas, Gaseosas',
      nutriments: { 'sugars_100g': 10.6, 'energy-kcal_100g': 42 },
    });
    expect(bd.score!).toBeLessThan(50);
  });
});

describe('lo desconocido nunca premia', () => {
  // El defecto más grave que tuvo el motor: todo lo no reconocido caía en un
  // impacto neutro, sumaba al bonus por ingredientes reales y habilitaba el
  // arquetipo de alimento entero. Un producto de tres ingredientes inventados
  // daba 80 (Excelente).
  it('un producto de ingredientes ilegibles no devuelve puntaje', () => {
    const bd = scoreProduct({ ingredients_text: 'zzqx, wrrp, ttvm' });
    expect(bd.score).toBeNull();
    expect(bd.tier).toBe('Sin datos suficientes');
  });

  it('un solo término opaco ya cuesta 8 puntos', () => {
    const conocido = scoreProduct({ ingredients_text: 'agua, sal, vinagre, canela' }).score!;
    const opaco = scoreProduct({ ingredients_text: 'agua, sal, vinagre, zzqxwrrp' }).score!;
    expect(conocido - opaco).toBeGreaterThanOrEqual(8);
  });

  it('la lista opaca se registra para curaduría con su texto exacto', () => {
    const bd = scoreProduct({ ingredients_text: 'agua, sal, Extracto BioVital-9' });
    expect(bd.unidentified).toEqual(['Extracto BioVital-9']);
  });
});

describe('listas mal formadas de OFF y de los retailers', () => {
  // Caso real (Pitusas sabor limón). El texto trae un preámbulo de marketing
  // largo antes de "Ingredientes:", y después la lista sin comas. El parser
  // viejo (a) no encontraba el "Ingredientes:" y (b) descartaba en silencio el
  // fragmento resultante por largo. Quedaba UN ingrediente —el mineral de
  // fortificación, que es verde— y la galletita puntuaba 82, "Excelente", con
  // confianza alta. Confiado y equivocado: el peor resultado posible.
  const PITUSAS =
    'GALLETITAS DULCES CON SABORA VAINILLA RELLENAS CON CREMA ARTIFICIAL\r\n' +
    'CON SABOR A LIMON. Ingredientes: Harina de trigo O000 enriquecida por ley 25630, ' +
    'azúcar, grasa vegetal, jarabe de glucosa, saborizante artificial';

  it('la galletita no puede salir Excelente', () => {
    const bd = scoreProduct({
      ingredients_text: PITUSAS,
      nutriments: { 'sugars_100g': 30, 'energy-kcal_100g': 480 },
    });
    expect(bd.tier).toBe('Malo');
  });

  it('la fortificación obligatoria no salva ni hunde al producto', () => {
    const conLey = scoreProduct({
      ingredients_text: 'harina de trigo enriquecida por ley 25630, azúcar, hierro, ácido fólico',
    }).score!;
    const sinLey = scoreProduct({
      ingredients_text: 'harina de trigo, azúcar',
    }).score!;
    expect(conLey).toBe(sinLey);
  });

  it('un listado patológico no rompe el motor', () => {
    const basura = Array.from({ length: 300 }, (_, i) => `frag${i}`).join(', ');
    const bd = scoreProduct({ ingredients_text: basura });
    expect(bd.score).toBeNull(); // sin identificar, no un número inventado
  });
});

describe('additives_tags alimentan el puntaje', () => {
  // OFF normaliza los aditivos a en:eXXX — es el dato más confiable que
  // tenemos, inmune al OCR del rotulado.
  it('un aditivo declarado solo en los tags igual penaliza', () => {
    const conTags = scoreProduct({
      ingredients_text: 'agua, harina integral, sal',
      additives_tags: ['en:e621', 'en:e211'],
    }).score!;
    const sinTags = scoreProduct({ ingredients_text: 'agua, harina integral, sal' }).score!;
    expect(conTags).toBeLessThan(sinTags);
  });

  it('no cuenta dos veces el aditivo que ya estaba en el texto', () => {
    const soloTexto = scoreProduct({
      ingredients_text: 'agua, harina integral, benzoato de sodio',
    }).score!;
    const ambos = scoreProduct({
      ingredients_text: 'agua, harina integral, benzoato de sodio',
      additives_tags: ['en:e211'],
    }).score!;
    expect(ambos).toBe(soloTexto);
  });

  it('un aditivo de los tags nunca ocupa una de las 3 primeras posiciones', () => {
    const bd = scoreProduct({
      ingredients_text: 'agua',
      additives_tags: ['en:e621'],
    });
    expect(bd.ingredients.find((i) => i.name.toLowerCase().includes('glutamato'))!.position)
      .toBeGreaterThan(3);
  });
});

describe('el panel nutricional no puede sustituir al listado', () => {
  it('penaliza la grasa trans declarada aunque el texto no la nombre', () => {
    const receta = 'harina integral, agua, sal, lecitina de girasol, canela';
    const con = scoreProduct({
      ingredients_text: receta,
      nutriments: { 'trans-fat_100g': 4, 'energy-kcal_100g': 200 },
    }).score!;
    const sin = scoreProduct({
      ingredients_text: receta,
      nutriments: { 'trans-fat_100g': 0, 'energy-kcal_100g': 200 },
    }).score!;
    expect(con).toBeLessThan(sin);
  });

  it('NO penaliza la grasa trans natural de un lácteo entero', () => {
    const manteca = scoreProduct({
      ingredients_text: 'crema de leche pasteurizada',
      categories: 'Lácteos, Manteca',
      nutriments: { 'trans-fat_100g': 3, 'saturated-fat_100g': 50, 'energy-kcal_100g': 740 },
    });
    expect(manteca.tier).toBe('Excelente');
    expect(manteca.warnings).toHaveLength(0);
  });

  it('sin panel, el paso nutricional se omite en vez de asumir algo', () => {
    const bd = scoreProduct({ ingredients_text: 'harina de trigo, azúcar, sal' });
    expect(bd.steps.some((s) => s.kind === 'nutricion')).toBe(false);
  });

  // El panel es un signo de apoyo, no el motor: no puede por sí solo hundir un
  // producto a la banda que el documento reserva para las anulaciones.
  it('el paso nutricional no puede llevar el puntaje por debajo del piso', () => {
    const bd = scoreProduct({
      ingredients_text: 'harina de trigo, azúcar, cacao, leche en polvo, canela',
      nutriments: { 'sugars_100g': 60, 'saturated-fat_100g': 25, 'energy-kcal_100g': 560, 'sodium_100g': 1.5, 'fat_100g': 32 },
    });
    const paso = bd.steps.find((s) => s.kind === 'nutricion')!;
    expect(paso.delta).toBeLessThan(0);
    expect(bd.score!).toBeGreaterThanOrEqual(15);
  });

  it('un puntaje que ya venía bajo no se sube por el paso nutricional', () => {
    const bd = scoreProduct({
      ingredients_text: 'azúcar, harina de trigo, aceite de girasol, jarabe de glucosa, saborizante artificial, colorante, emulsionante',
      nutriments: { 'sugars_100g': 60, 'saturated-fat_100g': 20, 'energy-kcal_100g': 550, 'sodium_100g': 1.5, 'fat_100g': 30 },
    });
    expect(bd.score!).toBeLessThanOrEqual(15);
  });
});

describe('jugo de fruta vs. fruta entera', () => {
  // Lo encontró la auditoría del catálogo real: "Jugo de naranja 100%
  // Exprimido" daba 96 (Excelente) con cobertura total, porque "naranja"
  // matchea el arquetipo de fruta entera. Al perder la fibra y la matriz es
  // azúcar libre: decirle a alguien que el jugo equivale a la fruta es la
  // confusión exacta que la regla de cierre de §4.2 existe para evitar.
  it('el jugo exprimido no puede puntuar como la fruta', () => {
    const jugo = scoreProduct({
      ingredients_text: 'jugo de naranja exprimido', categories: 'Bebidas',
    }).score!;
    const fruta = scoreProduct({ ingredients_text: 'naranja' }).score!;
    expect(fruta - jugo).toBeGreaterThan(20);
  });

  it('el concentrado de jugo pesa como azúcar añadida', () => {
    const bd = scoreProduct({
      ingredients_text: 'agua, concentrado de jugo de manzana, ácido cítrico',
      categories: 'Bebidas',
    });
    expect(bd.ingredients[1].impact).toBe('alto');
  });
});

describe('determinismo', () => {
  it('el mismo producto da siempre el mismo puntaje', () => {
    const p = {
      ingredients_text: 'harina de trigo, azúcar, aceite de girasol, lecitina de soja',
      nutriments: { 'sugars_100g': 25, 'energy-kcal_100g': 450 },
    };
    const runs = Array.from({ length: 5 }, () => scoreProduct(p).score);
    expect(new Set(runs).size).toBe(1);
  });

  it('el orden de los additives_tags no cambia el puntaje', () => {
    const a = scoreProduct({
      ingredients_text: 'agua, harina integral',
      additives_tags: ['en:e621', 'en:e211', 'en:e471'],
    }).score;
    const b = scoreProduct({
      ingredients_text: 'agua, harina integral',
      additives_tags: ['en:e471', 'en:e211', 'en:e621'],
    }).score;
    expect(a).toBe(b);
  });
});
