-- Session-scoped access for UaiDisparos multi-tenant UI.
-- Interactive pages and protected API routes use the authenticated Supabase session.
-- Background workers/webhooks keep using the server/admin client.

do $$
declare
  t text;
  tenant_tables text[] := array[
    'instances',
    'groups',
    'leads',
    'campaigns',
    'group_automations',
    'jobs',
    'webhook_events',
    'suppression_list',
    'private_broadcasts',
    'private_broadcast_recipients',
    'notification_outbox',
    'group_participant_snapshots'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_tenant_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (account_id = app_private.current_account_id() or app_private.is_super_admin())',
      t || '_tenant_select', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_tenant_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (account_id = app_private.current_account_id() or app_private.is_super_admin())',
      t || '_tenant_insert', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_tenant_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (account_id = app_private.current_account_id() or app_private.is_super_admin()) with check (account_id = app_private.current_account_id() or app_private.is_super_admin())',
      t || '_tenant_update', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_tenant_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (account_id = app_private.current_account_id() or app_private.is_super_admin())',
      t || '_tenant_delete', t
    );
  end loop;
end $$;

drop policy if exists notification_settings_superadmin_select on public.notification_settings;
drop policy if exists notification_settings_superadmin_insert on public.notification_settings;
drop policy if exists notification_settings_superadmin_update on public.notification_settings;
drop policy if exists notification_settings_superadmin_delete on public.notification_settings;

create policy notification_settings_superadmin_select
on public.notification_settings for select to authenticated
using (app_private.is_super_admin());

create policy notification_settings_superadmin_insert
on public.notification_settings for insert to authenticated
with check (app_private.is_super_admin());

create policy notification_settings_superadmin_update
on public.notification_settings for update to authenticated
using (app_private.is_super_admin())
with check (app_private.is_super_admin());

create policy notification_settings_superadmin_delete
on public.notification_settings for delete to authenticated
using (app_private.is_super_admin());

drop policy if exists accounts_superadmin_insert on public.accounts;
drop policy if exists accounts_superadmin_update on public.accounts;
drop policy if exists accounts_superadmin_delete on public.accounts;

create policy accounts_superadmin_insert
on public.accounts for insert to authenticated
with check (app_private.is_super_admin());

create policy accounts_superadmin_update
on public.accounts for update to authenticated
using (app_private.is_super_admin())
with check (app_private.is_super_admin());

create policy accounts_superadmin_delete
on public.accounts for delete to authenticated
using (app_private.is_super_admin() and is_primary = false);

drop policy if exists profiles_superadmin_insert on public.profiles;
drop policy if exists profiles_superadmin_update on public.profiles;
drop policy if exists profiles_superadmin_delete on public.profiles;

create policy profiles_superadmin_insert
on public.profiles for insert to authenticated
with check (app_private.is_super_admin());

create policy profiles_superadmin_update
on public.profiles for update to authenticated
using (app_private.is_super_admin())
with check (app_private.is_super_admin());

create policy profiles_superadmin_delete
on public.profiles for delete to authenticated
using (app_private.is_super_admin());

drop policy if exists system_settings_superadmin_insert on public.system_settings;
drop policy if exists system_settings_superadmin_update on public.system_settings;
drop policy if exists system_settings_superadmin_delete on public.system_settings;

create policy system_settings_superadmin_insert
on public.system_settings for insert to authenticated
with check (app_private.is_super_admin());

create policy system_settings_superadmin_update
on public.system_settings for update to authenticated
using (app_private.is_super_admin())
with check (app_private.is_super_admin());

create policy system_settings_superadmin_delete
on public.system_settings for delete to authenticated
using (app_private.is_super_admin());
