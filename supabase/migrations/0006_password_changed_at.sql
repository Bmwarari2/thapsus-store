-- Session invalidation: tokens issued before the last password change are
-- rejected by the API, so a password reset kills stolen sessions.

ALTER TABLE users ADD COLUMN password_changed_at timestamptz;
