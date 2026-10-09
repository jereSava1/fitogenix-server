import { describe, expect, it } from 'vitest';
import { auditProduct, barcodeStatus, summarizeAudit, type AuditInputRow } from './auditRow';

const base: AuditInputRow = {
  id: '1',
  barcode: '7798060850026',
  product_name: 'Producto',
  brand: 'Marca',
  data_source: 'off',
  ai_enriched: false,
  ingredients_text: 'harina, azúcar',
  nutriments: { 'energy-kcal_100g': 400, sugars_100g: 10, carbohydrates_100g: 60 },
};

describe('barcodeStatus', () => {
  it('distingue válido, dígito malo, longitud rara y sin código', () => {
    expect(barcodeStatus('7798060850026')).toBe('valido');
    expect(barcodeStatus('7798060850027')).toBe('digito_malo');
    expect(barcodeStatus('77980608500')).toBe('longitud_no_estandar');
    expect(barcodeStatus('ABC123')).toBe('longitud_no_estandar');
    expect(barcodeStatus(null)).toBe('sin_codigo');
    expect(barcodeStatus('  ')).toBe('sin_codigo');
  });
});

describe('auditProduct', () => {
  it('una fila sana no tiene marcas', () => {
    const r = auditProduct(base);
    expect(r).toMatchObject({
      barcode_status: 'valido',
      ai_enriched: false,
      fila_vacia: false,
      texto_reglas: [],
      nutrientes_fuera_de_rango: [],
      nutrientes_relaciones: [],
    });
  });

  it('una fila sin ingredientes ni nutrientes es vacía (nova-group no cuenta)', () => {
    const r = auditProduct({ ...base, ingredients_text: '  ', nutriments: { 'nova-group': 4 } });
    expect(r).toMatchObject({ sin_ingredientes: true, sin_nutrientes: true, fila_vacia: true });
  });

  it('marca texto, rangos y relaciones', () => {
    const r = auditProduct({
      ...base,
      ai_enriched: true,
      ingredients_text: 'Ingredientes: agua. Contiene leche.',
      nutriments: { sodium_100g: 3900, sugars_100g: 30, carbohydrates_100g: 10 },
    });
    expect(r.ai_enriched).toBe(true);
    expect(r.texto_reglas).toEqual(['rotulo', 'alergenos']);
    expect(r.texto_clases).toEqual(['contaminacion', 'declaracion']);
    expect(r.nutrientes_fuera_de_rango).toEqual(['sodium_100g']);
    expect(r.nutrientes_relaciones).toEqual(['azucares_mayor_que_carbohidratos']);
  });
});

describe('summarizeAudit', () => {
  it('cuenta por marca; una fila puede sumar en varias', () => {
    const rows = [
      auditProduct(base),
      auditProduct({ ...base, id: '2', barcode: '123', ingredients_text: null, nutriments: null }),
      auditProduct({ ...base, id: '3', nutriments: { sodium_100g: 99 }, ingredients_text: 'Contiene leche.' }),
    ];
    const s = summarizeAudit(rows);
    expect(s).toMatchObject({
      filas: 3,
      codigo_valido: 2,
      codigo_longitud_no_estandar: 1,
      fila_vacia: 1,
      texto_con_hallazgos: 1,
      nutricion_imposible: 1,
    });
    expect(s.texto_contaminado_o_mal_formado).toBeUndefined();
  });
});
