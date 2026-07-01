// Inyecta aliases en inglés en ingredientData.ts. Idempotente: se puede
// re-correr sin duplicar. OFF devuelve ingredientes en el idioma del país
// de origen del producto; el inglés es el más común después del español.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENTS, ADDITIVES } from '../src/domain/product/ingredientData';

// clave = alias español ya existente (localiza la entrada) → aliases EN a sumar
const EN: Record<string, string[]> = {
  'aceite de girasol alto oleico': ['high oleic sunflower oil'],
  'aceite de girasol': ['sunflower oil'],
  'aceite de soja': ['soybean oil', 'soy oil'],
  'aceite de canola': ['canola oil', 'rapeseed oil'],
  'aceite de maíz': ['corn oil'],
  'aceite de algodón': ['cottonseed oil'],
  'aceite de cártamo': ['safflower oil'],
  'aceite de uva': ['grapeseed oil'],
  'aceite vegetal': ['vegetable oil'],
  'aceites vegetales': ['vegetable oils'],
  'grasa vegetal': ['vegetable fat'],
  'aceite de sésamo': ['sesame oil'],
  'aceite de maní': ['peanut oil'],
  'aceite de palma': ['palm oil'],
  'grasa de palma': ['palm fat'],
  'aceite de oliva extra virgen': ['extra virgin olive oil'],
  'aceite de oliva': ['olive oil'],
  'aceite de coco': ['coconut oil'],
  'mantequilla': ['butter'],
  'ghee': ['clarified butter'],
  'hidrogenado': ['hydrogenated'],
  'parcialmente hidrogenado': ['partially hydrogenated'],
  'margarina': ['margarine'],
  'sucralosa': ['sucralose'],
  'acesulfame': ['acesulfame'],
  'sacarina': ['saccharin'],
  'stevia': ['stevia'],
  'eritritol': ['erythritol'],
  'xilitol': ['xylitol'],
  'sorbitol': ['sorbitol'],
  'maltitol': ['maltitol'],
  'miel': ['honey'],
  'jarabe de arce': ['maple syrup'],
  'melaza': ['molasses'],
  'azúcar de coco': ['coconut sugar'],
  'azúcar': ['sugar'],
  'sacarosa': ['sucrose'],
  'jarabe de glucosa': ['glucose syrup'],
  'jarabe de maíz de alta fructosa': ['high fructose corn syrup', 'high-fructose corn syrup'],
  'jarabe de maíz': ['corn syrup'],
  'jarabe de glucosa-fructosa': ['glucose-fructose syrup'],
  'dextrosa': ['dextrose'],
  'fructosa': ['fructose'],
  'maltodextrina': ['maltodextrin'],
  'glucosa': ['glucose'],
  'ácido ascórbico': ['ascorbic acid'],
  'tocoferol': ['tocopherol'],
  'ácido cítrico': ['citric acid'],
  'ácido láctico': ['lactic acid'],
  'vinagre': ['vinegar'],
  'sal marina': ['sea salt'],
  'sal': ['salt'],
  'benzoato de sodio': ['sodium benzoate'],
  'benzoato de potasio': ['potassium benzoate'],
  'nitrito de sodio': ['sodium nitrite'],
  'nitrato de sodio': ['sodium nitrate'],
  'propionato de calcio': ['calcium propionate'],
  'sorbato de potasio': ['potassium sorbate'],
  'dióxido de azufre': ['sulfur dioxide', 'sulphur dioxide'],
  'glutamato monosódico': ['monosodium glutamate'],
  'saborizante artificial': ['artificial flavor', 'artificial flavour'],
  'sabor artificial': ['artificial flavoring'],
  'vainillina': ['vanillin'],
  'saborizante natural': ['natural flavor', 'natural flavour'],
  'extracto de vainilla': ['vanilla extract'],
  'vainilla': ['vanilla'],
  'cúrcuma': ['turmeric'],
  'beta-caroteno': ['beta-carotene'],
  'remolacha': ['beet', 'beetroot'],
  'lecitina de girasol': ['sunflower lecithin'],
  'lecitina de soja': ['soy lecithin', 'soya lecithin'],
  'lecitina': ['lecithin'],
  'mono y diglicéridos': ['mono and diglycerides', 'monoglycerides'],
  'polisorbato': ['polysorbate'],
  'carragenina': ['carrageenan'],
  'goma xantana': ['xanthan gum'],
  'goma guar': ['guar gum'],
  'goma arábiga': ['gum arabic', 'acacia gum'],
  'pectina': ['pectin'],
  'almidón modificado': ['modified starch', 'modified corn starch'],
  'almidón de maíz': ['corn starch', 'cornstarch'],
  'harina de trigo': ['wheat flour'],
  'harina integral': ['whole wheat flour', 'wholemeal flour'],
  'harina de avena': ['oat flour'],
  'harina de almendra': ['almond flour'],
  'harina de coco': ['coconut flour'],
  'harina de arroz': ['rice flour'],
  'leche entera': ['whole milk'],
  'leche descremada': ['skim milk', 'skimmed milk', 'nonfat milk'],
  'leche en polvo': ['milk powder', 'powdered milk'],
  'crema de leche': ['cream', 'milk cream'],
  'leche': ['milk'],
  'queso': ['cheese'],
  'yogur': ['yogurt', 'yoghurt'],
  'suero de leche': ['whey', 'reduced minerals whey'],
  'proteína de suero': ['whey protein'],
  'caseína': ['casein'],
  'huevos': ['eggs'],
  'huevo': ['egg'],
  'clara de huevo': ['egg white'],
  'colágeno': ['collagen'],
  'gelatina': ['gelatin', 'gelatine'],
  'proteína de soja': ['soy protein', 'soya protein'],
  'carne': ['meat', 'beef'],
  'pollo': ['chicken'],
  'cerdo': ['pork'],
  'pescado': ['fish'],
  'salmón': ['salmon'],
  'atún': ['tuna'],
  'avena integral': ['whole oats'],
  'avena': ['oats', 'oat'],
  'quinoa': ['quinoa'],
  'arroz integral': ['brown rice'],
  'arroz': ['rice'],
  'té verde': ['green tea'],
  'café': ['coffee'],
  'cacao': ['cocoa', 'cacao'],
  'masa de cacao': ['cocoa mass', 'cocoa liquor'],
  'manteca de cacao': ['cocoa butter'],
  'chocolate': ['chocolate'],
  'almendras': ['almonds'],
  'nueces': ['walnuts'],
  'castañas de cajú': ['cashews'],
  'semillas de chía': ['chia seeds'],
  'semillas de lino': ['flax seeds', 'flaxseed', 'linseed'],
  'semillas de girasol': ['sunflower seeds'],
  'maní': ['peanuts', 'peanut'],
  'canela': ['cinnamon'],
  'jengibre': ['ginger'],
  'agua': ['water'],
  'bicarbonato de sodio': ['baking soda', 'sodium bicarbonate'],
  'levadura': ['yeast'],
  'polvo de hornear': ['baking powder'],
  'ácido fosfórico': ['phosphoric acid'],
  'colorante': ['color', 'colour', 'coloring'],
  'conservante': ['preservative'],
  'emulsionante': ['emulsifier'],
  'espesante': ['thickener'],
  'saborizante': ['flavoring', 'flavouring', 'flavor', 'flavour'],
  'edulcorante': ['sweetener'],
  'estabilizante': ['stabilizer', 'stabiliser'],
  'almidón de trigo': ['wheat starch'],
  'manteca de maní': ['peanut butter'],
  'proteína de trigo': ['wheat protein'],
  'gluten': ['gluten'],
  'fibra de trigo': ['wheat fiber', 'wheat fibre'],
  'inulina': ['inulin'],
  'cafeína': ['caffeine'],
  'monk fruit': ['monk fruit', 'luo han guo'],
  'ácido málico': ['malic acid'],
  'dióxido de carbono': ['carbon dioxide'],
  'carbonato de calcio': ['calcium carbonate'],
  'niacina': ['niacin'],
  'riboflavina': ['riboflavin'],
  'tiamina': ['thiamine', 'thiamin'],
  'hierro': ['iron'],
  'zinc': ['zinc'],
};

