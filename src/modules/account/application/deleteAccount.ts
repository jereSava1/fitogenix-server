/* Eliminar la cuenta del usuario (RF-029). Antes vivía entero en
 * `routes/users/deleteMe.ts`; desde M-07 recibe el `AuthAdmin` como puerto. */

import type { AuthAdmin } from './ports';

export type DeleteAccount = (userId: string) => Promise<void>;

export function makeDeleteAccount(authAdmin: AuthAdmin): DeleteAccount {
  return (userId) => authAdmin.deleteUser(userId);
}
