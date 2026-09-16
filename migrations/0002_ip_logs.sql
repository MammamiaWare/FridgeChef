-- Visitor IP logs (Vercel / edge: x-forwarded-for).
-- Applied on Neon when DATABASE_URL is set, and on local PGLite.

create table if not exists ip_logs (
  id bigserial primary key,
  ip text not null,
  user_agent text,
  path text,
  locale text,
  created_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists ip_logs_created_at_idx on ip_logs (created_at desc);
create index if not exists ip_logs_ip_idx on ip_logs (ip);
