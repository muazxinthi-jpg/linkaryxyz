-- Normalize the one-time owner bootstrap invitation to Linkary's human-safe
-- case-insensitive invite hashing convention.
-- This migration is idempotent and does not alter invite usage or privileges.

UPDATE invites
SET code_hash = 'ZetNxKAgJ3lN0DzvyD14t4t62Bvyolk8EYr3nq8o0nU',
    updated_at = datetime('now')
WHERE id = 'inv_bootstrap_owner_20260901'
  AND code_hash = 'dEY_v7d7voY9U9kpAR1sfWH12yz3yBPu5PAR4JJiolI';
