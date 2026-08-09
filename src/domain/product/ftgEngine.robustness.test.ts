// Blindaje de robustez — cada bloque congela la corrección de un defecto
// concreto que el motor tuvo y que se detectó con productos reales de OFF.
//
// El hilo común: el motor no puede afirmar más de lo que sabe. Un dato que no
// entendemos no es un dato bueno, y un puntaje calculado a ciegas no vale lo
// mismo que uno calculado sobre ingredientes reconocidos.
import { describe, expect, it } from 'vitest';
import {
  evaluateIngredient,
  ftgAnalyzeIngredients,
  ftgScoreWithBreakdown,
  parseIngredientNames,
} from './ftgEngine';
import { matchesPhrase, resolveLabelAbbreviation } from './scoringRubric';

describe('matching por palabra completa', () => {
  // El alias "sal" (sin penalización) matcheaba dentro de "salame",
  // "salchicha" y "salsa de soja" con includes(). Un embutido puntuaba como
  // sal de mesa — y encima la compuerta de nitrito depende de reconocer
  // embutidos.
  it('no matchea un alias dentro de otra palabra', () => {
    expect(matchesPhrase('salame', 'sal')).toBe(false);
    expect(matchesPhrase('salchicha', 'sal')).toBe(false);
    expect(matchesPhrase('salsa de soja', 'sal')).toBe(false);
    expect(matchesPhrase('trabajo', 'ajo')).toBe(false);
    expect(matchesPhrase('ajonjolí', 'ajo')).toBe(false);
  });

  it('sí matchea la palabra completa y su plural', () => {
    expect(matchesPhrase('sal', 'sal')).toBe(true);
    expect(matchesPhrase('sal marina fina', 'sal')).toBe(true);
    expect(matchesPhrase('azúcares totales', 'azúcar')).toBe(true);
    expect(matchesPhrase('aceites vegetales refinados', 'aceites vegetales')).toBe(true);
  });

  // LIMITACIÓN CONOCIDA: el plural se toleran solo al final de la frase. En
  // "aceites vegetales" la ese va en el medio, así que no matchea el alias
  // singular "aceite vegetal". Por eso IMPACT_TABLE lista las dos formas a
  // mano. Si esto se vuelve molesto, el arreglo es normalizar a singular
  // antes de indexar, no relajar los bordes de palabra.
  it('no infla plurales en el medio de una frase', () => {
    expect(matchesPhrase('aceites vegetales', 'aceite vegetal')).toBe(false);
    // …pero el alias plural explícito de la tabla sí lo cubre:
    expect(evaluateIngredient('aceites vegetales', 0).impact).toBe('alto');
  });

  it('un embutido ya no se toma por sal de mesa', () => {
    // Lo importante no es el impacto (no tenemos "salame" en la base) sino
    // que NO se lo dé por reconocido y benigno.
    expect(evaluateIngredient('salame', 0).known).toBe(false);
  });
});

describe('parseo de paréntesis', () => {
  // El rotulado argentino declara el aditivo concreto entre paréntesis. El
  // parseo los borraba y se quedaba con la categoría genérica.
  it('conserva lo que está entre paréntesis como fragmento propio', () => {
    expect(parseIngredientNames('agua, emulsionante (lecitina de soja), colorante (E150d), sal')).toEqual([
      'agua', 'emulsionante', 'lecitina de soja', 'colorante', 'E150d', 'sal',
    ]);
  });

  it('el aditivo entre paréntesis efectivamente penaliza', () => {
    const conParentesis = ftgScoreWithBreakdown({
      ingredients_text: 'agua, harina de arroz, emulsionante (lecitina de soja), sal',
    });
    const sinAditivo = ftgScoreWithBreakdown({
      ingredients_text: 'agua, harina de arroz, sal',
    });
    expect(conParentesis.score).toBeLessThan(sinAditivo.score);
  });
});

