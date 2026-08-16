/* Motor v2.1 — comportamiento por sección del documento.
 *
 * La calibración contra la tabla de §8 vive en ftgEngine.calibration.test.ts;
 * acá se fija el comportamiento de cada regla por separado, para que cuando
 * §8 falle se pueda saber CUÁL regla se rompió.
 */
import { describe, expect, it } from 'vitest';
import {
  scoreProduct,
  analyzeIngredients,
  type ProductInput,
} from './index';
import { CEILINGS, DEDUCTIONS } from './index';
import { ingredientCount } from '../ftgEngine';

const score = (p: ProductInput) => scoreProduct(p).score;

/* ── §1 — Cuándo no se puntúa ──────────────────────────────────────────── */

describe('§1.1 — fuera de alcance', () => {
  const casos: [string, ProductInput, string][] = [
    ['fórmula infantil', { product_name: 'Fórmula infantil etapa 2' }, 'pediatra'],
    ['papilla', { product_name: 'Papilla de frutas bebé' }, 'pediatra'],
    ['shampoo', { product_name: 'Shampoo anticaspa' }, 'higiene'],
    ['medicamento', { product_name: 'Ibuprofeno 400 comprimidos' }, 'profesional de la salud'],
    ['vino', { product_name: 'Vino tinto reserva' }, 'alcohólicas'],
    ['alimento para perros', { product_name: 'Alimento para perros adultos' }, 'mascotas'],
  ];

  for (const [label, product, fragmento] of casos) {
    it(`${label} no se puntúa`, () => {
      const bd = scoreProduct(product);
      expect(bd.score).toBeNull();
      expect(bd.noScore?.code).toBe('fuera-de-alcance');
      expect(bd.noScore?.message).toContain(fragmento);
    });
  }

  // "si la lista contiene sustancias no alimentarias, no puntuar aunque la
  // categoría en la base diga que es un alimento."
  it('la red de contención gana sobre la categoría', () => {
    const bd = scoreProduct({
      product_name: 'Crema untable',
      categories: 'Alimentos, Untables',
      ingredients_text: 'agua, glicerina, dimeticona, parabenos',
    });
    expect(bd.score).toBeNull();
    expect(bd.noScore?.code).toBe('no-alimentario');
  });

  it('no se emite un número estimado: el score es null, no 40', () => {
    expect(score({ ingredients_text: '' })).toBeNull();
    expect(score({ ingredients_text: '   ' })).toBeNull();
  });
});

describe('§1.2 — sin datos suficientes', () => {
  it('lista vacía', () => {
    expect(scoreProduct({ ingredients_text: '' }).noScore?.code).toBe('sin-ingredientes');
  });

  it('lista que es solo términos de categoría', () => {
    const bd = scoreProduct({ ingredients_text: 'cereales, vegetales, aditivos' });
    expect(bd.noScore?.code).toBe('solo-categorias');
  });

  it('3 o más ingredientes no identificados', () => {
    const bd = scoreProduct({ ingredients_text: 'zzqx, wrrp, ttvm, agua, sal' });
    expect(bd.score).toBeNull();
    expect(bd.noScore?.code).toBe('sin-identificar');
    // La cola de curaduría se llena igual (§9).
    expect(bd.unidentified).toEqual(['zzqx', 'wrrp', 'ttvm']);
  });

  it('la ausencia de datos nunca mejora un puntaje', () => {
    const bd = scoreProduct({ ingredients_text: 'zzqx, wrrp, ttvm' });
    expect(bd.score).toBeNull();
    expect(bd.tier).toBe('Sin datos suficientes');
    expect(bd.scoreAvailable).toBe(false);
  });
});

