// Contra la base (simulada): fila por usuario, columnas y traducción de errores.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingAnswers, OnboardingRepository } from '../application/ports';

let upsertResult: { error: { message: string } | null } = { error: null };
const upsert = vi.fn(async (_row: unknown, _opts: unknown) => upsertResult);
const from = vi.fn(() => ({ upsert }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));

let repo: OnboardingRepository;

beforeAll(async () => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  ({ supabaseOnboardingRepository: repo } = await import('./supabaseOnboardingRepository'));
});

beforeEach(() => {
  vi.clearAllMocks();
  upsertResult = { error: null };
});

const RESPUESTAS: OnboardingAnswers = { goals: [], symptoms: ['fog'], diets: [], allergies: [], avoid: [], source: null };

describe('save', () => {
  it('reemplaza la fila del usuario con el consentimiento en sus columnas', async () => {
    await repo.save('u1', RESPUESTAS, { at: new Date('2026-09-30T12:00:00Z'), textVersion: 'v1' });
    expect(from).toHaveBeenCalledWith('onboarding_responses');
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: 'u1',
        answers: RESPUESTAS,
        consent_health_data_at: '2026-09-30T12:00:00.000Z',
        consent_text_version: 'v1',
        updated_at: expect.any(String),
      },
      { onConflict: 'user_id' },
    );
  });

  it('sin consentimiento, las dos columnas en null', async () => {
    await repo.save('u1', { ...RESPUESTAS, symptoms: [] }, null);
    expect(upsert.mock.calls[0]![0]).toMatchObject({ consent_health_data_at: null, consent_text_version: null });
  });

  it('un error de la base o una excepción → DependencyUnavailableError (503)', async () => {
    upsertResult = { error: { message: 'boom' } };
    await expect(repo.save('u1', RESPUESTAS, null)).rejects.toMatchObject({ name: 'DependencyUnavailableError', dependency: 'supabase' });
    upsert.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(repo.save('u1', RESPUESTAS, null)).rejects.toMatchObject({ name: 'DependencyUnavailableError' });
  });
});
