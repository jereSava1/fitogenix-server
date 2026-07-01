/* ═══════════════════════════════════════════════════════════
   FITOGENIX — Ingredient classification & scoring engine
   Rubric v1 — Two-layer system (Capa A / Capa B)

   Pure logic, zero React Native / Expo imports — runs identically
   inside the app (via lookupProduct.ts) and in standalone Node
   scripts (scripts/fetch-off-drafts.ts, scripts/import-products.ts).
   Keeping this framework-agnostic is what lets the curation tooling
   reuse the exact same scoring as a live scan, instead of a second
   implementation that could silently drift from the app's.
═══════════════════════════════════════════════════════════ */

// ── Types ──
export type Severity = 'red' | 'orange' | 'yellow' | 'green' | 'gray';

export type AnalyzedIngredient = {
  name: string;
  detail: string;
  sev: Severity;
  amount: string;
  desc: string;
  flag: boolean;
};

export type NutritionFacts = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  sugars: number | null;
  fats: number | null;
  satFats: number | null;
  sodium: number | null;
  fiber: number | null;
  transFat: number | null;
  cholesterol: number | null;
};

// Minimal shape the engine needs — satisfied structurally by both
// lookupProduct.ts's RawOFFProduct and the plain objects the curation
// scripts build from Open Food Facts' API.
export type ProductInput = {
  ingredients_text?: string;
  nutriments?: Record<string, unknown>;
  nova_group?: number;
  additives_tags?: string[];
  labels_tags?: string[];
  categories?: string;
  image_url?: string;
  image_front_url?: string;
};

// ── Score breakdown type (Rubric §4, §7) ──
// Returned by ftgScoreWithBreakdown(); consumed by the popup UI.
export type ScoreBreakdown = {
  score: number;
  tier: 'Excelente' | 'Bueno' | 'Moderado' | 'Malo';
  tierColor: string;
  tierMessage: string;
  // Non-null when a gate fired — describes the gate reason for UI display.
  gateTriggered: string | null;
  components: {
    toxicidad:     { score: number; verdict: string; detail: string };
    nutricion:     { score: number; verdict: string; detail: string };
    procesamiento: { score: number; nova: number | null; detail: string };
    alineacion:    { score: number; verdict: string; detail: string };
  };
};

// Internal gate type — never exported.
type Gate =
  | { kind: 'annul';   reason: string }
  | { kind: 'ceiling'; maxScore: number; reason: string };

// ── E-number classification — Capa B (Fitogenix display severity) ──
const E_SEV: Record<string, Severity> = {
  'en:e102':'red','en:e104':'red','en:e110':'red','en:e120':'red',
  'en:e122':'red','en:e123':'red','en:e124':'red','en:e127':'red',
  'en:e129':'red','en:e131':'red','en:e132':'red','en:e133':'orange',
  'en:e142':'red','en:e150d':'red','en:e151':'red','en:e155':'red',
  'en:e100':'green','en:e101':'green','en:e140':'green','en:e141':'green',
  'en:e150a':'yellow','en:e150b':'yellow','en:e150c':'yellow',
  'en:e160a':'green','en:e160b':'yellow','en:e160c':'green','en:e161b':'green',
  'en:e162':'green','en:e163':'green','en:e171':'orange','en:e172':'yellow',
  'en:e200':'yellow','en:e202':'yellow','en:e203':'yellow',
  'en:e210':'red','en:e211':'red','en:e212':'red','en:e213':'red',
  'en:e214':'red','en:e215':'red','en:e216':'red','en:e217':'red',
  'en:e218':'orange','en:e219':'orange',
  'en:e220':'orange','en:e221':'orange','en:e222':'orange','en:e223':'orange',
  'en:e250':'red','en:e251':'red','en:e252':'red',
  'en:e280':'orange','en:e281':'orange','en:e282':'orange','en:e283':'orange',
  'en:e319':'red','en:e320':'red','en:e321':'red',
  'en:e300':'green','en:e301':'green','en:e302':'green',
  'en:e306':'green','en:e307':'green','en:e308':'green','en:e309':'green',
  'en:e392':'green',
  'en:e330':'yellow','en:e331':'yellow','en:e332':'yellow','en:e333':'yellow',
  'en:e334':'yellow','en:e335':'yellow','en:e336':'yellow','en:e337':'yellow',
  'en:e338':'red',
  'en:e322':'yellow','en:e442':'yellow',
  'en:e407':'orange','en:e410':'yellow','en:e412':'yellow','en:e413':'yellow',
  'en:e414':'green','en:e415':'yellow','en:e440':'green','en:e460':'yellow',
  'en:e461':'yellow','en:e462':'yellow','en:e463':'yellow','en:e464':'yellow',
  'en:e465':'yellow','en:e466':'yellow',
  'en:e470':'yellow','en:e471':'orange','en:e472':'orange','en:e473':'orange',
  'en:e474':'orange','en:e475':'orange','en:e476':'orange','en:e477':'orange',
  'en:e450':'orange','en:e451':'orange','en:e452':'orange',
  'en:e500':'green','en:e501':'green','en:e503':'green','en:e504':'green',
  'en:e620':'red','en:e621':'red','en:e622':'red','en:e623':'red',
  'en:e624':'red','en:e625':'red','en:e626':'orange','en:e627':'orange',
  'en:e628':'orange','en:e629':'orange','en:e630':'orange','en:e631':'orange',
  'en:e632':'orange','en:e633':'orange','en:e634':'orange','en:e635':'orange',
  'en:e950':'red','en:e951':'red','en:e952':'red','en:e954':'red',
  'en:e955':'red','en:e961':'red','en:e962':'red',
  'en:e960':'yellow','en:e968':'yellow',
  'en:e420':'yellow','en:e421':'yellow','en:e953':'yellow',
  'en:e965':'yellow','en:e966':'yellow','en:e967':'yellow',
};

// Capa A (regulatory/toxicological) E-number severities.
// Only listed where Capa A diverges from E_SEV (Capa B display).
const CAPA_A_ESEV: Record<string, Severity> = {
  // Aspartame (§6.3): IARC 2B (limited evidence), JECFA reaffirmed IDA 2023 → Moderado
  'en:e951': 'orange',
};

const E_NAMES: Record<string, string> = {
  'en:e100':'Curcumina (cúrcuma)','en:e102':'Tartrazina','en:e104':'Amarillo de quinoleína',
  'en:e110':'Amarillo Ocaso FCF','en:e120':'Carmín de cochinilla','en:e122':'Azorrubina',
  'en:e124':'Ponceau 4R','en:e129':'Rojo Allura AC','en:e133':'Azul Brillante FCF',
  'en:e140':'Clorofilas (natural)','en:e150a':'Caramelo simple','en:e150d':'Caramelo Clase IV',
  'en:e160a':'Beta-caroteno (natural)','en:e160b':'Annatto / Bixina','en:e162':'Rojo remolacha',
  'en:e171':'Dióxido de titanio','en:e200':'Ácido sórbico','en:e202':'Sorbato de potasio',
  'en:e210':'Ácido benzoico','en:e211':'Benzoato de sodio','en:e220':'Dióxido de azufre',
  'en:e250':'Nitrito de sodio','en:e251':'Nitrato de sodio','en:e282':'Propionato de calcio',
  'en:e300':'Vitamina C (Ácido ascórbico)','en:e306':'Vitamina E (Tocoferoles)',
  'en:e319':'TBHQ','en:e320':'BHA','en:e321':'BHT',
  'en:e322':'Lecitina','en:e330':'Ácido cítrico','en:e338':'Ácido fosfórico',
  'en:e392':'Extracto de romero','en:e407':'Carragenina','en:e410':'Goma de algarrobo',
  'en:e412':'Goma guar','en:e414':'Goma arábiga','en:e415':'Goma xantana',
  'en:e440':'Pectinas','en:e450':'Difosfatos','en:e466':'Carboximetilcelulosa',
  'en:e471':'Mono y diglicéridos de ácidos grasos','en:e476':'Poliglicerol de ácidos grasos',
  'en:e500':'Bicarbonato de sodio','en:e621':'Glutamato monosódico (MSG)',
  'en:e627':'Guanilato disódico','en:e631':'Inosinato disódico','en:e635':'Ribonucleótidos',
  'en:e950':'Acesulfame K','en:e951':'Aspartamo','en:e952':'Ciclamato',
  'en:e954':'Sacarina','en:e955':'Sucralosa','en:e960':'Glucósidos de esteviol (Stevia)',
};

