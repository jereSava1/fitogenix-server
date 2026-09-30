// Fakes de los puertos de auth para los tests de application/.
import { vi } from 'vitest';
import type { AuthGateway, AuthProfiles, Session } from '../application/ports';

export const SESSION: Session = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: 1_900_000_000,
  user: { id: 'u-1', email: 'ana@mail.com' },
};

export function fakeGateway() {
  return {
    signIn: vi.fn<AuthGateway['signIn']>(async () => ({ session: SESSION, names: { firstName: null, lastName: null } })),
    refresh: vi.fn<AuthGateway['refresh']>(async () => SESSION),
    signOut: vi.fn<AuthGateway['signOut']>(async () => undefined),
    signUp: vi.fn<AuthGateway['signUp']>(async () => ({ userId: 'u-nuevo' })),
    deleteUser: vi.fn<AuthGateway['deleteUser']>(async () => undefined),
    sendPasswordResetCode: vi.fn<AuthGateway['sendPasswordResetCode']>(async () => undefined),
    resetPassword: vi.fn<AuthGateway['resetPassword']>(async () => 'ok'),
  } satisfies AuthGateway;
}

export function fakeProfiles() {
  return {
    isUsernameAvailable: vi.fn<AuthProfiles['isUsernameAvailable']>(async () => true),
    createProfile: vi.fn<AuthProfiles['createProfile']>(async () => 'created'),
    ensureProfile: vi.fn<AuthProfiles['ensureProfile']>(async () => undefined),
  } satisfies AuthProfiles;
}
