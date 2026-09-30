// Tabla `onboarding_responses`: una fila por usuario (`user_id`), con cascada al borrar la
// cuenta. La base también rechaza datos de salud sin consentimiento.

import { queryFailed, runQuery, supabaseAdmin as admin } from '../../../platform/supabase';
import type { OnboardingRepository } from '../application/ports';

export const supabaseOnboardingRepository: OnboardingRepository = {
  async save(userId, answers, consent) {
    const { error } = await runQuery('onboarding_responses upsert', () =>
      admin()
        .from('onboarding_responses')
        .upsert(
          {
            user_id: userId,
            answers,
            consent_health_data_at: consent?.at.toISOString() ?? null,
            consent_text_version: consent?.textVersion ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        ),
    );
    if (error) throw queryFailed('onboarding_responses upsert', error);
  },
};
