/* =========================================================
   FITOGENIX - S1 - Cuando NO se puntua

   Los tres casos que se verifican ANTES de cualquier calculo. En los tres no
   se emite puntaje, ni color, ni descripciones - y nunca un numero estimado:
   "la ausencia de datos nunca mejora un puntaje".
========================================================= */

import type { OutOfScopeRule } from '../types';

/** §1.1 — Fuera de alcance por categoría. Se evalúa contra categoría + nombre
 *  + listado, porque el dato de categoría de OFF y de los retailers es
 *  irregular y a veces lo único que delata al producto es su nombre. */
export const OUT_OF_SCOPE: readonly OutOfScopeRule[] = [
  {
    id: 'infantil-medica',
    pattern:
      /\bf[oó]rmula(s)? infantil(es)?\b|\bleche de f[oó]rmula\b|\bpapilla(s)?\b|\bnutrici[oó]n m[eé]dica\b|\bnutrici[oó]n enteral\b|\bsucedaneo de leche materna\b|\binfant formula\b|\bbaby food\b|\bpotito(s)?\b/i,
    message:
      'Fitogenix no evalúa alimentos para lactantes ni productos de nutrición médica. Su composición está definida por normativa sanitaria. Consultá con un pediatra.',
  },
  {
    id: 'higiene-cosmetica',
    pattern:
      /\bshampoo\b|\bchamp[uú]\b|\bacondicionador\b|\bjab[oó]n\b|\bdetergente\b|\blavandina\b|\bdesodorante\b|\bantitranspirante\b|\bcrema facial\b|\bcrema corporal\b|\bmaquillaje\b|\blabial\b|\bpasta dental\b|\bdent[ií]frico\b|\benjuague bucal\b|\bcosm[eé]tic|\bhigiene personal\b|\blimpiador\b|\bsuavizante\b|\bcloro\b/i,
    message:
      'Todavía no evaluamos productos de higiene y cosmética. Estamos trabajando en eso.',
  },
  {
    id: 'medicamento-suplemento',
    pattern:
      /\bmedicamento\b|\bcomprimidos?\b|\bc[aá]psulas?\b|\bjarabe medicinal\b|\bibuprofeno\b|\bparacetamol\b|\bamoxicilina\b|\bventa bajo receta\b|\bmg por c[aá]psula\b|\bmulti ?vitam[ií]nico\b|\bsuplemento diet[aá]rio\b|\bsuplemento dietario\b/i,
    message:
      'Fitogenix no evalúa medicamentos ni suplementos. Consultá con un profesional de la salud.',
  },
  {
    id: 'alcohol',
    pattern:
      /\bvino(s)?\b|\bcerveza(s)?\b|\bwhisky\b|\bvodka\b|\bron\b|\bginebra\b|\bgin\b|\bfernet\b|\baperitivo\b|\blicor(es)?\b|\bchampa[gñ]|\bespumante\b|\bsidra\b|\btequila\b|\bbebida alcoh[oó]lica\b|\b\d{1,2}[.,]?\d?\s*% ?vol\b/i,
    message:
      'Fitogenix no puntúa bebidas alcohólicas. El alcohol es el componente determinante y no se puede evaluar con un criterio de calidad de ingredientes.',
  },
  {
    id: 'mascotas',
    pattern:
      /\balimento para (perros?|gatos?|mascotas?)\b|\bpet ?food\b|\bcomida para (perros?|gatos?)\b|\bbalanceado\b|\bdog food\b|\bcat food\b/i,
    message:
      'Este producto es alimento para mascotas. Fitogenix evalúa alimentos para consumo humano.',
  },
];

/**
 * §1.1 Red de contención — sustancias no alimentarias. Si aparecen en el
 * listado, no se puntúa aunque la categoría en la base diga que es un
 * alimento. La categoría es un dato de terceros; la lista de ingredientes es
 * el producto.
 */
export const NON_FOOD_SUBSTANCES =
  /\bpolietileno\b|\bpolipropileno\b|\bdimeticona\b|\bdimethicone\b|\blauril ?sulfato\b|\bsodium lauryl\b|\blaureth\b|\bparaben(o|os)?\b|\bmethylparaben\b|\bpropilenglicol industrial\b|\btriclos[aá]n\b|\bhipoclorito\b|\bformaldeh[ií]do\b|\bpetrolatum\b|\bibuprofeno\b|\bparacetamol\b|\bsildenafil\b|\bamoxicilina\b/i;

export const OUT_OF_SCOPE_NON_FOOD_MESSAGE =
  'La lista declara sustancias que no son alimentos. Fitogenix evalúa alimentos para consumo humano.';

/**
 * §1.2 — Términos que son CATEGORÍA, no ingrediente. Una lista que se reduce
 * a estos no describe nada: no se puede puntuar lo que no se sabe.
 */
export const CATEGORY_TERMS: readonly string[] = [
  'cereales', 'cereal', 'vegetales', 'vegetal', 'verduras', 'frutas', 'fruta',
  'especias', 'condimentos', 'aditivos', 'aditivo', 'conservantes',
  'ingredientes', 'otros', 'varios', 'granos', 'legumbres', 'harinas',
  'aceites', 'grasas', 'proteinas', 'minerales', 'vitaminas',
];

/** §1.3 — Suplementos deportivos: se puntúan, con techo 74 y advertencia. */
export const SPORTS_SUPPLEMENT_PATTERN =
  /\bprote[ií]na en polvo\b|\bwhey\b|\bcreatina\b|\bcreatine\b|\bpre ?entren|\bpre ?workout\b|\bbcaa\b|\baminoacidos?\b|\baminoácidos?\b|\bgainer\b|\bcaseina en polvo\b|\bsuplemento deportivo\b|\bmass gainer\b|\bglutamina\b/i;

export const SPORTS_SUPPLEMENT_NOTICE =
  'Este es un suplemento deportivo, no un alimento. Un puntaje bajo no significa que sea inseguro: significa que está lejos de un alimento real.';

export const NO_DATA_MESSAGE = 'No tenemos datos confiables de este producto.';
