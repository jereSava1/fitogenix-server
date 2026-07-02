export type ProductStatus = {
  label: "Fitogénico" | "No fitogénico" | "Consumo consciente";
  tone: "positive" | "negative" | "neutral";
};

export function normalizeProductQuery(query: string | number): string {
  return String(query).trim();
}

// Alineado con la spec: Fitogénico 70+ · No fitogénico <50 · Moderado 50-69.
export function resolveProductStatus(score: number): ProductStatus {
  if (score >= 70) return { label: "Fitogénico", tone: "positive" };
  if (score < 50) return { label: "No fitogénico", tone: "negative" };
  return { label: "Consumo consciente", tone: "neutral" };
}

export function buildProductSummary(
  name: string,
  brand?: string | null,
): string {
  const parts = [name, brand].filter(Boolean);
  return parts.join(" — ");
}
