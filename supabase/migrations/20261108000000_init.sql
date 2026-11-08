-- DisputeMate initial schema (PRD section 7)
-- Security model:
--   * Every table has row level security on.
--   * Customers can only READ their own rows. All writes go through server
--     actions that check permissions and then use the service role key, which
--     never leaves the server. This keeps status transitions, routing,
--     deadlines and approvals deterministic and outside customer control.
--   * Staff (reviewer, administrator) can read all dispute data.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('customer', 'reviewer', 'administrator');
create type payment_method as enum ('card', 'paynow', 'fast', 'giro');
create type transaction_status as enum ('success', 'pending', 'failed', 'reversed');
create type dispute_status as enum (
  'draft',
  'pending_review',
  'info_required',
  'approved_for_filing',
  'submitted',
  'under_investigation',
  'resolved',
  'rejected'
);
create type evidence_source as enum ('customer_upload', 'transaction_record', 'reviewer_upload');
create type evidence_processing_status as enum ('uploaded', 'processing', 'processed', 'failed');
create type window_unit as enum ('days', 'business_days');
create type alert_type as enum ('duplicate', 'failed_debited', 'unrecognised');
create type alert_status as enum ('open', 'confirmed', 'dismissed');

-- ---------------------------------------------------------------------------
-- Users (profile row per Supabase auth user)
-- ---------------------------------------------------------------------------
create table public.users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null,
  role user_role not null default 'customer',
  created_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where user_id = auth.uid() and role in ('reviewer', 'administrator')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where user_id = auth.uid() and role = 'administrator'
  );
$$;

-- ---------------------------------------------------------------------------
-- Transactions (simulated banking data for the MVP)
-- ---------------------------------------------------------------------------
create table public.transactions (
  transaction_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (user_id) on delete cascade,
  merchant_name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'SGD',
  transaction_date timestamptz not null,
  payment_method payment_method not null,
  transaction_status transaction_status not null,
  account_debited boolean not null default true,
  reference_number text not null unique
);
create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc);

-- ---------------------------------------------------------------------------
-- Dispute categories (admin managed)
-- ---------------------------------------------------------------------------
create table public.dispute_categories (
  key text primary key,
  label text not null,
  description text not null,
  is_active boolean not null default true,
  sort_order int not null default 0
);

