insert into site (id, name, enabled)
values
  ('site-a', 'Site A', true),
  ('site-b', 'Site B', true)
on conflict (id) do update
set name = excluded.name,
    enabled = excluded.enabled;

insert into nvr (id, site_id, name, status)
values
  ('nvr-a-1', 'site-a', 'NVR Site A 01', 'online'),
  ('nvr-b-1', 'site-b', 'NVR Site B 01', 'online')
on conflict (id) do update
set site_id = excluded.site_id,
    name = excluded.name,
    status = excluded.status;

insert into camera (id, site_id, nvr_id, name, status, last_seen_at)
values
  ('cam-a-1', 'site-a', 'nvr-a-1', 'Site A Camera 1', 'online', now()),
  ('cam-a-2', 'site-a', 'nvr-a-1', 'Site A Camera 2', 'offline', now() - interval '10 minutes'),
  ('cam-a-3', 'site-a', 'nvr-a-1', 'Site A Camera 3', 'online', now()),
  ('cam-b-1', 'site-b', 'nvr-b-1', 'Site B Camera 1', 'online', now()),
  ('cam-b-2', 'site-b', 'nvr-b-1', 'Site B Camera 2', 'offline', now() - interval '15 minutes')
on conflict (id) do update
set site_id = excluded.site_id,
    nvr_id = excluded.nvr_id,
    name = excluded.name,
    status = excluded.status,
    last_seen_at = excluded.last_seen_at;

insert into ai_event (site_id, camera_id, event_type, severity, score, ts_event, dedup_key, metadata_json)
values
  ('site-a', 'cam-a-2', 'offline', 'critical', 0.9800, now() - interval '8 minutes', 'seed-site-a-offline-1', '{"durationSec": 480}'::jsonb),
  ('site-a', 'cam-a-3', 'missing_recording', 'suspect', 0.7600, now() - interval '5 minutes', 'seed-site-a-missing-1', '{"durationSec": 120}'::jsonb),
  ('site-b', 'cam-b-2', 'offline', 'suspect', 0.8200, now() - interval '12 minutes', 'seed-site-b-offline-1', '{"durationSec": 720}'::jsonb)
on conflict (site_id, dedup_key) do update
set ts_event = excluded.ts_event,
    score = excluded.score,
    metadata_json = excluded.metadata_json,
    severity = excluded.severity;

insert into poll_state (site_id, component, severity, next_poll_at, last_latency_ms, consecutive_failures, load_shed_mode)
values
  ('site-a', 'connector-vss', 'suspect', now() + interval '60 seconds', 2000, 2, false),
  ('site-b', 'connector-vss', 'normal', now() + interval '4 minutes', 900, 0, false)
on conflict (site_id, component) do update
set severity = excluded.severity,
    next_poll_at = excluded.next_poll_at,
    last_latency_ms = excluded.last_latency_ms,
    consecutive_failures = excluded.consecutive_failures,
    load_shed_mode = excluded.load_shed_mode,
    updated_at = now();

insert into circuit_breaker_state (site_id, target_service, state, failure_count, last_latency_ms, updated_at)
values
  ('site-a', 'vss-provider', 'closed', 0, 850, now()),
  ('site-b', 'vss-provider', 'closed', 0, 920, now())
on conflict (site_id, target_service) do update
set state = excluded.state,
    failure_count = excluded.failure_count,
    last_latency_ms = excluded.last_latency_ms,
    updated_at = now();
