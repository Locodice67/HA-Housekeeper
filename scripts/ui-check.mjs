// Looks at the panel in a real browser: screenshots of the main views at desktop, tablet and phone
// size in light and dark, and optionally an accessibility scan with axe-core.
//
//   node scripts/ui-check.mjs [--out DIR] [--objects N] [--views a,b] [--viewports desktop,mobile] [--lang de|en] [--axe] [--serve] [--fail-fast]
//   (a failing Chrome run is reported with its view, size and scheme; the other runs continue and the exit code is 1)
//
// Needs Google Chrome (CHROME=/path, the macOS default path, or google-chrome/chromium on PATH).
// --axe also needs axe-core: `npm install --no-save axe-core@4.10.2` in the repository, or
// AXE_PATH=/path/to/axe.min.js. It exits with 1 when axe finds a serious or critical problem.
// The panel is built from panel-src/ on the fly; nothing here touches a Home Assistant instance.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPanel } from "./build_panel.mjs";
import { makeLoadFixture } from "./make_load_fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
// Not execFileSync: the page is served by this process, which must stay free to answer Chrome.
// A Chrome that does not come up in time is killed and started once more.
const runChrome = async (file, args, options) => { try { return await run(file, args, options); } catch (err) { if (!/^timeout/.test(err.message)) throw err; return run(file, args, options); } };
// Chrome gets no stdin: with the open pipe that execFile hands to it, it never starts in some
// environments (no connection to the page, no screenshot, no exit).
// ``until`` ends the run early once it holds: a headless Chrome may write its screenshot and then
// never exit, so the finished file counts as success.
const run = (file, args, { timeout = 60000, maxBuffer = 1024 * 1024, encoding = "utf8", until } = {}) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], detached: true }); // own process group, so a kill takes the helpers along
  const kill = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } };
  let stdout = "", stderr = "", done = false;
  const finish = (fn, value) => { if (!done) { done = true; clearTimeout(timer); clearInterval(poll); fn(value); } };
  const poll = until ? setInterval(() => { if (until()) { kill(); finish(resolve, { stdout, stderr }); } }, 250) : null;
  const timer = setTimeout(() => { kill(); finish(reject, new Error(`timeout after ${timeout} ms: ${path.basename(file)}`)); }, timeout);
  child.stdout.on("data", chunk => { stdout += chunk; if (stdout.length > maxBuffer) { kill(); finish(reject, new Error("output too large")); } });
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
  child.on("error", err => finish(reject, err));
  // Chrome's helpers keep the pipes open after it has exited; ending the group lets "close" fire.
  child.on("exit", kill);
  child.on("close", code => code === 0 ? finish(resolve, { stdout, stderr }) : finish(reject, new Error(`${path.basename(file)} exited with ${code}: ${stderr.slice(-300)}`)));
});
// True once the file exists and its size held still between two looks.
const written = file => { let last = -1; return () => { const size = fs.existsSync(file) ? fs.statSync(file).size : 0; const done = size > 0 && size === last; last = size; return done; }; };
const flag = name => process.argv.includes(`--${name}`);
const language = arg("lang", "de") === "en" ? "en" : "de";

const VIEWPORTS = { desktop: [1280, 1000], tablet: [768, 1100], mobile: [375, 1700] };
const VIEWS = {
  overview: "view=overview", findings: "view=findingsNav", inventory: "view=inventory", changes: "view=changes", monitor_editor: "view=monitor&editor=1",
  graph: "view=graph&graph=1&gobj=automation%3Aautomation.a1", detail: "object=entity%3Asensor.beispiel_7&tab=overview",
  attributes: "object=entity%3Asensor.beispiel_7&tab=technical", cleanup: "view=cleanup&plan=running", plan: "view=cleanup&plan=preview", repair: "view=repair", maintenance: "view=maintenance", reliability: "view=reliability", runs: "view=runs", recorder: "view=recorder", exposure: "view=exposure", policies: "view=policies", storage: "view=storage", dataflow: "view=dataflow", secrets: "view=secrets", settings: "view=settings", decisions: "view=settings&tab=exceptions", batteries: "view=batteries", unreferenced: "view=unreferenced",
};
const SCHEMES = ["light", "dark"];

function chromePath() {
  const candidates = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "chromium", "chromium-browser"].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes("/") ? fs.existsSync(candidate) : (() => { try { execFileSync("which", [candidate], { stdio: "ignore" }); return true; } catch { return false; } })()) return candidate;
  }
  throw new Error("Chrome not found: set CHROME=/path/to/chrome");
}

