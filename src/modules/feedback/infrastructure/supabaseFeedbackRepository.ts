// Tablas `feedback` y `product_reports`. Solo se insertan; no se guarda la IP (03-contratos §B.4.8).

import { queryFailed, runQuery, supabaseAdmin as admin } from '../../../platform/supabase';
import type { FeedbackRepository } from '../application/ports';

/** FK de `product_reports.product_id` → el producto no existe. */
const FOREIGN_KEY_VIOLATION = '23503';

export const supabaseFeedbackRepository: FeedbackRepository = {
  async saveFeedback(entry) {
    const { error } = await runQuery('feedback insert', () =>
      admin().from('feedback').insert({
        user_id: entry.userId,
        message: entry.message,
        app_version: entry.appVersion,
        platform: entry.platform,
      }),
    );
    if (error) throw queryFailed('feedback insert', error);
  },

  async saveReport(report) {
    const { error } = await runQuery('product_reports insert', () =>
      admin().from('product_reports').insert({
        user_id: report.userId,
        product_id: report.productId,
        type: report.type,
        message: report.message,
      }),
    );
    if (!error) return 'ok';
    if (error.code === FOREIGN_KEY_VIOLATION) return 'product_not_found';
    throw queryFailed('product_reports insert', error);
  },
};
