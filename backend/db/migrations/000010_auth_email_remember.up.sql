-- E-mails are case-insensitive: one account per lower(email). Existing rows are normalised
-- first (checked: no two accounts differ only by case).
UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- "Remember me": false = session cookie and a short refresh TTL, kept across rotation.
ALTER TABLE refresh_tokens ADD COLUMN remember BOOLEAN NOT NULL DEFAULT true;
