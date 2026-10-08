/** Prototipo local de presentación. No importa servicios, escribe archivos ni cambia el contrato. */
export function presentCategory(categories?: string): { label: string } {
  // Las comas no garantizan orden jerárquico; solo > declara niveles.
  const firstPath = categories?.split(',').find((part) => part.trim().length > 0);
  const levels = firstPath
    ?.replace(/^\s*[a-z]{2,3}:/i, '')
    .split('>')
    .map((level) => level.trim().replace(/-/g, ' '))
    .filter(Boolean)
    .map((level) => level.replace(
      /(^|[^\p{L}\p{M}\p{N}_])(\p{L})/gu,
      (_match, prefix: string, char: string) => prefix + char.toUpperCase(),
    ));
  if (!levels?.length) return { label: 'Alimento' };
  return { label: levels[levels.length - 1] };
}

if (require.main === module) {
  const inputs = process.argv.slice(2);
  const examples = inputs.length ? inputs : [
    'Lácteos', 'Almacén > Sal', 'Almacén > Mesa Dulce Navideña',
    'Lácteos > Yogures > Yogures descremados', 'sándwiches', 'AlmacéN > Sal',
  ];
  console.log(JSON.stringify(examples.map(original => ({ original, ...presentCategory(original) })), null, 2));
}
