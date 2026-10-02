import type { AuthAdmin } from './ports';

export type DeleteAccount = (userId: string) => Promise<void>;

export function makeDeleteAccount(authAdmin: AuthAdmin): DeleteAccount {
  return (userId) => authAdmin.deleteUser(userId);
}
