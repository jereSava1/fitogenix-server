// Respuestas del onboarding (RF-048). `symptoms`, `diets` y `allergies` son datos sensibles
// (salud; la dieta puede revelar religión): solo se guardan con consentimiento (RNF-S10, D-83).

import type { OnboardingAnswers, OnboardingConsent, OnboardingRepository } from './ports';

/** Cualquier respuesta en síntomas, dietas o alergias (también "ninguna") pide consentimiento. */
export function hasHealthData(answers: OnboardingAnswers): boolean {
  return answers.symptoms.length > 0 || answers.diets.length > 0 || answers.allergies.length > 0;
}

export function makeOnboarding(repo: OnboardingRepository, now: () => Date = () => new Date()) {
  return {
    /** `consent_required` si hay datos de salud sin consentimiento: no se guarda nada. */
    async save(
      userId: string,
      answers: OnboardingAnswers,
      consent?: OnboardingConsent,
    ): Promise<'ok' | 'consent_required'> {
      const consented = consent?.healthData === true;
      if (hasHealthData(answers) && !consented) return 'consent_required';
      await repo.save(userId, answers, consented ? { at: now(), textVersion: consent.textVersion } : null);
      return 'ok';
    },
  };
}

export type OnboardingService = ReturnType<typeof makeOnboarding>;
