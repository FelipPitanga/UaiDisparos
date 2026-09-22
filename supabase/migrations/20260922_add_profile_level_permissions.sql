-- Per-user access control for collaborators.
-- NULL permissions inherits the parent account permissions.
alter table public.profiles
  add column if not exists permissions jsonb;

comment on column public.profiles.permissions is
  'Optional per-user module permissions. NULL inherits account permissions. Super admins bypass module restrictions.';

update public.profiles
set permissions = null
where role = 'super_admin' and permissions is not null;
