ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS remember;
DROP INDEX IF EXISTS users_email_lower_key;