const E_DESC: Record<string, string> = {
  'en:e102':'Colorante azo sintético. Vinculado a hiperactividad infantil. Prohibido o restringido en varios países.',
  'en:e110':'Colorante azo. Posible cancerígeno. Prohibido en algunos países.',
  'en:e120':'Colorante de insectos cochinilla. Natural pero alérgeno conocido.',
  'en:e129':'Colorante azo rojo. Asociado a hiperactividad infantil y reacciones alérgicas.',
  'en:e150d':'Colorante caramelo clase IV. Contiene 4-MEI, posible cancerígeno según la IARC.',
  'en:e171':'Dióxido de titanio. La EFSA revocó su seguridad en 2021. Posible genotóxico.',
  'en:e211':'Conservante artificial. Puede formar benceno (cancerígeno) al combinarse con vitamina C.',
  'en:e250':'Nitrito de sodio. Conservante en carnes procesadas. IARC Grupo 2A; EFSA 2023 redujo niveles permitidos por riesgo de nitrosaminas.',
  'en:e251':'Nitrato de sodio. Precursor de nitrosaminas cancerígenas. IARC Grupo 2A en carnes procesadas.',
  'en:e282':'Propionato de calcio. Conservante. Algunos estudios lo asocian con irritabilidad e hiperactividad.',
  'en:e300':'Vitamina C natural. Antioxidante beneficioso. Protege contra la oxidación.',
  'en:e306':'Vitamina E (tocoferoles). Antioxidante natural. Beneficioso y seguro.',
  'en:e319':'TBHQ. Conservante petroquímico. Clasificado como posible cancerígeno. Evitar.',
  'en:e320':'BHA. Antioxidante sintético de petróleo. Posible cancerígeno según la IARC.',
  'en:e321':'BHT. Antioxidante sintético. Posible disruptor endocrino y cancerígeno.',
  'en:e322':'Lecitina emulsionante. Si es de soja puede ser transgénica. Preferir lecitina de girasol.',
  'en:e330':'Ácido cítrico. Conservante natural derivado de fermentación. Generalmente seguro.',
  'en:e338':'Ácido fosfórico. Acidulante. Interfiere con absorción de calcio y erosiona esmalte dental.',
  'en:e392':'Extracto de romero. Antioxidante natural de hierba aromática. Beneficioso.',
  'en:e407':'Carragenina. Capa A: aprobada por EFSA/JECFA, en reevaluación activa (2018) con preguntas sobre efectos intestinales. Desde la mirada Fitogenix: sustituto industrial de textura integral.',
  'en:e414':'Goma arábiga. Fibra natural de acacia. Prebiótica y segura.',
  'en:e440':'Pectinas. Fibra natural de frutas. Prebiótica y beneficiosa.',
  'en:e471':'Mono y diglicéridos. Emulsionante. Puede contener grasas trans. Origen poco transparente.',
  'en:e500':'Bicarbonato de sodio. Leudante natural y seguro.',
  'en:e621':'Glutamato monosódico (MSG). Potenciador de sabor artificial. Controversia sobre efectos neurológicos.',
  'en:e635':'Ribonucleótidos. Potenciador de sabor. Suele acompañar al MSG para efecto sinérgico.',
  'en:e950':'Acesulfame K. Edulcorante artificial. Estudios en animales muestran efectos sobre metabolismo.',
  'en:e951':'Capa A: IARC Grupo 2B (2023, evidencia limitada); JECFA reafirmó la IDA de 40mg/kg. Desde la mirada Fitogenix: edulcorante sintético sin equivalente natural.',
  'en:e952':'Ciclamato. Edulcorante artificial. Prohibido en EE.UU. por asociación con cáncer.',
  'en:e954':'Sacarina. Edulcorante artificial. Primer edulcorante sintético. Controversia sobre seguridad.',
  'en:e955':'Sucralosa. Edulcorante artificial 600x más dulce que el azúcar. Afecta el microbioma intestinal.',
  'en:e960':'Glucósidos de esteviol (stevia). Edulcorante de planta stevia. Preferible a los artificiales.',
};