let added = 0;
let missing: string[] = [];
for (const [esKey, enAliases] of Object.entries(EN)) {
  const entry = INGREDIENTS.find((i) => i.aliases.includes(esKey));
  if (!entry) { missing.push(esKey); continue; }
  for (const en of enAliases) {
    if (!entry.aliases.includes(en)) { entry.aliases.push(en); added++; }
  }
}

// ── Re-serializar el archivo ──
const esc = (s: string) => JSON.stringify(s);
const ingLines = INGREDIENTS.map((i) => {
  const a = i.a ? `, a: '${i.a}'` : '';
  return `  { aliases: [${i.aliases.map(esc).join(', ')}], b: '${i.b}'${a}, desc: ${esc(i.desc)} },`;
});
const addLines = Object.entries(ADDITIVES).map(([code, v]) => {
  const a = v.a ? `, a: '${v.a}'` : '';
  const d = v.desc ? `, desc: ${esc(v.desc)}` : '';
  return `  ${esc(code)}: { name: ${esc(v.name)}, b: '${v.b}'${a}${d} },`;
});

const path = join(__dirname, '../src/domain/product/ingredientData.ts');
const src = readFileSync(path, 'utf8');
const head = src.slice(0, src.indexOf('export const INGREDIENTS'));
const out = `${head}export const INGREDIENTS: Ingredient[] = [
${ingLines.join('\n')}
];

export const ADDITIVES: Record<string, Additive> = {
${addLines.join('\n')}
};
`;
writeFileSync(path, out, 'utf8');
console.log(`Aliases EN agregados: ${added}`);
if (missing.length) console.log(`⚠ claves ES no encontradas: ${missing.join(', ')}`);