-- ---------------------------------------------------------------------------
-- Routing rules (FR-07, admin managed, deterministic)
-- ---------------------------------------------------------------------------
create table public.routing_rules (
  rule_id uuid primary key default gen_random_uuid(),
  name text not null,
  payment_method payment_method not null,
  dispute_category text not null references public.dispute_categories (key),
  reason_code text not null,
  procedure text not null,
  review_queue text not null default 'disputes',
  filing_window int not null check (filing_window > 0),
  filing_window_unit window_unit not null default 'days',
  required_fields text[] not null default '{}',
  escalation_required boolean not null default false,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index routing_rules_active_unique
  on public.routing_rules (payment_method, dispute_category)
  where is_active;

-- ---------------------------------------------------------------------------
-- System settings (detection rules etc, admin managed)
-- ---------------------------------------------------------------------------
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Disputes
-- ---------------------------------------------------------------------------
create table public.disputes (
  dispute_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (user_id) on delete cascade,
  transaction_id uuid not null references public.transactions (transaction_id),
  related_transaction_id uuid references public.transactions (transaction_id),
  dispute_category text references public.dispute_categories (key),
  customer_description text not null default '',
  category_answers jsonb not null default '{}'::jsonb,
  ai_recommended_category text,
  ai_category_reasoning text,
  ai_category_confidence numeric(3, 2),
  ai_summary jsonb,
  ai_summary_source text,
  recommended_reason_code text,
  routing_rule_id uuid references public.routing_rules (rule_id),
  routing_explanation text,
  filing_deadline timestamptz,
  requires_human_routing boolean not null default false,
  scam_indicators text[] not null default '{}',
  escalated_to_fraud boolean not null default false,
  status dispute_status not null default 'draft',
  assigned_reviewer_id uuid references public.users (user_id),
  submission_reference text unique,
  submitted_at timestamptz,
  customer_confirmed_at timestamptz,
  decision text,
  decision_reason text,
  decision_explanation text,
  next_steps text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index disputes_user_idx on public.disputes (user_id, updated_at desc);
create index disputes_status_idx on public.disputes (status, filing_deadline);
-- Only one active (non-final) dispute per transaction.
create unique index disputes_one_active_per_transaction
  on public.disputes (transaction_id)
  where status not in ('resolved', 'rejected');

-- ---------------------------------------------------------------------------
-- Evidence
-- ---------------------------------------------------------------------------
create table public.evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (dispute_id) on delete cascade,
  file_name text not null,
  file_url text,
  storage_path text,
  file_type text not null,
  file_size int,
  evidence_source evidence_source not null default 'customer_upload',
  customer_description text not null default '',
  extracted_text text,
  ai_summary text,
  processing_status evidence_processing_status not null default 'uploaded',
  uploaded_at timestamptz not null default now()
);
create index evidence_dispute_idx on public.evidence (dispute_id);

-- ---------------------------------------------------------------------------
-- Dispute status history (audit trail of every transition)
-- ---------------------------------------------------------------------------
create table public.dispute_status_history (
  history_id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (dispute_id) on delete cascade,
  previous_status dispute_status,
  new_status dispute_status not null,
  updated_by uuid references public.users (user_id),
  action text not null,
  remarks text,
  created_at timestamptz not null default now()
);
create index status_history_dispute_idx on public.dispute_status_history (dispute_id, created_at);

-- ---------------------------------------------------------------------------
-- Reviewer notes (internal, staff only)
-- ---------------------------------------------------------------------------
create table public.reviewer_notes (
  note_id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (dispute_id) on delete cascade,
  author_id uuid not null references public.users (user_id),
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Potential dispute alerts (FR-03)
-- ---------------------------------------------------------------------------
create table public.dispute_alerts (
  alert_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (user_id) on delete cascade,
  alert_type alert_type not null,
  transaction_id uuid not null references public.transactions (transaction_id) on delete cascade,
  related_transaction_id uuid references public.transactions (transaction_id) on delete cascade,
  explanation text not null,
  status alert_status not null default 'open',
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index alerts_user_idx on public.dispute_alerts (user_id, status);

-- ---------------------------------------------------------------------------
-- Notifications (FR-11)
-- ---------------------------------------------------------------------------
create table public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (user_id) on delete cascade,
  dispute_id uuid references public.disputes (dispute_id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit log (sensitive operations)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  audit_id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users (user_id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- AI request log (monitoring AI performance, section 9)
-- ---------------------------------------------------------------------------
create table public.ai_requests (
  request_id uuid primary key default gen_random_uuid(),
  dispute_id uuid references public.disputes (dispute_id) on delete cascade,
  task text not null,
  model text,
  succeeded boolean not null,
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger disputes_touch before update on public.disputes
  for each row execute function public.touch_updated_at();
create trigger routing_rules_touch before update on public.routing_rules
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Simulated bank data: every new customer gets a sample transaction history,
-- including a duplicate charge pair and a failed-but-debited transfer.
-- ---------------------------------------------------------------------------
create or replace function public.seed_demo_transactions(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base timestamptz := date_trunc('minute', now());
  suffix text := upper(substr(replace(p_user::text, '-', ''), 1, 6));
begin
  insert into public.transactions
    (user_id, merchant_name, amount, currency, transaction_date, payment_method, transaction_status, account_debited, reference_number)
  values
    (p_user, 'ABC Store',            85.00, 'SGD', base - interval '3 days 2 hours',            'card',   'success', true,  'TXN-' || suffix || '-001'),
    (p_user, 'ABC Store',            85.00, 'SGD', base - interval '3 days 2 hours' + interval '4 minutes', 'card', 'success', true, 'TXN-' || suffix || '-002'),
    (p_user, 'FairPrice Xtra',       142.35, 'SGD', base - interval '1 day 5 hours',            'card',   'success', true,  'TXN-' || suffix || '-003'),
    (p_user, 'Grab',                 18.60, 'SGD', base - interval '2 days 1 hour',             'card',   'success', true,  'TXN-' || suffix || '-004'),
    (p_user, 'SP Group',             96.40, 'SGD', base - interval '6 days',                    'giro',   'success', true,  'TXN-' || suffix || '-005'),
    (p_user, 'Transfer to Tan Wei Ming', 250.00, 'SGD', base - interval '4 days 3 hours',       'fast',   'failed',  true,  'TXN-' || suffix || '-006'),
    (p_user, 'NETFLIX.COM',          19.98, 'SGD', base - interval '8 days',                    'card',   'success', true,  'TXN-' || suffix || '-007'),
    (p_user, 'XYZ*DIGITALGOODS HK',  329.00, 'SGD', base - interval '2 days 9 hours',           'card',   'success', true,  'TXN-' || suffix || '-008'),
    (p_user, 'Kopitiam',             6.80, 'SGD', base - interval '10 hours',                   'card',   'success', true,  'TXN-' || suffix || '-009'),
    (p_user, 'PayNow to Lim Hui Min', 40.00, 'SGD', base - interval '12 days',                  'paynow', 'success', true,  'TXN-' || suffix || '-010'),
    (p_user, 'Uniqlo Orchard',       79.80, 'SGD', base - interval '15 days',                   'card',   'success', true,  'TXN-' || suffix || '-011'),
    (p_user, 'Shopee',               54.20, 'SGD', base - interval '20 days',                   'card',   'reversed', false, 'TXN-' || suffix || '-012')
  on conflict (reference_number) do nothing;
end;
$$;

-- Create a profile row on signup. Role is always customer; staff roles are
-- granted by an administrator (or the seed script), never self-assigned.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (user_id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'customer'
  )
  on conflict (user_id) do nothing;

  perform public.seed_demo_transactions(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.dispute_categories enable row level security;
alter table public.routing_rules enable row level security;
alter table public.system_settings enable row level security;
alter table public.disputes enable row level security;
alter table public.evidence enable row level security;
alter table public.dispute_status_history enable row level security;
alter table public.reviewer_notes enable row level security;
alter table public.dispute_alerts enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_requests enable row level security;

create policy "users read self or staff" on public.users
  for select using (user_id = auth.uid() or public.is_staff());

create policy "transactions read own or staff" on public.transactions
  for select using (user_id = auth.uid() or public.is_staff());

create policy "categories readable" on public.dispute_categories
  for select using (auth.uid() is not null);

create policy "routing rules staff read" on public.routing_rules
  for select using (public.is_staff());

create policy "settings staff read" on public.system_settings
  for select using (public.is_staff());

create policy "disputes read own or staff" on public.disputes
  for select using (user_id = auth.uid() or public.is_staff());

create policy "evidence read own or staff" on public.evidence
  for select using (
    public.is_staff() or exists (
      select 1 from public.disputes d
      where d.dispute_id = evidence.dispute_id and d.user_id = auth.uid()
    )
  );

create policy "history read own or staff" on public.dispute_status_history
  for select using (
    public.is_staff() or exists (
      select 1 from public.disputes d
      where d.dispute_id = dispute_status_history.dispute_id and d.user_id = auth.uid()
    )
  );

create policy "notes staff only" on public.reviewer_notes
  for select using (public.is_staff());

create policy "alerts read own" on public.dispute_alerts
  for select using (user_id = auth.uid() or public.is_staff());

create policy "notifications read own" on public.notifications
  for select using (user_id = auth.uid());

create policy "audit admin read" on public.audit_logs
  for select using (public.is_admin());

create policy "ai requests admin read" on public.ai_requests
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Private storage bucket for evidence. Files are only served through
-- short-lived signed URLs generated on the server after permission checks.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  4194304,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain']
)
on conflict (id) do nothing;