// ── Fitogenix Ingredient Database (Capa B — Fitogenix philosophy) ──
// sev represents the Capa B (Fitogenix) display severity shown in the ingredient list.
// For ingredients where Capa A diverges, see CAPA_A_ING_SEV below.
// Each entry: [keyword_pattern, {sev, desc}] — longest match wins.
const FTG_ING_DB: [string, { sev: Severity; desc: string }][] = [
  // Seed oils — Capa B: Crítico (industrial extraction, high omega-6, no ancestral equivalent).
  // Capa A: Bien — independent meta-analyses show no increased CV/cancer risk at habitual intake.
  ['aceite de girasol alto oleico', {sev:'orange', desc:'Capa A: revisiones independientes no muestran riesgo aumentado. Desde la mirada Fitogenix: aceite de semilla refinado; variante con más oleico, menos omega-6, pero sigue siendo extracción industrial.'}],
  ['aceite de girasol',        {sev:'red',    desc:'Capa A: revisiones independientes no muestran riesgo cardiovascular o de cáncer aumentado. Desde la mirada Fitogenix: extracción industrial (solventes, alta temperatura), omega-6 elevado, sin equivalente de uso ancestral.'}],
  ['aceite de soja',           {sev:'red',    desc:'Capa A: revisiones independientes no muestran riesgo aumentado. Desde la mirada Fitogenix: extracción industrial, generalmente transgénico, omega-6 elevado.'}],
  ['aceite de canola',         {sev:'red',    desc:'Capa A: revisiones independientes no muestran riesgo aumentado. Desde la mirada Fitogenix: extracción industrial (solventes hexano), omega-6 elevado, sin uso ancestral.'}],
  ['aceite de colza',          {sev:'red',    desc:'Capa A: revisiones independientes no muestran riesgo aumentado. Desde la mirada Fitogenix: aceite de semilla industrial altamente refinado.'}],
  ['aceite de maíz',           {sev:'red',    desc:'Capa A: revisiones independientes no muestran riesgo aumentado. Desde la mirada Fitogenix: extracción industrial, generalmente transgénico, omega-6 elevado.'}],
  ['aceite de algodón',        {sev:'red',    desc:'Capa A: preocupaciones por pesticidas en cultivo (no clasificado como riesgo directo). Desde la mirada Fitogenix: aceite de semilla con alta carga de pesticidas.'}],
  ['aceite de cártamo',        {sev:'red',    desc:'Capa A: revisiones independientes no muestran riesgo aumentado. Desde la mirada Fitogenix: el más alto en omega-6 de todos los aceites de semilla.'}],
  ['aceite de uva',            {sev:'red',    desc:'Capa A: revisiones independientes no muestran riesgo aumentado. Desde la mirada Fitogenix: aceite de semilla extraído con solventes industriales.'}],
  ['aceite de pepita',         {sev:'red',    desc:'Capa A: sin evidencia regulatoria de riesgo. Desde la mirada Fitogenix: aceite de semilla de proceso industrial.'}],
  ['aceite vegetal',           {sev:'red',    desc:'Capa A: origen no declarado impide evaluar riesgo regulatorio. Desde la mirada Fitogenix: término genérico que oculta aceites de semilla industriales.'}],
  ['aceites vegetales',        {sev:'red',    desc:'Capa A: mezcla no declarada, imposible evaluar. Desde la mirada Fitogenix: mezcla de aceites de semilla industriales no especificados.'}],
  ['grasa vegetal',            {sev:'red',    desc:'Capa A: origen no declarado impide evaluación. Desde la mirada Fitogenix: puede contener aceites de semilla o grasas trans.'}],
  ['aceite de sésamo',         {sev:'orange', desc:'Capa A: sin evidencia regulatoria de riesgo. Desde la mirada Fitogenix: aceite de semilla, moderado en omega-6; mejor sin refinar en cantidades pequeñas.'}],
  ['aceite de maní',           {sev:'orange', desc:'Capa A: sin evidencia regulatoria de riesgo. Desde la mirada Fitogenix: aceite de semilla, algo mejor que otros pero alto en omega-6 si es refinado.'}],
  ['aceite de palma',          {sev:'orange', desc:'Capa A: algunas preguntas sobre CV, no concluyente. Desde la mirada Fitogenix: más estable que aceites de semilla, pero producción asociada a deforestación.'}],
  ['grasa de palma',           {sev:'orange', desc:'Capa A: sin evidencia regulatoria de riesgo directo. Desde la mirada Fitogenix: grasa saturada estable, cuestionada por impacto ambiental.'}],
  ['aceite de oliva extra virgen', {sev:'green', desc:'La mejor grasa vegetal. Rica en oleocantal antiinflamatorio y polifenoles. Presión en frío.'}],
  ['aceite de oliva',          {sev:'green', desc:'Grasa monoinsaturada saludable. Preferir versión extra virgen.'}],
  ['aceite de coco',           {sev:'green', desc:'Grasa saturada de cadena media (MCT). Estable al calor y beneficiosa para el metabolismo.'}],
  ['mantequilla',              {sev:'green', desc:'Grasa animal natural. Rica en ácidos grasos de cadena corta, vitaminas A, D, K2.'}],
  ['manteca',                  {sev:'green', desc:'Grasa animal natural. Fuente de vitaminas liposolubles y ácidos grasos conjugados (CLA).'}],
  ['ghee',                     {sev:'green', desc:'Mantequilla clarificada. Sin lactosa ni caseína. Muy estable al calor. Medicina ayurvédica.'}],
  ['grasa de res',             {sev:'green', desc:'Grasa bovina natural. Estable al calor. Rica en CLA y vitaminas liposolubles.'}],
  ['grasa de cerdo',           {sev:'green', desc:'Grasa animal tradicional. Rica en ácido oleico y vitamina D. Más estable que aceites de semilla.'}],
  ['manteca de cerdo',         {sev:'green', desc:'Grasa animal natural. Usada en cocina ancestral. Rica en grasas monoinsaturadas.'}],
  ['sebo',                     {sev:'green', desc:'Grasa bovina natural. Muy estable al calor. Tradicional en cocina ancestral.'}],
  ['grasa de pato',            {sev:'green', desc:'Grasa animal natural y sabrosa. Rica en grasas monoinsaturadas. Tradicional.'}],
  // Trans fats — Capa A: Crítico, Capa B: Crítico. Unanimous consensus. Gate triggers annulment.
  ['hidrogenado',              {sev:'red',    desc:'Grasa trans industrial. Consenso científico unánime sobre daño cardiovascular. OMS solicita eliminación global. Sin nivel de consumo seguro.'}],
  ['parcialmente hidrogenado', {sev:'red',    desc:'Aceite parcialmente hidrogenado (grasa trans). Sin nivel de consumo seguro — OMS 2018, Argentina. ANMAT ya adoptó política de eliminación.'}],
  ['margarina',                {sev:'red',    desc:'Aceite vegetal hidrogenado o interesterificado. Sustituto industrial de la mantequilla. Verificar si contiene grasas trans.'}],
  // Sweeteners
  ['sucralosa',                {sev:'red',    desc:'Edulcorante clorado 600x más dulce que el azúcar. Altera el microbioma intestinal. Evitar.'}],
  // Aspartame — Capa A: Moderado (IARC 2B, JECFA reafirmó IDA). Capa B: Crítico. Gate: techo 49.
  ['aspartamo',                {sev:'red',    desc:'Capa A: IARC Grupo 2B (2023, evidencia limitada); JECFA reafirmó la IDA de 40mg/kg. Desde la mirada Fitogenix: edulcorante sintético sin equivalente natural.'}],
  ['aspartame',                {sev:'red',    desc:'Capa A: IARC Grupo 2B (2023, evidencia limitada); JECFA reafirmó la IDA de 40mg/kg. Desde la mirada Fitogenix: edulcorante sintético sin equivalente natural.'}],
  ['acesulfame',               {sev:'red',    desc:'Edulcorante artificial. Estudios en animales muestran efectos adversos sobre metabolismo.'}],
  ['sacarina',                 {sev:'red',    desc:'Edulcorante artificial. Primer sintético. Clasificado como posible cancerígeno.'}],
  ['ciclamato',                {sev:'red',    desc:'Edulcorante artificial. Prohibido en EE.UU. Posible cancerígeno y disruptor hormonal.'}],
  ['neotame',                  {sev:'red',    desc:'Edulcorante artificial derivado del aspartamo. Más potente y con poca evidencia de seguridad.'}],
  ['advantame',                {sev:'red',    desc:'Edulcorante artificial ultrapotente. Evidencia de seguridad muy limitada.'}],
  ['stevia',                   {sev:'yellow', desc:'Edulcorante de planta stevia. Sin calorías. La forma en hoja es más natural que el extracto refinado.'}],
  ['eritritol',                {sev:'yellow', desc:'Poliol natural. Bien tolerado en la mayoría. No eleva glucemia. Mejor opción que sintéticos.'}],
  ['xilitol',                  {sev:'yellow', desc:'Poliol natural de madera de abedul. No eleva glucemia. Tóxico para mascotas. Moderado.'}],
  ['sorbitol',                 {sev:'yellow', desc:'Poliol. En grandes cantidades produce malestar digestivo. Moderado.'}],
  ['maltitol',                 {sev:'orange', desc:'Poliol. A pesar de ser "sin azúcar" eleva la glucemia casi como el azúcar. Evitar en diabéticos.'}],
  ['miel',                     {sev:'green',  desc:'Endulzante natural con enzimas, antioxidantes y propiedades antimicrobianas. Preferir cruda. Capa B: penalización menor por uso tradicional (§3 rubric).'}],
  ['jarabe de arce',           {sev:'yellow', desc:'Endulzante natural con minerales (zinc, manganeso). Consumir con moderación.'}],
  ['melaza',                   {sev:'yellow', desc:'Subproducto de la caña. Rico en hierro, calcio y magnesio. Mejor opción que azúcar refinada.'}],
  ['panela',                   {sev:'yellow', desc:'Azúcar de caña integral sin refinar. Conserva vitaminas y minerales. Capa B: penalización menor por uso tradicional. No implica superioridad metabólica.'}],
  ['azúcar mascabo',           {sev:'yellow', desc:'Azúcar integral de caña. Conserva melaza y minerales. Preferible al azúcar blanco.'}],
  ['azúcar de coco',           {sev:'yellow', desc:'Azúcar de flor de coco. Bajo índice glucémico. Contiene inulina (fibra). Moderado.'}],
  ['azúcar',                   {sev:'orange', desc:'Azúcar refinada. En exceso promueve inflamación, resistencia a insulina y desequilibrio del microbioma.'}],
  ['sacarosa',                 {sev:'orange', desc:'Azúcar de mesa refinada. Alta carga glucémica y proinflamatoria en exceso.'}],
  ['jarabe de glucosa',        {sev:'orange', desc:'Azúcar líquida refinada. Alta carga glucémica. Presente en productos ultraprocesados.'}],
  ['jarabe de maíz',           {sev:'red',    desc:'Jarabe de maíz de alta fructosa (JMAF). Altamente procesado. Vinculado a obesidad y hígado graso.'}],
  ['jarabe de glucosa-fructosa',{sev:'red',   desc:'JMAF. Fructosa libre procesada. Hepatotóxico en exceso. Evitar.'}],
  ['dextrosa',                 {sev:'orange', desc:'Glucosa refinada de maíz. Índice glucémico de 100 (el más alto posible).'}],
  ['fructosa',                 {sev:'orange', desc:'Fructosa aislada refinada. Metabolizada solo en el hígado. Promueve hígado graso en exceso.'}],
  ['maltodextrina',            {sev:'orange', desc:'Carbohidrato ultrarefinado. Índice glucémico mayor al azúcar. Mínimo valor nutricional.'}],
  ['glucosa',                  {sev:'orange', desc:'Azúcar simple refinada. Eleva rápidamente la glucemia.'}],
  ['jarabe de maíz de alta fructosa',{sev:'red', desc:'El peor edulcorante industrial. Directamente vinculado a síndrome metabólico y obesidad.'}],
  ['ácido ascórbico',          {sev:'green',  desc:'Vitamina C natural. Antioxidante y conservante beneficioso.'}],
  ['tocoferol',                {sev:'green',  desc:'Vitamina E natural. Antioxidante. Protege grasas de la oxidación.'}],
  ['extracto de romero',       {sev:'green',  desc:'Antioxidante natural de romero. Alternativa natural al BHA/BHT.'}],
  ['ácido cítrico',            {sev:'yellow', desc:'Conservante y acidulante. Natural en frutas. Generalmente seguro en cantidades normales.'}],
  ['ácido láctico',            {sev:'green',  desc:'Ácido natural de fermentación. Conservante y acidulante. Beneficioso para el microbioma.'}],
  ['vinagre',                  {sev:'green',  desc:'Conservante natural de fermentación. Regula glucemia y beneficia el microbioma.'}],
  ['sal',                      {sev:'yellow', desc:'Mineral esencial. El exceso eleva la presión arterial. Preferir sal marina sin refinar.'}],
  ['sal marina',               {sev:'green',  desc:'Sal sin refinar. Contiene trazas de minerales adicionales. Preferible a la sal de mesa.'}],
  ['benzoato de sodio',        {sev:'red',    desc:'Conservante. Con vitamina C forma benceno, compuesto cancerígeno. Evitar.'}],
  ['benzoato de potasio',      {sev:'red',    desc:'Conservante artificial. Mismo riesgo que benzoato de sodio.'}],
  ['nitrito de sodio',         {sev:'red',    desc:'Conservante en carnes procesadas. IARC Grupo 2A; EFSA 2023 redujo niveles permitidos. Forma nitrosaminas cancerígenas al cocinar.'}],
  ['nitrato de sodio',         {sev:'red',    desc:'Conservante. Precursor de nitrosaminas cancerígenas. IARC Grupo 2A en contexto de carnes procesadas.'}],
  ['bha',                      {sev:'red',    desc:'Antioxidante sintético de petróleo. Clasificado como posible cancerígeno por la IARC.'}],
  ['bht',                      {sev:'red',    desc:'Antioxidante sintético. Posible disruptor endocrino. Vinculado a cáncer en estudios animales.'}],
  ['tbhq',                     {sev:'red',    desc:'Conservante petroquímico. Posible cancerígeno. Común en aceites de semilla y frituras.'}],
  ['propionato de calcio',     {sev:'orange', desc:'Conservante fúngico. Algunos estudios lo asocian con irritabilidad y déficit de atención.'}],
  ['propionato de sodio',      {sev:'orange', desc:'Conservante. Estudios emergentes sobre efectos en conducta e intestino.'}],
  ['sorbato de potasio',       {sev:'yellow', desc:'Conservante antimicótico. Uno de los más seguros. Presente en muchos alimentos.'}],
  ['dióxido de azufre',        {sev:'orange', desc:'Conservante sulfito. Puede causar reacciones en personas con asma o sensibilidad.'}],
  ['glutamato monosódico',     {sev:'red',    desc:'MSG. Potenciador de sabor artificial. Controversia sobre efectos neurológicos en sensibles.'}],
  ['glutamato',                {sev:'red',    desc:'Potenciador de sabor. La versión añadida como aditivo es cuestionada neurológicamente.'}],
  ['saborizante artificial',   {sev:'red',    desc:'Aditivo de sabor sintético. Opacidad total sobre su composición química real.'}],
  ['saborizantes artificiales',{sev:'red',    desc:'Aditivos sintéticos de sabor. Sin transparencia sobre composición. Evitar.'}],
  ['sabor artificial',         {sev:'red',    desc:'Compuesto sintético de sabor. Diseñado para crear adicción, sin valor nutricional.'}],
  ['vainillina',               {sev:'orange', desc:'Vainillina sintética derivada del petróleo o guaiacol. Imitación del extracto de vainilla.'}],
  ['saborizante natural',      {sev:'yellow', desc:'Extracto de fuente natural. Generalmente seguro pero el término puede ser amplio.'}],
  ['extracto de vainilla',     {sev:'green',  desc:'Saborizante natural de vaina de vainilla. Real y seguro.'}],
  ['vainilla',                 {sev:'green',  desc:'Especia natural. Real y beneficiosa.'}],
  ['cúrcuma',                  {sev:'green',  desc:'Colorante y especia. La curcumina es uno de los antiinflamatorios naturales más potentes.'}],
  ['curcumina',                {sev:'green',  desc:'Principio activo de la cúrcuma. Antiinflamatorio, antioxidante y neuroprotector.'}],
  ['beta-caroteno',            {sev:'green',  desc:'Precursor de vitamina A. Antioxidante de origen vegetal.'}],
  ['antocianinas',             {sev:'green',  desc:'Pigmentos de frutas y vegetales. Potentes antioxidantes.'}],
  ['extracto de pimentón',     {sev:'green',  desc:'Colorante natural de pimiento. Fuente de vitamina C y antioxidantes.'}],
  ['remolacha',                {sev:'green',  desc:'Colorante natural. Rica en nitratos beneficiosos para la circulación.'}],
  ['annatto',                  {sev:'yellow', desc:'Colorante de semilla de achiote. Natural. Posibles reacciones en personas sensibles.'}],
  ['lecitina de girasol',      {sev:'yellow', desc:'Emulsionante natural de girasol. Preferible a la lecitina de soja transgénica.'}],
  ['lecitina de soja',         {sev:'orange', desc:'Emulsionante. Generalmente de soja transgénica. Contiene fitoestrógenos.'}],
  ['lecitina de colza',        {sev:'orange', desc:'Emulsionante de canola. Origen de aceite de semilla industrial.'}],
  ['lecitina',                 {sev:'yellow', desc:'Emulsionante. Si no especifica origen puede ser soja transgénica. Preferir girasol.'}],
  ['mono y diglicéridos',      {sev:'orange', desc:'Emulsionante. Puede contener grasas trans. Origen animal o vegetal sin especificar.'}],
  ['polisorbato',              {sev:'orange', desc:'Emulsionante sintético. Estudios sugieren alteración del microbioma intestinal.'}],
  // Carrageenan — Capa A: Moderado (under active EFSA reevaluation). Capa B: Moderado-Crítico. Gate: ceiling 49.
  ['carragenina',              {sev:'orange', desc:'Capa A: aprobada por EFSA/JECFA/FDA, pero en reevaluación activa desde 2018 con preguntas sobre efectos intestinales. Desde la mirada Fitogenix: sustituto industrial de textura integral.'}],
  ['carragenano',              {sev:'orange', desc:'Capa A: en reevaluación activa EFSA (2018); efectos intestinales insuficientemente investigados. Desde la mirada Fitogenix: sustituto industrial de ingredientes integrales.'}],
  ['goma xantana',             {sev:'yellow', desc:'Espesante por fermentación bacteriana. Generalmente bien tolerado. Presente en muchos GF.'}],
  ['goma guar',                {sev:'yellow', desc:'Espesante natural de semilla de guar. Fuente de fibra. Generalmente seguro.'}],
  ['goma arábiga',             {sev:'green',  desc:'Fibra natural de acacia. Prebiótica. Beneficia el microbioma intestinal.'}],
  ['pectina',                  {sev:'green',  desc:'Fibra soluble natural de frutas. Prebiótica. Beneficia el microbioma y la glucemia.'}],
  ['almidón modificado',       {sev:'orange', desc:'Almidón procesado químicamente. Ultrarefinado. Alto índice glucémico, sin fibra.'}],
  ['almidón de maíz',          {sev:'orange', desc:'Fécula refinada. Alto índice glucémico. Comúnmente de maíz transgénico.'}],
  ['fécula de maíz',           {sev:'orange', desc:'Almidón de maíz refinado. Sin fibra ni nutrientes. Alto índice glucémico.'}],
  ['harina de trigo',          {sev:'orange', desc:'Harina refinada sin germen ni salvado. Alta carga glucémica. Preferir integral.'}],
  ['harina 000',               {sev:'orange', desc:'Harina blanca muy refinada. Sin fibra ni minerales del germen.'}],
  ['harina 0000',              {sev:'orange', desc:'Harina extra refinada. Mínimo valor nutricional.'}],
  ['harina integral',          {sev:'green',  desc:'Harina con salvado y germen. Rica en fibra, vitaminas B y minerales.'}],
  ['harina de avena',          {sev:'green',  desc:'Harina de avena integral. Rica en beta-glucano (fibra que baja colesterol).'}],
  ['harina de almendra',       {sev:'green',  desc:'Harina de almendra. Rica en proteínas, grasas saludables y vitamina E. Baja en carbohidratos.'}],
  ['harina de coco',           {sev:'green',  desc:'Harina de coco. Alta en fibra, baja en carbohidratos. Sin gluten.'}],
  ['harina de arroz',          {sev:'yellow', desc:'Harina sin gluten. Índice glucémico moderado-alto. Opción para celíacos.'}],
  ['harina de garbanzo',       {sev:'green',  desc:'Legumbre en polvo. Rica en proteínas, fibra y folatos.'}],
  ['leche entera',             {sev:'green',  desc:'Lácteo íntegro. Fuente completa de proteínas, calcio y grasas liposolubles.'}],
  ['leche',                    {sev:'green',  desc:'Lácteo natural. Fuente de proteínas completas, calcio y vitaminas B.'}],
  ['leche descremada',         {sev:'yellow', desc:'Lácteo desgrasado. Pierde vitaminas liposolubles (A, D, K) al quitar la grasa.'}],
  ['leche en polvo',           {sev:'yellow', desc:'Leche deshidratada. Proceso de secado puede oxidar el colesterol. Moderado.'}],
  ['crema de leche',           {sev:'green',  desc:'Grasa láctea natural. Rica en vitaminas liposolubles y ácidos grasos de cadena corta.'}],
  ['queso',                    {sev:'green',  desc:'Lácteo fermentado. Rico en proteínas, calcio, vitamina K2 y probióticos.'}],
  ['yogur',                    {sev:'green',  desc:'Lácteo fermentado. Probiótico natural. Beneficioso para el microbioma intestinal.'}],
  ['suero de leche',           {sev:'green',  desc:'Proteína láctea completa. Alta biodisponibilidad. Todos los aminoácidos esenciales.'}],
  ['proteína de suero',        {sev:'green',  desc:'Whey protein. Proteína de rápida absorción con todos los aminoácidos esenciales.'}],
  ['caseína',                  {sev:'green',  desc:'Proteína de leche de digestión lenta. Alta biodisponibilidad. Ideal para la noche.'}],
  ['huevo',                    {sev:'green',  desc:'Uno de los alimentos más completos. Proteína de máxima calidad, colina, vitaminas A/D/B12.'}],
  ['huevos',                   {sev:'green',  desc:'Proteína animal completa. 9 aminoácidos esenciales. Nutricionalmente excepcional.'}],
  ['clara de huevo',           {sev:'green',  desc:'Proteína de alta biodisponibilidad. Sin grasa. Natural.'}],
  ['colágeno',                 {sev:'green',  desc:'Proteína estructural animal. Beneficia articulaciones, piel y tejido conectivo.'}],
  ['gelatina',                 {sev:'green',  desc:'Colágeno natural. Beneficiosa para articulaciones y permeabilidad intestinal.'}],
  ['proteína de arveja',       {sev:'green',  desc:'Proteína vegetal hipoalergénica. Buen perfil aminoacídico. Natural.'}],
  ['proteína de soja',         {sev:'orange', desc:'Proteína vegetal. Generalmente transgénica. Contiene fitoestrógenos que alteran hormonas.'}],
  ['proteína vegetal texturizada',{sev:'orange',desc:'Soja texturizada ultraprocesada. Alta intervención industrial. Fitoestrógenos.'}],
  ['carne',                    {sev:'green',  desc:'Proteína animal completa. Rica en hierro hem, zinc, vitamina B12 y creatina.'}],
  ['pollo',                    {sev:'green',  desc:'Proteína animal magra. Rica en proteínas completas y vitaminas del grupo B.'}],
  ['cerdo',                    {sev:'green',  desc:'Proteína animal. Rica en vitaminas B y grasa monoinsaturada (como el aceite de oliva).'}],
  ['pescado',                  {sev:'green',  desc:'Proteína animal. Rica en omega-3 EPA/DHA, yodo y vitamina D.'}],
  ['salmón',                   {sev:'green',  desc:'Pescado azul. Fuente excepcional de omega-3 EPA/DHA, astaxantina y vitamina D.'}],
  ['atún',                     {sev:'green',  desc:'Pescado rico en proteínas y omega-3. Moderar si es frecuente por mercurio.'}],
  ['sardina',                  {sev:'green',  desc:'Pescado pequeño. Bajo en mercurio. Alta densidad nutricional: omega-3, calcio, vitamina D.'}],
  ['anchoa',                   {sev:'green',  desc:'Pescado pequeño. Rico en omega-3. Excelente relación omega-3/omega-6.'}],
  ['avena integral',           {sev:'green',  desc:'Cereal integral mínimamente procesado. Rica en beta-glucano, proteínas y micronutrientes.'}],
  ['avena',                    {sev:'green',  desc:'Cereal integral. Rico en fibra beta-glucano que reduce el colesterol.'}],
  ['quinoa',                   {sev:'green',  desc:'Seudocereal ancestral. Proteína completa, todos los aminoácidos esenciales. Sin gluten.'}],
  ['arroz integral',           {sev:'green',  desc:'Cereal integral. Conserva salvado, germen, fibra y micronutrientes.'}],
  ['arroz',                    {sev:'yellow', desc:'Cereal refinado. Sin fibra significativa. Preferir versión integral.'}],
  ['trigo sarraceno',          {sev:'green',  desc:'Seudocereal sin gluten. Rico en rutina y minerales. Buena proteína vegetal.'}],
  ['mijo',                     {sev:'green',  desc:'Cereal sin gluten. Rico en magnesio y antioxidantes.'}],
  ['yerba mate',               {sev:'green',  desc:'Infusión ancestral sudamericana. Rica en antioxidantes (polifenoles), cafeína natural, vitaminas B y minerales.'}],
  ['yerba',                    {sev:'green',  desc:'Yerba mate. Infusión natural rica en antioxidantes y cafeína natural.'}],
  ['ilex paraguariensis',      {sev:'green',  desc:'Nombre científico de la yerba mate. Natural, ancestral, antioxidante.'}],
  ['té verde',                 {sev:'green',  desc:'Rico en EGCG (catequinas antioxidantes), L-teanina y cafeína natural.'}],
  ['té negro',                 {sev:'green',  desc:'Infusión natural con teaflavinas antioxidantes y cafeína moderada.'}],
  ['té',                       {sev:'green',  desc:'Infusión natural con antioxidantes y cafeína moderada.'}],
  ['manzanilla',               {sev:'green',  desc:'Hierba medicinal con propiedades antiinflamatorias y digestivas.'}],
  ['tilo',                     {sev:'green',  desc:'Hierba natural con propiedades calmantes.'}],
  ['boldo',                    {sev:'green',  desc:'Hierba natural con propiedades digestivas y hepáticas.'}],
  ['café',                     {sev:'green',  desc:'Rico en antioxidantes (ácido clorogénico) y cafeína natural. Consumo moderado beneficioso.'}],
  ['cebada',                   {sev:'yellow', desc:'Cereal procesado. Rico en beta-glucanos (fibra). Aceptable en cantidades moderadas.'}],
  ['tomate',                   {sev:'green',  desc:'Rico en licopeno antioxidante. Cocinado aumenta la biodisponibilidad del licopeno.'}],
  ['cebolla',                  {sev:'green',  desc:'Compuestos sulfurosos con propiedades cardioprotectoras y antibacterianas.'}],
  ['ajo',                      {sev:'green',  desc:'Allicina con potentes propiedades antimicrobianas, cardioprotectoras e inmunoestimuladoras.'}],
  ['espinaca',                 {sev:'green',  desc:'Rica en hierro, folatos, vitamina K y luteina antioxidante.'}],
  ['zanahoria',                {sev:'green',  desc:'Rica en beta-caroteno (provitamina A) y fibra. Natural.'}],
  ['batata',                   {sev:'green',  desc:'Tubérculo ancestral. Rico en beta-caroteno, vitamina C y potasio.'}],
  ['papa',                     {sev:'yellow', desc:'Tubérculo con vitamina C y potasio. Alto índice glucémico. Preferir con piel.'}],
  ['banana',                   {sev:'green',  desc:'Rica en potasio, vitamina B6 y almidón resistente (prebiótico cuando está verde).'}],
  ['manzana',                  {sev:'green',  desc:'Rica en pectina (fibra prebiótica) y quercetina antioxidante.'}],
  ['limón',                    {sev:'green',  desc:'Cítrico. Rico en vitamina C, flavonoides y ácido cítrico natural conservante.'}],
  ['naranja',                  {sev:'green',  desc:'Cítrico rico en vitamina C y hesperidina flavonoide.'}],
  ['arándanos',                {sev:'green',  desc:'Berries con el mayor contenido antioxidante. Beneficiosos para el cerebro y corazón.'}],
  ['masa de cacao',            {sev:'green',  desc:'Cacao puro sin azúcar. Rico en flavanoles, magnesio, hierro y zinc.'}],
  ['cacao',                    {sev:'green',  desc:'Superfood real. Flavanoles cardioprotectores, magnesio y teobromina estimulante.'}],
  ['manteca de cacao',         {sev:'green',  desc:'Grasa natural del cacao. Estable, sin oxidación. Rica en ácido esteárico y oleico.'}],
  ['chocolate',                {sev:'yellow', desc:'Depende del % cacao y azúcar. Preferir >70% cacao con mínimo azúcar.'}],
  ['almendras',                {sev:'green',  desc:'Ricas en vitamina E, magnesio, grasas monoinsaturadas y proteínas.'}],
  ['nueces',                   {sev:'green',  desc:'La fuente vegetal más rica en omega-3 ALA. Beneficiosas para el cerebro y corazón.'}],
  ['castañas de cajú',         {sev:'green',  desc:'Ricas en zinc, magnesio y cobre. Buena fuente de grasas monoinsaturadas.'}],
  ['semillas de chía',         {sev:'green',  desc:'Excepcional fuente de omega-3 ALA, fibra soluble y calcio vegetal.'}],
  ['semillas de lino',         {sev:'green',  desc:'Ricas en omega-3 ALA y lignanos antioxidantes. Preferir molidas para mejor absorción.'}],
  ['semillas de zapallo',      {sev:'green',  desc:'Ricas en zinc, magnesio y triptófano. Beneficiosas para próstata e inmunidad.'}],
  ['semillas de girasol',      {sev:'yellow', desc:'Nutritivas pero altas en omega-6. Consumir con moderación.'}],
  ['maní',                     {sev:'yellow', desc:'Legumbre técnicamente, no fruto seco. Nutritivo pero alto en omega-6 y oxalatos.'}],
  ['pimienta',                 {sev:'green',  desc:'Piperina que potencia la absorción de nutrientes. Antiinflamatoria.'}],
  ['canela',                   {sev:'green',  desc:'Regula la glucemia. Propiedades antimicrobianas y antiinflamatorias.'}],
  ['jengibre',                 {sev:'green',  desc:'Gingerol antiinflamatorio y antiemético. Beneficioso para digestión.'}],
  ['orégano',                  {sev:'green',  desc:'Uno de los herbs más ricos en antioxidantes. Propiedades antimicrobianas potentes.'}],
  ['romero',                   {sev:'green',  desc:'Antioxidante natural. Protege grasas de la oxidación. Beneficioso para memoria.'}],
  ['tomillo',                  {sev:'green',  desc:'Rico en timol antiséptico. Propiedades antimicrobianas.'}],
  ['perejil',                  {sev:'green',  desc:'Rica fuente de vitamina K, vitamina C y flavonoides.'}],
  ['especias',                 {sev:'green',  desc:'Condimentos naturales. Ricos en antioxidantes y compuestos bioactivos.'}],
  ['agua',                     {sev:'green',  desc:'Ingrediente base. Esencial para la vida.'}],
  ['bicarbonato de sodio',     {sev:'green',  desc:'Leudante natural. Seguro y ampliamente utilizado en panadería tradicional.'}],
  ['levadura',                 {sev:'green',  desc:'Hongo natural. Leudante o complemento proteico. Fuente de vitaminas B.'}],
  ['vinagre de manzana',       {sev:'green',  desc:'Fermentado natural. Beneficioso para glucemia, microbioma y digestión.'}],
  ['jugo de limón',            {sev:'green',  desc:'Ácido cítrico natural. Conservante y antioxidante. Sin procesamiento.'}],
  ['polvo de hornear',         {sev:'yellow', desc:'Leudante compuesto. Generalmente seguro; verificar si contiene aluminio.'}],
  ['ácido fosfórico',          {sev:'red',    desc:'Acidulante. Erosiona el esmalte dental e interfiere con la absorción de calcio.'}],
  ['colorante',                {sev:'orange', desc:'Colorante no especificado. Sin transparencia sobre si es natural o artificial.'}],
  ['conservante',              {sev:'orange', desc:'Conservante no especificado. Sin transparencia sobre el compuesto exacto.'}],
  ['antioxidante',             {sev:'yellow', desc:'Antioxidante no especificado. Puede ser natural (vitaminas) o sintético (BHA/BHT).'}],
  ['emulsionante',             {sev:'yellow', desc:'Emulsionante no especificado. Verificar el número E o el origen.'}],
  ['espesante',                {sev:'yellow', desc:'Espesante no especificado. Generalmente almidones o gomas. Verificar origen.'}],
  ['acidulante',               {sev:'yellow', desc:'Acidulante no especificado. Puede ser natural (cítrico) o sintético (fosfórico).'}],
  ['saborizante',              {sev:'yellow', desc:'Saborizante no especificado. Puede ser natural o artificial. Verificar origen.'}],
  ['edulcorante',              {sev:'yellow', desc:'Edulcorante no especificado. Verificar si es natural (stevia) o sintético.'}],
  ['estabilizante',            {sev:'yellow', desc:'Estabilizante no especificado. Generalmente gomas o fosfatos. Verificar origen.'}],
  ['regulador de acidez',      {sev:'yellow', desc:'Regulador de acidez no especificado. Puede ser natural (ácido cítrico) o sintético.'}],
  ['humectante',               {sev:'yellow', desc:'Humectante no especificado. Mantiene la humedad del producto. Verificar origen.'}],
  ['antiaglomerante',          {sev:'yellow', desc:'Antiaglomerante no especificado. Evita que el polvo se compacte. Generalmente seguro.'}],
  ['potenciador de sabor',     {sev:'orange', desc:'Potenciador de sabor no especificado. Puede incluir glutamatos o ribonucleótidos.'}],
  // ── LatAm-specific / regional ingredients ──
  ['dulce de leche',           {sev:'yellow', desc:'Lácteo tradicional cocido con azúcar. Alto en azúcar pero sin aditivos industriales. Capa B: penalización menor por uso cultural tradicional.'}],
  ['puré de tomate',           {sev:'green',  desc:'Tomate concentrado. Conserva el licopeno antioxidante. Mínimamente procesado.'}],
  ['harina de maíz',           {sev:'orange', desc:'Harina de maíz refinada. Baja en fibra. Común en productos precocidos regionales.'}],
  ['almidón de mandioca',      {sev:'orange', desc:'Fécula de mandioca/yuca refinada. Alto índice glucémico, sin fibra.'}],
  ['harina de mandioca',       {sev:'yellow', desc:'Harina de mandioca/yuca. Sin gluten. Moderado índice glucémico.'}],
  ['fécula de papa',           {sev:'orange', desc:'Almidón de papa refinado. Alto índice glucémico, sin nutrientes significativos.'}],
  ['almidón de papa',          {sev:'orange', desc:'Fécula de papa refinada. Alto índice glucémico, sin fibra.'}],
  ['leche condensada',         {sev:'orange', desc:'Leche con alta concentración de azúcar añadida. Muy procesada y calórica.'}],
  ['leche evaporada',          {sev:'yellow', desc:'Leche deshidratada parcialmente. Sin azúcar añadida, a diferencia de la condensada.'}],
  ['extracto de malta',        {sev:'yellow', desc:'Extracto de cereal fermentado. Saborizante natural con algo de azúcar.'}],
  ['extracto de levadura',     {sev:'orange', desc:'Potenciador de sabor natural, pero actúa similar al glutamato. Rico en sodio.'}],
  ['gluten',                   {sev:'yellow', desc:'Proteína de trigo. Neutro salvo intolerancia o enfermedad celíaca.'}],
  ['proteína de trigo',        {sev:'yellow', desc:'Proteína vegetal de trigo. Contiene gluten. Perfil aminoacídico incompleto.'}],
  ['fibra de trigo',           {sev:'green',  desc:'Fibra insoluble del salvado de trigo. Beneficiosa para la digestión.'}],
  ['salvado de trigo',         {sev:'green',  desc:'Capa externa del grano de trigo. Rica en fibra insoluble y minerales.'}],
  ['germen de trigo',          {sev:'green',  desc:'Parte del grano rica en vitamina E, folatos y grasas saludables.'}],
  ['almidón de trigo',         {sev:'orange', desc:'Almidón refinado de trigo. Sin fibra. Alto índice glucémico.'}],
  ['manteca de maní',          {sev:'green',  desc:'Maní procesado mínimamente. Rica en grasas monoinsaturadas y proteína vegetal.'}],
  ['crema de maní',            {sev:'green',  desc:'Maní procesado mínimamente. Verificar que no tenga azúcares o aceites añadidos.'}],
  ['miel de caña',             {sev:'yellow', desc:'Endulzante natural de caña de azúcar. Conserva minerales. Moderado.'}],
  ['jarabe de yacón',          {sev:'green',  desc:'Endulzante natural andino. Rico en fructooligosacáridos prebióticos.'}],
  ['fibra de avena',           {sev:'green',  desc:'Fibra soluble de avena. Beneficiosa para el colesterol y la glucemia.'}],
  ['salvado de avena',         {sev:'green',  desc:'Capa externa del grano de avena. Rica en beta-glucano y minerales.'}],
  ['psyllium',                 {sev:'green',  desc:'Fibra soluble de semillas. Beneficiosa para la digestión y la glucemia.'}],
  ['inulina',                  {sev:'green',  desc:'Fibra prebiótica natural. Beneficiosa para el microbioma intestinal.'}],
  ['creatina',                 {sev:'green',  desc:'Aminoácido de uso deportivo. Uno de los suplementos más estudiados y seguros.'}],
  ['maltosa',                  {sev:'orange', desc:'Azúcar simple de la malta. Eleva la glucemia de forma similar a la glucosa.'}],
  ['isomaltulosa',             {sev:'yellow', desc:'Azúcar de bajo índice glucémico. Liberación de energía más gradual que la sacarosa.'}],
  ['tagatosa',                 {sev:'yellow', desc:'Azúcar natural de bajo índice glucémico. Mínimo impacto en la glucemia.'}],
  ['alulosa',                  {sev:'yellow', desc:'Azúcar natural casi sin calorías. Mínimo impacto en la glucemia. Evidencia aún limitada.'}],
  ['fruta del monje',          {sev:'yellow', desc:'Edulcorante natural de fruta. Sin calorías. Buena alternativa a los artificiales.'}],
  ['monk fruit',               {sev:'yellow', desc:'Edulcorante natural de fruta. Sin calorías. Buena alternativa a los artificiales.'}],
  ['cafeína',                  {sev:'yellow', desc:'Estimulante natural. Segura en cantidades moderadas para la mayoría de adultos.'}],
  ['taurina',                  {sev:'yellow', desc:'Aminoácido común en bebidas energizantes. Generalmente seguro en dosis moderadas.'}],
  ['guaraná',                  {sev:'yellow', desc:'Estimulante natural sudamericano, rico en cafeína. Tradicional en bebidas energizantes.'}],
  ['extracto de guaraná',      {sev:'yellow', desc:'Estimulante natural sudamericano, rico en cafeína. Tradicional en bebidas energizantes.'}],
  ['ácido tartárico',          {sev:'yellow', desc:'Acidulante natural de uvas. Generalmente seguro en cantidades normales.'}],
  ['ácido málico',             {sev:'green',  desc:'Ácido natural de frutas (manzana). Acidulante seguro y de origen natural.'}],
  ['fosfato de calcio',        {sev:'yellow', desc:'Fortificante mineral. Fuente de calcio y fósforo. Generalmente seguro.'}],
  ['fosfato disódico',         {sev:'orange', desc:'Fosfato aditivo. El exceso de fosfatos se asocia a desequilibrios minerales.'}],
  ['cloruro de potasio',       {sev:'yellow', desc:'Sustituto de sal. Reduce el sodio pero el exceso afecta a personas con problemas renales.'}],
  ['gas carbónico',            {sev:'green',  desc:'Dióxido de carbono. Responsable de la carbonatación. Sin impacto nutricional.'}],
  ['dióxido de carbono',       {sev:'green',  desc:'Gas de carbonatación. Sin impacto nutricional ni efectos adversos conocidos.'}],
  ['goma de algarrobo',        {sev:'yellow', desc:'Espesante natural de semilla de algarrobo. Generalmente bien tolerado.'}],
  ['goma gellan',              {sev:'yellow', desc:'Espesante por fermentación bacteriana. Generalmente seguro en las dosis usadas.'}],
  ['carbonato de calcio',      {sev:'green',  desc:'Fortificante mineral. Fuente de calcio. Ampliamente usado y seguro.'}],
  ['sulfato ferroso',          {sev:'green',  desc:'Fortificante de hierro. Común en harinas fortificadas. Previene la anemia.'}],
  ['ácido fólico',             {sev:'green',  desc:'Vitamina B9 sintética usada para fortificación. Previene defectos del tubo neural.'}],
  ['niacina',                  {sev:'green',  desc:'Vitamina B3. Fortificante común en harinas y cereales. Segura y beneficiosa.'}],
  ['riboflavina',              {sev:'green',  desc:'Vitamina B2. Fortificante común en harinas y cereales. Segura y beneficiosa.'}],
  ['tiamina',                  {sev:'green',  desc:'Vitamina B1. Fortificante común en harinas y cereales. Segura y beneficiosa.'}],
  ['hierro',                   {sev:'green',  desc:'Mineral esencial. Común como fortificante. Previene la anemia ferropénica.'}],
  ['zinc',                     {sev:'green',  desc:'Mineral esencial. Común como fortificante. Beneficioso para inmunidad y piel.'}],
];

