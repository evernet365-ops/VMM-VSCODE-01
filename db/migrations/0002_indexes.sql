create index if not exists idx_nvr_site_id on nvr(site_id);
create index if not exists idx_camera_site_status on camera(site_id, status);
create index if not exists idx_ai_event_site_ts on ai_event(site_id, ts_event desc);
create index if not exists idx_ai_event_site_event_type on ai_event(site_id, event_type);
create index if not exists idx_ai_artifact_event_id on ai_artifact(event_id);
create index if not exists idx_notification_log_site_created on notification_log(site_id, created_at desc);
create index if not exists idx_poll_state_site_component on poll_state(site_id, component);
create index if not exists idx_circuit_breaker_state_site_target on circuit_breaker_state(site_id, target_service);
