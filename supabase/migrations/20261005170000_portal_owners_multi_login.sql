-- A property can have several partner logins (one owner, any number of
-- caretakers), and a phone number can hold a login at more than one property.
-- Uniqueness is per property and phone instead of per property or per phone.
ALTER TABLE public.portal_owners DROP CONSTRAINT IF EXISTS portal_owners_phone_key;
ALTER TABLE public.portal_owners DROP CONSTRAINT IF EXISTS portal_owners_property_slug_key;
ALTER TABLE public.portal_owners ADD CONSTRAINT portal_owners_property_phone_key UNIQUE (property_slug, phone);
