-- Partner logins can be owners or on-site caretakers. Existing rows stay owners.
ALTER TABLE public.portal_owners ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'owner';