describe('§1.3 — suplementos deportivos', () => {
  it('se puntúan, con techo 74 y advertencia', () => {
    const bd = scoreProduct({
      product_name: 'Whey Protein vainilla',
      ingredients_text: 'proteína de suero concentrada, cacao, stevia',
    });
    expect(bd.score).not.toBeNull();
    expect(bd.score!).toBeLessThanOrEqual(CEILINGS.soft);
    expect(bd.notices.some((n) => n.includes('no es un alimento') || n.includes('suplemento deportivo'))).toBe(true);
  });
});

/* ── §2 — Cómo se calcula ──────────────────────────────────────────────── */

describe('§2 Paso 2 — los seis coeficientes', () => {
  it('son los únicos valores válidos', () => {
    expect(DEDUCTIONS.alto).toEqual({ first3: 13, rest: 6 });
    expect(DEDUCTIONS.medio).toEqual({ first3: 7, rest: 3 });
    expect(DEDUCTIONS.bajo).toEqual({ first3: 3, rest: 1 });
    expect(DEDUCTIONS.desconocido).toEqual({ first3: 8, rest: 8 });
  });

  it('el mismo ingrediente pesa distinto según la posición', () => {
    const primero = score({ ingredients_text: 'azúcar, agua, sal' });          // 75 − 13
    const cuarto = score({ ingredients_text: 'agua, sal, vinagre, azúcar' });  // 75 − 6
    expect(primero).toBe(62);
    expect(cuarto).toBe(69);
  });

  it('cada resta aparece en el desglose con su ingrediente y su posición', () => {
    const bd = scoreProduct({ ingredients_text: 'azúcar, agua, sal' });
    const paso = bd.steps.find((s) => s.kind === 'ingrediente')!;
    expect(paso.label).toBe('Azúcar (posición 1)');
    expect(paso.delta).toBe(-13);
  });
});

describe('§2 Paso 3 — modificador de procesamiento', () => {
  it('4 o más marcadores restan 15', () => {
    const bd = scoreProduct({
      ingredients_text:
        'agua, almidón modificado, saborizante artificial, glutamato monosódico, lecitina de soja',
    });
    expect(bd.processing.markers.length).toBeGreaterThanOrEqual(4);
    expect(bd.processing.modifier).toBe(-15);
  });

  it('1 a 3 marcadores restan 10', () => {
    const bd = scoreProduct({ ingredients_text: 'agua, sal, almidón modificado' });
    expect(bd.processing.modifier).toBe(-10);
  });

  it('sin marcadores y con el puntaje ≥70, suma 5', () => {
    const bd = scoreProduct({ ingredients_text: 'agua, sal, vinagre, pimienta' });
    expect(bd.processing.modifier).toBe(5);
  });

  it('sin marcadores pero con el puntaje <70, no suma nada', () => {
    const bd = scoreProduct({ ingredients_text: 'harina de trigo, agua, sal' });
    expect(bd.processing.modifier).toBe(0);
  });

  it('vitaminas, stevia y eritritol NO son marcadores', () => {
    const bd = scoreProduct({ ingredients_text: 'agua, stevia, eritritol, vitamina c' });
    expect(bd.processing.markers).toHaveLength(0);
  });

  it('el bonus no se aplica sobre un ancla: las anclas ya lo incorporan', () => {
    const bd = scoreProduct({ ingredients_text: 'agua mineral' });
    expect(bd.score).toBe(98);
    expect(bd.processing.modifier).toBe(0);
  });
});

