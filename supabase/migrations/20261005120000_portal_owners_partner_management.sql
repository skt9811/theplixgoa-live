-- Partner App logins managed from the PMS Users screen (/pms/settings/users)
-- as well as /admin. owner_name: the partner's own name. is_active: a disabled
-- login cannot sign in; existing rows default to active.
ALTER TABLE public.portal_owners ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE public.portal_owners ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
