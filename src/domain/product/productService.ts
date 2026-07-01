export type ProductStatus = {
  label: "Fitogénico" | "No fitogénico" | "Consumo consciente";
  tone: "positive" | "negative" | "neutral";
};

export function normalizeProductQuery(query: string | number): string {
  return String(query).trim();
}

export function resolveProductStatus(score: number): ProductStatus {
  if (score >= 65) return { label: "Fitogénico", tone: "positive" };
  if (score < 30) return { label: "No fitogénico", tone: "negative" };
  return { label: "Consumo consciente", tone: "neutral" };
}

export function buildProductSummary(
  name: string,
  brand?: string | null,
): string {
  const parts = [name, brand].filter(Boolean);
  return parts.join(" — ");
}