// The synthetic installation plus the cases a screenshot should show: a broken integration, a loop,
// a missing target, objects in quarantine.
function showcase(objects) {
  const data = makeLoadFixture(objects);
  if (language === "en") {
    for (const object of data.objects) {
      object.name = object.name
        ?.replace(/^Gerät /, "Device ")
        .replace(/^Beispielsensor (\d+) Raum /, "Example sensor $1 Room ");
    }
  }
  data.meta.scanned_at = new Date().toISOString();
  data.meta.scan_interval_hours = 24;
  data.orphaned_statistics = [["sensor.e2m_proxon_fwt_meter_energy", "kWh", true, false], ["sensor.fritz_box_7530_download_geschwindigkeit", "KiB/s", false, true], ["sensor.fritz_box_7530_upload_geschwindigkeit_2", "KiB/s", false, true], ["sensor.eltako_gw1_weather_station_illuminance", "lx", false, true]]
    .map(([statistic_id, unit, has_sum, has_mean], i) => ({ statistic_id, unit, has_sum, has_mean, in_energy: i === 0 }));
  data.meta.recorder_available = true;
  data.meta.database = { dialect: "sqlite", db_bytes: 3 * 1024 ** 3, wal_bytes: 24 * 1024 ** 2, per_day: 18 * 1024 ** 2, samples: 30 };
  data.objects.push({ object_type: "config_entry", object_id: "ce-hue", name: "Philips Hue", domain: "hue", integration_name: "Philips Hue", status: "problem", state: "setup_error", error: "Cannot connect", source: "user", status_since: data.meta.scanned_at });
  data.meta.object_count = data.objects.length;
  data.meta.status_counts.problem = (data.meta.status_counts.problem || 0) + 1;
  data.meta.type_counts.config_entry = (data.meta.type_counts.config_entry || 0) + 1;
  data.edges.push(
    { source: "automation:automation.a2", target: "automation:automation.a1", relation: "TARGETS", confidence: "certain" },
    { source: "automation:automation.a1", target: "automation:automation.a2", relation: "TARGETS", confidence: "probable" },
    { source: "automation:automation.a1", target: "entity:sensor.removed_long_ago", relation: "TARGETS", confidence: "certain", location: "actions[2]" },
  );
  data.findings.unshift({ key: "automation:automation.a1", rule_id: "automation.missing_entity", object_id: "automation.a1", classification: "broken_reference", confidence: 0.95, affected_object: "sensor.removed_long_ago", first_detected_at: data.meta.scanned_at, evidence: [{ location: "actions[2]" }], ignored: false, ignored_by: null });
  data.quarantine = [{ object_id: "sensor.beispiel_4", object_type: "entity", since: new Date(Date.now() - 20 * 864e5).toISOString() }];
  return data;
}

const TREND = {
  available: true, baseline_at: new Date(Date.now() - 864e5).toISOString(), baselines: [], current: { objects: 0, findings: 0 },
  new_findings: { total: 3, items: [{ rule_id: "automation.missing_entity", object_id: "automation.a1", classification: "broken_reference", ignored: false }] },
  resolved_findings: { total: 5, items: [] }, status_changes: { total: 2, items: [] }, new_objects: { total: 1, items: [] }, removed_objects: { total: 0, items: [] },
};