// ── Capa A ingredient severity overrides ──
// Only for ingredients where Capa A (regulatory evidence) diverges from Capa B (FTG_ING_DB).
// Longest-match, same pattern as FTG_ING_DB.
const CAPA_A_ING_SEV: [string, Severity][] = [
  // Seed oils — Capa A: Bien (independent meta-analyses, major cohortes: no increased risk at habitual intake)
  ['aceite de girasol alto oleico', 'green'],
  ['aceite de girasol',             'green'],
  ['aceite de soja',                'green'],
  ['aceite de canola',              'green'],
  ['aceite de colza',               'green'],
  ['aceite de maíz',                'green'],
  ['aceite de cártamo',             'green'],
  ['aceite de uva',                 'green'],
  ['aceite de pepita',              'green'],
  ['aceite de sésamo',              'green'],
  ['aceite de maní',                'green'],
  ['aceite de palma',               'yellow'],
  ['grasa de palma',                'yellow'],
  // Generic oil labels: undisclosed origin → cannot assess Capa A
  ['aceite vegetal',                'yellow'],
  ['aceites vegetales',             'yellow'],
  ['grasa vegetal',                 'yellow'],
  // Aspartame — Capa A: Moderado (§6.3)
  ['aspartamo',                     'orange'],
  ['aspartame',                     'orange'],
];

