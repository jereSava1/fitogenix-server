import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeOnboarding } from './onboarding';
import type { OnboardingAnswers, OnboardingRepository } from './ports';

const repo = { save: vi.fn<OnboardingRepository['save']>(async () => {}) };
const AHORA = new Date('2026-09-30T12:00:00Z');
const onboarding = makeOnboarding(repo, () => AHORA);

const SIN_SALUD: OnboardingAnswers = { goals: ['energy'], symptoms: [], diets: [], allergies: [], avoid: ['sugar'], source: 'friend' };
const CON_SINTOMAS: OnboardingAnswers = { ...SIN_SALUD, symptoms: ['fog'] };
const CONSENTIMIENTO = { healthData: true as const, textVersion: '2026-09-30' };

beforeEach(() => vi.clearAllMocks());

describe('save', () => {
  it('sin datos de salud se guarda sin consentimiento', async () => {
    await expect(onboarding.save('u1', SIN_SALUD)).resolves.toBe('ok');
    expect(repo.save).toHaveBeenCalledWith('u1', SIN_SALUD, null);
  });

  it('con datos de salud y consentimiento se guarda con la fecha y la versión del texto', async () => {
    await expect(onboarding.save('u1', CON_SINTOMAS, CONSENTIMIENTO)).resolves.toBe('ok');
    expect(repo.save).toHaveBeenCalledWith('u1', CON_SINTOMAS, { at: AHORA, textVersion: '2026-09-30' });
  });

  it.each([
    ['síntomas sin consentimiento', CON_SINTOMAS, undefined],
    ['alergias sin consentimiento', { ...SIN_SALUD, allergies: ['peanut'] }, undefined],
    ['"ninguna" alergia también es dato de salud', { ...SIN_SALUD, allergies: ['none'] }, undefined],
    ['dietas sin consentimiento (D-83)', { ...SIN_SALUD, diets: ['kosher'] }, undefined],
    ['"ninguna" dieta también pide consentimiento', { ...SIN_SALUD, diets: ['none'] }, undefined],
  ] as const)('%s → consent_required y no guarda nada', async (_caso, answers, consent) => {
    await expect(onboarding.save('u1', answers as OnboardingAnswers, consent)).resolves.toBe('consent_required');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('con consentimiento y sin datos de salud → guarda el consentimiento igual', async () => {
    await onboarding.save('u1', SIN_SALUD, CONSENTIMIENTO);
    expect(repo.save).toHaveBeenCalledWith('u1', SIN_SALUD, { at: AHORA, textVersion: '2026-09-30' });
  });
});
