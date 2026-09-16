-- Geolocation columns for visitor IP logs.

alter table ip_logs add column if not exists country text;
alter table ip_logs add column if not exists country_code text;
alter table ip_logs add column if not exists region text;
alter table ip_logs add column if not exists city text;
alter table ip_logs add column if not exists latitude double precision;
alter table ip_logs add column if not exists longitude double precision;
alter table ip_logs add column if not exists org text;
alter table ip_logs add column if not exists timezone text;

create index if not exists ip_logs_country_code_idx on ip_logs (country_code);
