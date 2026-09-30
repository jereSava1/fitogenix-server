// Feedback de la app y reportes de productos: los manda cualquiera, con o sin cuenta (D-21, D-26).

export const PLATFORMS = { ios: true, android: true } as const;
export type Platform = keyof typeof PLATFORMS;

export const REPORT_TYPES = { info: true, ingredients: true, score: true, image: true, other: true } as const;
export type ReportType = keyof typeof REPORT_TYPES;

/** `userId` null = anónimo. */
export interface FeedbackEntry {
  userId: string | null;
  message: string;
  appVersion: string | null;
  platform: Platform | null;
}

export interface ProductReport {
  userId: string | null;
  productId: string;
  type: ReportType;
  message: string | null;
}

export interface FeedbackRepository {
  /** Una falla de la base lanza DependencyUnavailableError (503). */
  saveFeedback(entry: FeedbackEntry): Promise<void>;
  /** `product_not_found` si el producto no está en el catálogo. */
  saveReport(report: ProductReport): Promise<'ok' | 'product_not_found'>;
}
