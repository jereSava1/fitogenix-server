import type { FeedbackRepository, Platform, ReportType } from './ports';

export function makeFeedback(repo: FeedbackRepository) {
  return {
    /** El mensaje se guarda sin espacios en los bordes (la ruta ya exige texto). */
    send(input: { userId: string | null; message: string; appVersion?: string; platform?: Platform }): Promise<void> {
      return repo.saveFeedback({
        userId: input.userId,
        message: input.message.trim(),
        appVersion: input.appVersion ?? null,
        platform: input.platform ?? null,
      });
    },

    /** Un mensaje vacío o solo con espacios se guarda como null. */
    report(input: { userId: string | null; productId: string; type: ReportType; message?: string }) {
      return repo.saveReport({
        userId: input.userId,
        productId: input.productId,
        type: input.type,
        message: input.message?.trim() || null,
      });
    },
  };
}

export type FeedbackService = ReturnType<typeof makeFeedback>;