describe('§2 Paso 4 — techos', () => {
  // NOTA DE CALIBRACIÓN: con base 75 y −8 por no identificado, un producto con
  // un solo término opaco no puede pasar de 67, así que el techo de 74 nunca
  // llega a morder. Se registra igual —la UI lo muestra como límite declarado—
  // y el test fija que se detecte, no que recorte. Si alguna vez §2 sube la
  // base o baja el costo del no identificado, este techo empieza a servir.
  it('1 ingrediente no identificado → techo 74 declarado', () => {
    const bd = scoreProduct({ ingredients_text: 'agua, sal, vinagre, zzqxwrrp' });
    expect(bd.ceiling?.value).toBe(CEILINGS.soft);
    expect(bd.score).toBe(67); // 75 − 8, ya por debajo del techo
  });

  it('2 ingredientes no identificados → techo 49', () => {
    const bd = scoreProduct({
      ingredients_text: 'agua, sal, vinagre, pimienta, canela, zzqxwrrp, ttvmmkl',
    });
    expect(bd.score).toBe(CEILINGS.hard);
  });

  it('nitrito en producto NO cárnico → techo 59, no anulación', () => {
    const bd = scoreProduct({
      ingredients_text: 'agua, azúcar, nitrato de potasio',
      categories: 'Bebidas',
    });
    expect(bd.annulments).toHaveLength(0);
    expect(bd.score!).toBeLessThanOrEqual(CEILINGS.nitriteNonMeat);
  });

  it('proteína mayormente aislada → techo 74', () => {
    const bd = scoreProduct({
      ingredients_text: 'proteína de suero aislada, cacao, canela',
    });
    expect(bd.score!).toBeLessThanOrEqual(CEILINGS.soft);
  });

  it('si aplica más de un techo, vale el más bajo', () => {
    const bd = scoreProduct({
      product_name: 'Proteína en polvo',
      ingredients_text: 'proteína de suero aislada, cacao, canela, sal, agua, zzqxwrrp, ttvmmkl',
    });
    expect(bd.ceiling?.value).toBe(CEILINGS.hard);
  });
});

/* ── §3 — Anclas ───────────────────────────────────────────────────────── */

describe('§3 — anclas', () => {
  it('un ingrediente extra invalida el ancla', () => {
    const sola = score({ ingredients_text: 'aceite de oliva extra virgen' });
    const conAgregado = score({ ingredients_text: 'aceite de oliva extra virgen, saborizante artificial' });
    expect(sola).toBe(92);
    expect(conAgregado).toBeLessThan(70);
  });

  it('que el primer ingrediente sea avena no convierte al producto en avena', () => {
    const avena = score({ ingredients_text: 'avena integral' });
    const barrita = score({ ingredients_text: 'avena integral, azúcar, aceite de girasol, saborizante' });
    expect(avena).toBe(82);
    expect(barrita).toBeLessThan(45);
  });

  it('el ancla es determinista: punto medio del rango del documento', () => {
    expect(score({ ingredients_text: 'agua mineral natural' })).toBe(98);   // 95-100
    expect(score({ ingredients_text: 'huevos frescos' })).toBe(95);          // 92-98
    expect(score({ ingredients_text: 'aceite de girasol' })).toBe(23);       // 18-28
    expect(score({ ingredients_text: 'jarabe de maíz de alta fructosa' })).toBe(9); // 5-12
  });

  it('el panel puede desmentir al listado', () => {
    // Una "agua" con 10 g de azúcar declarada no es agua mineral.
    const bd = scoreProduct({
      ingredients_text: 'agua',
      nutriments: { 'sugars_100g': 10, 'energy-kcal_100g': 40 },
    });
    expect(bd.score).not.toBe(98);
  });

  it('regla de dominancia: >50% declarado no supera su ancla + 10', () => {
    const bd = scoreProduct({
      ingredients_text: 'azúcar 60%, cacao, manteca de cacao, vainilla',
    });
    // Ancla del azúcar: 12-20 → 16. Techo 26.
    expect(bd.score!).toBeLessThanOrEqual(26);
  });
});

/* ── §4 — Tabla de ingredientes ────────────────────────────────────────── */