describe('listas de ingredientes mal formadas', () => {
  // Caso real de OFF (Pitusas Sabor limón). El texto trae un preámbulo de
  // marketing largo antes de "Ingredientes:", y después la lista sin comas.
  // El parser viejo (a) no encontraba el "Ingredientes:" porque solo miraba
  // los primeros 60 caracteres, y (b) descartaba en silencio el fragmento
  // resultante por superar los 80. Quedaba UN ingrediente —el mineral de
  // fortificación, que es verde— y la galletita puntuaba 82, "Excelente",
  // con confianza alta. Confiado y equivocado: el peor resultado posible.
  const PITUSAS =
    'GALLETITAS DULCES CON SABORA VAINILLA RELLENAS CON CREMA ARTIFICIAL\r\n' +
    'CON SABOR A LIMON. Ingredientes: Harina de trigo O000 enriquecida por ley 25630\r\n' +
    '(Sulfato ferroso 30 mg/kg';

  it('encuentra el "Ingredientes:" después de un preámbulo largo', () => {
    expect(parseIngredientNames(PITUSAS)).toEqual([
      'Harina de trigo O000 enriquecida por ley 25630',
      'Sulfato ferroso 30 mg/kg',
    ]);
  });

  it('la galletita no puede salir Excelente', () => {
    const bd = ftgScoreWithBreakdown({ ingredients_text: PITUSAS, nutriments: { 'sugars_100g': 10 } });
    expect(bd.tier).toBe('Malo');
  });

  it('un fragmento largo se recorta, no se descarta', () => {
    const corrido = `harina de trigo ${'x'.repeat(200)}`;
    const parsed = parseIngredientNames(corrido);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].startsWith('harina de trigo')).toBe(true);
    // Y lo importante: el ingrediente real sigue siendo detectable.
    expect(evaluateIngredient(parsed[0], 0).impact).toBe('alto');
  });

  it('no parte los decimales al separar por puntos', () => {
    expect(parseIngredientNames('harina de trigo, sal 0.5 g, agua')).toEqual([
      'harina de trigo', 'sal 0.5 g', 'agua',
    ]);
  });
});

describe('abreviaturas del rotulado argentino (§8)', () => {
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
    const ings = ftgAnalyzeIngredients({ ingredients_text: 'Agua, Azúcar, COL 150 d, ARO, ACI 338' });
    const nombres = ings.map((i) => i.name);
    expect(nombres).toContain('Colorante E150');
    expect(nombres).toContain('Acidulante E338');
    // Ninguno de los tres puede quedar en verde: son aditivos industriales.
    for (const n of ['Colorante E150', 'Aroma', 'Acidulante E338']) {
      expect(ings.find((i) => i.name === n)!.sev).not.toBe('green');
    }
  });

  // El caso que lo destapó: la Coca-Cola de OFF, con los tres aditivos en
  // notación abreviada, salía 72 ("Buena opción").
  it('una gaseosa azucarada con aditivos abreviados no llega a Bueno', () => {
    const bd = ftgScoreWithBreakdown({
      ingredients_text: 'Agua, Azúcar, COL 150 d, ARO, ACI 338',
      categories: 'Bebidas, Gaseosas',
      nova_group: 4,
      nutriments: { 'sugars_100g': 10.6 },
    });
    expect(bd.score).toBeLessThan(50);
    expect(bd.tier).toBe('Moderado');
  });
});

describe('lo desconocido no premia', () => {
  // El defecto más grave: todo lo no reconocido caía en 'none', que sumaba
  // al bonus por ingredientes reales y habilitaba el arquetipo de alimento
  // entero. Un producto de tres ingredientes inventados daba 80 (Excelente).
  it('un producto de ingredientes ilegibles no puede dar Excelente', () => {
    const bd = ftgScoreWithBreakdown({ ingredients_text: 'zzqx, wrrp, ttvm', nova_group: 4 });
    expect(bd.coverage).toBe(0);
    expect(bd.tier).not.toBe('Excelente');
    expect(bd.scoreAvailable).toBe(false);
  });

  it('no habilita el arquetipo de alimento entero', () => {
    const desconocido = ftgScoreWithBreakdown({ ingredients_text: 'zzqx, wrrp, ttvm' });
    const reconocido = ftgScoreWithBreakdown({ ingredients_text: 'huevos frescos', nova_group: 1 });
    expect(reconocido.score).toBeGreaterThan(desconocido.score + 20);
  });

  it('un ingrediente desconocido no suma bonus, uno reconocido sí', () => {
    const conocidos = ftgScoreWithBreakdown({
      ingredients_text: 'harina de arroz, lecitina, sal, vinagre, cacao, canela',
    });
    const mitadIlegible = ftgScoreWithBreakdown({
      ingredients_text: 'harina de arroz, lecitina, zzqx, wrrp, ttvm, mmkl',
    });
    expect(conocidos.score).toBeGreaterThan(mitadIlegible.score);
    expect(conocidos.coverage).toBeGreaterThan(mitadIlegible.coverage);
  });
});

