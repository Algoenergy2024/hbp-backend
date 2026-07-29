-- Minimal governance gate: only admins can write to the assumptions ledger.
-- This is deliberately a single boolean, not a role/permission system — see
-- README for why a fuller model is blocked on deciding who HBP is actually
-- for. Promoting the first admin requires a manual DB update; there is no
-- self-serve path, which is the point for a pilot with a handful of users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
