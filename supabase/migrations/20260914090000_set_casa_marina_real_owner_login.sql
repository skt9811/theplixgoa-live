/*
# Set Casa Marina's real owner login

Replaces the placeholder phone/PIN (9000000003 / 1003) seeded for
casa-marina in 20260913104445_create_portal_owners_table.sql — that
migration's own notes flagged 8 of the 10 rows as placeholders still
needing real owner numbers before going live. This is the real number
for Casa Marina.
*/

UPDATE portal_owners
SET phone = '8882171431', pin = '1234', updated_at = now()
WHERE property_slug = 'casa-marina';