describe('§4 — clasificación', () => {
  const impactoDe = (texto: string, nombre: string) =>
    analyzeIngredients({ ingredients_text: texto })
      .find((i) => i.name.toLowerCase().includes(nombre))?.impact;

  it('§4.1 — aceite vegetal sin especificar es alto, palma es medio', () => {
    expect(impactoDe('aceite vegetal, sal', 'aceite vegetal')).toBe('alto');
    expect(impactoDe('aceite de palma, sal', 'palma')).toBe('medio');
    expect(impactoDe('grasa interesterificada, sal', 'interesterificada')).toBe('alto');
    expect(impactoDe('grasa bovina, sal', 'grasa bovina')).toBe('bajo');
    expect(impactoDe('aceite de oliva extra virgen, sal', 'oliva')).toBe('none');
  });

  it('§4.2 — la maltodextrina y el concentrado de jugo pesan como azúcar', () => {
    expect(impactoDe('maltodextrina, sal', 'maltodextrina')).toBe('alto');
    expect(impactoDe('concentrado de jugo de manzana, sal', 'concentrado')).toBe('alto');
  });

  it('§4.2 — azúcar tradicional: ancla como producto, Alto como ingrediente', () => {
    expect(score({ ingredients_text: 'miel' })).toBe(82);              // ancla 78-85
    expect(impactoDe('avena, miel, canela', 'miel')).toBe('alto');     // añadida
  });

  it('§4.4 — la proteína animal aislada pesa menos que la vegetal aislada', () => {
    expect(impactoDe('proteína de suero aislada, cacao', 'suero')).toBe('bajo');
    expect(impactoDe('proteína de soja aislada, cacao', 'soja')).toBe('alto');
    expect(impactoDe('caseinato de sodio, cacao', 'caseinato')).toBe('alto');
    expect(impactoDe('colágeno hidrolizado, cacao', 'colágeno')).toBe('medio');
  });

  it('§4.5 — el potenciador de sabor es medio, no alto', () => {
    expect(impactoDe('agua, glutamato monosódico', 'glutamato')).toBe('medio');
  });

  it('§4.5 — la lecitina de girasol pesa menos que la de soja', () => {
    expect(impactoDe('agua, lecitina de girasol', 'girasol')).toBe('bajo');
    expect(impactoDe('agua, lecitina de soja', 'soja')).toBe('medio');
  });

  it('§4.5 — la fortificación obligatoria no se penaliza', () => {
    const bd = scoreProduct({ ingredients_text: 'avena integral, hierro, ácido fólico' });
    const restas = bd.steps.filter((s) => s.kind === 'ingrediente');
    expect(restas).toHaveLength(0);
  });

  it('§4.6 — no equiparar la stevia al aspartamo', () => {
    expect(impactoDe('agua, stevia', 'stevia')).toBe('bajo');
    expect(impactoDe('agua, aspartamo', 'aspartamo')).toBe('medio');
    expect(impactoDe('agua, maltitol', 'maltitol')).toBe('medio');
  });
});

describe('§4.7 — no identificado', () => {
  it('las denominaciones de marketing no reciben el beneficio de la duda', () => {
    for (const frase of [
      'Mezcla natural de granos ancestrales seleccionados',
      'Complejo vitamínico exclusivo de origen vegetal',
      'Blend proteico de alta biodisponibilidad',
      'Sistema enzimático patentado BioActive-7',
    ]) {
      const bd = scoreProduct({ ingredients_text: `agua, sal, ${frase}` });
      expect(bd.unidentified, frase).toContain(frase);
    }
  });

  it('un adjetivo valorativo solo no vuelve desconocido a un ingrediente real', () => {
    const bd = scoreProduct({ ingredients_text: 'agua, aroma natural, sal marina' });
    expect(bd.unidentified).toHaveLength(0);
  });

  it('usa la fórmula exacta del documento', () => {
    const ing = analyzeIngredients({ ingredients_text: 'agua, sal, zzqxwrrp' })
      .find((i) => i.impact === 'desconocido')!;
    expect(ing.desc).toBe(
      'No pudimos identificar este ingrediente. Puede ser una denominación comercial o un término que no reconocemos.',
    );
  });
});

/* ── §5 — Anulaciones ──────────────────────────────────────────────────── */

