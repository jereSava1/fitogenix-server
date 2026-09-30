// Tabla `profiles`: una fila por usuario (`id` = el de Supabase Auth), con username único
// sin distinguir mayúsculas.

import { queryFailed, runQuery, supabaseAdmin as admin } from '../../../platform/supabase';
import type { Profile, ProfileChanges, ProfileRepository } from '../application/ports';

const COLUMNS = 'first_name, last_name, username, phone';

type ProfileRow = { first_name: string | null; last_name: string | null; username: string | null; phone: string | null };

function toProfile(row: ProfileRow): Profile {
  return { firstName: row.first_name, lastName: row.last_name, username: row.username, phone: row.phone };
}

/** `_` es comodín en LIKE y los usernames lo admiten. */
function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function toRow(changes: ProfileChanges): Partial<ProfileRow> {
  const row: Partial<ProfileRow> = {};
  if (changes.firstName !== undefined) row.first_name = changes.firstName;
  if (changes.lastName !== undefined) row.last_name = changes.lastName;
  if (changes.username !== undefined) row.username = changes.username;
  if (changes.phone !== undefined) row.phone = changes.phone;
  return row;
}

export const supabaseProfileRepository: ProfileRepository = {
  async get(userId) {
    const { data, error } = await runQuery('profiles select', () =>
      admin().from('profiles').select(COLUMNS).retry(false).eq('id', userId).maybeSingle<ProfileRow>(),
    );
    if (error) throw queryFailed('profiles select', error);
    return data ? toProfile(data) : null;
  },

  async update(userId, changes) {
    const { data, error } = await runQuery('profiles update', () =>
      admin().from('profiles').update(toRow(changes)).eq('id', userId).select(COLUMNS).maybeSingle<ProfileRow>(),
    );
    if (error) {
      if (error.code === '23505') return 'username_taken';
      throw queryFailed('profiles update', error);
    }
    return data ? toProfile(data) : 'not_found';
  },

  async isUsernameTaken(username) {
    const { data, error } = await runQuery('profiles username', () =>
      admin().from('profiles').select('id').retry(false).ilike('username', likeLiteral(username)).limit(1),
    );
    if (error) throw queryFailed('profiles username', error);
    return (data ?? []).length > 0;
  },

  async create(userId, profile) {
    const current = await runQuery('profiles select', () =>
      admin().from('profiles').select('username').retry(false).eq('id', userId).maybeSingle<{ username: string | null }>(),
    );
    if (current.error) throw queryFailed('profiles select', current.error);
    if (current.data?.username) return 'exists';

    const { error } = await runQuery('profiles upsert', () =>
      admin().from('profiles').upsert({ id: userId, ...toRow(profile) }, { onConflict: 'id' }),
    );
    if (error) {
      if (error.code === '23505') return 'username_taken';
      throw queryFailed('profiles upsert', error);
    }
    return 'created';
  },
};
