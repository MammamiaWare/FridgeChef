-- Device class from User-Agent (iphone, mac, windows, android, …).

alter table ip_logs add column if not exists device_type text;
alter table ip_logs add column if not exists device_os text;
alter table ip_logs add column if not exists device_browser text;

create index if not exists ip_logs_device_type_idx on ip_logs (device_type);