describe('§5 — anulaciones', () => {
  it('la cuenta es 20 − 6 × cantidad', () => {
    const una = scoreProduct({ ingredients_text: 'azúcar, dióxido de titanio' });
    expect(una.score).toBe(14);

    const dos = scoreProduct({
      ingredients_text: 'azúcar, dióxido de titanio, bromato de potasio',
    });
    expect(dos.score).toBe(8);
  });

  it('resta 4 más si el producto va dirigido a niños', () => {
    const bd = scoreProduct({
      ingredients_text: 'azúcar, dióxido de titanio',
      categories: 'Golosinas infantiles',
    });
    expect(bd.score).toBe(10);
  });

  it('§5.1 — la regla de cierre atrapa cualquier "hidrogenad-" o "endurecid-"', () => {
    for (const t of [
      'aceite vegetal parcialmente hidrogenado',
      'grasa vegetal hidrogenada',
      'grasa vegetal endurecida',
      'manteca vegetal hidrogenada',
    ]) {
      const bd = scoreProduct({ ingredients_text: `${t}, agua, sal` });
      expect(bd.annulments, t).toHaveLength(1);
      expect(bd.tier).toBe('Malo');
    }
  });

  it('§5.2 — curado sin ascorbato anula; con ascorbato es techo 49', () => {
    const sin = scoreProduct({
      ingredients_text: 'carne de cerdo, sal, nitrito de sodio',
      categories: 'Fiambres',
    });
    expect(sin.score).toBe(14);

    const con = scoreProduct({
      ingredients_text: 'carne de cerdo, sal, nitrito de sodio, ascorbato de sodio',
      categories: 'Fiambres',
    });
    expect(con.annulments).toHaveLength(0);
    expect(con.score!).toBeLessThanOrEqual(49);
    expect(con.score!).toBeGreaterThan(24);
  });

  it('§5.2 — el curado vegetal se evalúa igual y lleva aviso obligatorio', () => {
    const bd = scoreProduct({
      ingredients_text: 'carne de cerdo, sal, extracto de acerola, polvo de apio',
      categories: 'Fiambres',
    });
    expect(bd.score).toBe(14);
    expect(bd.notices.some((n) => n.includes('sin nitritos añadidos'))).toBe(true);
  });

  it('§5.2 — la espinaca sigue siendo espinaca', () => {
    const bd = scoreProduct({
      ingredients_text: 'espinaca, agua, sal',
      categories: 'Verduras congeladas',
    });
    expect(bd.annulments).toHaveLength(0);
  });

  it('§5.6 — dos azoicos anulan, uno solo no', () => {
    const dos = scoreProduct({ ingredients_text: 'azúcar, tartrazina, rojo allura' });
    expect(dos.annulments).toHaveLength(1);

    const uno = scoreProduct({ ingredients_text: 'azúcar, harina de trigo, tartrazina, agua' });
    expect(uno.annulments).toHaveLength(0);
  });

  it('§5.6 — uno solo SÍ anula en producto infantil', () => {
    const bd = scoreProduct({
      ingredients_text: 'azúcar, harina de trigo, tartrazina',
      categories: 'Golosinas, Productos infantiles',
    });
    expect(bd.annulments).toHaveLength(1);
  });
});

/* ── §7 — Qué ve el usuario ────────────────────────────────────────────── */