describe('el nombre mostrado y su color salen del mismo match', () => {
  // Caso real (Sprite). El OCR se comió las comas y "AGUA CARBONATADA
  // AZUCARES" quedó como un solo fragmento. Se emitía UNA entrada con el
  // nombre de la primera sustancia y el color de la peor: al usuario le
  // aparecía "Agua" pintada de ROJO. El puntaje estaba bien; lo que leía era
  // falso, que en un producto sensible cuesta más caro que el número.
  const SPRITE = 'NGE AGUA CARBONATADA AZUCARES: JUGO DE UMON, CONS BENZOATO BE SODIO';

  it('separa las sustancias de un fragmento mal parseado', () => {
    const ings = ftgAnalyzeIngredients({ ingredients_text: SPRITE });
    const agua = ings.find((i) => i.name.toLowerCase() === 'agua');
    const azucar = ings.find((i) => i.name.toLowerCase().startsWith('azuc'));

    expect(agua?.sev).toBe('green');   // nunca más "Agua" en rojo
    expect(azucar?.sev).toBe('red');
  });

  it('conserva el texto de la etiqueta cuando es más específico', () => {
    const ings = ftgAnalyzeIngredients({
      ingredients_text: 'Sangre vacuna, cuero de cerdo, cebolla, cebolla de verdeo, sal',
    });
    const nombres = ings.map((i) => i.name);
    // "cuero de cerdo" ya no se muestra como "Cerdo".
    expect(nombres).toContain('Cuero de cerdo');
    // Y "cebolla de verdeo" no colapsa contra "Cebolla".
    expect(nombres).toContain('Cebolla');
    expect(nombres).toContain('Cebolla de verdeo');
  });

  it('sigue traduciendo al español lo que viene en inglés de OFF', () => {
    const ings = ftgAnalyzeIngredients({ ingredients_text: 'sugar, palm oil, hazelnuts' });
    const nombres = ings.map((i) => i.name.toLowerCase());
    expect(nombres).toContain('azúcar');
    expect(nombres).toContain('aceite de palma');
    expect(nombres).not.toContain('palm oil');
  });

  it('no repite la sustancia y su clase: "lecithin as emulsifier" es uno solo', () => {
    const ings = ftgAnalyzeIngredients({ ingredients_text: 'agua, lecithin as emulsifier' });
    const nombres = ings.map((i) => i.name.toLowerCase());
    expect(nombres).toContain('lecitina');
    expect(nombres).not.toContain('emulsionante');
  });

  it('la clase genérica sola sí se muestra, con el default medio de §3.3', () => {
    const ings = ftgAnalyzeIngredients({ ingredients_text: 'agua, emulsionante, sal' });
    expect(ings.find((i) => i.name.toLowerCase() === 'emulsionante')?.sev).toBe('orange');
  });
});

describe('jugo de fruta vs. fruta entera (§3.4)', () => {
  // Lo encontró la auditoría del catálogo real: "Jugo de naranja 100%
  // Exprimido" daba 96 (Excelente) con cobertura total, porque "naranja"
  // matchea el arquetipo de fruta entera. §3.4 dice lo contrario — al perder
  // la fibra y la matriz es azúcar libre para la OMS, penalización media.
  // Decirle a alguien que el jugo equivale a la fruta es la confusión exacta
  // que esa sección existe para evitar.
  it('el jugo exprimido no puede puntuar como la fruta', () => {
    const jugo = ftgScoreWithBreakdown({
      ingredients_text: 'Jugo de naranja', categories: 'Bebidas', nova_group: 1,
    });
    const fruta = ftgScoreWithBreakdown({ ingredients_text: 'naranja', nova_group: 1 });

    expect(jugo.tier).toBe('Bueno');
    expect(fruta.tier).toBe('Excelente');
    expect(fruta.score - jugo.score).toBeGreaterThan(30);
  });

  it('fruta en la góndola de bebidas es jugo, aunque el listado diga "Manzana"', () => {
    const enBebidas = ftgScoreWithBreakdown({
      ingredients_text: 'Manzana', categories: 'Bebidas', nova_group: 1,
      nutriments: { 'sugars_100g': 9 },
    });
    expect(enBebidas.tier).toBe('Bueno');
  });

  it('la fruta de verdad sigue siendo Excelente', () => {
    const fruta = ftgScoreWithBreakdown({
      ingredients_text: 'Manzana', categories: 'Frutas frescas', nova_group: 1,
      nutriments: { 'sugars_100g': 10 },
    });
    expect(fruta.tier).toBe('Excelente');
  });
});

