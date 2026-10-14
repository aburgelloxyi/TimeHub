-- Google sign-ins kept by the Worker (worker/googleAuth.js), one per TimeHub
-- person, keyed by their Wrike user id. Like wrike_oauth_tokens: row level
-- security on and no policies, so only the Worker's service key reaches it;
-- the browser's keys can neither read nor write a token.
create table if not exists public.google_oauth_tokens (
  wrike_user_id text primary key,
  google_email text not null default '',
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  scopes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_tokens enable row level security;
revoke all on public.google_oauth_tokens from anon, authenticated;