// ── Core: classify a single ingredient name against FTG_ING_DB ──
function ftgClassifyOne(name: string): { sev: Severity; desc: string } | null {
  const n = name.toLowerCase().trim();
  let best: { sev: Severity; desc: string } | null = null;
  let bestLen = 0;
  for (const [pat, data] of FTG_ING_DB) {
    if (n.includes(pat) && pat.length > bestLen) {
      best = data;
      bestLen = pat.length;
    }
  }
  return best;
}

// Capa A severity for a given ingredient name (longest match wins; null = use Capa B sev as fallback)
function getCapaASevFromName(name: string): Severity | null {
  const n = name.toLowerCase().trim();
  let best: Severity | null = null;
  let bestLen = 0;
  for (const [pat, sev] of CAPA_A_ING_SEV) {
    if (n.includes(pat) && pat.length > bestLen) {
      best = sev;
      bestLen = pat.length;
    }
  }
  return best;
}

// ── Analyze all ingredients from OFF data ──
export function ftgAnalyzeIngredients(offProduct: ProductInput): AnalyzedIngredient[] {
  const list: AnalyzedIngredient[] = [];
  const seen = new Set<string>();

  const text = (offProduct.ingredients_text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/^.{0,60}?\bingr(?:edientes?)?\s*[:.]+\s*/i, '');
  const parts = text
    .split(/[,;]/)
    .map((s) => s.replace(/\*|_|\d+\.?\d*\s*%/g, '').trim())
    .filter((s) => s.length > 2 && s.length < 80);

  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const match = ftgClassifyOne(part);
    if (match) {
      list.push({ name: part, detail: '', sev: match.sev, amount: '', desc: match.desc, flag: match.sev === 'red' });
    } else {
      const lp = part.toLowerCase();
      const isENumber = /\be\d{3,4}\b/.test(lp);
      if (!isENumber && lp.length > 3) {
        list.push({
          name: part,
          detail: '',
          sev: 'yellow',
          amount: '',
          desc: 'Sin clasificación en nuestra base de datos. Verificar origen.',
          flag: false,
        });
      }
    }
    if (list.length >= 12) break;
  }

  const addTags = offProduct.additives_tags || [];
  for (const tag of addTags) {
    const eSev = E_SEV[tag];
    if (!eSev) continue;
    const eName = E_NAMES[tag] || tag.replace('en:', '').toUpperCase();
    if (list.find((i) => i.name.toLowerCase().includes(eName.toLowerCase().slice(0, 6)))) continue;
    list.push({
      name: eName,
      detail: 'Aditivo alimentario',
      sev: eSev,
      amount: 'trazas',
      desc: E_DESC[tag] || `Aditivo ${eName}.`,
      flag: eSev === 'red',
    });
    if (list.length >= 14) break;
  }

  return list.slice(0, 12);
}

