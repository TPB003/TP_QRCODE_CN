import { env } from "./harness";

await env.DB.exec("DELETE FROM submissions; DELETE FROM project_versions; DELETE FROM entity_codes; DELETE FROM projects; DELETE FROM qr_access_events; DELETE FROM analytics_daily_codes; DELETE FROM qr_code_assets; DELETE FROM qr_code_versions; DELETE FROM qr_codes; DELETE FROM sessions; DELETE FROM auth_codes; DELETE FROM oauth_states; DELETE FROM auth_identities; DELETE FROM users;");
