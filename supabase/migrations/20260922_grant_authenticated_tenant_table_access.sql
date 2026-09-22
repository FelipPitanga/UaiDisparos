-- Authenticated users need SQL privileges in addition to RLS policies.
-- RLS still isolates every row by account_id / super_admin.
grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.instances,
  public.groups,
  public.leads,
  public.campaigns,
  public.group_automations,
  public.jobs,
  public.webhook_events,
  public.suppression_list,
  public.private_broadcasts,
  public.private_broadcast_recipients,
  public.notification_outbox,
  public.group_participant_snapshots,
  public.notification_settings
to authenticated;

grant usage, select on all sequences in schema public to authenticated;