function partsCount(offProduct: ProductInput): number {
  if (!offProduct.ingredients_text) return 99;
  return offProduct.ingredients_text.split(/[,;]/).filter((s) => s.trim().length > 1).length;
}

export function ingredientCount(txt?: string): number {
  if (!txt || txt.trim().length < 3) return 0;
  return txt.split(/[,;]/).filter((s) => s.trim().length > 1).length;
}

// ── Two-layer score components (Rubric §4) ──

function computeToxicityScore(analyzed: AnalyzedIngredient[], addTags: string[]): number {
  // Capa A only: uses regulatory evidence. Overrides Capa B severities where they diverge (§2, §6).
  let base = analyzed.length > 0 ? 80 : 50;
  let redCount = 0, orangeCount = 0;

  for (const ing of analyzed) {
    const capaASev = getCapaASevFromName(ing.name) ?? ing.sev;
    if      (capaASev === 'red')    { redCount++;    base -= 20; }
    else if (capaASev === 'orange') { orangeCount++; base -= 8; }
    else if (capaASev === 'yellow') { base -= 2; }
    // green: no deduction
  }

  // Apply Capa A ESEV for e-numbers not already in analyzed
  for (const tag of addTags) {
    const capaASev = CAPA_A_ESEV[tag];
    if (!capaASev) continue;
    const eName = E_NAMES[tag] || '';
    if (eName && analyzed.find(i => i.name.toLowerCase().includes(eName.toLowerCase().slice(0, 6)))) continue;
    if      (capaASev === 'red')    { redCount++;    base -= 20; }
    else if (capaASev === 'orange') { orangeCount++; base -= 8; }
  }

  if (analyzed.length <= 5 && redCount === 0 && orangeCount === 0) base += 10;

  return Math.max(0, Math.min(100, Math.round(base)));
}