const PAGE = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ui-check</title><style>body{margin:0}</style></head><body>
<script src="/panel.js"></script><script src="/axe.js"></script>
<script>
(async () => {
  const q = new URLSearchParams(location.search), wait = ms => new Promise(r => setTimeout(r, ms));
  localStorage.setItem("ha_housekeeper.prefs", JSON.stringify({ mode: q.get("scheme") === "dark" ? "dark" : "light", graphMode: q.get("graph") ? "graph" : "list" }));
  const ago = h => new Date(Date.now() - h * 3600000).toISOString(), MB = 1048576;
  const BACKUP = { available: true, overall: "problem", schema: 1, backup_count: 3, counts: { ok: 3, note: 3, problem: 2, unknown: 0 },
    checks: [{ id: "setup", level: "ok", values: { agents: ["hassio.local", "cloud.cloud"], recurrence: "daily" } },
      { id: "newest", level: "problem", values: { age_hours: 70, limit_hours: 36, date: ago(70), recurrence: "daily" } },
      { id: "last_run", level: "problem", values: { attempted: ago(5), completed: ago(70), failed_agents: [], failed_attempt: true } },
      { id: "targets", level: "note", values: { local: ["hassio.local"], remote: [] } },
      { id: "size", level: "ok", values: { size: 900 * MB, expected: 880 * MB, ratio: 1.02, baseline: 2 } },
      { id: "retention", level: "ok", values: { copies: 3, days: null, count: 3, oldest_days: 6.4 } },
      { id: "encryption", level: "note", values: { configured: false, newest_protected: false } },
      { id: "emergency_kit", level: "note", values: { at: null, age_days: null } },
      { id: "restore_test", level: "ok", values: { at: ago(24 * 37), age_days: 37 } }],
    backups: [70, 94, 118].map((h, i) => ({ date: ago(h), size: (900 - i * 10) * MB, agents: ["hassio.local"], protected: false, automatic: true, failed_agents: [] })),
    attest: { emergency_kit: null, restore_test: ago(24 * 37) } };
  const data = await (await fetch("/data.json")).json(), trend = await (await fetch("/trend.json")).json();
  // Two marks for the page of exceptions and marks: one current, one whose review date has passed.
  const devices = data.objects.filter(o => o.object_type === "device");
  if (devices[0]) devices[0].mark = { kind: "expected_offline", reason: "nachts aus", until: null, window: { mode: "time", from: "22:00", to: "07:00" }, at: ago(240) };
  if (devices[1]) Object.assign(devices[1], { mark: { kind: "seasonal", reason: "", until: ago(48), at: ago(2400) }, mark_due: true });
  const el = document.createElement("ha-housekeeper-panel");
  el.narrow = innerWidth <= 870; // as Home Assistant hands it to a panel when its sidebar becomes a drawer
  document.body.appendChild(el);
  const GB = 1024 ** 3;
  el.hass = { language: "${language}", themes: { darkMode: q.get("scheme") === "dark" }, locale: { language: "${language}" }, dockedSidebar: q.get("sidebar") === "hidden" ? "always_hidden" : "docked",
    callWS: async msg => { const t = msg.type;
      if (t.endsWith("/inventory") || t.endsWith("/scan")) return data;
      if (t.endsWith("/status")) return { running: false };
      if (t.endsWith("/exceptions")) return { rules: [{ id: "r1", kind: "area", targets: ["garten"], action: "delay", days: 3, scope: "always", enabled: true, note: "", effect: { hold: 5, due: 0 } }], areas: [{ id: "garten", name: "Garten" }], labels: [], integrations: [], domains: [], devices: [], entities: [], vacation: {}, days_max: 365 };
      if (t.endsWith("/plan_list")) return { plans: [] };
      if (t.endsWith("/compare")) return trend;
      if (t.endsWith("/detail")) return { attributes: { friendly_name: "Beispiel", unit_of_measurement: "W" } };
      if (t.endsWith("/backup_health")) return BACKUP;
      if (t.endsWith("/automation_runs")) return { schema: 1, window_days: 7, since: "2026-10-01T08:00:00+00:00", total: 3, items: [
        { object_type: "automation", entity_id: "automation.flurlicht", name: "${language === "en" ? "Hall light" : "Flurlicht"}", status: "active", runs: 48, ok: 30, errors: 18, conditions: 0, mean_ms: 1200, max_ms: 95000, per_day: [2, 5, 8, 9, 7, 9, 8], lower_bound: true,
          findings: [{ kind: "failing", level: "warn", errors: 18, runs: 48, step: "action/2", step_count: 12 }, { kind: "long_wait", level: "info", seconds: 600 }] },
        { object_type: "script", entity_id: "script.nachtlicht", name: "${language === "en" ? "Night light" : "Nachtlicht"}", status: "active", runs: 6, ok: 0, errors: 6, conditions: 0, mean_ms: null, max_ms: null, per_day: [0, 0, 1, 2, 1, 1, 1], lower_bound: false,
          findings: [{ kind: "never_ok", level: "red", runs: 6 }] },
        { object_type: "automation", entity_id: "automation.heizung", name: "${language === "en" ? "Night heating" : "Heizung Nacht"}", status: "active", runs: 140, ok: 140, errors: 0, conditions: 0, mean_ms: 300, max_ms: 900, per_day: [20, 20, 20, 20, 20, 20, 20], lower_bound: false, findings: [] }] };
      if (t.endsWith("/db_health")) return { available: true, busy: false, cached: false, took_ms: 3200, schema: 1, supported: true, dialect: "sqlite", db_bytes: 11811160064, wal_bytes: 3221225472, growth: { known: true, per_day: 83886080 }, restart_gaps: 2,
        findings: [
          { kind: "duplicates", level: "problem", groups: 7, capped: false, series: [{ statistic_id: "sensor.a", name: "Energie Haus", groups: 5 }] },
          { kind: "recorder_gap", level: "problem", gaps: 2, longest_seconds: 7200, latest: [{ start: 1790000000, end: 1790007200, seconds: 7200, cause: "recorder" }] },
          { kind: "wal_large", level: "hint", wal_bytes: 3221225472, db_bytes: 11811160064 }] };
      if (t.endsWith("/statistics_last")) { const now = Date.now() / 1000; return { available: true, busy: false, last: { "sensor.e2m_proxon_fwt_meter_energy": now - 1038 * 86400, "sensor.fritz_box_7530_download_geschwindigkeit": now - 1033 * 86400, "sensor.fritz_box_7530_upload_geschwindigkeit_2": now - 30 * 86400, "sensor.eltako_gw1_weather_station_illuminance": null } }; }
      if (t.endsWith("/policies")) return { available: true, schema: 1, enabled: 2, violations: 3, rules: [
        { id: "entity_area", enabled: true, count: 2, ignored: 1, items: [{ object_type: "entity", object_id: "light.flur", name: "Flurlicht", key: "policy.entity_area|light.flur|", ignored: false, by: null }, { object_type: "entity", object_id: "sensor.keller", name: "Keller Temperatur", key: "policy.entity_area|sensor.keller|", ignored: false, by: null }, { object_type: "entity", object_id: "switch.alt", name: "Alter Schalter", key: "policy.entity_area|switch.alt|", ignored: true, by: "user" }] },
        { id: "device_area", enabled: false, count: 0, ignored: 0, items: [] },
        { id: "automation_description", enabled: true, count: 1, ignored: 0, items: [{ object_type: "automation", object_id: "automation.a1", name: "Automation 1", key: "policy.automation_description|automation.a1|", ignored: false, by: null }] },
        { id: "battery_device", enabled: false, count: 0, ignored: 0, items: [] }] };
      if (t.endsWith("/exposure")) return { available: true, schema: 1, checked: 320, webhooks: 4, exposed_total: 3, exposed_entities: [{ entity_id: "lock.haustuer", name: "Haustür", assistants: ["conversation"] }, { entity_id: "light.kueche", name: "Küche", assistants: ["conversation", "homekit"] }, { entity_id: "light.kueche_decke", name: "Küche Decke", assistants: ["conversation", "homekit"] }], assistants: [{ id: "conversation", status: "ok", exposed: 41 }, { id: "cloud.alexa", status: "inactive", exposed: 0 }, { id: "cloud.google_assistant", status: "inactive", exposed: 0 }], bridges: [{ kind: "homekit", title: "HASS Bridge", exposed: 18 }], findings: [{ kind: "sensitive_exposed", level: "hint", count: 2, items: [{ entity_id: "lock.haustuer", name: "Haustür", assistants: ["conversation"] }] }, { kind: "alias_duplicate", level: "warn", assistant: "conversation", alias: "Küche", count: 2, items: [{ entity_id: "light.kueche", name: "Küche" }, { entity_id: "light.kueche_decke", name: "Küche Decke" }] }] };
      if (t.endsWith("/storms")) return { available: true, busy: false, cached: false, took_ms: 4100, window_days: 1, schema: 1, total_rows: 412000, per_day: 412000, entity_count: 380, event_total: 150000, state_changed_events: 140000,
        findings: [
          { kind: "storm", entity_id: "sensor.laut", name: "${language === "en" ? "Noisy sensor" : "Lauter Sensor"}", window_days: 1, per_day: 72000, peak_hour: 5100, rows: 72000, followers: { automation: 2, entity: 1 } },
          { kind: "no_new_state", entity_id: "sensor.attr", name: "${language === "en" ? "Attributes only" : "Nur Attribute"}", window_days: 1, per_day: 9000, share: 96, followers: {} },
          { kind: "integration_share", entry_id: "e1", title: "Cloud-Hub", window_days: 1, per_day: 80000, load_share: 41.5, row_share: 19.4 }],
        entities: [{ entity_id: "sensor.laut", name: "${language === "en" ? "Noisy sensor" : "Lauter Sensor"}", entry_id: "e1", rows: 72000, per_day: 72000, no_new_state: 0.12, attr_bytes: 640, peak_hour: 5100 }, { entity_id: "sensor.attr", name: "${language === "en" ? "Attributes only" : "Nur Attribute"}", entry_id: "e2", rows: 9000, per_day: 9000, no_new_state: 0.96, attr_bytes: 5200, peak_hour: 900 }],
        integrations: [{ entry_id: "e1", title: "Cloud-Hub", domain: "hue", entities: 12, rows: 80000, per_day: 80000, row_share: 19.4, load_share: 41.5 }, { entry_id: "e2", title: "Zigbee", domain: "zha", entities: 40, rows: 60000, per_day: 60000, row_share: 14.6, load_share: 22.1 }],
        events: [{ type: "state_changed", count: 140000 }, { type: "call_service", count: 4000 }] };
      if (t.endsWith("/reliability")) return { available: true, busy: false, cached: false, took_ms: 2800, window_days: 7, schema: 1, unstable: { total: 31, items: [
        { entity_id: "sensor.tuer_batterie", name: "${language === "en" ? "Door sensor battery" : "Türsensor Batterie"}", entry_id: "e2", entry_title: "Zigbee", episodes: 12, per_day: 1.7, total_seconds: 4800, mean_seconds: 400, level: "flapping", pattern_hour: 3, used: 2 },
        { entity_id: "sensor.garten_feuchte", name: "${language === "en" ? "Garden moisture" : "Gartenfeuchte"}", entry_id: "e2", entry_title: "Zigbee", episodes: 4, per_day: 0.6, total_seconds: 120, mean_seconds: 30, level: "unstable", pattern_hour: null, used: 0 }] }, entries: [
        { entry_id: "e1", title: "Cloud-Hub", domain: "hue", state: "setup_retry", reauth: true, entities: 12, permanent: 2, availability: 93.4, shared_outages: 3, longest_outage: 7200, layer: "cloud", last_disruption: { end: 1791470000, seconds: 3600, shared: true } },
        { entry_id: "e2", title: "Zigbee", domain: "zha", state: "loaded", reauth: false, entities: 40, permanent: 0, availability: 98.2, shared_outages: 1, longest_outage: 900, layer: "local", last_disruption: { end: 1791400000, seconds: 900, shared: true } },
        { entry_id: "e3", title: "${language === "en" ? "Weather station" : "Wetterstation"}", domain: "ecowitt", state: "loaded", reauth: false, entities: 8, permanent: 0, availability: 100, shared_outages: 0, longest_outage: 0, layer: null, last_disruption: null }] };
      if (t.endsWith("/system_usage")) return { schema: 1, supervisor: true, cpu: { percent: 9.8, count: 4 }, load: { "1m": 0.16, "5m": 0.26, "15m": 0.3 },
        ram: { total: 7.6 * GB, used: 2.4 * GB, percent: 31.4 }, swap: { total: 2.5 * GB, used: 376 * MB, percent: 14.6 },
        disk: { total: 47.5 * GB, used: 36.8 * GB, free: 8.8 * GB, percent: 77.5, source: "supervisor" },
        categories: { total: 47.5 * GB, used: 36.8 * GB, children: [{ id: "system", label: "System", bytes: 24.8 * GB }, { id: "addons_data", label: "apps_data", bytes: 8 * GB }, { id: "homeassistant", label: "homeassistant", bytes: 5.9 * GB }, { id: "media", label: "media", bytes: 11 * MB }, { id: "share", label: "share", bytes: 1.9 * MB }] },
        breakdown: [{ id: "recorder_db", path: "home-assistant_v2.db", bytes: 5.1 * GB }, { id: "www", path: "www", bytes: 401 * MB }, { id: "custom_components", path: "custom_components", bytes: 191 * MB }, { id: "custom_cards", path: "www", bytes: 100 * MB }, { id: "image", path: "image", bytes: 33 * MB }, { id: "blueprints", path: "blueprints", bytes: 883 * 1024 }],
        custom_integrations: [{ domain: "hacs", bytes: 61 * MB }, { domain: "alexa_media", bytes: 12 * MB }, { domain: "dreame_vacuum", bytes: 9 * MB }],
        apps: [{ slug: "core_mosquitto", name: "Mosquitto broker", state: "started", cpu_percent: 0.3, memory_usage: 21 * MB, memory_limit: 7.6 * GB, size_bytes: 2 * MB }, { slug: "a0d7b954_vscode", name: "Studio Code Server", state: "stopped", cpu_percent: null, memory_usage: null, memory_limit: null, size_bytes: 610 * MB }],
        apps_memory: 21 * MB, cards_total: 100 * MB,
        cards: [{ id: "1", type: "module", url: "/hacsfiles/button-card/button-card.js?hacstag=1", bytes: 1.2 * MB, scope: "folder" }, { id: "2", type: "module", url: "/local/my-card.js", bytes: 40 * 1024, scope: "file" }, { id: "3", type: "module", url: "https://cdn.example.org/x.js", bytes: null, scope: null }],
        blueprints: [{ domain: "automation", path: "homeassistant/motion_light.yaml", name: "Motion-activated Light", author: "Home Assistant", bytes: 1800 }, { domain: "script", path: "homeassistant/confirmable_notification.yaml", name: "Confirmable Notification", author: "Home Assistant", bytes: 2400 }] };
      // The Blueprints tab of Maintenance reads its own command: one unused blueprint and one an automation misses.
      if (t.endsWith("/blueprints")) return { available: true, schema: 1, unused: 1, missing: 1, broken: 0, domains: [
        { domain: "automation", unused: [{ path: "homeassistant/motion_light.yaml", name: "Motion-activated Light", bytes: 1800 }], missing: [{ path: "custom/old_light.yaml", count: 1, users: [{ id: "automation.a1", name: "Automation 1" }] }], broken: [] },
        { domain: "script", unused: [], missing: [], broken: [] }] };
      if (t.endsWith("/sensitive_fields")) return { schema: 1, entries: [
        { entry_id: "c1", domain: "alexa_media", title: "Alexa", disabled: false, fields: [{ source: "data", key: "password", kind: "password", set: true }, { source: "data", key: "token.refresh_token", kind: "token", set: true }] },
        { entry_id: "c2", domain: "tado", title: "Tado", disabled: false, fields: [{ source: "data", key: "api_key", kind: "api_key", set: false }, { source: "data", key: "webhook_id", kind: "webhook", set: true }] },
        { entry_id: "c3", domain: "mqtt", title: "MQTT", disabled: false, fields: [{ source: "data", key: "password", kind: "password", set: false }] },
      ] };
      if (t.endsWith("/access")) return { schema: 1, with_access: 3, external: 3, high: 3, entries: [
        { entry_id: "e4", domain: "hassio", title: "Supervisor", iot_class: "local_polling", disabled: false, access: [{ kind: "system_root", detail: "Supervisor" }], flows: ["local", "system"], gps: false, camera: false, external: false, risk: "high" },
        { entry_id: "e5", domain: "mobile_app", title: "Pixel", iot_class: "local_push", disabled: false, access: [{ kind: "location", detail: "Companion App" }], flows: ["external", "gps", "local"], gps: true, camera: false, external: true, risk: "high" },
        { entry_id: "e6", domain: "zha", title: "Zigbee", iot_class: "local_polling", disabled: false, access: [{ kind: "radio", detail: "Zigbee" }], flows: [], gps: false, camera: false, external: false, risk: "high" },
        { entry_id: "e7", domain: "alexa_media", title: "Alexa", iot_class: "cloud_polling", disabled: false, access: [{ kind: "cloud_api", detail: "Amazon" }], flows: ["cloud", "external"], gps: false, camera: false, external: true, risk: "medium" },
        { entry_id: "e8", domain: "dwd_weather", title: "${language === "en" ? "Weather map" : "Wetterkarte"}", iot_class: "cloud_polling", disabled: false, access: [], flows: [], gps: false, camera: false, external: true, risk: "medium" }],
        apps_available: true, apps: [
          { slug: "a0d7b954_ssh", name: "Advanced SSH & Web Terminal", state: "started", version: "21.0.0", checked: true, risk: "high", access: [{ kind: "full_access", detail: null, level: "high" }, { kind: "privileged", detail: "SYS_ADMIN, NET_ADMIN", level: "high" }, { kind: "supervisor_api", detail: "manager", level: "high" }, { kind: "host_network", detail: null, level: "medium" }, { kind: "apparmor_off", detail: null, level: "medium" }] },
          { slug: "core_mosquitto", name: "Mosquitto broker", state: "started", version: "6.5.1", checked: true, risk: "medium", access: [{ kind: "supervisor_api", detail: "default", level: "medium" }, { kind: "auth_api", detail: null, level: "medium" }] },
          { slug: "core_zwave_js", name: "Z-Wave JS", state: "stopped", version: "0.9.0", checked: true, risk: "low", access: [{ kind: "devices", detail: "/dev/ttyUSB0", level: "low" }] }] };
      if (t.endsWith("/preflight")) return { state: { ha_version: "2026.10.0", backup: { available: true, configured: true, newest: "x", age_hours: 70 }, repairs: [], failed_entries: [], broken: [], pending_updates: [] }, checks: [{ check: "backup", level: "ok" }, { check: "repairs", level: "ok", count: 0 }, { check: "failed_entries", level: "ok", count: 0 }, { check: "broken", level: "ok", count: 0 }], record: null, after: null };
      return {}; } };
  for (let i = 0; i < 50 && !el.data; i++) await wait(100);
  const plan = q.get("plan");
  if (plan) {
    const act = (kind, extra = {}) => ({ kind, object_id: "sensor.beispiel_" + kind.length, name: (language === "en" ? "Example sensor " : "Beispielsensor ") + kind, verdict: "ok", executable: true, reasons: [], used_by: [], ...extra });
    el.plan = { plan_id: "p1", created_at: new Date().toISOString(), status: plan === "running" ? "running" : "dry_run", executed: false, summary: { total: 3, ok: 2, review: 0, blocked: 1 },
      backup: plan === "running" ? { job_id: "a1b2c3", at: new Date().toISOString() } : undefined,
      actions: [act("remove_entity"), act("migrate_meter", { object_id: "sensor.alt", target: "sensor.neu", name: language === "en" ? "Old meter" : "Zähler alt" }),
        act("remove_entity", { object_id: "sensor.x", name: language === "en" ? "In use" : "Genutzt", verdict: "blocked", executable: false, reasons: ["used_certain"], used_by: [{ source: "automation:automation.a1", relation: "TARGETS", confidence: "certain" }] })] };
    if (plan === "running") el.planProgress = { done: 1, total: 2 };
  }
  if (q.get("view")) { el.view = q.get("view"); if (el.view === "changes") await el.loadCompare(); }
  if (q.get("editor")) {
    el.monitorForm = { name: document.documentElement.lang === "en" ? "Front door" : "Haustür", description: "", notify: true, members: [
      { object_key: "entity:sensor.beispiel_7", required: true, rules: [{ kind: "freshness", value: 24 }] },
      { object_key: "automation:automation.a1", required: true, rules: [] },
    ] };
    el.monitorPreview = { state: "unverified", reason: "rule_no_timestamp", reason_key: "entity:sensor.beispiel_7", members: [
      { object_key: "entity:sensor.beispiel_7", state: "unverified", reason: "rule_no_timestamp" },
      { object_key: "automation:automation.a1", state: "ok", reason: "active" },
    ] };
    el.monitorQuery = "sensor";
  }
  if (q.get("graph")) { el.graphSelected = el.findObject(q.get("gobj")); el.graphDepth = 3; el.view = "graph"; }
  else if (q.get("object")) { await el.openObject(el.findObject(q.get("object"))); el.detailTab = q.get("tab") || "overview"; }
  el.render();
  await wait(300);
  if (q.get("axe") && window.axe) {
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    const out = result.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.html.slice(0, 160)) }));
    const text = JSON.stringify(out);
    if (q.get("inner")) parent.postMessage({ axe: text }, "*");
    else document.body.insertAdjacentHTML("beforeend", "<pre id=axe-result>" + btoa(unescape(encodeURIComponent(text))) + "</pre>");
  }
  document.body.dataset.ready = "1";
})();
</script></body></html>`;

// Chrome will not make a window narrower than about 500 px, so narrower sizes are shown in an iframe
// of the real width: media queries look at the iframe, not at the window.
const FRAME = `<!doctype html><html><head><meta charset="utf-8"><title>frame</title><style>body{margin:0;background:#888}iframe{border:0;display:block;background:#fff}</style></head><body>
<script>
  const q = new URLSearchParams(location.search), w = q.get("w"), h = q.get("h");
  q.delete("w"); q.delete("h"); q.set("inner", "1");
  const f = document.createElement("iframe"); f.width = w; f.height = h; f.src = "/?" + q.toString(); document.body.appendChild(f);
  addEventListener("message", e => { if (e.data && e.data.axe) document.body.insertAdjacentHTML("beforeend", "<pre id=axe-result>" + btoa(unescape(encodeURIComponent(e.data.axe))) + "</pre>"); });
</script></body></html>`;

// The panel loads its fonts and logo from the integration's own paths; without them Chrome waits for
// requests that never succeed and a screenshot with a virtual time budget never finishes.
const COMPONENT = path.join(root, "custom_components/ha_housekeeper");
function asset(pathname) {
  const font = /^\/ha_housekeeper\/fonts\/([\w.-]+\.woff2)$/.exec(pathname);
  const file = font ? path.join(COMPONENT, "fonts", font[1]) : pathname === "/ha_housekeeper/logo.png" ? path.join(COMPONENT, "brand/logo.png") : null;
  if (!file || !fs.existsSync(file)) return null;
  return [font ? "font/woff2" : "image/png", fs.readFileSync(file)];
}

function serve(data) {
  const panel = buildPanel();
  const axePath = process.env.AXE_PATH || path.join(root, "node_modules/axe-core/axe.min.js");
  const routes = {
    "/": ["text/html", PAGE], "/frame": ["text/html", FRAME], "/panel.js": ["text/javascript", panel], "/data.json": ["application/json", JSON.stringify(data)],
    "/trend.json": ["application/json", JSON.stringify(TREND)],
    "/axe.js": ["text/javascript", fs.existsSync(axePath) ? fs.readFileSync(axePath, "utf8") : "window.axe=undefined;"],
  };
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url, "http://x").pathname;
      const hit = routes[pathname] || asset(pathname);
      if (!hit) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "content-type": Buffer.isBuffer(hit[1]) ? hit[0] : `${hit[0]}; charset=utf-8` }).end(hit[1]);
    }).listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, hasAxe: fs.existsSync(axePath) }));
  });
}

// Each Chrome run gets its own profile so that several can run side by side. A job that fails is
// reported with its view, size and scheme and the others carry on (--fail-fast stops at the first).
async function pool(jobs, size, worker) {
  const queue = [...jobs], results = [], errors = [];
  await Promise.all(Array.from({ length: size }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try { results.push(await worker(job)); } catch (err) {
        const where = `${job.view}/${job.viewport}/${job.scheme}`;
        console.error(`failed: ${where}: ${err.message}`);
        errors.push(where);
        if (flag("fail-fast")) queue.length = 0;
      }
    }
  }));
  if (errors.length) failed = true;
  return results;
}

const NARROW = 500; // window sizes below this go through the frame
const pageUrl = (port, view, [w, h], scheme, extra = "") => w < NARROW
  ? `http://127.0.0.1:${port}/frame?w=${w}&h=${h}&${VIEWS[view]}&scheme=${scheme}${extra}`
  : `http://127.0.0.1:${port}/?${VIEWS[view]}&scheme=${scheme}${extra}`;
const windowSize = ([w, h]) => [Math.max(w, NARROW), h];

const chromeArgs = (profile, w, h) => ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, `--window-size=${w},${h}`, "--virtual-time-budget=3000"];