describe('cobertura y confianza', () => {
  it('reporta qué fracción de ingredientes entendió', () => {
    const todo = ftgScoreWithBreakdown({ ingredients_text: 'agua, sal, cacao' });
    expect(todo.coverage).toBe(1);
    expect(todo.confidence).toBe('alta');

    const nada = ftgScoreWithBreakdown({ ingredients_text: 'zzqx, wrrp, ttvm' });
    expect(nada.coverage).toBe(0);
    expect(nada.confidence).toBe('baja');
  });

  it('la falta de datos tiende a neutro, no a bueno ni a malo', () => {
    const ciego = ftgScoreWithBreakdown({ ingredients_text: 'zzqx, wrrp, ttvm, mmkl, ppqr' });
    expect(ciego.score).toBeGreaterThanOrEqual(45);
    expect(ciego.score).toBeLessThanOrEqual(55);
  });
});

describe('additives_tags alimentan el puntaje', () => {
  // OFF normaliza los aditivos a en:eXXX — es el dato más confiable que
  // tenemos, inmune al OCR del rotulado. Antes solo llenaba la lista visible
  // y no entraba al cálculo, así que un producto con el texto roto perdía
  // todos sus aditivos.
  it('un aditivo declarado solo en los tags igual penaliza', () => {
    const conTags = ftgScoreWithBreakdown({
      ingredients_text: 'agua, harina de arroz, sal',
      additives_tags: ['en:e621', 'en:e211', 'en:e102'],
    });
    const sinTags = ftgScoreWithBreakdown({ ingredients_text: 'agua, harina de arroz, sal' });
    expect(conTags.score).toBeLessThan(sinTags.score);
  });

  it('no cuenta dos veces el aditivo que ya estaba en el texto', () => {
    const soloTexto = ftgScoreWithBreakdown({ ingredients_text: 'agua, harina de arroz, benzoato de sodio' });
    const ambos = ftgScoreWithBreakdown({
      ingredients_text: 'agua, harina de arroz, benzoato de sodio',
      additives_tags: ['en:e211'],
    });
    expect(ambos.score).toBe(soloTexto.score);
  });
});

describe('grasa trans declarada en el panel', () => {
  // §4.1 solo ataca la grasa trans por ingrediente ("parcialmente
  // hidrogenado" en el texto). Un producto que la declara en el panel sin
  // nombrar el PHO se escapaba: 4g/100g daba 46, Moderado, sin compuerta.
  it('penaliza aunque el texto no nombre el PHO', () => {
    const conTrans = ftgScoreWithBreakdown({
      ingredients_text: 'harina de trigo, margarina vegetal, sal',
      nova_group: 4,
      nutriments: { 'trans-fat_100g': 4 },
    });
    const sinTrans = ftgScoreWithBreakdown({
      ingredients_text: 'harina de trigo, margarina vegetal, sal',
      nova_group: 4,
      nutriments: { 'trans-fat_100g': 0 },
    });
    expect(conTrans.score).toBeLessThan(sinTrans.score - 10);
  });

  // §3.4 y §4.1 son explícitos: la grasa trans natural de rumiantes no se
  // penaliza. Sin esta excepción, la manteca y el queso caerían injustamente.
  it('NO penaliza la grasa trans natural de un lácteo entero', () => {
    const manteca = ftgScoreWithBreakdown({
      ingredients_text: 'crema de leche pasteurizada',
      categories: 'Lácteos, Manteca',
      nova_group: 2,
      nutriments: { 'trans-fat_100g': 3 },
    });
    expect(manteca.tier).toBe('Excelente');
  });
});