function computeNutritionScore(product: ProductInput): number {
  // NOVA-aware: natural sugars and saturated fat in NOVA 1 foods are not penalized (§5.1, §5.2).
  const n = product.nutriments || {};
  const v = (k: string) => parseFloat(String(n[k + '_100g'] ?? n[k] ?? 0)) || 0;
  const nova = product.nova_group;

  const sugars  = v('sugars');
  const satFat  = v('saturated-fat');
  const trans   = v('trans-fat');
  const sodium  = v('sodium') * 1000;
  const protein = v('proteins');
  const fiber   = v('fiber');

  let base = 65;

  // Trans fat: always penalized; industrial PHO handled by gate separately
  if (trans > 0.2) base -= 25;

  // Sugars — NOVA 1 = whole food, natural matrix → no penalty (§5.1)
  if (nova !== 1) {
    if      (sugars > 25) base -= 25;
    else if (sugars > 15) base -= 15;
    else if (sugars > 8)  base -= 8;
    else if (sugars < 3)  base += 8;
  }

  // Saturated fat — NOVA 1 = natural (dairy, meat) → no penalty (§5.2)
  if (nova !== 1) {
    if      (satFat > 15) base -= 20;
    else if (satFat > 10) base -= 12;
    else if (satFat > 5)  base -= 6;
    else if (satFat < 3)  base += 5;
  }

  // Sodium: always evaluated (added salt applies regardless of NOVA)
  if      (sodium > 900) base -= 20;
  else if (sodium > 600) base -= 12;
  else if (sodium > 300) base -= 6;
  else if (sodium < 100) base += 5;

  if      (protein > 20) base += 15;
  else if (protein > 12) base += 10;
  else if (protein > 6)  base += 5;

  if      (fiber > 8) base += 15;
  else if (fiber > 5) base += 10;
  else if (fiber > 2) base += 5;

  return Math.max(0, Math.min(100, Math.round(base)));
}

function computeAlignmentScore(analyzed: AnalyzedIngredient[], ingText?: string): number {
  // Capa B: Fitogenix philosophy — ingredient-level alignment.
  // NOVA is captured in its own component (procesamiento) — not duplicated here.
  const hasData = (ingText || '').trim().length > 3;
  let base = hasData ? 72 : 40;

  for (const ing of analyzed) {
    // sev here is the Capa B (FTG_ING_DB) severity
    if      (ing.sev === 'red')    { base -= 14; }
    else if (ing.sev === 'orange') { base -= 5; }
    else if (ing.sev === 'yellow') { base -= 1; }
    else if (ing.sev === 'green')  { base += 2; }
  }

  // Penalize if a philosophically "bad" ingredient appears first in the list
  const firstIng = (ingText || '').replace(/\([^)]*\)/g, '').split(/[,;]/)[0]?.toLowerCase() || '';
  const badFirst = ['azúcar','sugar','jarabe','fructosa','dextrosa','aceite de girasol','aceite de soja','aceite vegetal','grasa vegetal'];
  if (badFirst.some(k => firstIng.includes(k))) base -= 10;

  return Math.max(0, Math.min(100, Math.round(base)));
}

// ── Gate detection (Rubric §4.2, §6) ──

