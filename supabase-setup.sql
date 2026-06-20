-- ============================================
--  AVAR1ON'S ARCHIVE — Database setup
--  Plak dit in Supabase SQL Editor en klik "Run"
-- ============================================

-- Tabel voor aangevinkte kaarten
create table owned_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  set_id text not null,
  card_id text not null,
  variant text not null,
  created_at timestamptz default now(),

  -- Eén gebruiker kan dezelfde kaart+variant maar één keer aanvinken
  unique (user_id, card_id, variant)
);

-- Row Level Security aanzetten: verplicht, anders kan iedereen alles zien
alter table owned_cards enable row level security;

-- Policy: gebruikers mogen ALLEEN hun eigen rijen zien
create policy "Users can view own cards"
  on owned_cards for select
  using (auth.uid() = user_id);

-- Policy: gebruikers mogen ALLEEN eigen rijen toevoegen
create policy "Users can insert own cards"
  on owned_cards for insert
  with check (auth.uid() = user_id);

-- Policy: gebruikers mogen ALLEEN eigen rijen verwijderen (uitvinken)
create policy "Users can delete own cards"
  on owned_cards for delete
  using (auth.uid() = user_id);

-- Index voor snelle lookups per set
create index owned_cards_user_set on owned_cards (user_id, set_id);