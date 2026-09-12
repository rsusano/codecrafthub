-- CodeCraftHub cloud workspace (courses + AI chat) per authenticated user
-- Run this in the Supabase SQL editor once.

create table if not exists public.user_workspace (
  user_id uuid primary key references auth.users (id) on delete cascade,
  courses jsonb not null default '[]'::jsonb,
  chat_messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_workspace enable row level security;

create policy "Users can read own workspace"
  on public.user_workspace
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own workspace"
  on public.user_workspace
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own workspace"
  on public.user_workspace
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