describe('§7 — salida', () => {
  it('devuelve todos los ingredientes, en el orden de la etiqueta', () => {
    const ings = analyzeIngredients({
      ingredients_text: 'harina de trigo, azúcar, cacao, sal, lecitina de soja',
    });
    expect(ings.map((i) => i.position)).toEqual([1, 2, 3, 4, 5]);
    expect(ings[0].name).toBe('Harina de trigo');
  });

  it('cada ingrediente informa cuánto restó', () => {
    const ings = analyzeIngredients({ ingredients_text: 'azúcar, agua' });
    expect(ings[0].delta).toBe(-13);
    expect(ings[1].delta).toBe(0);
  });

  it('la mirada Fitogenix es específica al producto, no genérica', () => {
    const a = scoreProduct({ ingredients_text: 'azúcar, aceite de girasol, sal' });
    const b = scoreProduct({ ingredients_text: 'agua mineral' });
    expect(a.fitogenixView).not.toBe(b.fitogenixView);
    expect(a.fitogenixView).toContain('azúcar');
  });

  it('lleva el encuadre fijo y el pie de página', () => {
    const bd = scoreProduct({ ingredients_text: 'agua, sal' });
    expect(bd.disclaimer.framing).toContain('postura declarada');
    expect(bd.disclaimer.footer).toContain('no reemplaza la consulta');
  });

  it('nunca menciona el idioma de origen ni la fuente de los datos', () => {
    const bd = scoreProduct({ ingredients_text: 'sugar, palm oil, cocoa' });
    const texto = [
      bd.fitogenixView,
      bd.processing.text,
      ...bd.ingredients.map((i) => `${i.name} ${i.desc}`),
      ...bd.steps.map((s) => `${s.label} ${s.detail ?? ''}`),
    ].join(' ').toLowerCase();
    for (const prohibido of ['inglés', 'ingles', 'open food facts', 'traducid', 'base de datos externa']) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
  });

  it('el puntaje sale solo de los ingredientes: la marca no lo mueve', () => {
    const conNombre = score({
      product_name: 'Galletitas Naturales Integrales Fit Light',
      ingredients_text: 'harina de trigo, azúcar, aceite de girasol',
    });
    const sinNombre = score({
      product_name: 'Producto',
      ingredients_text: 'harina de trigo, azúcar, aceite de girasol',
    });
    expect(conNombre).toBe(sinNombre);
  });
});

/* ── Utilidades ────────────────────────────────────────────────────────── */

describe('ingredientCount', () => {
  it('cuenta ingredientes separados por coma o punto y coma', () => {
    expect(ingredientCount(undefined)).toBe(0);
    expect(ingredientCount('')).toBe(0);
    expect(ingredientCount('   ')).toBe(0);
    expect(ingredientCount('agua, sal, azúcar')).toBe(3);
    expect(ingredientCount('agua; sal; azúcar; harina de trigo')).toBe(4);
    expect(ingredientCount('agua, sal,')).toBe(2);
  });
});

/* ── Coherencia entre la cuenta y lo que se muestra ─────────────────────── */

describe('el desglose no puede mostrar restas que no pasaron', () => {
  it('un producto con ancla muestra sus ingredientes sin resta', () => {
    // El aceite de girasol tiene ancla propia (18-28). El puntaje NO sale de
    // restarle 13 a una base: sale del ancla. Mostrar "−13" al lado sería un
    // número que nadie aplicó.
    const bd = scoreProduct({ ingredients_text: 'aceite de girasol' });
    expect(bd.score).toBe(23);
    expect(bd.ingredients.every((i) => i.delta === 0)).toBe(true);
    expect(bd.steps.some((s) => s.kind === 'ingrediente')).toBe(false);
  });

  it('un producto anulado tampoco', () => {
    const bd = scoreProduct({ ingredients_text: 'azúcar, dióxido de titanio, saborizante' });
    expect(bd.score).toBe(14);
    expect(bd.ingredients.every((i) => i.delta === 0)).toBe(true);
  });

  it('en el camino compuesto, cada resta coincide con su paso', () => {
    const bd = scoreProduct({
      ingredients_text: 'harina de trigo, azúcar, aceite de girasol, jarabe de glucosa, sal',
    });
    const pasos = bd.steps.filter((s) => s.kind === 'ingrediente');
    const conResta = bd.ingredients.filter((i) => i.delta !== 0);

    expect(pasos).toHaveLength(conResta.length);
    for (const ing of conResta) {
      const paso = pasos.find((s) => s.label.startsWith(ing.name));
      expect(paso?.delta, ing.name).toBe(ing.delta);
    }
  });
});