let failed = false;
const out = path.resolve(arg("out", path.join(os.tmpdir(), "ha-housekeeper-ui-check")));
const views = (arg("views", Object.keys(VIEWS).join(","))).split(",").filter(v => VIEWS[v]);
const viewports = (arg("viewports", Object.keys(VIEWPORTS).join(","))).split(",").filter(v => VIEWPORTS[v]);
fs.mkdirSync(out, { recursive: true });
const chrome = chromePath();
const { server, port, hasAxe } = await serve(showcase(Number(arg("objects", 400))));
if (flag("serve")) { // for looking at the page in any browser; Ctrl-C ends it
  console.log(`http://127.0.0.1:${port}/?${VIEWS[views[0]] || VIEWS.overview}&scheme=light`);
  await new Promise(() => {});
}
const root_profile = fs.mkdtempSync(path.join(os.tmpdir(), "hk-chrome-"));
const jobsParallel = Number(arg("jobs", 3));
let counter = 0;
const withProfile = async fn => {
  const profile = path.join(root_profile, String(counter++));
  return fn(profile);
};
try {
  const shots = [];
  for (const view of views) for (const viewport of viewports) for (const scheme of SCHEMES) shots.push({ view, viewport, scheme });
  const files = await pool(shots, jobsParallel, ({ view, viewport, scheme }) => withProfile(async profile => {
    const size = VIEWPORTS[viewport], [w, h] = windowSize(size), file = path.join(out, `${view}-${viewport}-${scheme}.png`);
    fs.rmSync(file, { force: true });
    // Some views never go idle in headless Chrome, so the virtual time budget never ends;
    // --timeout makes Chrome take the shot after 15 s, well inside the 45 s this script waits.
    await runChrome(chrome, [...chromeArgs(profile, w, h), "--timeout=15000", `--screenshot=${file}`, pageUrl(port, view, size, scheme)], { timeout: 45000, until: written(file) });
    return file;
  }));
  for (const file of files.sort()) console.log(file);
  if (flag("axe")) {
    if (!hasAxe) throw new Error("axe-core not found: npm install --no-save axe-core@4.10.2, or set AXE_PATH");
    const seen = new Map(), scans = [];
    for (const view of views) for (const viewport of ["desktop", "mobile"]) for (const scheme of SCHEMES) scans.push({ view, viewport, scheme });
    const found = await pool(scans, jobsParallel, ({ view, viewport, scheme }) => withProfile(async profile => {
      const size = VIEWPORTS[viewport], [w, h] = windowSize(size);
      const { stdout: dom } = await runChrome(chrome, [...chromeArgs(profile, w, h), "--dump-dom", pageUrl(port, view, size, scheme, "&axe=1")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 90000 });
      const match = /<pre id="axe-result">(.*?)<\/pre>/s.exec(dom);
      return { view, viewport, scheme, violations: match ? JSON.parse(Buffer.from(match[1].trim(), "base64").toString("utf8")) : null };
    }));
    for (const { view, viewport, scheme, violations } of found) {
      if (!violations) { console.log(`axe: no result for ${view} ${viewport} ${scheme}`); failed = true; continue; }
      for (const v of violations) {
        const entry = seen.get(v.id) || { ...v, where: new Set() };
        entry.where.add(`${view}/${viewport}/${scheme}`); seen.set(v.id, entry);
      }
    }
    for (const v of [...seen.values()].sort((a, b) => String(a.impact).localeCompare(String(b.impact)))) {
      console.log(`axe ${v.impact} ${v.id}: ${v.help} (${v.count} nodes in ${[...v.where].join(", ")})`);
      for (const html of v.sample) console.log(`    ${html}`);
      if (v.impact === "serious" || v.impact === "critical") failed = true;
    }
    if (!seen.size) console.log("axe: no violations");
  }
} finally {
  server.close();
  try { fs.rmSync(root_profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* Chrome may still be flushing its profile */ }
}
process.exit(failed ? 1 : 0);