function detectGates(product: ProductInput, analyzed: AnalyzedIngredient[]): Gate[] {
  const gates: Gate[] = [];
  const ingText = (product.ingredients_text || '').toLowerCase();
  const addTags = new Set(product.additives_tags || []);

  // Gate 1 — Industrial trans fat: anulación total (§6.5)
  // Natural trans in ruminant dairy is excluded: this regex only matches PHO/hydrogenated keywords.
  if (/parcialmente\s+hidrogenado|aceite\s+hidrogenado|grasa\s+hidrogenada/.test(ingText)) {
    gates.push({
      kind: 'annul',
      reason: 'Contiene aceite parcialmente hidrogenado (grasa trans industrial). Consenso científico y regulatorio unánime — OMS solicita eliminación global desde 2018. Sin nivel de consumo seguro.',
    });
  }

  // Gate 2 — Nitrito/Nitrato (§6.1)
  const nitriteE = ['en:e249','en:e250','en:e251','en:e252'];
  const hasNitrite = nitriteE.some(e => addTags.has(e)) ||
    /nitrito\s+de\s+sodio|nitrato\s+de\s+sodio/.test(ingText);

  if (hasNitrite) {
    const ascorbateE = ['en:e300','en:e301','en:e315','en:e316'];
    const hasAscorbate = ascorbateE.some(e => addTags.has(e)) ||
      /ascorbato|ácido\s+ascórbico|eritorbato/.test(ingText);
    const nova = product.nova_group;

    if (nova === 4 && !hasAscorbate) {
      // Added + NOVA 4 + no ascorbate/erythorbate → anulación total
      gates.push({
        kind: 'annul',
        reason: 'Nitrito/nitrato añadido en producto NOVA 4 sin ascorbato protector. IARC Grupo 2A; EFSA 2023 redujo niveles permitidos por riesgo de nitrosaminas cancerígenas.',
      });
    } else {
      // Added + ascorbate present (or lower NOVA) → techo 49
      gates.push({
        kind: 'ceiling',
        maxScore: 49,
        reason: 'Contiene nitrito/nitrato añadido como conservante. Riesgo moderado de nitrosaminas (EFSA 2023, IARC Grupo 2A).',
      });
    }
  }

  // Gate 3 — Aspartame: techo 49 (§6.3)
  if (addTags.has('en:e951') || /aspartamo|aspartame/.test(ingText)) {
    gates.push({
      kind: 'ceiling',
      maxScore: 49,
      reason: 'Contiene aspartamo (E951). IARC Grupo 2B (2023, evidencia limitada sobre peligro; JECFA reafirmó IDA de 40mg/kg tras evaluar datos humanos).',
    });
  }

  // Gate 4 — Carrageenan: techo 49 (§6.4)
  if (addTags.has('en:e407') || addTags.has('en:e407a') || /carragenina|carragenano/.test(ingText)) {
    gates.push({
      kind: 'ceiling',
      maxScore: 49,
      reason: 'Contiene carragenina (E407). EFSA mantiene reevaluación activa desde 2018 con preguntas sin resolver sobre efectos intestinales.',
    });
  }

  return gates;
}

function applyGatesToScore(rawScore: number, gates: Gate[], redCount: number): number {
  let annulCount = 0;
  let minCeiling = Infinity;

  for (const gate of gates) {
    if (gate.kind === 'annul') {
      annulCount++;
    } else {
      minCeiling = Math.min(minCeiling, gate.maxScore);
    }
  }

  if (annulCount > 0) {
    // Position within 0-24 band: more/worse factors → closer to 0 (§4.2)
    let s = 20;
    if (annulCount >= 2) s -= 8;
    if (redCount >= 3)   s -= 6;
    else if (redCount >= 1) s -= 3;
    return Math.max(0, Math.min(24, s));
  }

  if (minCeiling < Infinity) return Math.min(rawScore, minCeiling);

  return rawScore;
}

// ── Master scoring function (Rubric §4) ──

export function ftgScoreWithBreakdown(offProduct: ProductInput): ScoreBreakdown {
  const analyzed   = ftgAnalyzeIngredients(offProduct);
  const hasIngData = ingredientCount(offProduct.ingredients_text) > 0;
  const addTags    = offProduct.additives_tags || [];

  // Four components computed independently (§4.1)
  const toxicidadScore = computeToxicityScore(analyzed, addTags);
  const nutricionScore = computeNutritionScore(offProduct);

  const novaMap: Record<number, number> = { 1: 95, 2: 75, 3: 45, 4: 10 };
  const addCount = addTags.length;
  const novaFallback = addCount >= 5 ? 20 : addCount >= 2 ? 40 : hasIngData ? 58 : 40;
  const procesamientoScore = (offProduct.nova_group != null ? novaMap[offProduct.nova_group] : undefined) ?? novaFallback;

  const alineacionScore = computeAlignmentScore(analyzed, offProduct.ingredients_text);

  // Weighted combination — kept consistent across all products (§4.3)
  const rawScore = Math.max(1, Math.min(100, Math.round(
    toxicidadScore    * 0.35 +
    nutricionScore    * 0.25 +
    procesamientoScore * 0.25 +
    alineacionScore   * 0.15,
  )));

  // Apply gates before finalizing score (§4.2)
  const gates    = detectGates(offProduct, analyzed);
  const redCount = analyzed.filter(i => i.sev === 'red').length;
  const score    = applyGatesToScore(rawScore, gates, redCount);

  // Tier classification (§4.3)
  const tier: ScoreBreakdown['tier'] =
    score >= 75 ? 'Excelente' :
    score >= 50 ? 'Bueno'     :
    score >= 25 ? 'Moderado'  : 'Malo';

  const TIER_COLORS:   Record<string, string> = { Excelente: '#16a34a', Bueno: '#84cc16', Moderado: '#f97316', Malo: '#dc2626' };
  const TIER_MESSAGES: Record<string, string> = { Excelente: 'Lo recomendamos', Bueno: 'Buena opción', Moderado: 'Consúmelo con consciencia', Malo: 'No lo recomendamos' };

  // Component verdicts for popup (§7) — 1-2 frases, siempre específicas
  const nova = offProduct.nova_group ?? null;
  const novaDesc =
    nova === 1 ? 'NOVA 1 — Alimento sin procesar o mínimamente procesado.' :
    nova === 2 ? 'NOVA 2 — Ingrediente culinario procesado. Uso tradicional.' :
    nova === 3 ? 'NOVA 3 — Alimento procesado. Sal, azúcar u otros ingredientes añadidos.' :
    nova === 4 ? 'NOVA 4 — Producto ultraprocesado. Múltiples aditivos de uso industrial.' :
                 'Clasificación NOVA no disponible.';

  // Capa A (Toxicidad)
  const capaARedItems = analyzed.filter(i => (getCapaASevFromName(i.name) ?? i.sev) === 'red');
  const toxVerdict = capaARedItems.length > 0
    ? `${capaARedItems.map(i => i.name).join(', ')} — evidencia regulatoria de riesgo.`
    : toxicidadScore >= 75
      ? 'Sin ingredientes con evidencia regulatoria de riesgo.'
      : 'Ingredientes con señales de precaución moderada.';
  const toxDetail = gates.length > 0 ? gates[0].reason : '';

  // Nutrición
  const nutDetail = nova === 1
    ? 'Azúcares y grasas saturadas naturales no penalizadas (alimento entero, NOVA 1).'
    : '';
  const nutVerdict =
    nutricionScore >= 70 ? 'Perfil nutricional favorable.' :
    nutricionScore >= 50 ? 'Perfil nutricional aceptable.' :
    'Perfil nutricional con aspectos a mejorar (azúcar, sodio o grasas saturadas elevados).';

  // Capa B (Alineación Fitogenix) — siempre introducida con "Desde la mirada Fitogenix:"
  const capaBRedItems = analyzed.filter(i => i.sev === 'red');
  const alignVerdict = capaBRedItems.length > 0
    ? `Desde la mirada Fitogenix: contiene ${capaBRedItems.slice(0, 3).map(i => i.name).join(', ')} — no alineado con alimentación integral.`
    : alineacionScore >= 65
      ? 'Desde la mirada Fitogenix: ingredientes alineados con alimentación real y mínimamente procesada.'
      : 'Desde la mirada Fitogenix: algunos ingredientes no alineados con alimentación integral.';

  return {
    score,
    tier,
    tierColor:    TIER_COLORS[tier],
    tierMessage:  TIER_MESSAGES[tier],
    gateTriggered: gates.length > 0 ? gates[0].reason : null,
    components: {
      toxicidad:     { score: toxicidadScore,    verdict: toxVerdict,   detail: toxDetail },
      nutricion:     { score: nutricionScore,    verdict: nutVerdict,   detail: nutDetail },
      procesamiento: { score: procesamientoScore, nova,                 detail: novaDesc  },
      alineacion:    { score: alineacionScore,   verdict: alignVerdict, detail: ''        },
    },
  };
}

// ── Fitogenix Score: single number (delegates to ftgScoreWithBreakdown) ──
export function ftgScore(offProduct: ProductInput): number {
  return ftgScoreWithBreakdown(offProduct).score;
}

// ── Extract nutrition facts from OFF nutriments ──
export function extractNutrition(nutriments?: Record<string, unknown>): NutritionFacts {
  const empty: NutritionFacts = {
    calories: null, protein: null, carbs: null, sugars: null, fats: null,
    satFats: null, sodium: null, fiber: null, transFat: null, cholesterol: null,
  };
  if (!nutriments) return empty;
  const v = (k: string): number | null => {
    const raw = nutriments[k + '_100g'] ?? nutriments[k];
    if (raw == null || isNaN(Number(raw))) return null;
    return Math.round(parseFloat(String(raw)) * 10) / 10;
  };
  const sodium = v('sodium');
  const cholesterol = v('cholesterol');
  return {
    calories: v('energy-kcal'),
    protein: v('proteins'),
    carbs: v('carbohydrates'),
    sugars: v('sugars'),
    fats: v('fat'),
    satFats: v('saturated-fat'),
    sodium: sodium != null ? Math.round(sodium * 1000) : null,
    fiber: v('fiber'),
    transFat: v('trans-fat'),
    cholesterol: cholesterol != null ? Math.round(cholesterol * 1000) : null,
  };
}

// ── Extract category ──
export function extractCategory(categoriesStr?: string): string {
  if (!categoriesStr) return 'Alimento';
  const parts = categoriesStr.split(',').map((s) => s.trim());
  const short = parts.find((p) => p.split(':').pop()!.length < 30);
  if (!short) return parts[0] || 'Alimento';
  return short.split(':').pop()!.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
