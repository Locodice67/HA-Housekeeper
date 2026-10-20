// Run with: node --test tests/panel.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { buildPanel } from "../scripts/build_panel.mjs";
import { makeLoadFixture } from "../scripts/make_load_fixture.mjs";

const SOURCE = new URL("../custom_components/ha_housekeeper/frontend/ha-housekeeper-panel.js", import.meta.url);

function loadPanel(extra = {}) {
  const downloads = [];
  let PanelClass;
  const shadow = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
  class FakeElement {
    attachShadow() { this.shadowRoot = shadow; return shadow; }
  }
  const context = {
    HTMLElement: FakeElement,
    customElements: { get: () => undefined, define: (_, cls) => { PanelClass = cls; } },
    Blob: class { constructor(parts) { this.text = parts.join(""); } },
    URL: { createObjectURL: blob => { downloads.push(blob); return "blob:x"; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
    URLSearchParams,
    Intl, Map, Set, JSON, String, Number, Array, Object, Math, Date, setTimeout: () => 0,
    ...extra,
  };
  vm.runInNewContext(fs.readFileSync(SOURCE, "utf8") + "\nthis.TEXT = TEXT; this.NAV = NAV; this.NAV_GROUPS = NAV_GROUPS; this.OPTION_FIELDS = OPTION_FIELDS; this.csvCell = csvCell;", context);
  return { PanelClass, downloads, TEXT: context.TEXT, NAV: context.NAV, NAV_GROUPS: context.NAV_GROUPS, OPTION_FIELDS: context.OPTION_FIELDS, csvCell: context.csvCell, shadow };
}

const entriesOf = el => el.causeEntries().map(c => el.causeEntry(c)).join("");
const DATA = {
  meta: { scanned_at: "2026-10-07T10:00:00+00:00", object_count: 3, status_counts: { active: 2, orphaned: 1 }, type_counts: { entity: 3 } },
  objects: [
    { object_type: "entity", object_id: "sensor.a", name: "<img src=x onerror=alert(1)>", status: "orphaned", reason: "state_missing", platform: "test" },
    { object_type: "entity", object_id: "sensor.b", name: "B", status: "active", reason: "state_available" },
    { object_type: "automation", object_id: "automation.c", name: "C", status: "active", automation_id: "123" },
  ],
  edges: [],
  findings: [
    { rule_id: "entity.state_missing", object_id: "sensor.a", classification: "orphaned", confidence: 0.75, first_detected_at: "2026-10-01T00:00:00+00:00", evidence: [{ kind: "state_missing" }] },
    { rule_id: "automation.missing_entity", object_id: "automation.c", classification: "orphaned", confidence: 0.98, affected_object: "=HYPERLINK(\"x\")", evidence: [{ location: "actions[0]" }] },
  ],
};

function panel(lang = "en", extra = {}) {
  const env = loadPanel(extra);
  const el = new env.PanelClass();
  el._hass = { language: lang };
  el.data = DATA;
  return { el, ...env };
}

test("the overview has one findings link and shows active policy violations among hints", () => {
  const { el } = panel("de");
  el.findingEntries = () => Array.from({ length: 6 }, (_, i) => ({ finding: { id: i } }));
  el.overviewFinding = () => '<div class="row">Befund</div>';
  el.findingTotal = () => 6;
  el.todoItems = () => [];
  const todo = el.todoCard();
  assert.equal((todo.match(/Alle Befunde \(6\)/g) || []).length, 1);
  el.ensureBatteryTrend = () => {};
  el.ensurePolicies = () => {};
  el.policies = { available: true, rules: [
    { enabled: true, count: 3, ignored: 2 },
    { enabled: false, count: 8, ignored: 0 },
  ] };
  const hints = el.cleanupCard();
  assert.match(hints, /data-jump="policies"[^>]*>[\s\S]*?Richtlinienverstöße[\s\S]*?1 Regel aktiv[\s\S]*?>3<\/span>/);
  assert.ok(!hints.includes('>8</span>'), "disabled rules do not contribute violations");
  assert.equal(el.t("dbOvHint"), "Größe und Wachstum des Recorders.");
});

test("German and English texts define the same keys", () => {
  const { TEXT } = loadPanel();
  assert.deepEqual(Object.keys(TEXT.de).sort(), Object.keys(TEXT.en).sort());
});

test("home functions show a confirmed fault, a scan gap, and escapes function names", () => {
  const { el, NAV_GROUPS } = panel("de");
  assert.ok(NAV_GROUPS.find(([group]) => group === "navGroupOperation")[1].includes("monitor"));
  el.data = { ...DATA, monitor: [
    { id: "one", name: "<img src=x>", description: "", state: "problem", reason: "unavailable", reason_key: "entity:sensor.a", scanned_at: DATA.meta.scanned_at, members: [], incident_open: true },
    { id: "two", name: "Türklingel", description: "", state: "unverified", reason: "source_unread", scanned_at: DATA.meta.scanned_at, members: [], incident_open: false },
  ] };
  const html = el.monitorView();
  assert.match(html, /Beeinträchtigt/);
  assert.match(html, /Unbekannt/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.ok(html.includes('data-monitor-open="one"') && html.includes('data-lsort="monitor|state|asc"') && html.includes('class="tablewrap lt'), "the functions are a table; a row opens the function");
  el.monitorFilter = "unverified";
  assert.ok(el.monitorView().includes("Türklingel") && !el.monitorView().includes("&lt;img src=x&gt;") && el.lv.monitor.f.state === "unverified", "the deep-link filter lands in the list filter");
  el.monitorFilter = "";
  assert.ok(el.monitorView().includes("&lt;img src=x&gt;") && !el.lv.monitor.f.state, "clearing it shows every function again");
  el.monitorSelected = "one";
  assert.match(el.monitorDetail(), /Letzter Scan/);
});

test("the home functions history shows a flapping run as one line and filters by kind", () => {
  const { el } = panel("de");
  const at = "2026-10-14T09:00:00+00:00";
  el.data = { ...DATA, monitor: [{ id: "one", name: "Wasser", description: "", state: "ok", scanned_at: at, members: [{ object_key: "entity:sensor.x", required: true, rules: [] }], incident_open: false }] };
  el.monitorSelected = "one";
  el.journal = [{ plan_id: "p1", created_at: new Date().toISOString(), status: "verified", objects: ["sensor.x", "sensor.other"], summary: { total: 1, ok: 1 } }];
  el.monitorHistory = { one: { sig: "ok|" + at + "|undefined", retention_days: 30, entries: [
    { at, until: at, kind: "flapping", count: 7, state: "ok" }, { at, kind: "edited", added: ["entity:sensor.x"] },
  ] } };
  el.monitorHistory.one.availability = { window_days: 30, since: at, observed_seconds: 1000, ok_seconds: 999, problem_seconds: 1, unknown_seconds: 0, unstable_seconds: 0, incidents: 1, longest_seconds: 1, days: [{ date: "2026-10-13", state: "problem", problem_seconds: 3600 }, { date: "2026-10-14", state: "problem", problem_seconds: 540 }] };
  const html = el.monitorDetail();
  assert.match(html, /<b class="ok">99,9 %<\/b><span>Unauffällig, 30 Tage<\/span>/);
  assert.match(html, /<i class="problem" title="2026-10-13: Beeinträchtigt, 1 Std\./);
  assert.match(html, /<i class="problem short" title="2026-10-14: Beeinträchtigt, 9 Min\./);
  assert.match(html, /data-plan-open="p1"/);
  assert.ok(html.includes('data-lsort="monitor-history|time|desc"') && html.includes('data-lsort="monitor-members|state|asc"') && html.includes('data-object="entity:sensor.x"') === false, "history and objects are tables (the object is not in the inventory here, so its row opens nothing)");
  el.data.monitor[0].last_problem_at = new Date(Date.now() - 2 * 86400000).toISOString();
  assert.match(el.monitorLastProblemLine(), /Zuletzt beeinträchtigt.*Wasser.*2/);
  el.data.monitor[0].state = "problem";
  assert.equal(el.monitorLastProblemLine(), "");
  assert.match(html, /Wechselt häufig/);
  assert.match(html, /7 Wechsel/);
  el.lvState("monitor-history", "", "asc").f.kind = "config";
  const filtered = el.monitorDetail();
  assert.doesNotMatch(filtered, /7 Wechsel/);
  assert.match(filtered, /Geändert/);
});

test("a disabled home function remains editable but does not appear as an overview alarm", () => {
  const { el } = panel("de");
  el.data = { ...DATA, monitor: [{ id: "paused", name: "Wasseralarm", description: "", enabled: false, state: "disabled", reason: "disabled", members: [], incident_open: false }] };
  assert.match(el.monitorView(), /Deaktiviert/);
  el.monitorFilter = "disabled";
  assert.match(el.monitorView(), /Wasseralarm/);
  el.monitorSelected = "paused";
  assert.match(el.monitorDetail(), /Deaktiviert/);
  el.monitorForm = { id: "paused", name: "Wasseralarm", description: "", enabled: false, notify: true, members: [] };
  assert.match(el.monitorEditor(), /data-monitor-enabled /);
  assert.doesNotMatch(el.monitorEditor(), /data-monitor-enabled checked/);
  assert.ok(!el.todoItems().some(item => item.key.startsWith("monitor_")));
});

test("home functions editor keeps required members and offers only direct inventory objects", () => {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [...DATA.objects.map(o => o.object_id === "sensor.b" ? { ...o, area_id: "bedroom" } : o),
    { object_type: "scene", object_id: "scene.home", name: "Home", status: "active" },
    { object_type: "script", object_id: "script.start", name: "Start", status: "active" },
    { object_type: "app", object_id: "mqtt", name: "MQTT", status: "stopped" },
    { object_type: "area", object_id: "bedroom", name: "Bedroom", status: "active" },
  ] };
  el.monitorForm = { name: "Water", description: "", notify: true, members: [{ object_key: "entity:sensor.b", required: false }] };
  assert.match(el.monitorEditor(), /Enter at least two characters/);
  assert.doesNotMatch(el.monitorEditor(), /data-monitor-pick=/);
  el.monitorQuery = "automation";
  const html = el.monitorEditor();
  assert.match(html, /data-monitor-required="0"/);
  assert.match(html, /data-monitor-pick="automation:automation.c"/);
  assert.doesNotMatch(html, /data-monitor-pick="entity:sensor.b"/);
  assert.match(html, /class="row monitor-choice"/);
  assert.match(el.styles(), /\.row\.monitor-choice\{grid-template-columns:auto minmax\(0,1fr\) auto\}/);
  assert.match(html, /data-monitor-type="scene"/);
  el.monitorQuery = "home";
  assert.match(el.monitorEditor(), /data-monitor-pick="scene:scene.home"/);
  el.monitorType = "other";
  el.monitorQuery = "start";
  assert.match(el.monitorEditor(), /data-monitor-pick="script:script.start"/);
  el.monitorQuery = "mqtt";
  assert.match(el.monitorEditor(), /data-monitor-pick="app:mqtt"/);
  el.monitorQuery = "bedroom";
  assert.doesNotMatch(el.monitorEditor(), /data-monitor-pick="area:/);
  el.monitorType = "";
  assert.match(el.monitorEditor(), /data-monitor-pick="entity:sensor.b" disabled/);
  el.monitorQuery = "sensor.b";
  assert.match(el.monitorEditor(), /Hinzugefügt|Added/);
  assert.match(el.monitorEditor(), /data-monitor-pick="entity:sensor.b" disabled/);
});

test("home functions suggest known dependencies and shows entity rules", () => {
  const { el } = panel("de");
  el.data = { ...DATA, objects: [...DATA.objects,
    { object_type: "device", object_id: "d1", name: "Gerät", status: "active" },
    { object_type: "config_entry", object_id: "c1", name: "Integration", status: "active" },
    { object_type: "app", object_id: "mqtt", name: "MQTT", status: "active" },
  ], edges: [
    { source: "automation:automation.c", target: "entity:sensor.b", relation: "TARGETS", confidence: "certain" },
    { source: "device:d1", target: "entity:sensor.b", relation: "PROVIDES", confidence: "certain" },
    { source: "config_entry:c1", target: "entity:sensor.b", relation: "PROVIDES", confidence: "certain" },
    { source: "config_entry:c1", target: "app:mqtt", relation: "CONNECTED", confidence: "probable" },
  ] };
  el.monitorForm = { name: "Test", description: "", notify: true, members: [
    { object_key: "automation:automation.c", required: true, rules: [] },
    { object_key: "entity:sensor.a", required: true, rules: [{ kind: "min_value", value: 20 }] },
  ] };
  const keys = el.monitorSuggestions().map(item => item.key);
  assert.equal(keys.slice().sort().join(","), ["app:mqtt", "config_entry:c1", "device:d1", "entity:sensor.b"].sort().join(","));
  const html = el.monitorEditor();
  assert.match(html, /data-monitor-rule-toggle="1:min_value" checked/);
  assert.match(html, /data-monitor-pick="app:mqtt"/);
  assert.match(html, /vermutlich/);
});

test("home functions preview requests the backend evaluation without saving", async () => {
  let run, request;
  const { el } = panel("en", { setTimeout: fn => { run = fn; return 1; }, clearTimeout: () => {} });
  el.monitorForm = { name: "Test", description: "", notify: false, members: [{ object_key: "entity:sensor.b", required: true, rules: [{ kind: "freshness", value: 24 }] }] };
  el._hass.callWS = async msg => { request = msg; return { preview: { state: "problem", reason: "rule_stale", reason_key: "entity:sensor.b", members: [{ object_key: "entity:sensor.b", state: "problem", reason: "rule_stale" }] } }; };
  el.queueMonitorPreview();
  await run();
  assert.equal(request.type, "ha_housekeeper/monitor_preview");
  assert.equal(request.members[0].rules[0].value, 24);
  assert.match(el.monitorPreviewHtml(), /Not updated in time/);
});

test("home functions overview counts a known finding only once", () => {
  const { el } = panel("de");
  el.ensureSysLight = el.ensureGoals = el.ensurePolicies = () => {};
  el.staleScan = () => null;
  el.causeList = () => [];
  const problem = { id: "one", name: "Water", state: "problem", reason: "orphaned", reason_key: "entity:sensor.a", scanned_at: DATA.meta.scanned_at, incident_open: true };
  el.data = { ...DATA, monitor: [problem], quarantine: [] };
  assert.equal(el.todoItems().find(i => i.key === "monitor_problem").area, "findings");
  el.data = { ...DATA, monitor: [{ ...problem, reason_key: "entity:sensor.b" }], quarantine: [] };
  assert.equal(el.todoItems().find(i => i.key === "monitor_problem").area, "state");
});

test("shared list search keeps an accessible name after its placeholder disappears", () => {
  for (const lang of ["de", "en"]) {
    const { el } = panel(lang);
    el.lvState("findings", "name", "asc");
    const html = el.listBar("findings", { sorts: [] });
    assert.match(html, /<input type="search" data-lq="findings"[^>]+aria-label="[^"]+"/);
  }
});

test("paging brings the new list page into view and announces its position", () => {
  const { el, shadow } = panel("de");
  el.pageSize = 20;
  el.pages = { findings: 2 };
  assert.match(el.paginate("findings", Array.from({ length: 45 }, (_, i) => i)).footer, /data-lpage-footer="findings" data-page-count="3"/);
  const calls = [];
  const region = {
    setAttribute: (key, value) => calls.push([key, value]),
    scrollIntoView: opts => calls.push(["scroll", opts.block]),
    focus: opts => calls.push(["focus", opts.preventScroll]),
  };
  const footer = { dataset: { lpageFooter: "findings", pageCount: "3" }, closest: () => region };
  shadow.querySelectorAll = () => [footer];
  el.focusListPage("findings");
  assert.deepEqual(calls, [["tabindex", "-1"], ["aria-label", "Seite 2 von 3"], ["scroll", "start"], ["focus", true]]);
});

test("modal focus stays in the top dialog and the page behind it is inert", () => {
  const { el } = panel();
  const focused = [];
  const control = name => ({
    name, focus: () => { root.activeElement = controls[name]; focused.push(name); },
    closest: () => null, getClientRects: () => [1],
  });
  const controls = { no: control("no"), yes: control("yes") };
  const dialog = { setAttribute() {}, focus() {} };
  const handlers = {};
  const top = {
    dataset: { confirmModal: "" },
    querySelector: () => dialog,
    querySelectorAll: () => [controls.no, controls.yes],
    contains: item => item === controls.no || item === controls.yes,
    addEventListener: (name, fn) => { handlers[name] = fn; },
  };
  const lower = { dataset: { noteModal: "" }, inert: false };
  const background = { inert: false };
  const root = {
    activeElement: controls.no,
    querySelectorAll: () => [lower, top],
    querySelector: () => background,
  };
  assert.equal(el.modalKey(top), "confirmModal");
  el.bindModalFocus(root);
  assert.equal(background.inert, true);
  assert.equal(lower.inert, true);
  const key = (shiftKey, target) => {
    root.activeElement = target;
    let prevented = false;
    handlers.keydown({ key: "Tab", shiftKey, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  assert.equal(key(true, controls.no), true);
  assert.equal(key(false, controls.yes), true);
  assert.deepEqual(focused, ["yes", "no"]);
});

test("closing a confirmation dialog restores focus to its opener", () => {
  const { el, shadow } = panel();
  const opener = { selector: '[data-plan-delete="p1"]', start: null, end: null };
  const cancel = { selector: "[data-confirm-no]", start: null, end: null };
  const modal = { dataset: { confirmModal: "" } };
  let shown = false, focused = opener;
  const restored = [];
  Object.defineProperty(shadow, "innerHTML", { configurable: true, set: html => { shown = html.includes("data-confirm-modal"); }, get: () => "" });
  shadow.querySelectorAll = () => shown ? [modal] : [];
  shadow.querySelector = () => null;
  el.captureFocus = () => focused;
  el.restoreFocus = saved => { if (saved) restored.push(saved.selector); };
  el.bind = () => { if (shown) focused = cancel; };
  el.bindModalFocus = () => {};
  el.fitNav = () => {};
  el.syncGuard = () => {};
  el.syncUrl = () => {};
  el.confirmAsk("Run?", () => {});
  assert.equal(el._modalReturnFocus.get("confirmModal"), opener);
  el.confirmClose();
  assert.equal(restored.at(-1), opener.selector);
  assert.equal(el._modalReturnFocus.size, 0);
});

test("every view renders without throwing and escapes object names", () => {
  const { el, shadow } = panel("de");
  for (const view of ["overview", "inventory", "findingsNav", "graph"]) {
    el.view = view;
    el.render();
    assert.ok(shadow.innerHTML.length > 100, view);
    assert.ok(!shadow.innerHTML.includes("<img src=x"), `${view} leaks unescaped name`);
  }
});

test("detail page renders for an orphaned entity and escapes the name", () => {
  const { el, shadow } = panel();
  el.selected = DATA.objects[0];
  el.render();
  assert.ok(shadow.innerHTML.includes("&lt;img src=x"));
  assert.ok(!shadow.innerHTML.includes("<img src=x"));
  assert.ok(shadow.innerHTML.includes('data-action="back"'));
});

test("inventory lists an automation, script or scene once, not also as its entity", () => {
  const { el } = panel();
  const pair = (type, id) => [{ object_type: "entity", object_id: id, name: id, status: "active" }, { object_type: type, object_id: id, name: id, status: "active" }];
  el.data = { ...DATA, objects: [...DATA.objects, ...pair("automation", "automation.a"), ...pair("script", "script.s"), ...pair("scene", "scene.c")] };
  const ids = el.filtered().map(o => `${o.object_type}:${o.object_id}`);
  for (const id of ["automation.a", "script.s", "scene.c"]) assert.equal(ids.filter(k => k.endsWith(`:${id}`)).length, 1);
  assert.ok(!ids.includes("entity:automation.a"));
  el.typeFilter = "automation";
  assert.match(el.inventory(), /data-inv-sel="automation\.a"/);
  el.data.objects.find(o => o.object_type === "automation").entity_status = "orphaned";
  el.data.objects.find(o => o.object_type === "automation").entity_reason = "entity_disabled";
  el._memo = null;
  assert.match(el.inventory(), /Entity was disabled/);
});

test("inventory header selects and clears only the entities on the current page", () => {
  const { el } = panel();
  el.typeFilter = "entity";
  assert.match(el.inventory(), /data-inv-sel-page/);
  el.typeFilter = "config_entry";
  assert.doesNotMatch(el.inventory(), /data-inv-sel-page/);
  el._invPage = ["sensor.a", "sensor.b"];
  el.invSel = new Set(["sensor.a", "sensor.other"]);
  assert.match(el.invHeadBox(), /data-partial/);
  const box = { checked: true, hasAttribute: name => name === "data-partial" };
  const root = { querySelector: selector => selector === "[data-inv-sel-page]" ? box : null, querySelectorAll: () => [] };
  el.render = () => {};
  el.bindInvSel(root);
  assert.equal(box.indeterminate, true);
  box.onchange();
  assert.deepEqual([...el.invSel].sort(), ["sensor.a", "sensor.b", "sensor.other"]);
  assert.match(el.invHeadBox(), /checked/);
  box.checked = false;
  box.onchange();
  assert.deepEqual([...el.invSel], ["sensor.other"]);
  el._invPage = [];
  assert.equal(el.invHeadBox(), "");
});

test("navigation keeps a trail and goes back", () => {
  const { el } = panel();
  el.selected = DATA.objects[0];
  el.trail = [];
  el.openObject(DATA.objects[1]);
  assert.equal(el.trail.length, 1);
  el.goBack();
  assert.equal(el.selected, DATA.objects[0]);
  el.goBack();
  assert.equal(el.selected, null);
});

function diagnoseWith(extra, entityOverrides) {
  const { el } = panel();
  el.data = { ...DATA, objects: [...DATA.objects, ...extra] };
  const entity = { object_type: "entity", object_id: "light.x", name: "X", status: "unavailable", reason: "state_unavailable",
    state: "unavailable", config_entry_id: "e1", device_id: "d1", ...entityOverrides };
  return el.diagnose(entity);
}
const ENTRY = { object_type: "config_entry", object_id: "e1", name: "Hue", status: "active", state: "loaded" };
const DEVICE = { object_type: "device", object_id: "d1", name: "Lampe", status: "active" };

test("unavailable with healthy integration and device blames reachability", () => {
  const d = diagnoseWith([ENTRY, DEVICE], {});
  assert.deepEqual(Array.from(d.rows.map(r => r.tone)), ["ok", "ok", "red"]);
  assert.ok(d.cause.includes("nicht erreichbar") || d.cause.includes("unreachable"));
  assert.ok(d.hint);
});

test("diagnosis rows link the integration, the device and the working twin", () => {
  const d = diagnoseWith([ENTRY, DEVICE], { duplicate_of: "light.x_ok" });
  assert.deepEqual(Array.from(d.rows.map(r => r.link)), ["config_entry:e1", "device:d1", null, "entity:light.x_ok"]);
});

test("the detail summary links the integration, device and area of an entity", () => {
  const { el } = panel();
  el.data = { ...DATA, objects: [...DATA.objects, ENTRY, { ...DEVICE, area_id: "a1" }, { object_type: "area", object_id: "a1", name: "Keller" }], findings: [] };
  const html = el.detailSummary({ object_type: "entity", object_id: "light.x", platform: "hue", config_entry_id: "e1", device_id: "d1" }, "entity:light.x").map(r => r[1]).join("");
  assert.ok(['data-object="config_entry:e1"', 'data-object="device:d1"', 'data-object="area:a1"'].every(s => html.includes(s)));
});

test("the detail summary links an automation and its entity to each other", () => {
  const { el } = panel();
  const entity = { object_type: "entity", object_id: "automation.a", name: "A", status: "active" }, auto = { object_type: "automation", object_id: "automation.a", name: "A", status: "active" };
  el.data = { ...DATA, objects: [...DATA.objects, entity, auto], findings: [] };
  const rows = item => el.detailSummary(item, `${item.object_type}:${item.object_id}`).map(r => r[1]).join("");
  assert.ok(rows(auto).includes('data-object="entity:automation.a"'));
  assert.ok(rows(entity).includes('data-object="automation:automation.a"'));
});

test("unavailable with a failed integration blames the integration", () => {
  const d = diagnoseWith([{ ...ENTRY, state: "setup_error", status: "problem" }, DEVICE], {});
  assert.equal(d.rows[0].tone, "red");
  assert.ok(d.cause.includes("unavailable") || d.cause.includes("not loaded") || d.cause.includes("nicht geladen"));
  assert.ok(!d.cause.includes("nicht erreichbar"));
});

test("missing device and disabled entity are explained without alarm", () => {
  assert.equal(diagnoseWith([ENTRY], { reason: "device_missing", status: "orphaned", state: null }).rows[1].tone, "red");
  const off = diagnoseWith([ENTRY, DEVICE], { reason: "entity_disabled", status: "disabled", state: null, disabled_by: "user" });
  assert.ok(off.rows.every(r => r.tone !== "red"));
});

test("automation diagnosis lists missing references", () => {
  const { el } = panel();
  const d = el.diagnose(DATA.objects[2]);
  assert.equal(d.tone, "red");
  assert.equal(d.rows[0].tone, "red");
  assert.ok(d.rows[0].value.includes("actions[0]"));
});

test("haPath builds Home Assistant paths", () => {
  const { el } = panel();
  assert.equal(el.haPath({ object_type: "entity", object_id: "sensor.a b" }), "/config/entities?search=sensor.a%20b");
  assert.equal(el.haPath({ object_type: "entity", object_id: "sensor.a", device_id: "d9" }), "/config/devices/device/d9");
  assert.equal(el.haPath({ object_type: "automation", object_id: "automation.c", automation_id: "123" }), "/config/automation/edit/123");
  assert.equal(el.haPath({ object_type: "automation", object_id: "automation.c" }), "/config/entities?search=automation.c");
  assert.equal(el.haPath({ object_type: "device", object_id: "d1" }), "/config/devices/device/d1");
  assert.equal(el.haPath({ object_type: "config_entry", domain: "hue" }), "/config/integrations/integration/hue");
  assert.equal(el.haPath({ object_type: "unknown" }), null);
});

test("filtered applies query, type and status", () => {
  const { el } = panel();
  el.query = "sensor.b";
  assert.equal(JSON.stringify(el.filtered().map(o => o.object_id)), JSON.stringify(["sensor.b"]));
  el.query = "";
  el.typeFilter = "automation";
  assert.deepEqual(el.filtered().map(o => o.object_id), ["automation.c"]);
  el.typeFilter = "";
  el.statusFilter = "orphaned";
  assert.deepEqual(el.filtered().map(o => o.object_id), ["sensor.a"]);
});

test("findings are sorted by confidence", () => {
  const { el } = panel();
  assert.deepEqual(Array.from(el.sortedFindings().map(f => f.object_id)), ["automation.c", "sensor.a"]);
});

test("CSV export neutralises formulas and respects the filter", () => {
  const { el, downloads } = panel();
  el.exportFindings("csv");
  const csv = downloads[0].text;
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), csv);
  assert.deepEqual(["-3.5", -2, "+1e3", "-x"].map(loadPanel().csvCell), ['"-3.5"', '"-2"', '"+1e3"', `"'-x"`]); // numbers stay numbers
  assert.equal(csv.split("\r\n").length, 3);

  el.findingFilter = "nothing";
  el.exportFindings("csv");
  assert.equal(downloads[1].text.split("\r\n").length, 1);
});

test("JSON export carries scan time and rows", () => {
  const { el, downloads } = panel();
  el.exportFindings("json");
  const parsed = JSON.parse(downloads[0].text);
  assert.equal(parsed.scanned_at, DATA.meta.scanned_at);
  assert.equal(parsed.findings.length, 2);
  assert.equal(parsed.findings[0].rule_id, "automation.missing_entity");
});

function impactWith(edges, item, key) {
  const { el } = panel();
  el.data = { ...DATA, edges };
  return el.impact(item, key);
}
const E = (source, target, relation, confidence = "certain", location = "actions[0]") => ({ source, target, relation, confidence, location });

test("impact is safe when no automation uses the object", () => {
  const m = impactWith([], DATA.objects[1], "entity:sensor.b");
  assert.equal(m.tone, "ok");
  assert.equal(m.hits.length, 0);
});

test("impact flags certain references and ranks them first", () => {
  const edges = [
    E("automation:automation.p", "entity:sensor.b", "REFERENCES", "probable", "runtime_extraction"),
    E("automation:automation.c", "entity:sensor.b", "TRIGGERS_ON"),
  ];
  const m = impactWith(edges, DATA.objects[1], "entity:sensor.b");
  assert.equal(m.tone, "red");
  assert.equal(m.certain, 1);
  assert.equal(m.hits[0].key, "automation:automation.c");
});

test("impact of a device includes its entities, probable-only is a warning", () => {
  const edges = [
    E("device:d1", "entity:sensor.b", "PROVIDES"),
    E("automation:automation.c", "entity:sensor.b", "REFERENCES", "probable", "runtime_extraction"),
  ];
  const m = impactWith(edges, { object_type: "device", object_id: "d1" }, "device:d1");
  assert.equal(m.related, 1);
  assert.equal(m.tone, "warn");
  assert.equal(m.probable, 1);
});

test("impact card is skipped for automations and shows the verdict", () => {
  const { el } = panel();
  assert.equal(el.impactCard(DATA.objects[2], "automation:automation.c"), "");
  assert.ok(el.impactCard(DATA.objects[1], "entity:sensor.b").includes("No known usage"));
});

test("scripts and scenes get paths, diagnosis, finding keys and impact sources", () => {
  const { el } = panel();
  assert.equal(el.haPath({ object_type: "script", object_id: "script.tidy" }), "/config/script/edit/tidy");
  assert.equal(el.haPath({ object_type: "scene", object_id: "scene.a", scene_id: "42" }), "/config/scene/edit/42");
  assert.equal(el.haPath({ object_type: "scene", object_id: "scene.a", device_id: "d9" }), "/config/devices/device/d9");
  assert.equal(el.haPath({ object_type: "scene", object_id: "scene.a" }), "/config/entities?search=scene.a");
  assert.equal(el.findingKey({ rule_id: "script.missing_entity", object_id: "script.tidy" }), "script:script.tidy");

  const script = { object_type: "script", object_id: "script.tidy", name: "Tidy", status: "active" };
  el.data = { ...DATA, objects: [...DATA.objects, script], findings: [
    { rule_id: "script.missing_entity", object_id: "script.tidy", classification: "broken_reference", confidence: 0.98, affected_object: "light.gone", evidence: [{ location: "sequence/1/target/entity_id" }] },
  ] };
  const d = el.diagnose(script);
  assert.equal(d.tone, "red");
  assert.ok(d.rows[0].value.includes("light.gone"));

  el.data.edges = [E("script:script.tidy", "entity:sensor.b", "TARGETS"), E("scene:scene.a", "entity:sensor.b", "TARGETS")];
  const m = el.impact(DATA.objects[1], "entity:sensor.b");
  assert.equal(m.certain, 2);
  assert.equal(el.impact(script, "script:script.tidy"), null);
  el.selected = script;
  el.render();
});

test("dashboards get paths, diagnosis and count as usage in impact", () => {
  const { el } = panel();
  assert.equal(el.haPath({ object_type: "dashboard", object_id: "dash-living", url_path: "dash-living" }), "/dash-living");
  assert.equal(el.haPath({ object_type: "dashboard", object_id: "lovelace", url_path: null }), "/lovelace");
  el.data = { ...DATA, edges: [E("dashboard:dash-living", "entity:sensor.b", "SHOWS")] };
  const m = el.impact(DATA.objects[1], "entity:sensor.b");
  assert.equal(m.certain, 1);
  assert.equal(el.impact({ object_type: "dashboard", object_id: "x" }, "dashboard:x"), null);
  assert.ok(el.t("SHOWS") !== "SHOWS");
});

const COMPARE = {
  available: true, baseline: "previous", baselines: [{ id: "previous", at: "2026-10-06T10:00:00+00:00" }, { id: "2026-10-05T20:00:00+00:00", at: "2026-10-05T20:00:00+00:00" }],
  baseline_at: "2026-10-06T10:00:00+00:00", scanned_at: "2026-10-07T10:00:00+00:00",
  status_changes: { total: 2, items: [
    { object_type: "entity", object_id: "sensor.b", name: "B", from: "unavailable", to: "active" },
    { object_type: "entity", object_id: "sensor.a", name: "<b>A</b>", from: "active", to: "unavailable" },
  ] },
  new_findings: { total: 1, items: [DATA.findings[0]] },
  resolved_findings: { total: 1, items: [{ rule_id: "entity.state_missing", object_id: "sensor.gone", affected_object: null }] },
  new_objects: { total: 0, items: [] },
  removed_objects: { total: 1, items: [{ object_type: "entity", object_id: "sensor.gone" }] },
};

test("changes view lists worsened changes first and escapes names", () => {
  const { el, shadow } = panel("de");
  el.view = "changes";
  el.compare = COMPARE;
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("&lt;b&gt;A&lt;/b&gt;") && !html.includes("<b>A</b>"));
  assert.ok(html.indexOf("&lt;b&gt;A") < html.indexOf(">B<"), "worsened change must come first");
  assert.ok(html.includes('id="baseline"'));
  assert.ok(html.includes("Neue Befunde") && html.includes("Entfernte Objekte"));
});

test("loadCompare asks the backend with the selected baseline", async () => {
  const { el } = panel();
  const calls = [];
  el._hass.callWS = async msg => { calls.push(msg); return COMPARE; };
  el.view = "changes"; // the overview would fetch its own comparison
  el.compareBaseline = "2026-10-05T20:00:00+00:00";
  await el.loadCompare();
  assert.equal(JSON.stringify(calls), JSON.stringify([{ type: "ha_housekeeper/compare", baseline: "2026-10-05T20:00:00+00:00" }]));
  assert.equal(el.compare, COMPARE);
});

test("the status counts affected objects once, only of the base types, and not hidden findings", () => {
  const { el } = panel("en");
  const entity = id => ({ object_type: "entity", object_id: id, name: id, status: "orphaned" });
  const objects = [...Array.from({ length: 8 }, (_, i) => entity(`sensor.s${i}`)), { object_type: "dashboard", object_id: "dash", name: "d", status: "active" }];
  const finding = (rule, id, extra = {}) => ({ rule_id: rule, object_id: id, classification: "orphaned", confidence: 0.9, evidence: [], impact: "medium", ...extra });
  const base = { ...DATA, objects };
  el.data = { ...base, findings: [finding("entity.state_missing", "sensor.s0"), finding("entity.duplicate", "sensor.s0"), finding("entity.unavailable", "sensor.s0")] };
  assert.deepEqual([el.health().affected, el.health().base, el.health().percent, el.health().load], [1, 8, 87.5, 1]); // one object counts once, with its worst level: medium takes off one
  el.data = { ...base, findings: [finding("entity.state_missing", "sensor.s0"), finding("entity.state_missing", "sensor.s1", { ignored: true })] };
  assert.equal(el.health().affected, 1); // hidden findings do not count
  el.data = { ...base, findings: [finding("dashboard.missing_entity", "dash")] };
  assert.equal(el.health().affected, 0); // other object types are listed but not part of the ring
  el.data = { ...DATA, objects: [], findings: [finding("entity.state_missing", "sensor.s0")] };
  assert.equal(el.health().percent, 100); // no rated object, nothing to take off
  const many = Array.from({ length: 1000 }, (_, i) => entity(`sensor.m${i}`));
  el.data = { ...DATA, objects: many, findings: [finding("entity.state_missing", "sensor.m0")] };
  assert.equal(el.health().percent, 99.9, "one object takes its weight off the number of all objects");
  el.dbHealth = { available: true, findings: [{ level: "problem", kind: "gaps" }] };
  assert.equal(el.health().percent, 99.9, "the database check only runs in Maintenance, so it never moves the number");
  assert.ok(el.t("healthTip", { affected: 2, base: 8 }).includes("2") && el.t("healthHint").includes("points out of 100"));
  el.data = { ...base, causes: [], findings: [finding("entity.state_missing", "sensor.s0"), finding("entity.state_missing", "sensor.s1", { cause_id: "device:x" }), finding("entity.state_missing", "sensor.s2", { cause_id: "device:x" })] };
  assert.deepEqual([el.health().affected, el.health().base, el.health().load], [3, 8, 3], "the follow-ups of a cause count like any other object, with their own level");
});

test("hidden findings are excluded from counts, lists and export unless shown", () => {
  const { el, downloads } = panel("en");
  const findings = [{ ...DATA.findings[0], key: "k1", ignored: true, ignored_by: "user" }, { ...DATA.findings[1], key: "k2", ignored: false }];
  el.data = { ...DATA, findings };
  assert.equal(el.sortedFindings().length, 1);
  assert.equal(el.sortedFindings(true).length, 2);
  assert.equal(el.health().percent, 100, "findings without an impact take nothing off");
  el.exportFindings("json");
  assert.equal(JSON.parse(downloads[0].text).findings.length, 1);
  el.findingStatus = "all";
  el.exportFindings("json");
  assert.equal(JSON.parse(downloads[1].text).findings.length, 2);
  el.view = "findingsNav";
  el.render();
  assert.ok(el.shadowRoot.innerHTML.includes("Hidden (1)"));
});

test("detail page offers to hide and show findings, but not label-hidden ones", () => {
  const { el } = panel("en");
  el.data = { ...DATA, findings: [
    { ...DATA.findings[0], key: "k1", ignored: false },
    { rule_id: "entity.state_unavailable", object_id: "sensor.a", classification: "unavailable", confidence: 0.75, key: "k3", ignored: true, ignored_by: "label" },
  ] };
  const html = el.actionsCard(el.findObject("entity:sensor.a"), "entity:sensor.a");
  assert.ok(html.includes('data-decide-open="k1"'));
  assert.ok(!html.includes('data-ignore="k3"') && !html.includes('data-decide-open="k3"'));
  assert.ok(html.includes("housekeeper_ignore"));
});

test("battery view lists the lowest levels first and counts low ones", () => {
  const { el, shadow } = panel("en");
  const battery = (id, state, extra = {}) => ({ object_type: "entity", object_id: id, name: id, status: "active", device_class: "battery", state, unit: "%", ...extra });
  el.data = { ...DATA, meta: { ...DATA.meta, low_battery_percent: 20 }, objects: [
    battery("sensor.full", "95"), battery("sensor.low", "8"), battery("sensor.edge", "20"),
    battery("binary_sensor.flag", "on"), battery("binary_sensor.fine", "off"), battery("sensor.nan", "unknown"),
    battery("sensor.gone", "3", { status: "unavailable" }), { ...battery("sensor.temp", "1"), device_class: "temperature" },
  ] };
  assert.equal(el.lowBatteries().length, 3);
  assert.equal(JSON.stringify(Array.from(el.batteryRows().map(r => r.item.object_id))), JSON.stringify(["binary_sensor.flag", "sensor.low", "sensor.edge", "binary_sensor.fine", "sensor.full"]));
  assert.equal(el.batteryFilter, "all", "the table opens with every battery");
  el.batteryFilter = "low";
  el.view = "batteries";
  el.render();
  assert.ok(shadow.innerHTML.includes("sumvalue\">3<") && shadow.innerHTML.includes("sumvalue\">5<"));
  assert.ok(!shadow.innerHTML.includes("sensor.full"));
  el.batteryFilter = "all";
  el.render();
  assert.ok(shadow.innerHTML.includes("sensor.full"));
});

test("deep links select view, filter and object once", () => {
  const replaced = [];
  const window = { location: { search: "?view=findingsNav&filter=orphaned", pathname: "/ha-housekeeper" }, history: { replaceState: (_s, _t, url) => replaced.push(url) } };
  const { el } = panel("en", { window });
  el.isConnected = true;
  el._basePath = "/ha-housekeeper";
  el.applyUrl();
  assert.equal(el.view, "findingsNav");
  assert.equal(el.findingFilter, "orphaned");
  el.view = "overview";
  el.applyUrl();
  assert.equal(el.view, "overview", "applied only once");

  window.location.search = "?object=entity:sensor.b";
  const second = panel("en", { window });
  second.el.applyUrl();
  assert.equal(second.el.selected, DATA.objects[1]);

  el.view = "inventory";
  el.render();
  assert.equal(replaced.at(-1), "/ha-housekeeper?view=inventory");
  el.view = "overview";
  el.render();
  assert.equal(replaced.at(-1), "/ha-housekeeper");
  el._basePath = "/somewhere-else";
  const before = replaced.length;
  el.render();
  assert.equal(replaced.length, before, "never rewrites another page's URL");
});

test("unreferenced view lists active entities no source uses", () => {
  const { el, shadow } = panel("en");
  const ent = (id, extra = {}) => ({ object_type: "entity", object_id: id, name: id, status: "active", ...extra });
  el.data = { ...DATA, objects: [
    ent("light.used"), ent("light.lonely"), ent("sensor.lonely_sensor"), ent("sensor.diag", { entity_category: "diagnostic" }),
    ent("sensor.gone", { status: "unavailable" }), ent("automation.a"), ent("switch.in_group"),
  ], edges: [
    { source: "automation:automation.a", target: "entity:light.used", relation: "TARGETS" },
    { source: "entity:group.all", target: "entity:switch.in_group", relation: "INCLUDES" },
    { source: "device:d", target: "entity:sensor.lonely_sensor", relation: "PROVIDES" },
  ] };
  assert.equal(JSON.stringify(Array.from(el.unreferencedRows().map(o => o.object_id))), JSON.stringify(["light.lonely", "sensor.lonely_sensor"]));
  el.view = "unreferenced";
  el.render();
  assert.ok(shadow.innerHTML.includes("light.lonely") && !shadow.innerHTML.includes("light.used"));
  assert.ok(shadow.innerHTML.includes("hint only"));
  el.lv.unreferenced.f.domain = "light";
  el.render();
  assert.ok(shadow.innerHTML.includes("light.lonely") && !shadow.innerHTML.includes("sensor.lonely_sensor"));
});

test("long lists are paged with a default of 20 and a page-size choice", () => {
  const { el, shadow } = panel("en");
  const ent = i => ({ object_type: "entity", object_id: `light.l${String(i).padStart(2, "0")}`, name: `Lamp ${String(i).padStart(2, "0")}`, status: "active" });
  el.data = { ...DATA, objects: Array.from({ length: 45 }, (_, i) => ent(i)), edges: [] };
  el.view = "unreferenced";
  assert.equal(el.pageSize, 20);
  el.render();
  assert.equal((shadow.innerHTML.match(/data-object="entity:light\.l/g) || []).length, 20);
  assert.ok(shadow.innerHTML.includes("1–20 of 45") && shadow.innerHTML.includes("Page 1 of 3"));
  el.pages.unreferenced = 3;
  el.render();
  assert.equal((shadow.innerHTML.match(/data-object="entity:light\.l/g) || []).length, 5);
  assert.ok(shadow.innerHTML.includes("41–45 of 45"));
  el.pageSize = 50;
  el.pages = {};
  el.render();
  assert.equal((shadow.innerHTML.match(/data-object="entity:light\.l/g) || []).length, 45);
  assert.ok(!shadow.innerHTML.includes("Page 1 of"));
});

test("findings can be searched, filtered by type, and sorted; export follows", () => {
  const { el, shadow } = panel("en");
  const f = (rule, id, conf, since) => ({ rule_id: rule, classification: "orphaned", object_id: id, confidence: conf, first_detected_at: since, ignored: false });
  el.data = { ...DATA, objects: [
    { object_type: "entity", object_id: "sensor.b", name: "Bravo", status: "orphaned" },
    { object_type: "entity", object_id: "sensor.a", name: "Alpha", status: "orphaned" },
    { object_type: "automation", object_id: "automation.c", name: "Charlie", status: "active" },
  ], edges: [], findings: [f("entity.x", "sensor.b", 0.9, "2026-01-02T00:00:00+00:00"), f("entity.x", "sensor.a", 0.8, null), f("automation.missing", "automation.c", 0.7, "2026-01-05T00:00:00+00:00")] };
  const ids = () => Array.from(el.visibleFindings().map(x => x.object_id)).join(",");
  el.view = "findingsNav";
  el.render();
  assert.equal(ids(), "sensor.b,sensor.a,automation.c");
  el.lv.findings.sort = "name"; el.lv.findings.dir = "asc";
  assert.equal(ids(), "sensor.a,sensor.b,automation.c");
  el.lv.findings.dir = "desc";
  assert.equal(ids(), "automation.c,sensor.b,sensor.a");
  el.lv.findings.sort = "since"; el.lv.findings.dir = "desc";
  assert.equal(ids(), "automation.c,sensor.b,sensor.a"); // missing date stays last
  el.lv.findings.dir = "asc";
  assert.equal(ids(), "sensor.b,automation.c,sensor.a");
  el.lv.findings.f.type = "entity";
  assert.equal(ids(), "sensor.b,sensor.a");
  el.lv.findings.q = "alpha";
  assert.equal(ids(), "sensor.a");
  assert.equal(el.exportRows().length, 1);
  el.render();
  assert.ok(shadow.innerHTML.includes('data-lq="findings"') && shadow.innerHTML.includes("data-ld=\"findings\""));
  el.lv.findings.q = "zzz";
  el.render();
  assert.ok(shadow.innerHTML.includes("No matches"));
});

test("findings render as a sortable table and compact rows change its layout", () => {
  const storage = fakeStorage();
  const { el } = panel("en", { localStorage: storage });
  el.data = { ...DATA, causes: [], findings: DATA.findings.map((f, i) => ({ ...f, key: `finding-${i}`, impact: i ? "low" : "high" })) };
  let html = el.findingsView();
  assert.match(html, /class="tablewrap lt findings-table"/);
  assert.match(html, /<th scope="col" aria-sort="descending"><button type="button" class="thbtn" data-lsort="findings\|impact\|desc"/);
  assert.match(html, /data-lsort="findings\|id\|asc"/);
  assert.match(html, /data-dense="findings" aria-pressed="false"/);
  assert.match(html, /<span class="listbar-actions">/);
  assert.match(html, /<td data-label="Severity">/);
  assert.equal((html.match(/class="finding-data/g) || []).length, 2);
  el.render = () => {};
  el.toggleDenseList("findings");
  html = el.findingsView();
  assert.match(html, /class="tablewrap lt findings-table dense-list"/);
  assert.equal(JSON.parse(storage.getItem("ha_housekeeper.dense_lists")).findings, true);
});

test("cause and dashboard groups use the findings table columns in both densities", () => {
  const { el } = panel("en");
  const cause = { id: "outage-z", kind: "integration_down", object_type: "config_entry", object_id: "z", name: "Cloud", follower_count: 1, total_followers: 1, child_ids: [], consumers: {}, impact: "high" };
  const follower = { key: "follower", rule_id: "entity.state_unavailable", object_id: "sensor.b", classification: "unavailable", confidence: 0.9, impact: "medium", cause_id: cause.id, ignored: false };
  el.data = { ...DATA, objects: [...DATA.objects, { object_type: "config_entry", object_id: "z", name: "Cloud" }], causes: [cause], findings: [follower] };
  let html = el.findingsView();
  assert.match(html, /class="finding-data finding-cause og lvl0"/);
  assert.match(html, /data-fold="og:config_entry:z"/);
  assert.match(html, /<button[^>]*class="finding-fold"[^>]*data-fold="og:config_entry:z"[^>]*><ha-icon[^>]*><\/ha-icon><\/button><button[^>]*class="finding-link"[^>]*data-object="config_entry:z"/, "the arrow folds while the cause name opens its details");
  assert.doesNotMatch(html, /class="finding-group"/);
  el.folds = { "og:config_entry:z": true };
  el.denseLists().findings = true;
  html = el.findingsView();
  assert.match(html, /class="tablewrap lt findings-table dense-list"/);
  assert.match(html, /class="finding-data finding-cause og lvl1"/, "the object below the cause is indented");
  const place = { view: "Archive", card: "Card", card_path: "views/0/cards/0", card_refs: 3, card_missing: 2 };
  const broken = i => ({ key: `broken-${i}`, rule_id: "dashboard.missing_entity", object_id: "dash", classification: "broken_reference", confidence: 0.9, impact: "low", affected_object: `sensor.${i}`, evidence: [{ location: `views/0/cards/0/${i}`, place }] });
  el.data = { ...DATA, objects: [...DATA.objects, { object_type: "dashboard", object_id: "dash", name: "Dash" }], causes: [], findings: [broken(1), broken(2)] };
  el.folds = { "og:dashboard:dash": true };
  html = el.findingsView();
  assert.match(html, /<button[^>]*class="finding-fold"[^>]*data-fold="og:dashboard:dash"[^>]*><ha-icon[^>]*><\/ha-icon><\/button><button[^>]*class="finding-link"[^>]*data-object="dashboard:dash"/, "the dashboard is the head");
  assert.match(html, /data-fsel-group="bg:dash\|views\/0\/cards\/0"/, "a card with several references is a head below it");
});

test("grouped causes and single findings obey the same table sort", () => {
  const { el } = panel("en");
  const cause = { id: "outage-z", kind: "integration_down", object_type: "config_entry", object_id: "z", name: "Zulu", follower_count: 1, total_followers: 1, child_ids: [], consumers: {}, impact: "high" };
  const single = { key: "single", rule_id: "entity.state_missing", object_id: "sensor.a", classification: "orphaned", confidence: 0.8, impact: "low", ignored: false };
  const follower = { ...single, key: "follower", object_id: "sensor.z", cause_id: cause.id };
  el.data = { ...DATA, causes: [cause], findings: [single, follower] };
  el.lvState("findings", "impact", "desc");
  el.lv.findings.sort = "name"; el.lv.findings.dir = "asc";
  let html = el.findingsView();
  assert.ok(html.indexOf('data-fold="og:entity:sensor.a"') < html.indexOf("Integration Zulu is not loaded"));
  el.lv.findings.dir = "desc";
  html = el.findingsView();
  assert.ok(html.indexOf("Integration Zulu is not loaded") < html.indexOf('data-fold="og:entity:sensor.a"'));
});

test("batteries and unreferenced lists filter by area and sort", () => {
  const { el } = panel("en");
  const ent = (id, name, area, extra = {}) => ({ object_type: "entity", object_id: id, name, area_id: area, status: "active", device_class: "battery", state: "50", unit: "%", ...extra });
  el.data = { ...DATA, objects: [
    { object_type: "area", object_id: "kitchen", name: "Kitchen" }, { object_type: "area", object_id: "hall", name: "Hall" },
    ent("sensor.a", "Zeta", "kitchen", { state: "40" }), ent("sensor.b", "Alpha", "hall", { state: "90" }), ent("sensor.c", "Mid", "kitchen", { state: "10" }),
  ], edges: [] };
  el.view = "batteries"; el.batteryFilter = "all"; el.render();
  const read = () => { el.render(); return el.shadowRoot.innerHTML.match(/<strong class="cut">(Zeta|Alpha|Mid)<\/strong>/g).map(m => m.replace(/<[^>]+>/g, "")).join(","); };
  assert.equal(read(), "Mid,Zeta,Alpha"); // lowest level first
  el.lv.batteries.dir = "desc";
  assert.equal(read(), "Alpha,Zeta,Mid");
  el.lv.batteries.sort = "name"; el.lv.batteries.dir = "asc";
  assert.equal(read(), "Alpha,Mid,Zeta");
  el.lv.batteries.f.area = "Kitchen";
  assert.equal(read(), "Mid,Zeta");
  el.lv.batteries.q = "zet";
  assert.equal(read(), "Zeta");
});

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return { store, getItem: key => (key in store ? store[key] : null), setItem: (key, value) => { store[key] = String(value); } };
}

test("compact rows belong to each eligible table and keep their own browser state", () => {
  const storage = fakeStorage();
  const { el } = panel("en", { localStorage: storage });
  const columns = [{ key: "name", label: "utName", cell: item => el.nameCell(item.name, item.id) }];
  const rows = [{ name: "Sensor", id: "sensor.a" }];
  for (const id of ["unreferenced", "batteries", "runs", "orphanstats"]) el.lvState(id, "name", "asc");
  const bar = id => el.listBar(id, { sorts: [], dense: true });
  assert.match(bar("unreferenced"), /data-dense="unreferenced" aria-pressed="false"/);
  assert.match(bar("orphanstats"), /data-dense="orphanstats"/, "every table offers compact rows");
  el.render = () => {};
  el.toggleDenseList("unreferenced");
  assert.match(bar("unreferenced"), /data-dense="unreferenced" aria-pressed="true"/);
  assert.match(el.listTable("unreferenced", columns, rows), /class="tablewrap lt dense-list"/);
  assert.doesNotMatch(el.listTable("batteries", columns, rows), /dense-list/);
  assert.doesNotMatch(el.listTable("orphanstats", columns, rows), /dense-list/);
  el.toggleDenseList("batteries");
  assert.equal(JSON.parse(storage.getItem("ha_housekeeper.dense_lists")).runs, undefined, "only lists that are on are kept");
  const { el: reopened } = panel("en", { localStorage: storage });
  assert.equal(reopened.isDenseList("unreferenced"), true);
  assert.equal(reopened.isDenseList("batteries"), true);
  assert.equal(reopened.isDenseList("runs"), false);
  assert.equal(reopened.isDenseList("orphanstats"), false);
  const legacy = panel("en", { localStorage: fakeStorage({ "ha_housekeeper.dense": "1" }) }).el;
  assert.equal(legacy.isDenseList("unreferenced"), true);
  assert.equal(legacy.isDenseList("runs"), true);
  assert.equal(legacy.isDenseList("findings"), false);
  assert.equal(legacy.isDenseList("orphanstats"), false);
});

test("settings are available before data has loaded", () => {
  const { el, shadow } = panel("de");
  el.data = null;
  el.view = "settings";
  el.settingsTab = "look";
  el.render();
  assert.ok(shadow.innerHTML.includes("Schriftgröße") && shadow.innerHTML.includes("Farbschema"));
});

test("display preferences are saved, validated, and turned into theme CSS", () => {
  const storage = fakeStorage();
  const { el } = panel("en", { localStorage: storage });
  assert.equal(el.prefs.size, "normal");
  assert.ok(el.themeCss().includes("--hk-fs:1.1;") && !el.themeCss().includes("--hk-surface")); // standard + automatic follows Home Assistant
  el.setPref("size", "large");
  el.setPref("mode", "dark");
  el.setPref("scheme", "housekeeper");
  el.setPref("pageSize", "50");
  const css = el.themeCss();
  assert.ok(css.includes("--hk-fs:1.25") && css.includes("color-scheme:dark") && css.includes("--hk-blue:#4fc3ae"));
  assert.equal(el.pageSize, 50);
  const saved = JSON.parse(storage.store["ha_housekeeper.prefs"]);
  assert.equal(saved.scheme, "housekeeper");
  el.setPref("scheme", "midnight");
  assert.ok(el.themeCss().includes("--hk-blue:#5aa9ff"));
  assert.equal(saved.pageSize, 50);
  // a fresh panel reads them back; invalid values fall back to defaults
  assert.equal(panel("en", { localStorage: storage }).el.prefs.mode, "dark");
  const broken = panel("en", { localStorage: fakeStorage({ "ha_housekeeper.prefs": JSON.stringify({ size: "huge", mode: "x", scheme: "neon", pageSize: 7, startView: "nope", graphMode: "cube" }) }) }).el;
  assert.equal(JSON.stringify(broken.prefs), JSON.stringify({ size: "normal", mode: "auto", scheme: "standard", density: "normal", motion: "auto", pageSize: 20, startView: "overview", graphMode: "list", language: "auto" }));
});

test("the start view preference applies unless a deep link says otherwise", () => {
  const win = search => ({ location: { search, pathname: "/ha-housekeeper" }, dispatchEvent() {}, history: {} });
  const a = panel("en", { window: win("") }).el;
  a.prefs = { ...a.prefs, startView: "batteries" };
  a.applyUrl();
  assert.equal(a.view, "batteries");
  const b = panel("en", { window: win("?view=inventory") }).el;
  b.prefs = { ...b.prefs, startView: "batteries" };
  b.applyUrl();
  assert.equal(b.view, "inventory");
});

test("preferences sync with the Home Assistant user profile", async () => {
  const calls = [];
  const stored = { size: "large", mode: "dark", scheme: "modern", density: "compact", motion: "reduced", pageSize: 50, startView: "batteries" };
  const { el } = panel("en", { localStorage: fakeStorage() });
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return msg.type === "frontend/get_user_data" ? { value: stored } : null; } };
  await el.loadUserPrefs();
  assert.equal(el.prefs.size, "large");
  assert.equal(el.prefs.scheme, "modern");
  assert.equal(el.pageSize, 50);
  el.setPref("density", "normal");
  const write = calls.find(c => c.type === "frontend/set_user_data");
  assert.equal(write.key, "ha_housekeeper");
  assert.equal(write.value.density, "normal");
  // a failing or empty profile leaves the local preferences alone
  const { el: other } = panel("en", { localStorage: fakeStorage() });
  other._hass = { language: "en", callWS: async () => { throw new Error("nope"); } };
  await other.loadUserPrefs();
  assert.equal(other.prefs.size, "normal");
});

test("scan settings are validated and sent to the options command", async () => {
  const { el, shadow } = panel("en");
  const sent = [];
  el._hass = { language: "en", callWS: async msg => { sent.push(msg); return { options: {} }; } };
  el.data = { ...DATA, meta: { ...DATA.meta, min_unavailable_days: 7, unused_automation_days: 90, scan_interval_hours: 24, low_battery_percent: 20 } };
  el.view = "settings"; el.settingsTab = "scan";
  el.render();
  assert.ok(shadow.innerHTML.includes('data-opt="scan_interval_hours"') && shadow.innerHTML.includes('value="24"'));
  const input = (key, value) => ({ dataset: { opt: key }, value });
  el.shadowRoot.querySelectorAll = selector => (selector === "[data-opt]" ? [input("scan_interval_hours", "6"), input("low_battery_percent", "500")] : []);
  await el.saveOptions();
  assert.equal(sent.length, 0);
  assert.ok(el.optionsMessage.includes("allowed range"));
  el.shadowRoot.querySelectorAll = selector => (selector === "[data-opt]" ? [input("scan_interval_hours", "6"), input("low_battery_percent", "15")] : []);
  await el.saveOptions();
  assert.equal(JSON.stringify(sent[0]), JSON.stringify({ type: "ha_housekeeper/set_options", scan_interval_hours: 6, low_battery_percent: 15 }));
  assert.ok(el.optionsMessage.includes("Saved"));
});

test("cleanup view lists candidates, creates a dry-run plan and shows the verdicts", async () => {
  const { el, shadow } = panel("en");
  const ent = (id, status) => ({ object_type: "entity", object_id: id, name: id, status, platform: "x" });
  el.data = { ...DATA, objects: [ent("sensor.old", "orphaned"), ent("sensor.used", "orphaned"), ent("light.fine", "active")], edges: [],
    findings: [
      { rule_id: "entity.state_missing", object_id: "sensor.old", classification: "orphaned", confidence: 0.9, ignored: false },
      { rule_id: "entity.state_missing", object_id: "sensor.used", classification: "orphaned", confidence: 0.9, ignored: false },
      { rule_id: "automation.missing_entity", object_id: "automation.a", classification: "broken_reference", confidence: 0.9, ignored: false },
    ] };
  const calls = [];
  el._hass = { language: "en", callWS: async msg => {
    calls.push(msg);
    if (msg.type === "ha_housekeeper/plan_list") return { plans: [] };
    return { plan_id: "p1", created_at: new Date().toISOString(), status: "dry_run", executed: false, summary: { total: 2, ok: 1, review: 0, blocked: 1, uses: 1, statistics: 0 },
      actions: [{ kind: "remove_entity", object_id: "sensor.old", name: "Old", verdict: "ok", reasons: [], used_by: [] },
        { kind: "remove_entity", object_id: "sensor.used", name: "Used", verdict: "blocked", reasons: ["used_certain"], used_by: [{ source: "automation:automation.a", relation: "TARGETS", confidence: "certain" }] }] };
  } };
  assert.equal(el.cleanupCandidates().length, 2); // broken references are not entity candidates
  el.view = "cleanup";
  el.render();
  assert.ok(shadow.innerHTML.includes("Candidates (2)") && shadow.innerHTML.includes("Nothing is changed") && shadow.innerHTML.includes("disabled"));
  el.cleanupSel = new Set(["sensor.old", "sensor.used"]);
  await el.createPlan();
  const create = calls.find(c => c.type === "ha_housekeeper/plan_create");
  assert.equal(JSON.stringify(create.actions), JSON.stringify([{ kind: "disable_entity", object_id: "sensor.old" }, { kind: "disable_entity", object_id: "sensor.used" }]));
  el.view = "plan";
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("Blocked") && html.includes("Definitely in use"));
  el.view = "journal";
  el.render();
  assert.ok(shadow.innerHTML.includes("2 checked: 1 with no known use, 0 to review, 1 blocked.") && shadow.innerHTML.includes('data-plan-open="p1"')); // journaled
  await el.deletePlan("p1");
  assert.equal(el.plan, null);
});

test("orphaned statistics have their own tab with search, kind filter and energy flag", () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true }, objects: [], edges: [], findings: [], orphaned_statistics: [
    { statistic_id: "sensor.old_energy", unit: "kWh", has_sum: true, has_mean: false, in_energy: true },
    { statistic_id: "sensor.old_temp", unit: "°C", has_sum: false, has_mean: true, in_energy: false },
    { statistic_id: "sensor.old_both", unit: null, has_sum: true, has_mean: true, in_energy: false },
  ] };
  el.view = "unreferenced";
  el.unrefTab = "statistics";
  el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("sensor.old_energy") && html.includes("In the Energy dashboard") && html.includes("Developer tools"));
  assert.equal((html.match(/In the Energy dashboard/g) || []).length, 1);
  el.lv.orphanstats.f.kind = "kindMean";
  el.render();
  html = shadow.innerHTML;
  assert.ok(html.includes("sensor.old_temp") && !html.includes("sensor.old_energy"));
  el.lv.orphanstats.q = "nothing";
  el.render();
  assert.ok(shadow.innerHTML.includes("No matches"));
  el.data = { ...el.data, meta: { ...el.data.meta, recorder_available: false }, orphaned_statistics: [] };
  el.lv.orphanstats = undefined;
  el.render();
  assert.ok(shadow.innerHTML.includes("recorder is not available"));
});

test("orphaned statistics show their last entry and sort by it, oldest or newest first", async () => {
  const calls = [];
  const { el, shadow } = panel("en", { setTimeout: () => 0 });
  const day = 86400, now = Date.now() / 1000;
  el._hass = { language: "en", callWS: async msg => { calls.push(msg.type); return { available: true, busy: false, last: { "sensor.a": now - 40 * day, "sensor.b": now - 3 * day, "sensor.c": null } }; } };
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true }, objects: [], edges: [], findings: [], orphaned_statistics: ["a", "b", "c"].map(n => ({ statistic_id: `sensor.${n}`, unit: "%", has_sum: false, has_mean: true, in_energy: false })) };
  el.view = "unreferenced"; el.unrefTab = "statistics";
  el.render();
  const loading = el.loadOrphanLast();
  assert.ok(shadow.innerHTML.includes("…</span>"), "the column says it is loading");
  await loading;
  assert.deepEqual(calls, ["ha_housekeeper/statistics_last"]);
  const order = () => [...shadow.innerHTML.matchAll(/<strong class="cut">(sensor\.[abc])<\/strong>/g)].map(m => m[1]);
  el.lv.orphanstats.sort = "last"; el.lv.orphanstats.dir = "desc";
  el.render();
  assert.deepEqual(order(), ["sensor.b", "sensor.a", "sensor.c"]); // newest first, no entry last
  assert.ok(shadow.innerHTML.includes("Last entry") && shadow.innerHTML.includes("no entry found") && shadow.innerHTML.includes("days ago"));
  el.lv.orphanstats.dir = "asc";
  el.render();
  assert.deepEqual(order(), ["sensor.a", "sensor.b", "sensor.c"]); // oldest first, no entry still last
  // A busy recorder shows a note and is not asked in a loop; opening the tab again retries.
  el._hass.callWS = async msg => { calls.push(msg.type); return { available: true, busy: true, last: {} }; };
  await el.loadOrphanLast();
  assert.ok(shadow.innerHTML.includes("Recorder busy"));
  const before = calls.length;
  el.render();
  assert.equal(calls.length, before);
  el.retryOrphanLast();
  assert.equal(el._orphanLastRequested, false);
});

test("unused entities are a table with columns that sort and filters for domain, area and integration", () => {
  const { el, shadow } = panel("en");
  const day = 864e5, iso = ms => new Date(Date.now() - ms).toISOString();
  const ent = (id, extra = {}) => ({ object_type: "entity", object_id: id, name: id, status: "active", platform: "hue", device_id: null, area_id: null, ...extra });
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true }, edges: [], findings: [], orphaned_statistics: [], objects: [
    { object_type: "area", object_id: "kitchen", name: "Kitchen", status: "active" },
    ent("light.a", { platform: "hue", area_id: "kitchen", last_changed: iso(3 * day), last_reported: iso(60000), status_since: iso(10 * day), has_statistics: true }),
    ent("sensor.b", { platform: "zha", last_changed: iso(30 * day), last_reported: iso(2 * day) }),
    ent("switch.c", { platform: "hue" }),
  ] };
  el.view = "unreferenced"; el.unrefTab = "entities";
  el.render();
  let html = shadow.innerHTML;
  for (const head of ["Name", "Domain", "Device", "Area", "Integration", "Last change", "Last report", "Observed since", "Statistics"]) assert.ok(html.includes(`>${head}`), head);
  assert.ok(html.includes('class="sortgroup table-sort"') && html.includes('data-lsort="unreferenced|id|asc"'), "the mobile sort control keeps ID sorting available in the desktop table header");
  assert.ok(html.includes("data-lsort=\"unreferenced|changed|desc\"") && html.includes('aria-sort="ascending"'));
  assert.ok(html.includes("3 days ago") && html.includes("30 days ago") && html.includes("Kitchen"));
  const order = () => [...shadow.innerHTML.matchAll(/<span class="id cut"[^>]*>([a-z_.]+)<\/span>/g)].map(m => m[1]);
  assert.equal(JSON.stringify(order()), JSON.stringify(["light.a", "sensor.b", "switch.c"]));
  el.lv.unreferenced.sort = "changed"; el.lv.unreferenced.dir = "desc"; el.render();
  assert.equal(JSON.stringify(order()), JSON.stringify(["light.a", "sensor.b", "switch.c"]), "newest first, unknown last");
  el.lv.unreferenced.dir = "asc"; el.render();
  assert.equal(JSON.stringify(order()), JSON.stringify(["sensor.b", "light.a", "switch.c"]), "oldest first, unknown still last");
  el.lv.unreferenced.f.platform = "zha"; el.render();
  assert.equal(JSON.stringify(order()), JSON.stringify(["sensor.b"]));
  el.lv.unreferenced.f.platform = ""; el.lv.unreferenced.q = "kitchen"; el.render();
  assert.equal(JSON.stringify(order()), JSON.stringify(["light.a"]), "the search covers the area");
  assert.ok(shadow.innerHTML.includes("data-object=\"entity:light.a\""), "a row opens the entity");
});

test("orphaned statistics are a table that filters by unit and by the age of the last entry", () => {
  const { el, shadow } = panel("en", { setTimeout: () => 0 });
  const now = Date.now() / 1000, day = 86400;
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true }, objects: [], edges: [], findings: [], orphaned_statistics: [
    { statistic_id: "sensor.new", unit: "kWh", has_sum: true, has_mean: false, in_energy: false },
    { statistic_id: "sensor.old", unit: "°C", has_sum: false, has_mean: true, in_energy: false },
    { statistic_id: "sensor.dead", unit: "°C", has_sum: false, has_mean: true, in_energy: false },
  ] };
  el.orphanLast = { available: true, busy: false, last: { "sensor.new": now - 5 * day, "sensor.old": now - 400 * day, "sensor.dead": now - 900 * day } };
  el._orphanLastRequested = true;
  el.view = "unreferenced"; el.unrefTab = "statistics"; el.render();
  const ids = () => [...shadow.innerHTML.matchAll(/<strong class="cut">(sensor\.[a-z]+)<\/strong>/g)].map(m => m[1]);
  let html = shadow.innerHTML;
  for (const head of ["Statistic ID", "Kind", "Unit", "Last entry", "Energy dashboard"]) assert.ok(html.includes(`>${head}`), head);
  assert.equal(JSON.stringify(ids()), JSON.stringify(["sensor.dead", "sensor.new", "sensor.old"]));
  el.lv.orphanstats.f.age = "365"; el.render();
  assert.equal(JSON.stringify(ids()), JSON.stringify(["sensor.dead", "sensor.old"]), "older than a year");
  el.lv.orphanstats.f.age = "730"; el.render();
  assert.equal(JSON.stringify(ids()), JSON.stringify(["sensor.dead"]));
  el.lv.orphanstats.f.age = ""; el.lv.orphanstats.f.unit = "kWh"; el.render();
  assert.equal(JSON.stringify(ids()), JSON.stringify(["sensor.new"]));
  assert.ok(!shadow.innerHTML.includes('data-object="'), "statistics rows do not open anything");
});

test("changes can be searched and filtered by object type", () => {
  const { el, shadow } = panel("en");
  const part = items => ({ total: items.length, items });
  el.compare = { available: true, baseline_at: "2026-10-06T10:00:00+00:00", scanned_at: "2026-10-07T10:00:00+00:00", baselines: [],
    status_changes: part([]), new_findings: part([]), resolved_findings: part([]), removed_objects: part([]),
    new_objects: part([{ object_type: "entity", object_id: "light.kitchen", name: "Kitchen", status: "active" }, { object_type: "automation", object_id: "automation.night", name: "Night", status: "active" }]) };
  el.view = "changes";
  el.render();
  assert.ok(shadow.innerHTML.includes("light.kitchen") && shadow.innerHTML.includes("automation.night") && shadow.innerHTML.includes('data-lq="changes"'));
  el.lv.changes.f.type = "automation";
  el.render();
  assert.ok(!shadow.innerHTML.includes("light.kitchen") && shadow.innerHTML.includes("automation.night"));
  el.lv.changes.f.type = "";
  el.lv.changes.q = "kitch";
  el.render();
  assert.ok(shadow.innerHTML.includes("light.kitchen") && !shadow.innerHTML.includes("automation.night"));
  assert.ok(!shadow.innerHTML.includes("data-ls="));
});

test("a new scan makes the views computed from the last one load again", async () => {
  const { el } = panel("en", { setTimeout: () => 0, window: { location: { search: "", pathname: "/ha-housekeeper" }, dispatchEvent() {}, history: {}, setInterval: () => 0, clearInterval() {}, clearTimeout() {}, setTimeout: () => 0 } });
  const answers = { "ha_housekeeper/scan": { meta: { scanned_at: "b" }, findings: [], objects: [] } };
  el._hass = { language: "en", callWS: async msg => answers[msg.type] || {} };
  el.data = { meta: { scanned_at: "a" }, findings: [], objects: [] };
  el.view = "cleanup";
  el._policiesRequested = el._exposureRequested = el._qualityRequested = el._blueprintsRequested = true;
  await el.load(true);
  assert.ok(!el._policiesRequested && !el._exposureRequested && !el._qualityRequested && !el._blueprintsRequested);
  el._policiesRequested = true;
  await el.load(true);
  assert.ok(el._policiesRequested, "the same scan again changes nothing");
});

test("policies: rules switch, violations list with hide buttons, hidden ones are folded away", async () => {
  const calls = [];
  const { el, shadow } = panel("en", { setTimeout: () => 0 });
  const item = (id, ignored = false, by = null) => ({ object_type: "entity", object_id: id, name: id, key: `policy.entity_area|${id}|`, ignored, by });
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return { available: true, enabled: 1, violations: 2, rules: [
    { id: "entity_area", enabled: true, count: 2, ignored: 2, items: [item("light.a"), item("light.b"), item("light.c", true, "user"), item("light.d", true, "label")] },
    { id: "device_area", enabled: false, count: 0, ignored: 0, items: [] }] }; } };
  el.view = "policies";
  el.render();
  assert.ok(shadow.innerHTML.includes("Checking policies"));
  await el.loadPolicies();
  let html = shadow.innerHTML;
  assert.ok(html.includes("Entity without an area") && html.includes("light.a") && html.includes("light.b") && !html.includes("light.c"), "hidden ones are folded away");
  assert.ok(html.includes("2 hidden") && html.includes("Show hidden"));
  el.viewTab = { policies: "rules" }; el.render(); html = shadow.innerHTML;
  assert.ok(html.includes("2 violations") && html.includes("Device without an area") && html.includes(">off<"));
  assert.equal((html.match(/data-policy-toggle=/g) || []).length, 2);
  assert.ok(/data-policy-toggle="entity_area"[^>]*checked/.test(html) && !/data-policy-toggle="device_area"[^>]*checked/.test(html));
  el.viewTab = {}; el.policyShowHidden = true; el.render(); html = shadow.innerHTML;
  assert.ok(html.includes("light.c") && html.includes("hidden by label") && html.includes(">Show<"));
  assert.equal((html.match(/data-policy-ignore=/g) || []).length, 1, "only the user's own decision can be undone");
  assert.equal((html.match(/data-decide-open=/g) || []).length, 0, "a row with a fix offers it; hiding sits in the folded-open part");
  assert.ok(html.includes(">Assign area<"));
  el.polOpen = ["policy.entity_area|light.a|", "policy.entity_area|light.b|"]; el.render(); html = shadow.innerHTML;
  assert.equal((html.match(/data-decide-open=/g) || []).length, 2, "folded open: the others ask what to do; the label hides one");
  await el.changePolicy({ type: "ha_housekeeper/set_policy", rule: "device_area", enabled: true });
  assert.equal(JSON.stringify(calls.map(c => c.type)), JSON.stringify(["ha_housekeeper/policies", "ha_housekeeper/set_policy", "ha_housekeeper/policies"]));
  el.policies = { available: true, enabled: 0, violations: 0, rules: [{ id: "entity_area", enabled: false, count: 0, ignored: 0, items: [] }] };
  el.render();
  assert.ok(shadow.innerHTML.includes("Switch on a rule above"));
});

test("policies, second stage: duplicate names, labels and the naming scheme with its prefix editor", async () => {
  const calls = [];
  const { el, shadow } = panel("en", { setTimeout: () => 0 });
  const it = (id, extra = {}) => ({ object_type: "entity", object_id: id, name: id, key: `k|${id}`, ignored: false, by: null, ...extra });
  let answer;
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return msg.type.endsWith("/policies") ? answer : {}; } };
  el.policies = answer = { available: true, enabled: 3, violations: 4, prefixes: { sensor: "wz_" }, rules: [
    { id: "duplicate_name", enabled: true, count: 2, ignored: 0, items: [it("light.k1", { also: ["light.k2"] }), it("light.k2", { also: ["light.k1"] })] },
    { id: "automation_label", enabled: true, count: 1, ignored: 0, items: [it("automation.a")] },
    { id: "naming_scheme", enabled: true, count: 1, ignored: 0, items: [it("sensor.temp", { expected: "wz_" })] }] };
  el._policiesRequested = true; el.view = "policies"; el.render();
  const html = shadow.innerHTML;
  for (const text of ["Duplicate display name", "Automation without a label", "Naming scheme", "Same name as: light.k2", "Expects the prefix wz_"]) assert.ok(html.includes(text), text);
  el.viewTab = { policies: "rules" }; el.render();
  assert.ok(shadow.innerHTML.includes("Prefix: wz_"));
  const rulesHtml = shadow.innerHTML;
  assert.equal((rulesHtml.match(/id="polDomain"/g) || []).length, 1, "the prefix editor belongs to the naming scheme only");
  assert.ok(rulesHtml.includes("data-policy-prefix-add") && rulesHtml.includes('data-policy-prefix-remove="sensor"'));
  await el.addPolicyPrefix("  light ", " wz_ ");
  await el.addPolicyPrefix("", "x_"); // incomplete input sends nothing
  await el.removePolicyPrefix("sensor");
  assert.equal(JSON.stringify(calls.filter(c => c.type.endsWith("set_policy_prefix")).map(c => [c.domain, c.prefix])), JSON.stringify([["light", "wz_"], ["sensor", ""]]));
});

test("an overdue scan is an item in the to-do list of the overview", () => {
  const { el } = panel("en");
  const meta = scanned => ({ ...DATA.meta, scanned_at: scanned, scan_interval_hours: 24 });
  el.data = { ...DATA, meta: meta(new Date().toISOString()) };
  assert.equal(el.staleScan(), null);
  el.data = { ...DATA, meta: meta(new Date(Date.now() - 80 * 3.6e6).toISOString()) };
  assert.equal(el.staleScan().hours, 80);
  assert.ok(el.todoItems().find(i => i.key === "stale").text.includes("scans every 24 hours"));
  el.data = { ...DATA, meta: { ...meta(new Date(Date.now() - 80 * 3.6e6).toISOString()), scan_interval_hours: 0 } };
  assert.equal(el.staleScan(), null); // manual scans: only after a week
  el.data = { ...DATA, meta: { ...meta(new Date(Date.now() - 9 * 24 * 3.6e6).toISOString()), scan_interval_hours: 0 } };
  assert.ok(el.todoItems().find(i => i.key === "stale").text.includes("9 days old"));
});

test("the journal lists short entries and opening one fetches the plan", async () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, objects: [], edges: [], findings: [], quarantine: [] };
  el.view = "cleanup";
  el.journal = [{ plan_id: "p9", created_at: "2026-10-07T10:00:00+00:00", status: "verified", executed: true, run: true, summary: { total: 1, ok: 1, review: 0, blocked: 0 } }];
  el.plan = null;
  el.view = "journal";
  el.render();
  assert.ok(shadow.innerHTML.includes('data-plan-open="p9"'));
  assert.ok(!shadow.innerHTML.includes("file copy was dropped"));
  el.journal = [{ ...el.journal[0], file_snapshot_dropped: true }];
  el.render();
  assert.ok(shadow.innerHTML.includes("file copy was dropped"));
  const asked = [];
  el._hass = { language: "en", callWS: async msg => { asked.push(msg); return { plan_id: "p9", created_at: "2026-10-07T10:00:00+00:00", status: "verified", executed: true, summary: { total: 1, ok: 1, review: 0, blocked: 0 },
    actions: [{ kind: "disable_entity", object_id: "sensor.a", name: "A", verdict: "ok", executable: true, reasons: [], used_by: [], result: { state: "done" } }] }; } };
  await el.openPlan("p9");
  assert.equal(JSON.stringify(asked), JSON.stringify([{ type: "ha_housekeeper/plan_detail", plan_id: "p9" }]));
  assert.equal(el.plan.plan_id, "p9");
  assert.ok(shadow.innerHTML.includes("sensor.a"));
});

test("navigation marks the current page and progress is announced to screen readers", () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA };
  el.view = "findingsNav";
  el.render();
  let html = shadow.innerHTML;
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.ok(/data-view="findingsNav"\s+aria-current="page"/.test(html));
  assert.ok(html.includes('role="status" aria-live="polite"'));
  assert.ok(!/aria-live="polite">[^<]/.test(html), "silent while idle");
  el.view = "settings";
  el.render();
  assert.ok(/data-view="settings"\s+aria-current="page"/.test(shadow.innerHTML));
  el.view = "cleanup";
  el.plan = { status: "running", actions: [] };
  el.planProgress = { done: 2, total: 5, phase: "execute" };
  assert.ok(el.liveStatus().includes("2") && el.liveStatus().includes("5"));
  el.plan = { status: "backup", actions: [] };
  assert.equal(el.liveStatus(), el.t("backupRunning"));
  el.plan = null; el.busy = true; el.scanStatus = { running: true, progress: 40 };
  assert.ok(el.liveStatus().includes("40%"));
  assert.ok(shadow.innerHTML.includes(":focus-visible") || el.styles().includes(":focus-visible"), "visible focus style");
  assert.ok(el.styles().includes(".sr-only{"));
});

test("the scan button is disabled while a plan runs", () => {
  const { el } = panel("en");
  el.data = { ...DATA };
  const disabled = () => /data-action="scan"\s+disabled/.test(el.heading());
  el.plan = null;
  assert.equal(disabled(), false);
  for (const status of ["backup", "running"]) { el.plan = { status }; assert.equal(disabled(), true, status); }
  el.plan = { status: "verified" };
  assert.equal(disabled(), false);
  assert.ok(el.t("err_cleanup_busy").includes("plan is running"));
});

test("a refusal of the backend is shown in the language of the panel", () => {
  const refusal = (code, message) => Object.assign(new Error(message), { code });
  for (const lang of ["de", "en"]) {
    const { el } = panel(lang);
    assert.equal(el.errText(refusal("not_found", "Plan not found")), el.t("err_plan_not_found"));
    assert.equal(el.errText(refusal("days_required", "Putting a finding off needs days")), el.t("err_days_required"));
    assert.equal(el.errText(refusal("scan_failed", "ValueError: boom")), el.t("err_failed", { detail: "boom" }));
    assert.equal(el.errText(refusal("other", "Something new")), "Something new");
  }
  assert.notEqual(panel("de").el.errText(refusal("not_found", "Plan not found")), panel("en").el.errText(refusal("not_found", "Plan not found")));
});

test("preliminary data during the Home Assistant start shows a banner on every page", () => {
  const { el } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, preliminary: false } };
  assert.equal(el.warmupBanner(), "");
  assert.ok(!el.heading().includes("is starting"));
  el.data = { ...DATA, meta: { ...DATA.meta, preliminary: true, warmup_seconds_left: 120 } };
  assert.ok(el.warmupBanner().includes("is starting"));
  assert.ok(el.heading().includes("is starting")); // part of the page heading, so on every view
});

test("the start banner names the step and counts the warm-up down", () => {
  const { el } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, preliminary: true } };
  el._warm = { booting: true, known: true };
  assert.ok(el.warmupBanner().includes("Home Assistant starts") && el.warmupBanner().includes("still loading"));
  el._warm = { until: Date.now() + 125000, known: true, done: 38, total: 41, pending: 3, names: ["Shelly", "HACS"] };
  let html = el.warmupBanner();
  assert.ok(html.includes("38 of 41 integrations loaded") && html.includes("2:0") && html.includes("Shelly") && html.includes("+1"));
  el._warm = { until: Date.now() + 45000, settling: true, known: true, done: 41, total: 41, pending: 0 };
  assert.ok(el.warmupBanner().includes("Safety buffer"));
  el._warm = { until: Date.now() + 45000, settling: true, known: true, done: 41, total: 41, pending: 1, names: ["Shelly"] };
  assert.ok(el.warmupBanner().includes("Shelly is reloading briefly"));
  el._warm = { until: Date.now() - 1000, known: true };
  el.scanStatus = { running: true, progress: 40, phase: "devices" };
  html = el.warmupBanner();
  assert.ok(html.includes("Devices and entities") && html.includes("2/4") && html.includes("40 %"));
  el._warm = { until: Date.now() + 290000, known: false }; // the figures of an old scan are not shown
  html = el.warmupBanner();
  assert.ok(html.includes("Asking for the state") && !html.includes("4:5"));
});

test("the recorder load header shows rows, entities and events as figures and names what was left out", () => {
  const { el } = panel("en");
  el.data = { ...DATA }; el._stormsRequested = 1; el._exposureRequested = true;
  el.storms = { ...STORMS, window_days: 7, per_day: 58857, excluded: { ignored: 2, disabled: 0, permanent: 1 } };
  const html = el.stormsView();
  assert.ok(html.includes("in the last 7 days") && html.includes("a day") && html.includes("have written") && html.includes("in the events table"));
  assert.ok(html.includes("2 hidden") && html.includes("1 down all the time") && !html.includes("0 disabled"));
  el.storms = { ...STORMS, excluded: {} };
  assert.ok(el.stormsView().includes("in the last 24 hours") && !el.stormsView().includes('class="exchips"'));
  el.viewTab = { recload: "shares" };
  assert.ok(el.stormsView().includes('data-lsort="stormshares|load|desc"') && el.stormsView().includes("41.5 %"), "the integration shares are a table with the load share");
  el.viewTab = { recload: "events" };
  assert.ok(el.stormsView().includes('data-lsort="stormevents|count|desc"') && el.stormsView().includes("state_changed"), "the events are a table with count and share");
});

test("a dry-run plan is confirmed, typed, executed with progress, and can be undone", async () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, objects: [{ object_type: "entity", object_id: "sensor.a", name: "A", status: "orphaned" }, { object_type: "entity", object_id: "sensor.b", name: "B", status: "orphaned" }], edges: [], findings: [] };
  const action = (id, verdict, extra = {}) => ({ kind: "disable_entity", object_id: id, name: id, verdict, executable: verdict !== "blocked", reasons: [], used_by: [], ...extra });
  const base = { plan_id: "p1", created_at: new Date().toISOString(), status: "dry_run", executed: false, summary: { total: 2, ok: 1, review: 1, blocked: 0 },
    actions: [action("sensor.a", "ok"), action("sensor.b", "review", { reasons: ["has_statistics"] })] };
  el.plan = base;
  el.view = "plan";
  const sent = [];
  let current = base;
  el._hass = { language: "en", callWS: async msg => {
    sent.push(msg);
    if (msg.type === "ha_housekeeper/plan_list") return { plans: [current] };
    if (msg.type === "ha_housekeeper/plan_confirm") return { plan_id: "p1", token: "tok", expires_at: "x", execute: msg.acknowledged.length ? ["sensor.a", "sensor.b"] : ["sensor.a"], needs_acknowledgement: msg.acknowledged.length ? [] : ["sensor.b"], skipped: [] };
    if (msg.type === "ha_housekeeper/plan_execute") return { started: true };
    if (msg.type === "ha_housekeeper/plan_cancel") return { cancelling: true };
    if (msg.type === "ha_housekeeper/plan_status") return { progress: { running: false, done: 1, total: 1 }, plan: current };
    if (msg.type === "ha_housekeeper/plan_undo") { current = { ...current, status: "undone" }; return { results: [{ object_id: "sensor.a", outcome: "undone" }], status: "undone" }; }
    if (msg.type === "ha_housekeeper/scan" || msg.type === "ha_housekeeper/inventory") return el.data;
    return {};
  } };
  el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("data-plan-confirm") && html.includes("data-plan-discard>Cancel") && !html.includes('data-ack-all') && !html.includes("data-plan-execute"));
  assert.ok(shadow.innerHTML.includes("2 entities will be disabled") && shadow.innerHTML.includes('data-count="2"'), "the preview already names what runs");
  await el.confirmPlan();
  const confirm = sent.find(m => m.type === "ha_housekeeper/plan_confirm");
  assert.equal(JSON.stringify(confirm.acknowledged), JSON.stringify(["sensor.b"]), "the dialog is the acknowledgement: every step to review is sent");
  el.render();
  html = shadow.innerHTML;
  assert.ok(!html.includes("data-confirm-word") && !html.includes("data-plan-execute"), "one step: no second screen and no word to type");
  current = { ...base, status: "verified", executed: true, run: { started_at: "x" }, verification: { ok: true, checks: [{ check: "disabled", object_id: "sensor.a", ok: true }, { check: "no_new_broken_references", ok: true }] },
    actions: [action("sensor.a", "ok", { result: { state: "done" } }), action("sensor.b", "review", { result: { state: "not_run", reason: "entity_changed" } })] };
  await el.executePlan();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.find(m => m.type === "ha_housekeeper/plan_execute").token, "tok");
  el.render();
  html = shadow.innerHTML;
  assert.ok(html.includes("Executed and verified") && html.includes("Disabled") && html.includes("changed after the preview") && html.includes("data-undo-all") && html.includes('data-undo-one="sensor.a"'));
  assert.ok(html.includes("✓ Entity is disabled") && !html.includes("data-plan-delete"));
  // Deleted statistics come back only from the backup: no undo buttons for them, undo stays for the rest.
  current = { ...current, actions: [action("sensor.old", "ok", { kind: "purge_statistics", result: { state: "done" } })] };
  el.plan = current;
  el.render();
  assert.ok(shadow.innerHTML.includes("sensor.old") && !shadow.innerHTML.includes("data-undo-all") && !shadow.innerHTML.includes('data-undo-one="sensor.old"'));
  await el.undoPlan();
  assert.ok(el.undoMessage.includes("sensor.a: enabled again"));
  assert.equal(el.plan.status, "undone");
});

test("a blocked removal cannot be confirmed; a ready one asks for the removal word and mentions the backup", async () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, objects: [], edges: [], findings: [], quarantine: [] };
  const plan = (executable, reasons) => ({ plan_id: "p2", created_at: new Date().toISOString(), status: "dry_run", executed: false, summary: { total: 1, ok: executable ? 1 : 0, review: 0, blocked: executable ? 0 : 1 },
    actions: [{ kind: "remove_entity", object_id: "sensor.a", name: "A", verdict: executable ? "ok" : "blocked", executable, reasons, quarantine_days_left: 6, used_by: [] }] });
  el.view = "plan";
  el.journal = [];
  el.plan = plan(false, ["quarantine_too_short"]);
  el.render();
  assert.ok(!shadow.innerHTML.includes("data-plan-confirm") && shadow.innerHTML.includes("Nothing to run") && shadow.innerHTML.includes("The entry is blocked") && !shadow.innerHTML.includes('class="wz"') && shadow.innerHTML.includes("quarantine is still too short. (6 days to go)"));
  el.plan = plan(false, ["nothing_found"]);
  el.render();
  assert.ok(shadow.innerHTML.includes("Nothing to change") && !shadow.innerHTML.includes("Nothing to run") && !shadow.innerHTML.includes(">Blocked<"));
  el.plan = plan(true, []);
  el._hass = { language: "en", callWS: async () => ({ plan_id: "p2", token: "t", expires_at: "x", execute: ["sensor.a"], removals: ["sensor.a"], needs_acknowledgement: [], skipped: [] }) };
  el.render();
  assert.ok(shadow.innerHTML.includes("data-plan-confirm") && shadow.innerHTML.includes('data-risky="true"'));
  assert.ok(!shadow.innerHTML.includes("data-confirm-word") && shadow.innerHTML.includes("creates a Home Assistant backup first"));
});

test("removal candidates are the quarantined entities and wait for the quarantine period", () => {
  const { el, shadow } = panel("en");
  const ago = n => new Date(Date.now() - n * 864e5 - 3600e3).toISOString();
  const item = id => ({ object_type: "entity", object_id: id, name: id, status: "disabled" });
  el.data = { ...DATA, meta: { ...DATA.meta, quarantine_days: 14 }, objects: [item("sensor.old"), item("sensor.new")], edges: [], findings: [],
    quarantine: [{ object_id: "sensor.old", plan_id: "p", since: ago(20) }, { object_id: "sensor.new", plan_id: "p", since: ago(2) }] };
  el.journal = [];
  el.view = "cleanup"; el.viewTab = { cleanup: "quarantine" };
  el.cleanupKind = "remove_entity";
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("Candidates (2)") && html.includes("Ready") && html.includes("12 days to go") && html.includes("Removal is possible only after 14 days"));
  assert.ok(/data-sel="sensor.new"[^>]*disabled/.test(html) && !/data-sel="sensor.old"[^>]*disabled/.test(html));
  assert.equal(JSON.stringify(el._cleanupVisible), JSON.stringify(["sensor.old"]));
  assert.ok(html.includes('<input type="checkbox" class="selbox" data-sel-page') && html.includes("<table") && html.includes('data-lsort="cleanup|status|asc"'), "candidates are a table with a page box in its head");
  el.cleanupSel.add("sensor.old");
  el.render();
  assert.ok(/data-sel-page checked/.test(shadow.innerHTML), "the page box is checked once every pickable row is");
  el.cleanupSel.clear();
  el.lv.cleanup.f.readiness = "waiting";
  el.render();
  assert.ok(shadow.innerHTML.includes("sensor.new") && !shadow.innerHTML.includes('data-sel="sensor.old"'));
});

test("the served panel file is built from panel-src and up to date", () => {
  assert.equal(fs.readFileSync(SOURCE, "utf8"), buildPanel(), "run: node scripts/build_panel.mjs");
});

const stepCData = () => {
  const ago = n => new Date(Date.now() - n * 864e5 - 3600e3).toISOString();
  const entity = (id, status, device_id) => ({ object_type: "entity", object_id: id, name: id, status, device_id });
  const device = (id, name, status = "active", extra = {}) => ({ object_type: "device", object_id: id, name, status, manufacturer: "Acme", model: "X1", ...extra });
  return { ago, data: { ...DATA, meta: { ...DATA.meta, quarantine_days: 14 }, findings: [], edges: [{ source: "automation:automation.heat", target: "entity:sensor.old", relation: "TRIGGERS_ON", confidence: "certain" }],
    objects: [device("d-dead", "Dead lamp"), device("d-live", "Live lamp"), device("d-q", "Quarantined plug", "disabled"), entity("light.dead", "orphaned", "d-dead"), entity("light.live", "active", "d-live"),
      entity("sensor.old", "unavailable"), entity("sensor.new", "active")],
    quarantine: [{ object_type: "device", object_id: "d-q", plan_id: "p", since: ago(20) }],
    recurring_devices: [{ device_id: "d-dead", name: "Dead lamp", forgotten_at: ago(3), plan_id: "p", domains: ["hue"] }] } };
};

test("device candidates are the devices without working entities; removal lists quarantined devices", () => {
  const { el, shadow } = panel("en");
  const { data } = stepCData();
  el.data = data; el.journal = []; el.view = "cleanup"; el.viewTab = { cleanup: "devices" };
  el.cleanupKind = "disable_device";
  el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("Candidates (1)") && html.includes('data-sel="d-dead"') && !html.includes('data-sel="d-live"') && !html.includes('data-sel="d-q"'));
  assert.ok(html.includes("1 entities") && html.includes('data-object="device:d-dead"'));
  for (const kind of ["remove_device", "forget_device"]) {
    el.viewTab = { cleanup: "quarantine" }; el.quarantineType = "device"; el.cleanupKind = kind; el.lv.cleanup = undefined; el.render();
    html = shadow.innerHTML;
    assert.ok(html.includes('data-sel="d-q"') && html.includes("Devices in quarantine") && !html.includes('data-sel="d-dead"'), kind);
  }
  for (const value of ["remove_device", "forget_device"]) assert.ok(html.includes(`value="${value}"`));
  assert.ok(!html.includes('value="disable_entity"') && !html.includes('value="disable_device"'));
  assert.ok(!html.includes('value="replace_references"'));
});

test("the replace assistant previews sources and sends the new entity with the plan", async () => {
  const { el, shadow } = panel("en");
  const { data } = stepCData();
  el.data = data; el.journal = []; el.view = "repair"; el.repairTask = "replace_references"; el.cleanupKind = "replace_references";
  el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("Replace references") && html.includes('data-picker="replOld"'));
  assert.ok(/data-plan-create\s+disabled/.test(html));
  el.replOld = "sensor.old"; el.replNew = "sensor.";
  el.render();
  html = shadow.innerHTML;
  const offered = el.pickerResults("replNew").map(o => o.object_id);
  assert.ok(offered.includes("sensor.new") && !offered.includes("light.live") && !/data-plan-create\s+disabled/.test(html));
  el.replNew = "sensor.new";
  const sent = [];
  const plan = { plan_id: "r1", created_at: new Date().toISOString(), status: "dry_run", executed: false, summary: { total: 1, ok: 0, review: 1, blocked: 0 },
    actions: [{ kind: "replace_references", object_type: "entity", object_id: "sensor.old", target: "sensor.new", name: "sensor.old", verdict: "review", executable: true, reasons: ["config_rewrite", "source_manual"], used_by: [],
      sources: [{ source: "automation:automation.heat", type: "automation", name: "Heating", writable: true, reason: null, change_count: 2, changes: [{ location: "trigger/0/entity_id", from: "sensor.old", to: "sensor.new" }], manual: ["action/0/data/message"] },
        { source: "dashboard:yamlboard", type: "dashboard", name: "yamlboard", writable: false, reason: "yaml_mode", change_count: 0, changes: [], manual: [] }] }] };
  el._hass = { language: "en", callWS: async msg => { sent.push(msg); return plan; } };
  await el.createPlan();
  assert.equal(JSON.stringify(sent[0]), JSON.stringify({ type: "ha_housekeeper/plan_create", actions: [{ kind: "replace_references", object_id: "sensor.old", target: "sensor.new" }] }));
  el.render();
  html = shadow.innerHTML;
  assert.ok(html.includes("sensor.old → sensor.new") && html.includes("Heating") && html.includes("2 changes") && html.includes("Trigger 1 · entity_id") && html.includes("<span>sensor.old</span>") && html.includes("<span>sensor.new</span>"));
  assert.ok(html.includes("To do by hand (2)") && html.includes("action/0/data/message") && html.includes("YAML dashboard") && html.includes("Rewrites configuration"));
  assert.equal(el.planWord(plan), "REPLACE");
  assert.ok(el.confirmSummary(plan, 1).startsWith("In 2 entity references"));
});

test("a plan that removes half of all entities or more warns before it runs", () => {
  const { el } = panel("en");
  const remove = n => Array.from({ length: n }, () => ({ kind: "remove_entity", executable: true, verdict: "ok" }));
  const plan = n => ({ actions: remove(n), summary: { totals: { entity: 120, device: 10 } } });
  el.ack = new Set();
  assert.equal(el.largeRemovalWarning(plan(59)), null);
  assert.ok(el.largeRemovalWarning(plan(66)).title.includes("66 of 120 entities (55 %)"));
  const devices = { actions: [{ kind: "forget_device", executable: true, verdict: "ok" }, { kind: "disable_device", executable: true, verdict: "ok" }], summary: { totals: { entity: 120, device: 2 } } };
  assert.ok(el.largeRemovalWarning(devices).title.includes("1 of 2 devices (50 %)"));
  assert.equal(el.largeRemovalWarning({ actions: [{ kind: "disable_entity", executable: true, verdict: "ok" }], summary: { totals: { entity: 1 } } }), null);
});

test("removing a device asks for the removal word and says that its entities go with it", () => {
  const { el } = panel("en");
  const plan = { actions: [{ kind: "forget_device", executable: true }, { kind: "disable_device", executable: true }] };
  assert.equal(el.planWord(plan), "REMOVE");
  assert.ok(el.confirmSummary(plan, 2).includes("2 devices will be removed together with their entities"));
  const quarantine = { actions: [{ kind: "disable_device", executable: true }] };
  assert.equal(el.planWord(quarantine), "DISABLE");
  assert.ok(el.confirmSummary(quarantine, 3).startsWith("3 devices will be disabled"));
  assert.equal(panel("de").el.planWord({ actions: [{ kind: "replace_references", executable: true }] }), "ERSETZEN");
});

// The detail page is split into tabs; some checks look at several of them.
function detailTabsHtml(el, shadow, ...tabs) {
  return tabs.map(tab => { el.detailTab = tab; el.render(); return shadow.innerHTML; }).join("\n");
}

test("an integration page says which integration it is, where it comes from and how it was set up", () => {
  const { el, shadow } = panel("de");
  const entry = { object_type: "config_entry", object_id: "01K72", name: "Bridge", domain: "hue", integration_name: "Philips Hue", custom: true, integration_dir: "custom_components/hue", integration_version: "1.2.3",
    documentation: "https://example.org/hue", source: "zeroconf", state: "setup_error", error: "Cannot connect", unique_id: "abc", entity_count: 4, device_count: 2, created_at: "2026-09-01T10:00:00+00:00", status: "problem" };
  el.data = { ...DATA, objects: [entry], edges: [], findings: [] };
  el.selected = entry; el.view = "detail"; el.details = new Map();
  const html = detailTabsHtml(el, shadow, "overview", "technical");
  for (const text of ["Philips Hue", "(hue)", "custom_components/hue · v1.2.3", "Automatisch entdeckt (zeroconf)", "Cannot connect", "01K72", "abc", "/config/integrations/integration/hue", 'href="https://example.org/hue"']) assert.ok(html.includes(text), text);
  assert.ok(html.includes("Meldung: Cannot connect"));
});

const propertyData = () => {
  const entry = { object_type: "config_entry", object_id: "ce1", name: "Hue Bridge", domain: "hue", integration_name: "Philips Hue", status: "active", state: "loaded" };
  const device = { object_type: "device", object_id: "dev1", name: "Küchenlampe", original_name: "Hue color lamp", manufacturer: "Signify", model: "LCT015", model_id: "9290", serial_number: "SN1", sw_version: "1.88", hw_version: "2", entry_type: null,
    configuration_url: "https://hue.local", area_id: "kitchen", via_device_id: "hub", config_entry_ids: ["ce1"], labels: ["lbl"], identifiers: ["hue:abc"], connections: ["mac:aa:bb"], status: "active", entity_count: 1, created_at: "2026-09-01T10:00:00+00:00" };
  const hub = { object_type: "device", object_id: "hub", name: "Hue Hub", status: "active", config_entry_ids: ["ce1"], labels: [] };
  const entity = { object_type: "entity", object_id: "light.kitchen", name: "Küche", original_name: "Color lamp", unique_id: "u-1", platform: "hue", device_id: "dev1", config_entry_id: "ce1", area_id: null, labels: ["lbl"], aliases: ["Deckenlicht"],
    entity_category: "diagnostic", disabled_by: "user", hidden_by: "integration", icon: "mdi:lamp", status: "active", state: "on", unit: "W", state_class: "measurement", device_class: "light", created_at: "2026-09-01T10:00:00+00:00", last_changed: "2026-10-07T09:00:00+00:00" };
  return { ...DATA, objects: [entry, device, hub, entity, { object_type: "area", object_id: "kitchen", name: "Küche (Raum)", status: "active" }, { object_type: "label", object_id: "lbl", name: "Wichtig", status: "active" }], edges: [], findings: [] };
};

const METER_PLAN = {
  plan_id: "m1", created_at: new Date().toISOString(), status: "dry_run", executed: false, summary: { total: 1, ok: 0, review: 1, blocked: 0 },
  actions: [{ kind: "migrate_meter", object_type: "entity", object_id: "sensor.meter_old", target: "sensor.meter_new", mode: "both", alt_id: "sensor.meter_old_alt", name: "Old meter", verdict: "review", executable: true,
    reasons: ["stats_write", "id_takeover", "stats_gap"], used_by: [],
    statistics: { import_count: 48, old_first: 1788220800, old_last: 1788390000, switch: 1788480000, offset: 47, unit: "kWh", dropped_overlap: 3, gap_hours: 24,
      preview: { before: [{ start: 1788386400, sum: 46 }, { start: 1788390000, sum: 47 }], after: [{ start: 1788480000, sum: 0, sum_after: 47 }] } } }],
};

test("the meter assistant offers the modes and sends the pair with the plan", async () => {
  const { el, shadow } = panel("en");
  const { data } = stepCData();
  data.objects.push({ object_type: "entity", object_id: "sensor.meter_old", name: "Old meter", status: "unavailable", has_statistics: true, unit: "kWh" },
    { object_type: "entity", object_id: "sensor.meter_new", name: "New meter", status: "active", unit: "kWh" },
    { object_type: "entity", object_id: "sensor.other_unit", name: "Other", status: "active", unit: "W" });
  el.data = data; el.journal = []; el.view = "repair"; el.repairTask = "migrate_meter"; el.cleanupKind = "migrate_meter";
  el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("Replace a meter") && html.includes('data-picker="meterOld"'));
  assert.ok(html.includes("Statistics and ID") && /data-plan-create\s+disabled/.test(html));
  el.meterOld = "sensor.meter_old"; el.meterNew = "sensor.meter_new"; el.meterMode = "statistics";
  el.render();
  html = shadow.innerHTML;
  const offeredMeters = el.pickerResults("meterNew").map(o => o.object_id);
  assert.ok(offeredMeters.includes("sensor.meter_new") && !offeredMeters.includes("sensor.other_unit"), "only new meters with the same unit");
  const sent = [];
  el._hass = { language: "en", callWS: async msg => { sent.push(msg); return METER_PLAN; } };
  await el.createPlan();
  assert.equal(JSON.stringify(sent[0]), JSON.stringify({ type: "ha_housekeeper/plan_create", actions: [{ kind: "migrate_meter", object_id: "sensor.meter_old", target: "sensor.meter_new", mode: "statistics" }] }));
});

test("a meter plan explains the copy, the shifted total and the ID move, and asks for MIGRATE", () => {
  const { el, shadow } = panel("en");
  const { data } = stepCData();
  el.data = data; el.journal = []; el.view = "plan"; el.repairTask = "migrate_meter"; el.plan = METER_PLAN;
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("sensor.meter_old → sensor.meter_new") && html.includes("48 hourly values"));
  assert.ok(html.includes("+47 kWh") && html.includes("3 hours twice") && html.includes("Gap of 24 hours"));
  assert.ok(html.includes("sensor.meter_old → sensor.meter_old_alt, then sensor.meter_new → sensor.meter_old"));
  assert.ok(html.includes("Experimental: writes into the recorder database"));
  assert.equal(el.planWord(METER_PLAN), "MIGRATE");
  assert.ok(el.confirmSummary(METER_PLAN, 1).startsWith("1 meter changes: Housekeeper first creates a Home Assistant backup"));
  assert.equal(panel("de").el.planWord(METER_PLAN), "MIGRIEREN");
  const done = { ...METER_PLAN, status: "verified", actions: [{ ...METER_PLAN.actions[0], result: { state: "done", statistics_kept: true } }] };
  el.plan = done; el.render();
  assert.ok(shadow.innerHTML.includes("Migrated") && shadow.innerHTML.includes("only be reset with the backup"));
});

const COSTS = {
  available: true, total_states: 12000, first: 0, last: 1, size_bytes: 5 * 1024 * 1024, keep_days: 10, statistics_total: 300,
  entities: [
    { entity_id: "sensor.noisy", name: "<b>Noisy</b>", states: 9000, per_day: 900, share: 75, used: 0, has_statistics: false, known: true, excluded: false, suggest_exclude: true },
    { entity_id: "sensor.used", name: "Used", states: 2000, per_day: 200, share: 16.7, used: 3, has_statistics: false, known: true, excluded: false, suggest_exclude: false },
    { entity_id: "sensor.gone", name: "Gone", states: 100, per_day: 10, share: 0.8, used: 0, has_statistics: false, known: true, excluded: true, suggest_exclude: false },
  ],
  statistics: [{ statistic_id: "sensor.energy", rows: 250, known: true }],
};

test("the maintenance view loads the preflight; the recorder view offers the cost analysis on request", async () => {
  const { el, shadow } = panel("en", { setTimeout: () => 0 });
  const sent = [];
  const state = { ha_version: "2026.2.3", backup: { available: true, level: "ok", age_hours: 5 }, disk: { free: 41e9 }, repairs: [{ issue_id: "old", domain: "demo" }], failed_entries: [], broken: [], updates: [{ entity_id: "update.core", name: "Core", installed: "2026.2.3", latest: "2026.3.0", group: "system" }] };
  const report = { state, checks: [{ check: "backup", level: "ok" }, { check: "repairs", level: "warn", count: 1 }, { check: "failed_entries", level: "ok", count: 0 }, { check: "broken", level: "ok", count: 0 }], verdict: "look", counts: { total: 1, system: 1, app: 0, hacs: 0, device: 0, blocked: 0 }, watch: { hours: 24, active: null } };
  el._hass = { language: "en", callWS: async msg => { sent.push(msg.type); return msg.type.endsWith("recorder_costs") ? COSTS : report; } };
  el.view = "maintenance"; el.viewTab = { maintenance: "updates" };
  el.render();
  assert.ok(shadow.innerHTML.includes("Updates") && shadow.innerHTML.includes("Checking"));
  assert.ok(!shadow.innerHTML.includes("Start analysis") && !shadow.innerHTML.includes("Storage use"), "the recorder topics moved to the Recorder view");
  await el.loadPreflight();
  let html = shadow.innerHTML;
  assert.deepEqual(sent, ["ha_housekeeper/preflight"]);
  assert.ok(html.includes("Last backup 5 h ago") && html.includes("Open repairs") && html.includes("1 · old"));
  assert.ok(html.includes("2026.2.3 → 2026.3.0") && html.includes("1 update open") && html.includes("watches for 24 hours"));
  el.view = "recorder"; el.viewTab = { recorder: "costs" };
  el.render();
  assert.ok(shadow.innerHTML.includes("Start analysis"));
  await el.loadCosts();
  html = shadow.innerHTML;
  assert.ok(html.includes("12,000 stored states") && html.includes("5 MB") && html.includes("kept 10 days"));
  assert.ok(html.includes("&lt;b&gt;Noisy&lt;/b&gt;") && !html.includes("<b>Noisy</b>"), "names are escaped");
  assert.ok(html.includes("Recommended") && html.includes("already excluded") && html.includes("3 uses"));
  assert.ok(html.includes("Nothing selected · ") && html.includes("Select all suggested") && !html.includes("Copy YAML"), "without a pick there is only the bar");
  el.excludeSel.add("sensor.noisy");
  assert.equal(el.excludeSnippet(), "recorder:\n  exclude:\n    entities:\n      - sensor.noisy\n");
  el.render();
  assert.ok(shadow.innerHTML.includes("- sensor.noisy") && !shadow.innerHTML.includes("- sensor.used") && shadow.innerHTML.includes("1 selected"));
  assert.ok(shadow.innerHTML.includes("Copy YAML") && shadow.innerHTML.includes("What to do next"), "a pick opens the block and the steps");
});

test("the recorder costs are a sortable table with a bar column, clickable tiles and a refresh", async () => {
  const { el, shadow } = panel("en", { setTimeout: () => 0 });
  const costs = { ...COSTS, took_ms: 1234, cached: false, entities: [
    { entity_id: "sensor.history", name: "History", states: 9000, per_day: 300, per_day_avg: 300, states_24h: 2, states_7d: 6, share: 75, used: 0, has_statistics: false, known: true, excluded: false, suggest_exclude: false },
    { entity_id: "sensor.loud", name: "Loud", states: 600, per_day: 600, per_day_avg: 600, states_24h: 500, states_7d: 3000, share: 5, used: 0, has_statistics: false, known: true, excluded: false, suggest_exclude: true },
  ] };
  const sent = [];
  el._hass = { language: "en", callWS: async msg => { sent.push(msg); return costs; } };
  el.view = "recorder"; el.viewTab = { recorder: "costs" };
  await el.loadCosts();
  assert.equal(JSON.stringify(sent[0]), JSON.stringify({ type: "ha_housekeeper/recorder_costs" }));
  let html = shadow.innerHTML;
  assert.ok(html.indexOf("sensor.loud") < html.indexOf("sensor.history"), "current rate first");
  assert.ok(html.includes("calculated in 1,234 ms") && html.includes('data-lf-set="costlist|state|suggest"') && html.includes("sysshare") && html.includes("3,000"));
  assert.ok(html.indexOf('class="sumtiles"') < html.indexOf('<div class="panel">'), "the tiles stand free above the card of the list, not inside it");
  assert.ok(!html.includes("data-cost-sort") && !html.includes("data-ex-only"));
  el.lv.costlist.sort = "states"; el.lv.costlist.dir = "desc"; el.render();
  html = shadow.innerHTML;
  assert.ok(html.indexOf("sensor.history") < html.indexOf("sensor.loud"), "by the total in the database");
  await el.loadCosts(true);
  assert.equal(JSON.stringify(sent[1]), JSON.stringify({ type: "ha_housekeeper/recorder_costs", refresh: true }));
  assert.ok(el.t("recorderCached", { ms: 5 }).includes("few minutes"));
});

const BACKUP_REPORT = {
  available: true, overall: "problem", counts: { ok: 3, note: 3, problem: 1, unknown: 0 }, schema: 1, backup_count: 2,
  checks: [
    { id: "setup", level: "ok", values: { agents: ["hassio.local", "cloud.cloud"], recurrence: "daily" } },
    { id: "newest", level: "problem", values: { age_hours: 70, limit_hours: 36, date: "2026-10-05T10:00:00+00:00", recurrence: "daily" } },
    { id: "last_run", level: "problem", values: { attempted: "2026-10-08T03:00:00+00:00", completed: "2026-10-05T03:00:00+00:00", failed_agents: ["<b>.x"], failed_attempt: true } },
    { id: "targets", level: "note", values: { local: ["hassio.local"], remote: [] } },
    { id: "size", level: "note", values: { size: 524288000, expected: 1048576000, ratio: 0.5, baseline: 3 } },
    { id: "retention", level: "ok", values: { copies: 3, days: null, count: 2, oldest_days: 6.4 } },
    { id: "encryption", level: "note", values: { configured: false, newest_protected: false } },
    { id: "emergency_kit", level: "note", values: { at: null, age_days: null } },
    { id: "restore_test", level: "ok", values: { at: "2026-09-01T00:00:00+00:00", age_days: 37 } },
    { id: "plan_backups", level: "note", values: { checked: 4, missing: 1 } },
    { id: "own_backups", level: "note", values: { count: 12, size: 3145728000 } },
  ],
  backups: [{ date: "2026-10-05T10:00:00+00:00", size: 524288000, agents: ["hassio.local"], protected: false, automatic: true, failed_agents: [] }],
  attest: { emergency_kit: null, restore_test: "2026-09-01T00:00:00+00:00" },
};

test("the backup card puts text and a word next to every level and escapes what comes from outside", async () => {
  const { el, shadow } = panel("en");
  el.data = DATA;
  el._hass = { language: "en", callWS: async () => BACKUP_REPORT };
  el.view = "maintenance"; el.render();
  assert.ok(shadow.innerHTML.includes("Backups") && shadow.innerHTML.includes("Checking backups"));
  await el.loadBackup();
  const html = shadow.innerHTML;
  for (const text of ["Targets and schedule", "Targets: Local, Nabu Casa · schedule: daily", "3 days ago · limit for the schedule: 36 h",
    "The last attempt", "no backup; last success", "Targets with errors: &lt;b&gt;", "Local only (Local)", "500 MB instead of about 1,000 MB (50 %)",
    "Retention: 3 backups · present: 2, the oldest 6 days old", "No backup password set.", "Not confirmed yet", "Last on", "37 days ago",
    "not found any more", "Latest backups", "How to test a restore", "Housekeeper never performs a restore itself"]) assert.ok(html.includes(text), text);
  for (const word of [">OK<", ">Note<", ">Problem<"]) assert.ok(html.includes(word), word);
  assert.ok(!html.includes("<b>>") && !html.includes("cloud.<b>"));
  assert.ok(html.indexOf("Backups") < html.indexOf("Updates"), "the card comes first");
});

test("the backup card says when the component is missing or the call fails", async () => {
  const { el, shadow } = panel("de");
  el._hass = { language: "de", callWS: async () => ({ available: false, checks: [], backups: [], overall: "unknown" }) };
  el.view = "maintenance"; await el.loadBackup();
  assert.ok(shadow.innerHTML.includes("Backup-Komponente von Home Assistant ist nicht verfügbar"));
  el._hass = { language: "de", callWS: async () => { throw new Error("kaputt"); } };
  await el.loadBackup();
  assert.ok(shadow.innerHTML.includes("kaputt") && !shadow.innerHTML.includes("nicht verfügbar"));
});

test("backup confirmations are inline, saved with a date, and can be taken back", async () => {
  const { el, shadow } = panel("en");
  const sent = [];
  el._hass = { language: "en", callWS: async msg => { sent.push(JSON.stringify(msg)); return BACKUP_REPORT; } };
  el.view = "maintenance"; await el.loadBackup();
  const kit = { dataset: { bhSave: "emergency_kit" } }, restore = { dataset: { bhClear: "restore_test" } };
  const dates = { emergency_kit: { value: "2026-10-01" } };
  el.shadowRoot.querySelectorAll = selector => (selector === "[data-bh-save]" ? [kit] : selector === "[data-bh-clear]" ? [restore] : []);
  el.shadowRoot.querySelector = selector => { const m = /data-bh-date="(\w+)"/.exec(selector); return m ? dates[m[1]] || null : null; };
  el.render();
  assert.ok(shadow.innerHTML.includes('data-bh-open="emergency_kit"') && !shadow.innerHTML.includes("data-bh-save"), "the form opens only on a click");
  assert.ok(shadow.innerHTML.includes('data-bh-open="targets"'), "storage locations can be confirmed");
  assert.match(shadow.innerHTML, /<span class="bhactions"><button class="bhopen" data-bh-open="targets"[^>]*>[^<]+<\/button><span class="pill warn">Note<\/span>/, "the confirmation sits before the badge, which stays the right-hand status column");
  assert.match(shadow.innerHTML, /<\/div><div class="panel"><div class="sectionlabel">Latest backups<\/div>/, "recent backups have their own card");
  el.bhForm = "emergency_kit"; el.render();
  assert.ok(shadow.innerHTML.includes('data-bh-save="emergency_kit"') && !shadow.innerHTML.includes('data-bh-clear="emergency_kit"'), "only a recorded one can be taken back");
  el.bhForm = "restore_test"; el.render();
  assert.ok(shadow.innerHTML.includes('data-bh-clear="restore_test"'));
  el.bhForm = "targets"; el.render();
  assert.ok(shadow.innerHTML.includes('data-bh-save="targets"'));
  sent.length = 0;
  kit.onclick();
  await Promise.resolve();
  assert.equal(sent[0], JSON.stringify({ type: "ha_housekeeper/backup_attest", kind: "emergency_kit", date: "2026-10-01" }));
  restore.onclick();
  await Promise.resolve();
  assert.equal(sent[1], JSON.stringify({ type: "ha_housekeeper/backup_attest", kind: "restore_test", clear: true }));
});

test("the preflight says what follows an update: the watch is on, running or off", () => {
  const { el, shadow } = panel("en");
  const state = { ha_version: "2026.3.0", backup: { available: false }, repairs: [], failed_entries: [], broken: [], updates: [] };
  const show = watch => { el.preflight = { state, checks: [{ check: "backup", level: "warn" }], watch }; el.view = "maintenance"; el.viewTab = { maintenance: "updates" }; el._pfRequested = true; el.render(); return shadow.innerHTML; };
  assert.ok(show({ hours: 24, active: null }).includes("watches for 24 hours") && !show({ hours: 24, active: null }).includes("data-watch-go"));
  const running = show({ hours: 24, active: { id: "w1", until: new Date(Date.now() + 5 * 3600000).toISOString(), triggers: [{ kind: "ha_version", from: "1", to: "2" }], samples: 1, new: 2 } });
  assert.ok(running.includes("2 findings so far") && running.includes('data-watch-go="w1"'));
  assert.ok(show({ hours: 0, active: null }).includes("switched off"));
});

test("the updates tab judges first, groups the updates and trusts only safe picture addresses", () => {
  const { el, shadow } = panel("en");
  const update = (group, name, extra = {}) => ({ entity_id: `update.${name}`, name, installed: "1", latest: "2", group, ...extra });
  const updates = [update("system", "Core"), update("app", "Cloudflared", { picture: "/api/hassio/addons/x/icon" }), update("hacs", "Card", { blocked: true, picture: "javascript:alert(1)" })];
  el.preflight = { state: { backup: { available: true, level: "ok", age_hours: 5 }, disk: { free: 41e9 }, repairs: [], failed_entries: [], broken: [], updates },
    checks: [{ check: "backup", level: "ok" }, { check: "broken", level: "warn", count: 2 }], verdict: "look", counts: { total: 3, system: 1, app: 1, hacs: 1, device: 0, blocked: 1 }, watch: { hours: 24, active: null } };
  el.view = "maintenance"; el.viewTab = { maintenance: "updates" }; el._pfRequested = true; el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("Look first") && html.includes("3 updates open") && html.includes("To check: Missing references"));
  assert.ok(html.indexOf("Cloudflared") < html.indexOf("Card") && html.includes("HACS cannot install it") && html.includes("All device firmware is up to date."));
  assert.ok(html.includes('src="/api/hassio/addons/x/icon"') && !html.includes("javascript:"));
});

test("inventory rows and sortable headers can be used with the keyboard", () => {
  const { el, shadow } = panel("en");
  el.view = "inventory";
  const row = { dataset: { object: "entity:sensor.b" }, click() { this.clicked = (this.clicked || 0) + 1; } };
  row.target = row;
  el.shadowRoot.querySelectorAll = selector => (selector === "tr[data-object], g[data-graph]" ? [row] : []);
  el.render();
  const html = shadow.innerHTML;
  assert.ok(/<tr data-object="[^"]+" tabindex="0" role="button" aria-label="[^"]+">/.test(html), "rows are focusable");
  assert.ok(/<th scope="col" aria-sort="[a-z]+"><button type="button" class="thbtn" data-lsort="inventory\|name\|asc">/.test(html), "headers hold a real button");
  const key = (k, target = row) => { const ev = { key: k, target, prevented: false, preventDefault() { this.prevented = true; } }; row.onkeydown(ev); return ev; };
  assert.ok(key("Enter").prevented && row.clicked === 1);
  assert.ok(key(" ").prevented && row.clicked === 2);
  assert.ok(!key("a").prevented && row.clicked === 2, "other keys do nothing");
  assert.ok(!key("Enter", {}).prevented && row.clicked === 2, "keys pressed inside a control are left alone");
});

test("the replacement preview warns about sources that undo only item by item", () => {
  const { el } = panel("en");
  const action = { sources: [
    { name: "Small", type: "automation", writable: true, change_count: 1, changes: [], manual: [], undo_per_item: false },
    { name: "Huge", type: "automation", writable: true, change_count: 1, changes: [], manual: [], undo_per_item: true },
  ] };
  const html = el.sourceList(action);
  assert.equal(html.split(el.t("sourceUndoPerItem")).length - 1, 1, "only the large source is flagged");
  assert.ok(html.indexOf("Huge") < html.indexOf(el.t("sourceUndoPerItem")));
  assert.ok(el.t("sourceUndoPerItem") !== "sourceUndoPerItem" && panel("de").el.t("sourceUndoPerItem").includes("Eintrag"));
});

test("typing in a search field changes the state at once and renders once after a pause", () => {
  const cancelled = new Set();
  const { el, shadow } = panel("en", { clearTimeout: id => cancelled.add(id) });
  el.view = "inventory";
  const queued = [];
  el.defer = fn => { queued.push(fn); return queued.length; };
  const input = { value: "", dataset: { lq: "inventory" } };
  shadow.querySelectorAll = selector => (selector === "[data-lq]" ? [input] : []);
  el.render(); // binds the field
  let renders = 0;
  const render = el.render.bind(el);
  el.render = () => { renders += 1; render(); };
  for (const text of ["r", "ra", "rau"]) { input.value = text; input.oninput(); }
  assert.equal(el.query, "rau", "the state follows every key");
  assert.equal(renders, 0, "nothing is rebuilt while typing");
  assert.deepEqual([...cancelled], [1, 2], "each key cancels the pending render");
  queued[2]();
  assert.equal(renders, 1);
  assert.ok(shadow.innerHTML.includes('value="rau"'));
});

test("a re-render puts the focus back on the same control", () => {
  const { el, shadow } = panel("en");
  const field = { id: "query", getAttribute() {}, attributes: [], selectionStart: 3, selectionEnd: 5 };
  shadow.activeElement = field;
  assert.deepEqual({ ...el.captureFocus() }, { selector: "#query", start: 3, end: 5 });
  const button = { localName: "button", getAttribute() {}, attributes: [{ name: "class", value: "x" }, { name: "data-sortbtn", value: 'a"b' }], selectionStart: undefined };
  shadow.activeElement = button;
  assert.equal(el.captureFocus().selector, 'button[data-sortbtn="a\\"b"]');
  shadow.activeElement = { getAttribute() {}, attributes: [{ name: "class", value: "x" }] };
  assert.equal(el.captureFocus(), null, "controls without id or data attribute are left alone");

  const calls = [];
  const next = { focus: opts => calls.push(["focus", opts.preventScroll]), setSelectionRange: (a, b) => calls.push(["range", a, b]), disabled: false };
  shadow.querySelector = selector => (selector === "#query" ? next : null);
  el.restoreFocus({ selector: "#query", start: 3, end: 5 });
  assert.deepEqual(calls, [["focus", true], ["range", 3, 5]]);
  calls.length = 0;
  el.restoreFocus({ selector: "#gone", start: null, end: null });
  el.restoreFocus(null);
  assert.deepEqual(calls, []);
});

test("scan progress updates the button and the status line without rebuilding the page", () => {
  const { el, shadow } = panel("en");
  const button = { innerHTML: "", disabled: false };
  const live = { textContent: "" };
  shadow.querySelector = selector => (selector === "[data-action='scan']" ? button : selector === "[role='status']" ? live : null);
  el.busy = true; el.scanStatus = { running: true, progress: 42 };
  el.renderProgress();
  assert.ok(button.innerHTML.includes("Scanning") && button.innerHTML.includes("42%") && button.disabled === true);
  assert.ok(live.textContent.includes("42%"));
  assert.equal(shadow.innerHTML, "", "the page was not rendered");
  shadow.querySelector = () => null; // no heading on screen (detail view): fall back to a full render
  el.renderProgress();
  assert.ok(shadow.innerHTML.includes('class="shell"'));
});

test("a later render swaps the page through a template, not outerHTML (WebKit, issue #7)", () => {
  const tpl = { innerHTML: "", content: {} };
  const { el, shadow } = panel("en", { document: { createElement: tag => (tag === "template" ? tpl : { click() {}, remove() {} }), body: { appendChild() {} } } });
  el.render();
  let swapped = null;
  const current = { replaceWith: node => { swapped = node; }, set outerHTML(_) { throw new Error("NoModificationAllowedError"); } };
  shadow.querySelector = selector => (selector === ".shell" ? current : selector === "style[data-hk]" ? {} : null);
  el.render();
  assert.equal(swapped, tpl.content);
  assert.ok(tpl.innerHTML.startsWith('<div class="shell'));
});

test("a view that throws shows a message, and a refused swap rebuilds the page instead of freezing", () => {
  const errors = [];
  const { el, shadow } = panel("en", { console: { error: (...a) => errors.push(a), debug() {} } });
  el.content = () => { throw new Error("broken view"); };
  el.render(); el.render();
  assert.ok(shadow.innerHTML.includes("This view could not be shown.") && shadow.innerHTML.includes("broken view") && shadow.innerHTML.includes('data-view="overview"'));
  assert.equal(errors.length, 1, "logged once");
  delete el.content;
  const current = { replaceWith() { throw new Error("NoModificationAllowedError"); } };
  shadow.querySelector = selector => (selector === ".shell" ? current : selector === "style[data-hk]" ? {} : null);
  shadow.innerHTML = "";
  el.render();
  assert.ok(shadow.innerHTML.includes('class="shell'));
});

test("derived lists follow the data: cache, search, ignore flag and edge index", () => {
  const { el } = panel("en");
  const first = el.filtered();
  assert.equal(el.filtered(), first, "the same filter returns the cached list");
  el.query = "b"; // matches B, not the two others
  assert.equal(JSON.stringify(el.filtered().map(o => o.object_id)), JSON.stringify(["sensor.b"]));
  el.query = "";
  const findings = el.sortedFindings().length;
  el.data.findings[0].ignored = true; el._rev += 1;
  assert.equal(el.sortedFindings().length, findings - 1);
  el.data.findings[0].ignored = false; el._rev += 1;

  el.data = { ...DATA, edges: [
    { source: "device:d", target: "entity:sensor.b", relation: "PROVIDES", confidence: "certain" },
    { source: "automation:automation.c", target: "entity:sensor.b", relation: "TRIGGERS_ON", confidence: "certain", location: "trigger[0]" },
  ] };
  assert.equal(JSON.stringify(el.edgesTo("entity:sensor.b").map(e => e.source)), JSON.stringify(["device:d", "automation:automation.c"]));
  assert.equal(JSON.stringify(el.edgesFrom("device:d").map(e => e.target)), JSON.stringify(["entity:sensor.b"]));
  assert.ok(el.edgeIndex().used.has("entity:sensor.b") && !el.edgeIndex().used.has("device:d"));
  // A device owns its entities, so what uses them is what breaks with the device.
  const impact = el.impact({ object_type: "device", object_id: "d" }, "device:d");
  assert.equal(JSON.stringify(impact.hits.map(h => h.key)), JSON.stringify(["automation:automation.c"]));
  assert.equal(impact.related, 1);
});

test("the navigation groups every view once, with settings at the foot", () => {
  const { NAV, NAV_GROUPS, TEXT } = loadPanel();
  const grouped = NAV_GROUPS.flatMap(([, views]) => [...views]);
  const expected = [...NAV].map(([view]) => view).filter(view => view !== "settings").sort();
  assert.equal(JSON.stringify([...grouped].sort()), JSON.stringify(expected), "every view except settings is in exactly one group");
  for (const lang of ["de", "en"]) for (const [label] of NAV_GROUPS) assert.ok(TEXT[lang][label], `${lang} ${label}`);
  const { el, shadow } = panel("en");
  el.view = "cleanup";
  el.render();
  const html = shadow.innerHTML;
  const menus = [...html.matchAll(/<div class="navmenu[^"]*"><button[^>]*data-menu="([^"]+)"/g)].map(m => m[1]);
  assert.equal(JSON.stringify(menus), JSON.stringify(["navGroupClean", "navGroupMaintain", "navGroupOperation", "navGroupSecurity", "navGroupExplore"]), "five menus after the direct entries");
  assert.ok(html.includes('<nav class="topnav" id="topnav" aria-label="Main navigation">'));
  const order = ["overview", "findingsNav", "cleanup", "repair", "journal", "maintenance", "batteries", "reliability", "inventory", "changes", "settings"].map(v => html.indexOf(`data-view="${v}"`));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), "views keep their order and settings comes last");
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1, "one current entry");
  assert.ok(/data-view="cleanup"\s+aria-current="page"/.test(html));
  el.view = "batteries"; el.render();
  assert.ok(/class="nav menubtn group-active" data-menu="navGroupMaintain"/.test(shadow.innerHTML), "the menu holding the current view is marked");
});

const TREND = {
  available: true, baseline_at: "2026-10-07T09:00:00+00:00",
  new_findings: { total: 3, items: [
    { rule_id: "entity.state_missing", object_id: "sensor.new1", classification: "unavailable", ignored: false },
    { rule_id: "automation.missing_entity", object_id: "automation.new2", classification: "broken_reference", ignored: false },
    { rule_id: "automation.missing_entity", object_id: "automation.hidden", classification: "broken_reference", ignored: true },
  ] },
  resolved_findings: { total: 5, items: [] }, status_changes: { total: 2, items: [] }, new_objects: { total: 0, items: [] },
};

test("the overview starts with what needs doing, most urgent first", () => {
  const { el, shadow } = panel("en");
  const now = new Date().toISOString();
  el.data = {
    ...DATA,
    meta: { ...DATA.meta, scanned_at: new Date(Date.now() - 80 * 3.6e6).toISOString(), scan_interval_hours: 24, quarantine_days: 14 },
    objects: [...DATA.objects, { object_type: "config_entry", object_id: "e1", name: "Hub", status: "problem", domain: "hue", state: "setup_error" }],
    quarantine: [{ object_id: "sensor.old", object_type: "entity", since: new Date(Date.now() - 20 * 864e5).toISOString() }, { object_id: "sensor.fresh", object_type: "entity", since: now }],
    causes: [{ id: "integration_down:e1", kind: "integration_down", object_type: "config_entry", object_id: "e1", name: "Hub", follower_count: 0, consumers: {}, impact: "none", state: "setup_error" }],
  };
  el.trend = TREND;
  el.backup = { available: true, overall: "problem", checks: [{ id: "newest", level: "problem" }, { id: "emergency_kit", level: "note" }, { id: "last_run", level: "problem" }] };
  const keys = el.todoItems().map(i => i.key);
  assert.equal(JSON.stringify(keys), JSON.stringify(["outages", "critical", "stale", "backup", "quarantine"]));
  const byKey = Object.fromEntries(el.todoItems().map(i => [i.key, i]));
  assert.equal(byKey.outages.count, 1);
  assert.equal(byKey.outages.hintText, "1 integrations", "an outage without any affected entity still counts");
  assert.equal(byKey.critical.count, 2, "hidden findings and other classes do not count");
  assert.equal(byKey.quarantine.count, 1, "only entries past the quarantine period");
  assert.equal(byKey.backup.tone, "red");
  assert.equal(byKey.backup.hintText, "Latest backup, Last automatic run", "only the problems are named, not the notes");

  el.view = "overview"; el.folds = { todo_later: true }; el.render();
  const html = shadow.innerHTML;
  assert.ok(html.indexOf("What needs doing now?") > html.indexOf('class="summary"'), "the list comes after the key figures");
  assert.ok(html.indexOf('data-todo="outages"') < html.indexOf('data-todo="critical"') && html.indexOf('data-todo="critical"') < html.indexOf('data-todo="stale"'));
  assert.equal(html.split("Integration Hub is not loaded").length - 1, 1, "an outage appears once on the overview, not as a second card");
  assert.ok(html.includes("no entity affected") && !html.includes("Integrations with problems"));
  assert.ok(html.indexOf('class="summary"') < html.indexOf('class="ring') && html.indexOf('class="ring') < html.indexOf('data-jump="inventory" data-status'), "the health card is the first card of the statistics row");
});

test("jumping from a to-do row to the inventory sets its type and status filter", () => {
  const { el, shadow } = panel("en");
  const row = { dataset: { jump: "inventory", type: "config_entry", status: "problem" } };
  el.data = { ...DATA, objects: [...DATA.objects, { object_type: "config_entry", object_id: "E9", name: "Broken", domain: "hue", status: "problem" }] };
  shadow.querySelectorAll = selector => (selector === "[data-jump]" ? [row] : []);
  el.render();
  el.statusFilter = "x"; el.typeFilter = "y";
  row.onclick();
  assert.equal(el.view, "inventory");
  assert.equal(el.typeFilter, "config_entry");
  assert.equal(el.statusFilter, "problem");
});

test("the detail page keeps a summary on top and builds only the open tab", () => {
  const { el, shadow } = panel("en");
  el.data = propertyData();
  const entity = el.data.objects.find(o => o.object_id === "light.kitchen");
  el.selected = entity; el.view = "detail"; el.details = new Map([[el.objectKey(entity), { attributes: { effect_marker: "zebra-77" } }]]);
  el.render();
  let html = shadow.innerHTML;
  const summary = html.slice(html.indexOf('class="panel sumline"'), html.indexOf('class="tabs"'));
  for (const text of ["Integration", "hue", "Device", "Küchenlampe", "Area", "Küche (Raum)", "Risk when removed"]) assert.ok(summary.includes(text), text);
  assert.ok(html.includes('role="tablist"') && html.includes('role="tabpanel"'));
  const tabs = [...html.matchAll(/data-detail-tab="(\w+)"/g)].map(m => m[1]);
  assert.equal(JSON.stringify(tabs), JSON.stringify(["overview", "actions", "relations", "technical", "attributes", "history"]));
  assert.ok(/id="hk-tab-overview" aria-selected="true" aria-controls="hk-tabpanel" tabindex="0"/.test(html));
  assert.ok(/id="hk-tab-relations" aria-selected="false" aria-controls="hk-tabpanel" tabindex="-1"/.test(html), "roving tabindex");
  assert.ok(html.includes('class="panelhead"') && html.includes(el.t("knownTitle")), "overview: diagnosis and what is known");
  assert.ok(html.includes(`<span class="pill mute">${el.t("entity")}</span>`) && html.includes("data-xp-from"), "the header names the type and keeps the export of this one object");
  assert.ok(!html.includes("zebra-77") && !html.includes("u-1"), "other tabs are not built");

  html = detailTabsHtml(el, shadow, "attributes");
  assert.ok(html.includes("zebra-77"));
  html = detailTabsHtml(el, shadow, "relations");
  assert.ok(html.includes(el.t("relations") === "relations" ? "Relations" : el.t("relations")) || html.includes("hk-tabpanel"));
  assert.ok(!html.includes("zebra-77"));
  el.details = new Map(); // no attributes: no attributes tab, and a stale choice falls back to the overview
  el.detailTab = "attributes"; el.render();
  html = shadow.innerHTML;
  assert.ok(!html.includes('data-detail-tab="attributes"'));
  assert.ok(/id="hk-tab-overview" aria-selected="true"/.test(html));
});

test("detail tabs are chosen by click and arrow keys, and reset for another object", () => {
  const { el, shadow } = panel("en");
  el.data = propertyData();
  const entity = el.data.objects.find(o => o.object_id === "light.kitchen");
  el.selected = entity; el.view = "detail"; el.details = new Map();
  const buttons = ["overview", "relations", "technical"].map(id => ({ dataset: { detailTab: id } }));
  const focused = [];
  shadow.querySelectorAll = selector => (selector === "[data-detail-tab]" ? buttons : []);
  shadow.querySelector = selector => { const m = /^\[data-detail-tab="(\w+)"\]$/.exec(selector); return m ? { focus: () => focused.push(m[1]) } : null; };
  el.render();
  buttons[2].onclick();
  assert.equal(el.detailTab, "technical");
  const press = (button, key) => { const ev = { key, prevented: false, preventDefault() { this.prevented = true; } }; button.onkeydown(ev); return ev; };
  assert.ok(press(buttons[2], "ArrowRight").prevented);
  assert.equal(el.detailTab, "overview", "wraps around");
  press(buttons[0], "ArrowLeft");
  assert.equal(el.detailTab, "technical");
  press(buttons[2], "Home");
  assert.equal(el.detailTab, "overview");
  press(buttons[0], "End");
  assert.equal(el.detailTab, "technical");
  assert.equal(JSON.stringify(focused), JSON.stringify(["overview", "technical", "overview", "technical"]), "focus follows the arrow keys");
  assert.equal(focused.at(-1), "technical");
  assert.ok(!press(buttons[0], "a").prevented, "other keys are left alone");

  el.detailTab = "technical";
  const device = el.data.objects.find(o => o.object_id === "dev1");
  el.openObject(device);
  assert.equal(el.detailTab, "overview", "another object starts on the overview");
  el._pendingTab = "relations";
  el.openObject(entity);
  assert.equal(el.detailTab, "relations", "a deep link brings its tab");
  el.goBack();
  assert.equal(el.detailTab, "overview");
});

test("the address carries the selected detail tab and a deep link opens it", () => {
  const urls = [];
  const win = { location: { pathname: "/ha-housekeeper", search: "?object=entity%3Alight.kitchen&tab=technical" }, history: { state: null, replaceState: (_s, _t, url) => urls.push(url) } };
  const { el } = panel("en", { window: win });
  el.data = propertyData();
  el.isConnected = true; el._basePath = "/ha-housekeeper";
  el.applyUrl();
  assert.equal(el.selected.object_id, "light.kitchen");
  assert.equal(el.detailTab, "technical");
  el.syncUrl();
  assert.equal(urls.at(-1), "/ha-housekeeper?object=entity%3Alight.kitchen&tab=technical");
  el.detailTab = "overview";
  el.syncUrl();
  assert.equal(urls.at(-1), "/ha-housekeeper?object=entity%3Alight.kitchen", "the overview tab is the default and stays out of the address");
});

const stepStates = steps => steps.map(s => `${s.id.replace("step", "")}:${s.state}`).join(" ");
const act = (kind, extra = {}) => ({ kind, object_id: `sensor.${kind}`, name: kind, verdict: "ok", executable: true, reasons: [], used_by: [], ...extra });
const planOf = (status, actions, extra = {}) => ({ plan_id: "p1", created_at: "2026-10-07T10:00:00+00:00", status, executed: false, summary: { total: actions.length, ok: actions.length, review: 0, blocked: 0 }, actions, ...extra });

test("a plan with many rows has a search box for its rows, and the editors share the delete style and the place of the error", () => {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [], edges: [], findings: [], quarantine: [] };
  const many = Array.from({ length: 8 }, (_, i) => act("disable_entity", { object_id: `sensor.row_${i}`, name: `Row ${i}` }));
  let html = el.planCard(planOf("dry_run", many));
  assert.ok(html.includes('data-lq="planrows"') && (html.match(/class="row planrow/g) || []).length === 8, "the box shows from six rows on");
  el.lvState("planrows", "", "asc").q = "row 3"; el._planqFor = "p1";
  html = el.planCard(planOf("dry_run", many));
  assert.equal((html.match(/class="row planrow/g) || []).length, 1, "the search narrows the rows");
  html = el.planCard(planOf("dry_run", many, { plan_id: "p2" }));
  assert.equal((html.match(/class="row planrow/g) || []).length, 8, "another plan starts without the old search text");
  assert.ok(!el.planCard(planOf("dry_run", many.slice(0, 2))).includes('data-lq="planrows"'), "a short plan has no box");
  el.noteOpen(null, ""); el.noteDraft.error = "Give the entry a title.";
  const note = el.noteEditor();
  assert.ok(note.indexOf('role="alert"') > note.indexOf("note-actions") && !note.includes('<div class="error" role="alert">'), "the error stands in the bottom bar");
  el.noteOpen({ id: "n1", title: "t", at: "2026-10-08T18:05:00+00:00", target: "", note: "", source: "me", ref: "" });
  assert.ok(el.noteEditor().includes("btn dangersoft"), "delete is the soft red button");
  el.monitorForm = { id: "f1", name: "x", description: "", enabled: true, notify: true, members: [] };
  assert.ok(el.monitorEditor().includes("btn dangersoft") && !el.monitorEditor().includes("btn danger\""), "the same in the home functions editor");
});

test("the plan card shows the steps with text, marks undo kinds and folds the details", () => {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [], edges: [], findings: [], quarantine: [] };
  const plan = planOf("verified", [
    act("disable_entity"),
    act("migrate_meter", { object_id: "sensor.old_meter", target: "sensor.new_meter", sources: [] }),
    act("remove_entity", { executable: false, verdict: "blocked", reasons: ["used_certain"], used_by: [{ source: "automation:automation.a", relation: "TARGETS", confidence: "certain" }] }),
  ], { backup: { job_id: "job-9", at: "2026-10-07T10:05:00+00:00" }, verification: { ok: true, checks: [] } });
  const html = el.planCard(plan);
  assert.ok(html.indexOf('<ol class="track"') < html.indexOf('class="row planrow'), "the steps come before the actions");
  assert.equal((html.match(/aria-current="step"/g) || []).length, 0, "a finished plan has no current step");
  assert.ok(html.includes('<span class="sr-only">: done</span>') && html.includes('<span class="sr-only">: not needed</span>') === false);
  assert.ok(html.includes("Created") && html.includes(el.t("backupRestoreHint")));
  assert.equal((html.match(/Undo by Housekeeper/g) || []).length, 1);
  assert.equal((html.match(/Backup only/g) || []).length, 1, "merged statistics can only be restored from the backup");
  assert.equal((html.match(/<details class="rowdetails">/g) || []).length, 2, "the meter detail and the uses fold; the plain disable row has none");
  const open = el.planCard(planOf("dry_run", [act("disable_entity")]));
  assert.equal((open.match(/aria-current="step"/g) || []).length, 1);
  assert.ok(open.includes('<span class="sr-only">: not needed</span>') && open.includes('<span class="sr-only">: current</span>') && open.includes('<span class="sr-only">: pending</span>'));
  assert.ok(open.includes("Not needed: everything can be taken back by Housekeeper"));
  for (const lang of ["de", "en"]) {
    const text = panel(lang).el.t.bind(panel(lang).el);
    for (const key of ["stepsLabel", "stepSelect", "stepAnalysis", "stepConfirm", "stepBackup", "stepRun", "stepVerify", "stepDone", "stepCurrent", "stepTodo", "stepSkipped", "stepFailed", "undoHousekeeper", "undoBackupOnly", "backupRestoreHint", "planDetails"]) assert.notEqual(text(key), key, `${lang} ${key}`);
  }
});

const graphData = () => {
  const obj = (object_type, object_id, name, status = "active", extra = {}) => ({ object_type, object_id, name, status, ...extra });
  const edge = (source, target, relation, confidence = "certain") => ({ source, target, relation, confidence });
  return { ...DATA, findings: [],
    objects: [obj("config_entry", "C", "Hub Eintrag"), obj("device", "D", "Gerät D"), obj("entity", "sensor.e", "Sensor E", "orphaned", { device_id: "D" }),
      obj("automation", "automation.a", "Automation A"), obj("script", "script.s", "Skript S"), obj("automation", "automation.b", "Automation B")],
    edges: [
      edge("config_entry:C", "device:D", "OWNS"), edge("device:D", "entity:sensor.e", "PROVIDES"),
      edge("automation:automation.a", "entity:sensor.e", "TRIGGERS_ON"), edge("script:script.s", "entity:sensor.e", "REFERENCES", "probable"),
      edge("automation:automation.b", "script:script.s", "TARGETS"), edge("script:script.s", "automation:automation.a", "TARGETS"),
      edge("entity:sensor.e", "entity:sensor.gone", "REFERENCES"),
    ] };
};
const graphPanel = (lang = "en", pref = "graph") => {
  const env = panel(lang);
  env.el.data = graphData();
  env.el.prefs = { ...env.el.prefs, graphMode: pref };
  env.el.graphSelected = env.el.findObject("entity:sensor.e");
  env.el.view = "graph";
  return env;
};
const keysOf = levels => levels.map(level => level.map(n => n.key).sort().join(","));

test("the graph model walks origin to the left and users to the right, level by level", () => {
  const { el } = graphPanel();
  const item = el.graphSelected, key = "entity:sensor.e";
  const one = el.graphModel(item, key, { depth: 1 });
  assert.equal(JSON.stringify(keysOf(one.left)), JSON.stringify(["device:D"]));
  assert.equal(JSON.stringify(keysOf(one.right)), JSON.stringify(["automation:automation.a,entity:sensor.gone,script:script.s"]));
  assert.equal(one.missing, 1, "the target without an object is counted");
  assert.equal(one.probable, 1);
  const three = el.graphModel(item, key, { depth: 3 });
  assert.equal(JSON.stringify(keysOf(three.left)), JSON.stringify(["device:D", "config_entry:C"]));
  assert.equal(JSON.stringify(keysOf(three.right)), JSON.stringify(["automation:automation.a,entity:sensor.gone,script:script.s", "automation:automation.b"]));
  assert.equal(three.cycles, 1, "script S targets automation A, which already stands one level closer");
  assert.equal(three.count, 6);
  assert.equal(three.hidden, 0);
  assert.equal(three.right[1][0].via, "in");
});

test("graph filters by relation and certainty, and limits the nodes", () => {
  const { el } = graphPanel();
  const item = el.graphSelected, key = "entity:sensor.e";
  const trig = el.graphModel(item, key, { depth: 3, relation: "TRIGGERS_ON" });
  assert.equal(JSON.stringify(keysOf(trig.right)), JSON.stringify(["automation:automation.a"]));
  assert.equal(trig.left.length, 0, "the origin edge is filtered too");
  const sure = el.graphModel(item, key, { depth: 3, certainOnly: true });
  // The probable edge from script S is gone; S is still reached, one level later, over its certain edge to automation A.
  assert.equal(JSON.stringify(keysOf(sure.right)), JSON.stringify(["automation:automation.a,entity:sensor.gone", "script:script.s", "automation:automation.b"]));
  assert.equal(sure.probable, 0);
  const small = el.graphModel(item, key, { depth: 3, limit: 1 });
  assert.equal(small.right.flat().length, 1);
  assert.ok(small.hidden >= 2, "what does not fit is counted");
  assert.ok(small.edges.every(e => [...small.left.flat(), ...small.right.flat()].some(n => n.key === e.from) || e.from === key));
});

test("five or more leaf nodes of one type fold into one node that opens on a click", () => {
  const { el, shadow } = graphPanel();
  const data = graphData();
  for (let i = 0; i < 6; i++) {
    data.objects.push({ object_type: "automation", object_id: `automation.x${i}`, name: `X${i}`, status: "active" });
    data.edges.push({ source: `automation:automation.x${i}`, target: "entity:sensor.e", relation: "TRIGGERS_ON", confidence: "certain" });
  }
  el.data = data;
  const folded = el.graphModel(el.graphSelected, "entity:sensor.e", { depth: 1 });
  const node = folded.right[0].find(n => n.group);
  assert.equal(node.group.length, 7, "the six new automations and automation A");
  assert.ok(folded.edges.every(e => !e.from.startsWith("automation:automation.x")), "edges end at the group");
  el.graphDepth = 1;
  el.render();
  assert.ok(shadow.innerHTML.includes('data-graph-group="'));
  const id = node.key.slice(6);
  const open = el.graphModel(el.graphSelected, "entity:sensor.e", { depth: 1, open: new Set([id]) });
  assert.equal(open.right[0].filter(n => n.group).length, 0);
});

test("the sort and filter of a list come back, the search text does not; findings can be selected", () => {
  const storage = fakeStorage();
  const { el, shadow } = panel("en", { localStorage: storage });
  el.lvState("demo", "name", "asc");
  el.lv.demo.sort = "since"; el.lv.demo.dir = "desc"; el.lv.demo.q = "abc"; el.lv.demo.f.type = "x";
  el.persistLv("demo");
  const again = panel("en", { localStorage: storage }).el.lvState("demo", "name", "asc");
  assert.equal(`${again.sort}|${again.dir}|${again.q}|${again.f.type}`, "since|desc||x");
  el.data = { ...DATA, findings: [{ ...DATA.findings[0], key: "k1" }] };
  el.view = "findingsNav"; el.findSel = new Set(["k1"]);
  el.render();
  assert.ok(shadow.innerHTML.includes('data-fsel-state="status"'), "the selection bar is shown");
  assert.ok(!/data-fsel-group="og:/.test(shadow.innerHTML), "the head of its object has no box of its own, so it is not ticked with it");
  assert.equal(el.exportRows().length, 1);
});

test("a bulk action keeps the failed findings selected, and a full list of saved views is not overwritten", async () => {
  const { el } = panel("en");
  const toasts = [];
  el.toast = text => toasts.push(text);
  el.data = { ...DATA, findings: ["k1", "k2", "k3"].map(key => ({ ...DATA.findings[0], key, ignored: false })) };
  el.findSel = new Set(["k1", "k2", "k3"]);
  el._hass = { callWS: async msg => { if (msg.finding_key === "k2") throw new Error("boom"); return {}; } };
  await el.hideSelectedFindings();
  assert.deepEqual([...el.findSel], ["k2"]);
  assert.ok(toasts[0].startsWith("2 of 3 done, 1 failed"));
  el._views = { demo: Array.from({ length: 10 }, (_, i) => ({ name: `v${i}`, q: "", f: {}, sort: "name", dir: "asc" })) };
  el.lvState("demo", "name", "asc");
  el.commitView("demo", "new");
  assert.equal(el._views.demo.length, 10);
  assert.ok(!el._views.demo.some(v => v.name === "new") && el._views.demo[9].name === "v9");
});

test("the scan health banner shows only for a failed or an old scan, with the phase and the last good scan", () => {
  const { el } = panel("en");
  const meta = state => ({ ...DATA.meta, scan_health: { state, failed_phase: "automations", last_success_at: "2026-10-11T14:02:00+00:00", consecutive_failures: 3, error: "RuntimeError: boom" } });
  el.data = { ...DATA, meta: meta("ok") };
  assert.equal(el.healthBanner(), "");
  el.data = { ...DATA, meta: meta("failed") };
  assert.ok(el.healthBanner().includes("automations") && el.healthBanner().includes("3 failures in a row") && el.healthBanner().includes("boom"));
  el.data = { ...DATA, meta: meta("stale") };
  assert.ok(el.healthBanner().includes("No scan has succeeded since"));
});

test("blueprints tab, notification switch, diagnostics without names and the weekly report", async () => {
  const { el, shadow, downloads } = panel("en");
  el.view = "maintenance"; el.viewTab = { maintenance: "blueprints" };
  el.blueprints = { available: true, unused: 1, missing: 1, broken: 0, domains: [
    { domain: "automation", total: 2, unused: [{ path: "a/idle.yaml", name: "Idle" }], missing: [{ path: "a/gone.yaml", users: [{ id: "automation.c", name: "C" }], count: 1 }], broken: [] },
    { domain: "script", total: 0, unused: [], missing: [], broken: [] }] };
  el._blueprintsRequested = true;
  el.render();
  assert.ok(shadow.innerHTML.includes("a/gone.yaml") && shadow.innerHTML.includes("Idle") && shadow.innerHTML.includes("data-bp-refresh"));
  assert.ok(shadow.innerHTML.includes('data-bp-open="automation/a/idle.yaml"'), "rows open the detail");
  el.bpOpen = "automation/a/idle.yaml"; el._bpDetailKey = "automation/a/idle.yaml";
  el.bpDetail = { available: true, user_count: 1, size: 1200, modified: "2026-10-01T10:00:00+00:00", min_version: "2024.10.0", inputs: [{ key: "light", name: "Light", section: "", selector: "entity", has_default: false, default: null, description: null }],
    users: [{ id: "automation.c", name: "C", inputs: [{ key: "light", state: "missing_entity", value: "light.gone" }] }] };
  el.viewTab.blueprint = "inputs"; el.render();
  assert.ok(shadow.innerHTML.includes("Light") && shadow.innerHTML.includes("No default, must be set"));
  el.viewTab.blueprint = "users"; el.render();
  assert.ok(shadow.innerHTML.includes("light.gone") && shadow.innerHTML.includes("entity missing"));
  el.viewTab.blueprint = "technical"; el.render();
  assert.ok(shadow.innerHTML.includes("2024.10.0"));
  el.bpOpen = "";
  el.view = "settings"; el.settingsTab = "scan";
  el.data = { ...DATA, meta: { ...DATA.meta, notify: true } };
  el.render();
  assert.ok(/data-notify checked/.test(shadow.innerHTML));
  const diag = JSON.stringify(el.diagnosticsData());
  assert.ok(!diag.includes("sensor.a") && diag.includes("findings_by_rule"), "numbers only, no ids");
  el.data = DATA;
  el.compare = { available: true, baseline_at: "2026-10-01T00:00:00+00:00", baselines: [], status_changes: { total: 0, items: [] }, new_findings: { total: 1, items: [DATA.findings[0]] }, resolved_findings: { total: 0, items: [] }, new_objects: { total: 0, items: [] }, removed_objects: { total: 0, items: [] } };
  await el.weeklyReport();
  assert.ok(downloads.at(-1).text.includes("# Housekeeper report") && downloads.at(-1).text.includes("sensor.a"));
});

test("orphaned statistics are selected and turned into a purge plan, which asks for the word; replacements get successor hints", async () => {
  const { el, shadow } = panel("en");
  const orphans = [{ statistic_id: "sensor.old_power", unit: "W", has_mean: true, in_energy: false }, { statistic_id: "sensor.grid", unit: "kWh", has_sum: true, in_energy: true }];
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true }, orphaned_statistics: orphans,
    objects: [...DATA.objects, { object_type: "entity", object_id: "sensor.new_power", name: "N", status: "active", unit: "W" }] };
  el.view = "unreferenced"; el.unrefTab = "statistics"; el._orphanLastRequested = true;
  el.render();
  assert.ok(shadow.innerHTML.includes('data-psel="sensor.old_power"') && !shadow.innerHTML.includes('data-psel="sensor.grid"'), "an Energy series cannot be picked");
  el.purgeSel.add("sensor.old_power"); el.purgeOpen = true;
  el.render();
  assert.ok(!/data-purge-run disabled/.test(shadow.innerHTML), "making the preview needs no word: the plan asks for it");
  const asked = [];
  el._hass = { language: "en", callWS: async msg => { asked.push(msg); return { plan_id: "p9", status: "dry_run", actions: [], summary: {} }; } };
  el.load = async () => {};
  await el.purgeRun();
  assert.equal(JSON.stringify(asked[0]), JSON.stringify({ type: "ha_housekeeper/plan_create", actions: [{ kind: "purge_statistics", object_id: "sensor.old_power", states: true }] }));
  assert.equal(el.purgeSel.size, 0);
  assert.equal(el.view, "plan");
  assert.equal(el.plan.plan_id, "p9");
  assert.equal(el.planWord({ actions: [{ kind: "purge_statistics", executable: true }] }), "DELETE");
  assert.equal(el.successorsOf("sensor.power_new", "W")[0].object_id, "sensor.new_power");
});

test("the layout puts levels in columns without overlapping nodes", () => {
  const { el } = graphPanel();
  const model = el.graphModel(el.graphSelected, "entity:sensor.e", { depth: 3 });
  const layout = el.graphLayout(model), x = key => layout.at.get(key).x;
  assert.ok(x("config_entry:C") < x("device:D") && x("device:D") < x("entity:sensor.e") && x("entity:sensor.e") < x("script:script.s") && x("script:script.s") < x("automation:automation.b"));
  const boxes = [...layout.at.values()];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a.x + layout.W <= b.x || b.x + layout.W <= a.x || a.y + layout.H <= b.y || b.y + layout.H <= a.y, "no two nodes overlap");
  }
  assert.ok(boxes.every(b => b.y >= 0 && b.y + layout.H <= layout.height + 0.001));
});

test("edges that share a side of a node leave it at different heights", () => {
  const { el, shadow } = graphPanel();
  el.graphDepth = 3;
  el.render();
  const starts = [...shadow.innerHTML.matchAll(/<path class="gedge[^"]*" d="M([\d.]+),([\d.]+) /g)].map(m => `${m[1]},${m[2]}`);
  assert.ok(starts.length > 1);
  const ends = [...shadow.innerHTML.matchAll(/ ([\d.]+),([\d.]+)" (?:marker-end|marker-start)/g)].map(m => `${m[1]},${m[2]}`);
  const both = [...starts, ...ends], rep = both.filter((x, i) => both.indexOf(x) !== i);
  assert.equal(rep.length, 0, "no two edge ends coincide");
});

test("a long journal and long relation groups get a search box", () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, objects: [], edges: [], findings: [], quarantine: [] };
  el.view = "cleanup";
  el.journal = Array.from({ length: 8 }, (_, i) => ({ plan_id: `p${i}`, created_at: `2026-10-0${i + 1}T10:00:00+00:00`, status: "verified", summary: { total: 1, ok: 1, review: 0, blocked: 0 } }));
  el.view = "journal";
  el.render();
  assert.ok(shadow.innerHTML.includes('data-lq="journal"'));
  el.lv.journal.q = "zzz";
  el.render();
  assert.ok(!shadow.innerHTML.includes("data-plan-open="));
});

test("the graph is an SVG with focusable nodes, edge directions and text for what colour shows", () => {
  const { el, shadow } = graphPanel();
  el.graphDepth = 3;
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes('<svg class="graphsvg" role="group" aria-label="Dependency graph of'));
  assert.equal((html.match(/<g class="gnode[^"]*" data-graph="[^"]+" tabindex="0" role="button"/g) || []).length, 6, "every node but the centre can be opened with the keyboard");
  assert.equal((html.match(/class="gnode center"/g) || []).length, 1);
  assert.ok(html.includes("Orphaned") || html.includes("Verwaist") || /Entity · \w+/.test(html), "status stands in the node as text");
  assert.ok(html.includes("missing") && html.includes('class="gnode missing"'), "a missing target is marked and says so");
  assert.ok(/class="gedge prob"/.test(html) && /class="gedge cycle"/.test(html));
  // device D provides E (left to right): the arrow is at the right end; automation A triggers on E (right to left): at the left end
  const device = /<path class="gedge" d="[^"]+" marker-end="url\(#hk-arrow\)"><title>device:D → entity:sensor.e/.test(html);
  const automation = /<path class="gedge" d="[^"]+" marker-start="url\(#hk-arrow\)"><title>automation:automation.a → entity:sensor.e/.test(html);
  assert.ok(device && automation, "arrows follow the direction of the data");
  assert.ok(html.includes("Missing targets: 1") && html.includes("Probable relations: 1") && html.includes("Cycles: 1"));
  assert.ok(html.includes('data-fold="graph_legend"') && !html.includes("Solid: certain"));
});

test("the graph bar switches between list and graph, sets depth and filters", () => {
  const { el, shadow } = graphPanel("en", "list");
  el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes('data-pref="graphMode|graph"') && html.includes('aria-pressed="false"'));
  assert.ok(!html.includes('<svg class="graphsvg"') && html.includes('<div class="path">'), "the list is the default");
  el.prefs = { ...el.prefs, graphMode: "graph" };
  el.render();
  html = shadow.innerHTML;
  assert.ok(html.includes('<svg class="graphsvg"') && !html.includes('<div class="path">'));
  for (const text of ["Levels", "All relations", "Certain only", "What breaks when removed?"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes('<option value="TRIGGERS_ON"'), "the relation filter lists the relations that exist");

  const depthButtons = [1, 2, 3].map(n => ({ dataset: { graphDepth: String(n) } }));
  const select = id => ({ value: "" });
  const relation = select(), conf = select(), more = {}, impact = {};
  shadow.querySelectorAll = selector => (selector === "[data-graph-depth]" ? depthButtons : []);
  shadow.querySelector = selector => ({ "#graphRel": relation, "#graphConf": conf, "[data-graph-impact]": { addEventListener: (_, fn) => { impact.fn = fn; } }, "[data-graph-more]": { addEventListener: (_, fn) => { more.fn = fn; } } }[selector] || null);
  el.render();
  depthButtons[2].onclick();
  assert.equal(el.graphDepth, 3);
  relation.value = "TRIGGERS_ON"; relation.onchange();
  assert.equal(el.graphRel, "TRIGGERS_ON");
  conf.value = "certain"; conf.onchange();
  assert.equal(el.graphConf, "certain");
  impact.fn();
  assert.equal(el.graphImpact, true);
  more.fn();
  assert.equal(el.graphLimit, 80);
});

test("on a narrow screen only the list is offered", () => {
  const { el, shadow } = graphPanel("en", "graph");
  const narrow = { matchMedia: () => ({ matches: false }) };
  const env = panel("en", narrow);
  env.el.data = graphData(); env.el.prefs = { ...env.el.prefs, graphMode: "graph" }; env.el.graphSelected = env.el.findObject("entity:sensor.e"); env.el.view = "graph";
  assert.equal(env.el.canGraph(), false);
  env.el.render();
  assert.ok(!env.shadow.innerHTML.includes('<svg class="graphsvg"') && env.shadow.innerHTML.includes('<div class="path">'));
  assert.ok(!env.shadow.innerHTML.includes("graphMode|"), "no switch without room for the graph");
  assert.equal(el.canGraph(), true);
  assert.ok(shadow !== undefined);
});

test("what breaks when the object is removed is highlighted, others fade", () => {
  const { el, shadow } = graphPanel();
  el.graphDepth = 2; el.graphImpact = true;
  el.render();
  const html = shadow.innerHTML;
  assert.ok(/<g class="gnode hit" data-graph="automation:automation.a"/.test(html) && /aria-label="Automation: Automation A, [^"]*breaks"/.test(html));
  assert.ok(/<g class="gnode gdim" data-graph="device:D"/.test(html));
  assert.ok(/class="gedge hit"/.test(html));
  const auto = graphPanel();
  auto.el.graphSelected = auto.el.findObject("automation:automation.a");
  auto.el.render();
  assert.ok(!auto.shadow.innerHTML.includes("data-graph-impact"), "nothing breaks when an automation goes: no button");
});

test("graph nodes open with Enter and Space and recentre the graph", () => {
  const { el, shadow } = graphPanel();
  const node = { dataset: { graph: "automation:automation.a" } };
  node.target = node;
  shadow.querySelectorAll = selector => (selector === "tr[data-object], g[data-graph]" ? [node] : selector === "[data-graph]" ? [node] : []);
  el.render();
  assert.equal(typeof node.onclick, "function");
  const ev = { key: "Enter", target: node, preventDefault() { this.prevented = true; } };
  node.onkeydown(ev);
  assert.ok(ev.prevented);
  assert.equal(el.graphSelected.object_id, "automation.a", "SVG nodes have no click(), so the handler is called directly");
  assert.equal(el.graphLimit, 40);
});

test("a large installation renders every view within generous time limits", () => {
  const { el } = panel("en");
  el.data = makeLoadFixture(8000);
  const views = ["overview", "inventory", "findingsNav", "unreferenced", "cleanup", "graph", "changes", "batteries"];
  const timings = {};
  for (const view of views) {
    el.view = view; el.pages = {};
    const started = performance.now();
    el.render();
    timings[view] = performance.now() - started;
  }
  // Limits are far above what a run takes (a few milliseconds) so only a real regression trips them.
  for (const [view, ms] of Object.entries(timings)) assert.ok(ms < 1500, `${view} took ${Math.round(ms)} ms`);
  // The expensive parts are cached: a second render of the same list is cheap.
  el.view = "inventory";
  const again = performance.now();
  el.render();
  assert.ok(performance.now() - again < 500);
  // Detail, relations and impact of one object stay fast with 8,000 objects and their edges.
  const entity = el.data.objects.find(o => o.object_type === "device");
  const started = performance.now();
  el.selected = entity; el.details = new Map(); el.detailTab = "relations"; el.render();
  el.detailTab = "overview"; el.render();
  assert.ok(performance.now() - started < 1500, "an object page");
  const graph = performance.now();
  el.selected = null; el.view = "graph"; el.graphSelected = entity; el.prefs = { ...el.prefs, graphMode: "graph" }; el.graphDepth = 3; el.render();
  assert.ok(performance.now() - graph < 1500, "the graph");
});

test("the whole confirmation flow works end to end against a scripted backend", async () => {
  const sent = [], snapshots = [];
  const action = { kind: "remove_entity", object_id: "sensor.old", name: "Old", verdict: "ok", executable: true, reasons: [], used_by: [] };
  const plan = (status, extra = {}) => ({ plan_id: "p1", created_at: new Date().toISOString(), status, executed: status !== "dry_run", summary: { total: 1, ok: 1, review: 0, blocked: 0 }, actions: [{ ...action, ...(extra.result ? { result: extra.result } : {}) }], ...(extra.plan || {}) });
  const statuses = [
    { progress: { running: true, phase: "backup" }, plan: plan("backup") },
    { progress: { running: true, phase: "running", done: 0, total: 1 }, plan: plan("running", { plan: { backup: { job_id: "j1", at: "2026-10-07T10:01:00+00:00" } } }) },
    { progress: { running: false }, plan: plan("verified", { result: { state: "done" }, plan: { backup: { job_id: "j1", at: "2026-10-07T10:01:00+00:00" }, verification: { ok: true, checks: [] } } }) },
  ];
  let undone = false;
  const { el, shadow } = panel("en", { setTimeout: fn => { fn(); return 0; } });
  el.data = { ...DATA, objects: [...DATA.objects, { object_type: "entity", object_id: "sensor.old", name: "Old", status: "disabled" }] };
  el._hass = { language: "en", callWS: async msg => {
    sent.push(msg.type.replace("ha_housekeeper/", ""));
    switch (msg.type) {
      case "ha_housekeeper/plan_create": return plan("dry_run");
      case "ha_housekeeper/plan_confirm": return { plan_id: "p1", token: "tok", execute: ["sensor.old"], needs_acknowledgement: [] };
      case "ha_housekeeper/plan_execute": assert.equal(msg.token, "tok"); return { started: true };
      case "ha_housekeeper/plan_status":
        if (undone) return { progress: { running: false }, plan: plan("undone", { result: { state: "undone" }, plan: { backup: { job_id: "j1", at: "2026-10-07T10:01:00+00:00" }, verification: { ok: true, checks: [] } } }) };
        return statuses.shift() || statuses.at(-1);
      case "ha_housekeeper/plan_undo": undone = true; return { results: [{ object_id: "sensor.old", outcome: "undone" }], status: "undone" };
      default: return el.data;
    } } };
  const render = el.render.bind(el);
  el.render = () => {
    render();
    if (el.plan) snapshots.push({ steps: stepStates(el.planSteps(el.plan, Boolean(el.confirmation))), live: el.liveStatus(), scanDisabled: el.cleanupRunning() });
  };
  el.view = "cleanup"; el.cleanupKind = "remove_entity"; el.cleanupSel = new Set(["sensor.old"]);

  await el.createPlan();
  assert.equal(el.plan.status, "dry_run");
  assert.ok(shadow.innerHTML.includes("data-plan-confirm"), "the plan asks for confirmation");
  assert.equal(stepStates(el.planSteps(el.plan, false)), "Select:done Analysis:current Confirm:todo Backup:todo Run:todo Verify:todo");

  await el.confirmPlan();
  assert.equal(el.confirmation.token, "tok");
  assert.ok(!shadow.innerHTML.includes("data-confirm-word") && !shadow.innerHTML.includes("data-plan-execute"), "one step, no word is typed");

  await el.executePlan();
  for (let i = 0; i < 100 && el._polling; i++) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(el._polling, null, "polling ended");
  assert.equal(el.plan.status, "verified");
  const seen = snapshots.map(s => s.steps);
  assert.ok(seen.includes("Select:done Analysis:done Confirm:done Backup:current Run:todo Verify:todo"), "the backup step was shown while it ran");
  assert.ok(seen.some(s => s.includes("Backup:done Run:current")), "then the run");
  assert.equal(seen.at(-1), "Select:done Analysis:done Confirm:done Backup:done Run:done Verify:done");
  assert.ok(snapshots.some(s => s.live.includes("Backup running")) && snapshots.some(s => s.scanDisabled), "screen readers and the scan button follow the run");
  assert.equal(JSON.stringify(sent.filter(type => type !== "plan_list").slice(0, 7)), JSON.stringify(["plan_create", "plan_confirm", "plan_execute", "plan_status", "plan_status", "plan_status", "inventory"]));
  assert.ok(shadow.innerHTML.includes("data-undo-all") && shadow.innerHTML.includes("Created"), "undo and the backup record are offered");
  el.undoAsk = "all"; el.render();
  assert.ok(shadow.innerHTML.includes("data-undo-all-yes") && !shadow.innerHTML.includes("data-undo-all>"), "undo asks before it goes");

  await el.undoPlan();
  assert.equal(el.undoAsk, null);
  assert.equal(el.plan.status, "undone");
  assert.ok(el.undoMessage.includes("sensor.old: restored"));
  assert.ok(!el.cleanupRunning());
});

const RELIABILITY = {
  available: true, busy: false, cached: false, took_ms: 2800, window_days: 7,
  entries: [
    { entry_id: "e1", title: "Cloud <b>Hub</b>", domain: "hue", state: "setup_retry", reauth: true, entities: 12, permanent: 2, availability: 93.4, shared_outages: 3, longest_outage: 7200, layer: "cloud", last_disruption: { end: 1791470000, seconds: 3600, shared: true } },
    { entry_id: "e2", title: "Local Box", domain: "zha", state: "loaded", reauth: false, entities: 5, permanent: 0, availability: 100, shared_outages: 0, longest_outage: 0, layer: null, last_disruption: null },
    { entry_id: "e9", title: "Dead Gate", domain: "shelly", state: "setup_error", reauth: false, entities: 0, permanent: 6, dead: true, availability: null, shared_outages: 0, longest_outage: 0, layer: null, last_disruption: null },
  ],
};

test("the reliability view lists the worst integration first with numbers, words and the guessed layer", async () => {
  const { el, shadow } = panel("en");
  el.data = DATA; el.view = "reliability";
  el._hass = { language: "en", callWS: async () => RELIABILITY };
  el.render();
  assert.ok(shadow.innerHTML.includes("Evaluating the recorder"));
  await el.loadReliability();
  const html = shadow.innerHTML;
  for (const text of [el.t("relTabIntegrations"), "Cloud &lt;b&gt;Hub&lt;/b&gt;", "93.4 %", "12 entities", "2 h", "probably the cloud or its API", "Re-authentication open", "setup_retry", "No disruption", "calculated in 2.8 s", "24 hours", "7 days", "30 days"]) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf("Dead Gate") < html.indexOf("Cloud &lt;b&gt;") && html.indexOf("Cloud &lt;b&gt;") < html.indexOf("Local Box"), "the dead one first");
  assert.ok(!html.includes("<b>Hub</b>"));
  assert.ok(html.includes("Down all the time") && html.includes("6 entities, the whole window") && html.includes("Avg per integration"));
  assert.ok(!html.includes("Re-authentication open</button>") && html.includes('data-jump="findingsNav" data-filter="config_entry.reauth"'));
});

test("reliability rows open the integration, and its detail page shows the numbers with the affected entities", async () => {
  const { el, shadow } = panel("en");
  const entry = { object_type: "config_entry", object_id: "e1", name: "Hue", status: "active", state: "loaded", domain: "hue" };
  el.data = { ...DATA, monitor: [{ id: "m1", name: "Light <b>function</b>", enabled: true, members: [{ object_key: "entity:light.a" }] }], objects: [...DATA.objects.filter(o => o.object_type !== "config_entry"), entry, { object_type: "entity", object_id: "light.a", name: "Lamp A", config_entry_id: "e1", status: "active" }] };
  el.view = "reliability";
  const days = Array.from({ length: 8 }, (_, i) => ({ date: `2026-10-0${i + 1}`, seconds: i === 2 ? 7200 : i === 5 ? 300 : 0 }));
  const periods = [{ start: 1791470000, end: 1791477200, seconds: 7200, kind: "shared", affected: 9 }];
  const withEntities = { ...RELIABILITY, computed_at: 1791470000, entries: [{ ...RELIABILITY.entries[0], days, periods, period_total: 3, affected_total: 20, affected: [{ entity_id: "light.a", name: "Lamp <i>A</i>", availability: 91.2 }] }, RELIABILITY.entries[1]] };
  el._hass = { language: "en", callWS: async () => withEntities };
  await el.loadReliability();
  const list = shadow.innerHTML;
  assert.ok(list.includes('data-object="config_entry:e1"'), "known entries open");
  assert.ok(!list.includes('data-object="config_entry:e2"'), "unknown entries stay plain rows");
  el.selected = entry; el.view = "detail"; el.detailTab = "reliability";
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes('data-detail-tab="reliability"'));
  for (const text of ["Entities with downtime (20)", "Lamp &lt;i&gt;A&lt;/i&gt;", "91.2 %", 'data-object="entity:light.a"', "Showing the 1 with the lowest availability of 20"]) assert.ok(html.includes(text), text);
  for (const text of ["Outage periods (3)", "9 of 14 entities", ">Shared<", 'class="problem short"', 'class="problem"', "Showing the last 1 of 3.", "Carries the house functions", 'data-monitor-last="m1"', "Light &lt;b&gt;function&lt;/b&gt;"]) assert.ok(html.includes(text), text);
  const facts = el.knownCard(entry, "config_entry:e1");
  assert.ok(facts.includes("Availability (7 days)") && facts.includes("93.4 %"));
  assert.ok(el.knownCard({ ...entry, status: "problem", reauth: true }, "config_entry:e1").includes("New login open"), "a loaded entry that wants a login says so");
  el.selected = { ...entry, object_id: "e3" }; el.detailTab = "reliability"; el.render();
  assert.ok(!shadow.innerHTML.includes('data-detail-tab="reliability"'), "no tab without numbers");
});

test("a window longer than the recorder keeps gets a note, in reliability and in the write load", () => {
  const { el } = panel("en");
  assert.ok(el.keepNote({ keep_days: 10, window_days: 30 }).includes("keeps only 10 days"));
  assert.equal(el.keepNote({ keep_days: 10, window_days: 7 }), "");
  assert.equal(el.keepNote({ keep_days: null, window_days: 30 }), "");
});

test("an old reliability reply is shown at once and renewed once in the background", async () => {
  const calls = [];
  const { el, shadow } = panel("en");
  el.data = DATA; el.view = "reliability";
  el._hass = { language: "en", callWS: async msg => { calls.push({ ...msg }); return msg.refresh ? { ...RELIABILITY, stale: false } : { ...RELIABILITY, stale: true, age_seconds: 3600, computed_at: 1791470000 }; } };
  await el.loadReliability();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(calls.map(c => c.refresh)), "[false,true]", "one renewal, no loop");
  assert.ok(!el.reliability.stale);
  el.reliability = { ...RELIABILITY, stale: true, age_seconds: 3600, computed_at: 1791470000 };
  assert.ok(el.reliabilityView().includes("As of "), "the age is named");
});

test("the reliability window switch and refresh ask the backend with the right arguments, once per window", async () => {
  const queue = [];
  const { el } = panel("en", { setTimeout: fn => { queue.push(fn); return 0; } });
  const calls = [];
  el._hass.callWS = async msg => { calls.push(msg); return RELIABILITY; };
  const drain = async () => { while (queue.length) await queue.shift()(); };
  el.data = DATA; el.view = "reliability";
  el.ensureReliability(); el.ensureReliability(); el.render();
  await drain();
  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0] }, { type: "ha_housekeeper/reliability", window_days: 7, refresh: false });
  el.relWindow = 1; el.ensureReliability(); await drain();
  assert.equal(calls[1].window_days, 1);
  el.relWindow = 30; el.ensureReliability(); await drain();
  assert.equal(calls[2].window_days, 30);
  await el.loadReliability(true);
  assert.equal(calls[3].refresh, true);
});

const UNSTABLE = {
  total: 31, items: [
    { entity_id: "sensor.<b>x</b>", name: "Flatter <i>1</i>", entry_id: "e1", entry_title: "Zigbee", episodes: 12, per_day: 1.7, total_seconds: 4800, mean_seconds: 400, level: "flapping", pattern_hour: 23, used: 2 },
    { entity_id: "sensor.y", name: "Wackler", entry_id: "e1", entry_title: null, episodes: 4, per_day: 0.6, total_seconds: 120, mean_seconds: 30, level: "unstable", pattern_hour: null, used: 0 },
  ],
};

const RUNS = {
  schema: 1, window_days: 7, since: "2026-10-01T08:00:00+00:00", total: 3,
  items: [
    { object_type: "automation", entity_id: "automation.flur", name: "Flur <b>Licht</b>", status: "active", runs: 48, ok: 30, errors: 18, conditions: 0, mean_ms: 1200, max_ms: 95000, per_day: [2, 5, 8, 9, 7, 9, 8], lower_bound: true,
      findings: [{ kind: "failing", level: "warn", errors: 18, runs: 48, step: "action/2", step_count: 12 }, { kind: "long_wait", level: "info", seconds: 600 },
        { kind: "after_update", level: "warn", event: "ha_version", to: "2026.10.0", rate_before: 5, rate_after: 40 }] },
    { object_type: "script", entity_id: "script.nacht", name: "Nacht", status: "active", runs: 6, ok: 0, errors: 6, conditions: 0, mean_ms: null, max_ms: null, per_day: [0, 0, 1, 2, 1, 1, 1], lower_bound: false,
      findings: [{ kind: "never_ok", level: "red", runs: 6 }] },
    { object_type: "automation", entity_id: "automation.heizung", name: "Heizung", status: "active", runs: 140, ok: 140, errors: 0, conditions: 0, mean_ms: 300, max_ms: 900, per_day: [20, 20, 20, 20, 20, 20, 20], lower_bound: false, findings: [] },
  ],
};

test("the runs view loads once per visit and counts again on request", async () => {
  const queue = [];
  const { el } = panel("en", { setTimeout: fn => { queue.push(fn); return 0; } });
  const calls = [];
  el._hass.callWS = async msg => { calls.push(msg); return RUNS; };
  const drain = async () => { while (queue.length) await queue.shift()(); };
  el.data = DATA; el.view = "runs"; el.viewTab = { runs: "runs" };
  el.ensureRuns(); el.ensureRuns(); el.render();
  await drain();
  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0] }, { type: "ha_housekeeper/automation_runs" });
  await el.loadRuns();
  assert.equal(calls.length, 2);
});

test("conflicts and loops show their stage and escape names", () => {
  const { el } = panel("en");
  el.folds = { runs_conflicts: true };
  const html = el.conflictsPanel({ conflicts: { items: [
    { kind: "opposing", stage: "confirmed", days: 3, entity_id: "light.hall", automations: [{ entity_id: "automation.on", name: "On <i>x</i>" }, { entity_id: "automation.off", name: "Off" }], commands: ["light.turn_on", "light.turn_off"], reason: "trigger", detail: "sensor.door" },
    { kind: "loop", stage: "static", days: 0, entities: ["sensor.x", "sensor.y"], automations: [{ entity_id: "automation.a", name: "A" }] }] } });
  assert.ok(html.includes("repeated") && html.includes("possible") && html.includes("sensor.x</code> → <code>sensor.y"));
  assert.ok(!html.includes("<i>x</i>") && html.includes('data-object="automation:automation.on"'));
  assert.ok(html.includes('data-lsort="runs_conflicts|stage|asc"') && html.includes('class="tablewrap lt') && html.includes("Opposing") && html.includes("Loop"), "the conflicts are a table with stage and kind");
  assert.equal(el.conflictsPanel({}), "");
});

test("the graph goes back one node at a time, then to the page it was opened from", () => {
  const { el, shadow } = panel("en");
  const a = { object_type: "entity", object_id: "sensor.a", name: "Alpha", status: "active" };
  const b = { object_type: "entity", object_id: "sensor.b", name: "Beta", status: "active" };
  const c = { object_type: "entity", object_id: "sensor.c", name: "Gamma", status: "active" };
  el.data = { ...DATA, objects: [...DATA.objects, a, b, c] };
  el.selected = a; el.view = "detail"; el.detailTab = "technical";
  el.openGraph(a);
  assert.equal(el.view, "graph"); assert.equal(el.selected, null);
  assert.equal(el.graphBackLabel(), "Alpha", "the first back goes to the detail page");
  el.noteGraphStep(b); el.graphSelected = b;
  el.noteGraphStep(c); el.graphSelected = c;
  assert.equal(el.graphBackLabel(), "Beta");
  assert.ok(shadow.innerHTML.includes('data-action="graph-back"') || el.graph().includes('data-action="graph-back"'));
  el.graphBack();
  assert.equal(el.graphSelected, b);
  el.graphBack();
  assert.equal(el.graphSelected, a);
  el.graphBack();
  assert.equal(el.selected, a, "back on the detail page");
  assert.equal(el.detailTab, "technical", "with the tab it was left on");
  assert.equal(el.graphOrigin, null);
  assert.equal(el.graphBackLabel(), "");
});

test("leaving a page through a link keeps it for back, the menu clears the trail", () => {
  const { el } = panel("en");
  el.data = DATA; el.view = "overview";
  el.noteJump("findingsNav"); el.view = "findingsNav";
  el.noteJump("findingsNav");
  assert.equal(el.viewTrail.length, 1, "no step for the page we are on");
  assert.ok(el.heading().includes('data-action="view-back"') && el.heading().includes("Back to"));
  el.viewBack();
  assert.equal(el.view, "overview");
  assert.equal(el.viewTrail.length, 0);
  assert.ok(!el.heading().includes('data-action="view-back"'));
});

test("going back from a detail page restores the tab the previous one was left on", async () => {
  const { el } = panel("en");
  const a = { object_type: "entity", object_id: "sensor.a", name: "Alpha", status: "active" };
  const b = { object_type: "entity", object_id: "sensor.b", name: "Beta", status: "active" };
  el.data = { ...DATA, objects: [...DATA.objects, a, b] };
  el._hass = { language: "en", callWS: async () => ({}) };
  await el.openObject(a);
  el.detailTab = "relations";
  await el.openObject(b);
  assert.equal(el.detailTab, "overview");
  el.goBack();
  assert.equal(el.selected, a); assert.equal(el.detailTab, "relations");
  el.goBack();
  assert.equal(el.selected, null);
});

test("slow recorder views ask again by themselves while another calculation holds the lock, and renew an old reply once", async () => {
  const timers = [];
  const { el } = panel("en", { setTimeout: (fn, ms) => { timers.push([fn, ms]); return 0; } });
  el.data = DATA; el.view = "recorder";
  const calls = [];
  let answer = { available: true, busy: true, findings: [], window_days: 1 };
  el._hass = { language: "en", callWS: async msg => { if (msg.type.endsWith("/storms")) { calls.push(msg.refresh); return answer; } return { available: true, busy: false, findings: [] }; } };
  await el.loadStorms();
  assert.equal(timers.filter(([, ms]) => ms === 8000).length, 1, "one retry is scheduled");
  assert.ok(el.stormsView().includes("asks again by itself"));
  answer = { ...RELIABILITY, available: true, busy: false, stale: true, age_seconds: 3600, computed_at: 1791470000, findings: [], entities: [], integrations: [], events: [], total_rows: 0, per_day: 0, entity_count: 0, event_total: 0 };
  const [retry] = timers.find(([, ms]) => ms === 8000);
  retry();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.stringify(calls), "[false,false,true]", "the stale reply is renewed once with refresh");
  el._busyTries = {};
  for (let i = 0; i < 15; i++) el.followUp("x", "recorder", { busy: true }, () => {}, false);
  assert.equal(timers.filter(([, ms]) => ms === 8000).length <= 13, true, "the retries are limited");
});

test("the runs view searches and filters the table and the list of what stands out, and sorts by column", () => {
  const { el } = panel("en");
  el.data = DATA; el.runs = RUNS; el.view = "runs"; el.viewTab = { runs: "runs" }; el._runsRequested = true;
  assert.ok(!el.runsView().includes('data-lq="runs"'), "a short list needs no search box");
  const st = el.lvState("runs", "runs", "desc");
  st.q = "nacht";
  let html = el.runsView();
  assert.ok(html.includes('data-lq="runs"'), "the box stays while a text is set");
  assert.ok(html.includes("script.nacht") && !html.includes("automation.heizung") && !html.includes("Flur"), "table and attention list are cut");
  st.q = "zzz";
  assert.ok(el.runsView().includes("No matches for these filters."));
  st.q = ""; st.f = { type: "script" };
  html = el.runsView();
  assert.ok(html.includes("script.nacht") && !html.includes("automation.heizung"));
  st.f = { outcome: "errors" };
  html = el.runsView();
  assert.ok(html.includes("script.nacht") && html.includes("automation.flur") && !html.includes("automation.heizung"), "only runs with errors");
  st.f = {}; st.sort = "errors"; st.dir = "desc";
  html = el.runsView();
  assert.ok(html.indexOf("automation.flur") < html.indexOf("script.nacht") && html.indexOf("script.nacht") < html.indexOf("automation.heizung"));
  assert.ok(html.includes('data-lsort="runs|errors|desc"'));
  assert.ok(html.includes("from 3 errors and 20 % of the runs") && html.includes("5 times its own normal (28 days before) and at least 100 runs a day"), "the footnote names the limits");
});

test("reliability and the unstable entities can be searched and filtered", () => {
  const { el } = panel("en");
  el.data = DATA; el.view = "reliability"; el._relRequested = 7;
  const entries = Array.from({ length: 7 }, (_, i) => ({ ...RELIABILITY.entries[1], entry_id: `x${i}`, title: `Box ${i}`, domain: i === 3 ? "zha" : "hue", availability: 99 - i, shared_outages: i === 3 ? 2 : 0, reauth: i === 5, state: i === 6 ? "setup_retry" : "loaded" }));
  const unstable = { total: 7, excluded: {}, items: Array.from({ length: 7 }, (_, i) => ({ entity_id: `sensor.u${i}`, name: `Flatter ${i}`, entry_title: "Hue", level: "unstable", episodes: 3, per_day: 1, total_seconds: 60, mean_seconds: 20, used: 0, pattern_hour: null })) };
  el.reliability = { ...RELIABILITY, entries, unstable, coverage: undefined };
  let html = el.reliabilityView();
  assert.ok(html.includes('data-lq="relentries"') && !html.includes('data-lq="relunstable"'), "the open tab holds its list");
  el.viewTab = { reliability: "unstable" };
  assert.ok(el.reliabilityView().includes('data-lq="relunstable"') && el.reliabilityView().includes('data-lf-set="relunstable|level|unstable"'), "the unstable tab has tiles that set the level filter");
  el.viewTab = {};
  assert.ok(html.indexOf("Box 6") < html.indexOf("Box 0"), "worst availability first");
  el.lvState("relentries", "avail", "asc").f = { state: "outages" };
  html = el.reliabilityView();
  assert.ok(html.includes("Box 3") && !html.includes("Box 0"));
  el.lv.relentries.f = { state: "setup" };
  assert.ok(!el.reliabilityView().includes("Box 3"));
  assert.ok(el.reliabilityView().includes("too small") === false, "five entities are enough for a shared outage");
  el.lv.relentries.f = {}; el.lv.relentries.q = "zha";
  assert.ok(el.reliabilityView().includes("Box 3") && !el.reliabilityView().includes("Box 0"));
  el.lv.relentries.q = ""; el.lvState("relunstable", "", "asc").q = "flatter 4"; el.viewTab = { reliability: "unstable" };
  html = el.reliabilityView();
  assert.ok(html.includes("sensor.u4") && !html.includes("sensor.u2"));
});

test("the load view, the policies and the exposure view have a search box once they are long enough", () => {
  const { el } = panel("en");
  el.data = { ...DATA }; el._stormsRequested = 1; el._exposureRequested = true;
  const entities = Array.from({ length: 7 }, (_, i) => ({ entity_id: `sensor.e${i}`, name: `Laut ${i}`, rows: 10 - i, per_day: 10, no_new_state: 0, attr_bytes: null, peak_hour: null }));
  el.storms = { ...STORMS, entities };
  el.viewTab = { recload: "entities" };
  assert.ok(el.stormsView().includes('data-lq="stormentities"'));
  el.lvState("stormentities", "", "asc").q = "laut 5";
  let html = el.stormsView();
  assert.ok(html.includes("sensor.e5") && !html.includes("sensor.e2"));
  const items = Array.from({ length: 12 }, (_, i) => ({ key: `policy.entity_area|light.l${i}|`, object_type: "entity", object_id: `light.l${i}`, name: `Lampe ${i}`, ignored: false }));
  el.policies = { available: true, enabled: 1, violations: 12, prefixes: {}, rules: [{ id: "entity_area", enabled: true, count: 12, ignored: 0, items }] };
  el._policiesRequested = true;
  html = el.policiesView();
  assert.ok(html.includes('data-lq="polviol"') && html.includes('data-dense="polviol"') && html.includes('data-lsort="polviol|rule|asc"'), "the violations table has search, density control and sortable columns");
  assert.ok(html.includes("data-pol-page") && html.includes('data-lf="polviol|rule"') && html.includes('class="tablewrap lt pols'), "page box in the head, filter by rule");
  el.lvState("polviol", "", "asc").q = "lampe 11";
  html = el.policiesView();
  assert.ok(html.includes("Lampe 11") && !html.includes("Lampe 3"));
  el.exposure = { ...EXPO, findings: [{ kind: "alias_duplicate", level: "warn", assistant: "conversation", alias: "Küche", count: 6, items: Array.from({ length: 6 }, (_, i) => ({ entity_id: `light.k${i}`, name: `Küche ${i}` })) }, EXPO.findings[0]] };
  el.folds = { expo_alias_duplicate: true };
  html = el.exposureView();
  assert.ok(html.includes('data-lq="expofind_alias_duplicate"') && html.includes('data-lsort="expofind_alias_duplicate|name|asc"') && !html.includes('data-lq="exposure"'), "an open finding lists its entities as a table with search and sorting; no search over the page");
  const exposed = { ...EXPO, exposed_entities: Array.from({ length: 7 }, (_, i) => ({ entity_id: `light.ex${i}`, name: `Light ${i}`, assistants: ["conversation"] })) };
  html = el.expoSourceTab(exposed, { id: "conversation", label: "Assist", status: "ok", count: 7 });
  assert.ok(html.includes('data-lq="expo_conversation"') && html.includes('data-dense="expo_conversation"'), "a table of a source offers compact rows");
  assert.ok(html.includes("<table") && html.includes('data-lf="expo_conversation|domain"') && html.includes("mdi:lightbulb-outline") && !html.includes("mdi:chevron-right"), "a source is a table with a domain filter and domain symbols, no arrow");
  el.lvState("expofind_alias_duplicate", "", "asc").q = "küche 2";
  html = el.exposureView();
  assert.ok(html.includes("light.k2") && !html.includes("light.k4"), "the search of a finding cuts its table");
  el.lv.expofind_alias_duplicate.q = "nothing like this";
  assert.ok(el.exposureView().includes("No matches for these filters."));
});

test("exposure findings fold: all closed at first, the head toggles and the open one lists its entities in a table", () => {
  const { el } = panel("en");
  el.data = { ...DATA }; el._exposureRequested = true;
  const items = n => Array.from({ length: n }, (_, i) => ({ entity_id: `light.x${i}`, name: `X ${i}` }));
  el.exposure = { ...EXPO, findings: [
    { kind: "stale_exposed", level: "warn", count: 14, items: items(14) },
    { kind: "diagnostic_exposed", level: "hint", count: 2, items: [{ entity_id: "sensor.diag", name: "Diag" }] },
  ] };
  let html = el.exposureView();
  assert.ok(html.includes("To check") && html.includes("For your information"));
  assert.ok(!html.includes("light.x0") && !html.includes("sensor.diag"), "everything is closed at first");
  assert.ok(html.includes('aria-expanded="false"'));
  el.folds = { expo_stale_exposed: true };
  html = el.exposureView();
  assert.ok(html.includes("light.x9") && html.includes("light.x13") && !html.includes("data-expo-all") && html.includes('data-lq="expofind_stale_exposed"'), "all entities of an open finding sit in its table, no show-all link");
  el.folds = { expo_stale_exposed: true, expo_diagnostic_exposed: true };
  html = el.exposureView();
  assert.ok(html.includes("light.x13") && html.includes("sensor.diag"));
});

test("polish: the to-do list groups by urgency, the cleanup view has tabs, the quality list filters", () => {
  const { el } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, scanned_at: new Date().toISOString() }, regressions: [{ plan_id: "p", at: "2026-10-08T10:00:00+00:00", new_count: 1 }], criteria_alerts: [{ entity_id: "automation.a", ok: 0, missed: 3 }] };
  const card = el.todoCard();
  assert.ok(card.includes("todogrp red") && card.includes('data-fold="todo_care"') && !card.includes("todogrp open"), "groups without rows are left out, maintenance folds while something else is open");
  el.view = "cleanup"; el.journal = []; el._journalRequested = true; el.purges = [{ at: "2026-10-01T10:00:00+00:00", removed: ["sensor.a"], skipped: [], states: false }];
  const html = el.cleanupView();
  assert.ok(html.includes('data-view-tab="cleanup|entities"') && html.includes('data-view-tab="cleanup|devices"') && html.includes('data-view-tab="cleanup|unused"') && html.includes('data-view-tab="cleanup|stats"') && !html.includes('data-view-tab="cleanup|purges"'), "old purges are noted in the Journal, no tab here");
  el.diag = { quality: { items: [{ entity_id: "automation.ok", name: "Fine", status: "on", worst: "ok", dimensions: Object.fromEntries(["integrity", "reliability", "effectiveness", "maintainability", "restart_safety", "efficiency", "conflicts"].map(id => [id, { level: "ok", reasons: [] }])) }] }, criteria: {}, detail: {} };
  el._qualityRequested = true;
  el.lvState("overview", "worst", "asc").f.level = "problem";
  assert.ok(el.qualityView().includes("data-lf-set="));
});

test("the scripts tab lists scripts with their callers", () => {
  const { el } = panel("en");
  const dims = Object.fromEntries(["integrity", "reliability", "maintainability", "efficiency"].map(id => [id, { level: "ok", reasons: [] }]));
  el.diag = { quality: { items: [], scripts: [{ entity_id: "script.lonely", name: "Lonely", status: "active", worst: "ok", dimensions: dims, callers: { automation: 0, script: 0 } }, { entity_id: "script.used", name: "Used", status: "active", worst: "ok", dimensions: dims, callers: { automation: 2, script: 1 } }] }, criteria: {}, detail: {} };
  el._qualityRequested = true; el._runsRequested = true;
  const html = el.scriptsView();
  assert.ok(html.includes('data-object="script:script.lonely"') && html.includes("nobody") && html.includes("2 automations · 1 script"));
});

test("open previews can be selected and merged into one plan; a ran plan cannot", async () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, objects: [], edges: [], findings: [], quarantine: [] };
  el.view = "journal";
  const short = (id, extra = {}) => ({ plan_id: id, created_at: new Date().toISOString(), status: "dry_run", summary: { total: 1, ok: 1, review: 0, blocked: 0 }, ...extra });
  el.journal = [short("a"), short("b"), short("c", { executed: true, status: "verified" })];
  const calls = [];
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return { plan: { ...short("n"), actions: [] }, merged: msg.plan_ids, conflicts: [{ object_id: "sensor.x", kinds: ["remove_entity", "replace_references"] }], dropped: 0 }; } };
  el.render();
  assert.ok(shadow.innerHTML.includes('data-merge-sel="a"') && shadow.innerHTML.includes('data-merge-sel="b"') && !shadow.innerHTML.includes('data-merge-sel="c"'));
  assert.ok(/data-merge disabled/.test(shadow.innerHTML), "needs two");
  assert.ok(shadow.innerHTML.includes('data-merge-page="a,b"') && shadow.innerHTML.includes("<table"), "the journal is a table with a page box for the plans that can be merged");
  assert.ok(/<tr data-plan-open="a" tabindex="0" role="button"/.test(shadow.innerHTML) && !/<button class="btn" data-plan-open/.test(shadow.innerHTML) && shadow.innerHTML.includes('class="jsum"'), "the row opens the plan, there is no open button, the check column wraps");
  el.toggleDenseList("journal");
  assert.ok(!el.journalView().includes('class="jsum"'), "the compact row leaves the check column out");
  el.toggleDenseList("journal");
  el.mergeSel = new Set(["a", "b"]);
  el.render();
  assert.ok(/data-merge-page="a,b" checked/.test(shadow.innerHTML), "the page box is checked once both are");
  await el.mergePlans();
  assert.equal(JSON.stringify(calls[0].plan_ids), '["a","b"]');
  assert.equal(el.plan.plan_id, "n");
  assert.equal(JSON.stringify(el.journal.map(p => p.plan_id)), '["n","c"]');
  assert.ok(el.mergeNote.includes("1 objects were left out") && el.mergeNote.includes("sensor.x"));
});

test("picked previews can be deleted at once; a ran plan is not among them", async () => {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [], edges: [], findings: [], quarantine: [] };
  const short = (id, extra = {}) => ({ plan_id: id, created_at: new Date().toISOString(), status: "dry_run", summary: { total: 1, ok: 1, review: 0, blocked: 0 }, ...extra });
  el.journal = [short("a"), short("b"), short("c", { executed: true, status: "verified" })];
  const calls = [];
  el._hass = { language: "en", callWS: async msg => { if (msg.type === "ha_housekeeper/plan_delete") calls.push(msg.plan_id); return { removed: true }; } };
  el.mergeSel = new Set(["a", "c"]);
  await el.deletePlans();
  assert.equal(JSON.stringify(calls), '["a"]');
  assert.equal(JSON.stringify(el.journal.map(p => p.plan_id)), '["b","c"]');
  assert.equal(el.mergeSel.size, 0);
});

test("the improve block asks for the switch, offers fixes and turns one into a plan under cleanup", async () => {
  const { el } = panel("en");
  el.data = { ...DATA };
  const calls = [];
  let enabled = false;
  el._hass = { language: "en", callWS: async msg => {
    calls.push(msg);
    if (msg.type.endsWith("/refactor_proposals")) return { entity_id: msg.entity_id, enabled, editable: true, reason: null, proposals: [{ fix: "add_description" }, { fix: "remove_duplicate_triggers", count: 2 }] };
    if (msg.type.endsWith("/refactor_set")) { enabled = msg.enabled; return { enabled }; }
    return { plan_id: "r1", status: "dry_run", actions: [], summary: { total: 1, ok: 0, review: 1, blocked: 0 } };
  } };
  el.diag = { quality: null, loading: false, error: "", sel: "automation.hall", criteria: {}, draft: null, message: "", detail: {} };
  await el.loadRefactor("automation.hall");
  assert.ok(el.refactorCard("automation.hall").includes('data-refactor-switch="on"') && !el.refactorCard("automation.hall").includes("data-refactor-plan"));
  await el.setRefactor(true);
  const card = el.refactorCard("automation.hall");
  assert.ok(card.includes('data-refactor-plan="add_description"') && card.includes("2 triggers are exactly the same"));
  el.refactorState().text.add_description = "  Warms the hall ";
  const render = el.render.bind(el); let scrolled = false;
  el.render = () => { scrolled ||= Boolean(el._scrollPlan); render(); };
  await el.makeRefactorPlan("automation.hall", "add_description");
  el.render = render;
  assert.ok(scrolled, "the page opens at the new plan");
  const create = calls.find(c => c.type.endsWith("/plan_create"));
  assert.equal(JSON.stringify(create.actions), JSON.stringify([{ kind: "refactor_automation", object_id: "automation.hall", fix: "add_description", values: { description: "Warms the hall" } }]));
  assert.equal(el.view, "plan");
  assert.equal(el.plan.plan_id, "r1");
  enabled = true;
  el.refactor.by["automation.hall"] = { enabled: true, editable: true, proposals: [{ fix: "set_timeout", count: 2, paths: ["action/0", "action/2"] }, { fix: "set_mode", mode: "single", max: null }] };
  const more = el.refactorCard("automation.hall");
  assert.ok(more.includes("data-refactor-timeout") && more.includes("action/0, action/2") && more.includes("data-refactor-mode") && !more.includes("data-refactor-max"));
  el.refactorState().timeout = "90"; el.refactorState().keep = false; el.refactorState().mode = "queued"; el.refactorState().max = "4";
  assert.ok(el.refactorCard("automation.hall").includes("data-refactor-max"));
  calls.length = 0;
  await el.makeRefactorPlan("automation.hall", "set_timeout");
  await el.makeRefactorPlan("automation.hall", "set_mode");
  const [t, m] = calls.filter(c => c.type.endsWith("/plan_create")).map(c => JSON.stringify(c.actions[0].values));
  assert.equal(t, '{"timeout":90,"continue_on_timeout":false}');
  assert.equal(m, '{"mode":"queued","max":4}');
});

test("an object leaves quarantine after a question, through the undo of just that object", async () => {
  const { el, shadow } = panel("en");
  const item = id => ({ object_type: "entity", object_id: id, name: id.toUpperCase(), status: "disabled" });
  el.data = { ...DATA, meta: { ...DATA.meta, quarantine_days: 14 }, objects: [item("sensor.a"), item("sensor.b")], edges: [], findings: [],
    quarantine: [{ object_id: "sensor.a", object_type: "entity", plan_id: "p1", since: new Date().toISOString() }, { object_id: "sensor.b", plan_id: "p2", since: new Date().toISOString() }] };
  el.journal = []; el.view = "cleanup"; el.viewTab = { cleanup: "quarantine" };
  el.render();
  let html = shadow.innerHTML;
  assert.equal(html.split("data-release=\"").length - 1, 2);
  assert.ok(html.includes('data-object="entity:sensor.a"'));
  el.releaseConfirm = "entity:sensor.a"; el.render();
  html = shadow.innerHTML;
  assert.ok(html.includes("Enable it again?") && html.includes('data-release-yes="entity:sensor.a"') && html.includes('data-release="entity:sensor.b"'));
  const calls = [];
  el._hass.callWS = async msg => { calls.push({ ...msg }); return msg.type.endsWith("plan_list") ? { plans: [] } : { results: [{ object_id: "sensor.a", outcome: "undone" }], status: "undone" }; };
  el.load = async () => { el.data = { ...el.data, quarantine: el.data.quarantine.slice(1) }; };
  await el.releaseQuarantine("entity:sensor.a");
  assert.equal(JSON.stringify(calls.filter(c => c.type.endsWith("plan_undo"))), JSON.stringify([{ type: "ha_housekeeper/plan_undo", plan_id: "p1", object_ids: ["sensor.a"] }]));
  html = shadow.innerHTML;
  assert.ok(html.includes("sensor.a: enabled again") && html.split("data-release=\"").length - 1 === 1 && el.releaseConfirm === null);
  el._hass.callWS = async () => { throw new Error("boom"); };
  await el.releaseQuarantine("entity:sensor.b");
  assert.ok(shadow.innerHTML.includes("boom"));
});

test("a quarantined entity's detail page offers to take it out of quarantine", () => {
  const { el, shadow } = panel("en");
  const entity = { object_type: "entity", object_id: "sensor.q", name: "Q", status: "disabled", disabled_by: "user", state: null };
  el.data = { ...DATA, objects: [...DATA.objects, entity], quarantine: [{ object_id: "sensor.q", object_type: "entity", plan_id: "p1", since: new Date().toISOString() }] };
  el.selected = entity; el.view = "detail"; el.detailTab = "overview";
  el.render();
  assert.ok(shadow.innerHTML.includes('data-release="entity:sensor.q"'));
});

test("an orphaned statistic names likely successors by domain, unit and name, and explains what to do", () => {
  const { el, shadow } = panel("en");
  const entity = (id, unit, status = "active") => ({ object_type: "entity", object_id: id, name: id, status, unit });
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true },
    objects: [entity("sensor.wohnzimmer_energie_neu", "kWh"), entity("sensor.wohnzimmer_energie_zaehler", "Wh"), entity("sensor.garten_feuchte", "%"), entity("sensor.wohnzimmer_energie_alt2", "kWh", "disabled"), entity("light.wohnzimmer_energie", "kWh")],
    orphaned_statistics: [{ statistic_id: "sensor.wohnzimmer_energie", unit: "kWh", has_sum: true, has_mean: false, in_energy: false }, { statistic_id: "sensor.garage_tuer", unit: "", has_sum: false, has_mean: true, in_energy: false }] };
  el.view = "unreferenced"; el.unrefTab = "statistics";
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("Possible successors:") && html.includes('data-object="entity:sensor.wohnzimmer_energie_neu"'));
  assert.ok(!html.includes("energie_zaehler") && !html.includes("energie_alt2") && !html.includes('data-object="entity:light.'), "other unit, disabled and other domain are not suggested");
  assert.equal(html.split('<small class="statsucc">Possible successors:').length - 1, 1, "no suggestion without a similar name");
  assert.ok(html.includes('data-tip-sub="Possible successors: sensor.wohnzimmer_energie_neu"'), "the tooltip of the name holds them for the compact rows");
  assert.ok(html.includes("Meter change (continue statistics)") && html.includes("Developer tools → Statistics"));
});

const STORMS = {
  available: true, busy: false, cached: false, took_ms: 4100, window_days: 1, total_rows: 412000, per_day: 412000, entity_count: 380, event_total: 150000, state_changed_events: 140000,
  findings: [
    { kind: "storm", entity_id: "sensor.laut", name: "Lauter <b>Sensor</b>", window_days: 1, per_day: 72000, peak_hour: 5100, rows: 72000, followers: { automation: 2, entity: 1 } },
    { kind: "attribute_flood", entity_id: "sensor.attr", name: "Attr", window_days: 1, per_day: 2000, attr_bytes: 5200, followers: {} },
    { kind: "no_new_state", entity_id: "sensor.same", name: "Same", window_days: 1, per_day: 9000, share: 96, followers: {} },
    { kind: "integration_share", entry_id: "e1", title: "Cloud-Hub", window_days: 1, per_day: 80000, load_share: 41.5, row_share: 19.4 },
    { kind: "event_burst", event_type: "zha_event", count: 120000, window_days: 1 }],
  entities: [{ entity_id: "sensor.laut", name: "Lauter Sensor", rows: 72000, per_day: 72000, no_new_state: 0.12, attr_bytes: 640, peak_hour: 5100 }, { entity_id: "sensor.calm", name: null, rows: 10, per_day: 10, no_new_state: 0, attr_bytes: null, peak_hour: null }],
  integrations: [{ entry_id: "e1", title: "Cloud-Hub", domain: "hue", entities: 12, rows: 80000, per_day: 80000, row_share: 19.4, load_share: 41.5 }],
  events: [{ type: "state_changed", count: 140000 }],
};

test("the load view loads once per window, asks the backend with the right arguments and counts again on request", async () => {
  const { el } = panel("en");
  const calls = [];
  el._hass = { language: "en", callWS: async msg => { if (msg.type.endsWith("/storms")) calls.push(msg); return STORMS; } };
  el.data = { ...DATA };
  el.stormsView(); el.stormsView();
  await el.loadStorms();
  assert.equal(JSON.stringify(calls[0]), JSON.stringify({ type: "ha_housekeeper/storms", window_days: 1, refresh: false }));
  el.stormsWindow = 7; el.storms = null;
  await el.loadStorms(true);
  assert.equal(JSON.stringify(calls[1]), JSON.stringify({ type: "ha_housekeeper/storms", window_days: 7, refresh: true }));
  el.stormsWindow = 30; el.storms = null;
  await el.loadStorms();
  assert.equal(calls[2].window_days, 30);
  assert.ok(el.stormsView().includes('data-storm-window="30"') && el.stormsView().includes("30 days"));
  el._stormsRequested = 30;
  const before = calls.length; el.stormsView();
  assert.equal(calls.length, before, "no repeated load");
});

test("an integration's loudest entities can be shown on their own and the filter can be cleared", () => {
  const { el } = panel("en");
  el.data = { ...DATA }; el._stormsRequested = 1;
  el.storms = { ...STORMS, entities: [{ entity_id: "sensor.in", name: "In", entry_id: "e1", rows: 5, per_day: 5, no_new_state: 0, attr_bytes: null, peak_hour: null }, { entity_id: "sensor.out", name: "Out", entry_id: "e2", rows: 4, per_day: 4, no_new_state: 0, attr_bytes: null, peak_hour: null }] };
  el.viewTab = { recload: "shares" };
  assert.ok(el.stormsView().includes('data-storm-entry="e1"'));
  el.stormEntry = "e1"; el.viewTab = { recload: "entities" };
  const html = el.stormsView();
  assert.ok(html.includes("sensor.in") && !html.includes("sensor.out") && html.includes("Only Cloud-Hub: 1 of 12") && html.includes("data-storm-entry-clear"));
});

test("a plan with several pairs sums up the changes and folds each row's details", () => {
  const { el } = panel("en");
  const src = (type, n) => ({ type, name: type, writable: true, change_count: n, changes: [], manual: [] });
  const plan = { actions: [{ kind: "replace_references", sources: [src("automation", 3), src("energy", 1)] }, { kind: "migrate_meter" }, { kind: "replace_references", sources: [src("script", 2)] }] };
  const html = el.exchangeSummary(plan);
  assert.ok(html.includes("3 pairs") && html.includes("6 changes in 3 sources") && html.includes("1 meter switches") && html.includes("Energy dashboard"));
  assert.equal(el.exchangeSummary({ actions: [plan.actions[0]] }), "", "a single action has no sum");
});

test("the replace form checks the pair before any preview and keeps the button off for a plan that would be blocked", () => {
  const { el } = panel("en");
  const ent = (id, extra = {}) => ({ object_type: "entity", object_id: id, name: id, status: "active", unit: "kWh", ...extra });
  el.data = { ...DATA, objects: [ent("sensor.a", { has_statistics: true }), ent("sensor.b"), ent("sensor.c", { unit: "W" }), ent("sensor.d", { status: "disabled" })], edges: [{ source: "automation:automation.x", target: "entity:sensor.a", relation: "TRIGGERS_ON" }, { source: "dashboard:energy", target: "entity:sensor.a", relation: "SHOWS" }] };
  el.replOld = "sensor.a"; el.replNew = "sensor.b";
  let html = el.replaceCard();
  assert.ok(html.includes("Automation") && html.includes("Energy dashboard") && html.includes("The new entity works") && html.includes("Same unit (kWh)") && html.includes("data-repl-meter") && !/data-plan-create\s+disabled/.test(html));
  el.replNew = "sensor.c"; assert.ok(el.replaceCard().includes("Unit or device class differ"));
  el.replNew = "sensor.d"; html = el.replaceCard();
  assert.ok(html.includes("does not work") && /data-plan-create\s+disabled/.test(html));
});

test("the entity page trims history: tables and period become one plan action, a stretch only for states", () => {
  const { el } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true }, objects: [{ object_type: "entity", object_id: "sensor.a", name: "A", status: "active" }] };
  const item = el.findObject("entity:sensor.a");
  assert.ok(!el.entityTrimCard(item).includes("data-et-table"), "no card body before the rows are counted");
  el.entityRec = { "sensor.a": { data: { states: { rows: 900, first: 1_700_000_000 }, short: { rows: 0 }, long: { rows: 40, first: 1_700_000_000 } } } };
  const html = el.entityTrimCard(item);
  assert.ok(html.includes("900 rows") && html.includes("data-et-mode") && /data-et-table="short_term"[^>]*disabled/.test(html));
  assert.equal(JSON.stringify(el.entityTrimAction(item)), JSON.stringify({ kind: "trim_history", object_id: "sensor.a", keep_days: 30 }));
  const e = el.entityTrimState("sensor.a"); e.tables.add("long_term");
  assert.equal(JSON.stringify(el.entityTrimAction(item)), JSON.stringify({ kind: "trim_history", object_id: "sensor.a", keep_days: 30, tables: ["states", "long_term"] }));
  assert.ok(el.entityTrimCard(item).includes("long-term statistics") && !el.entityTrimCard(item).includes("data-et-mode"), "a stretch is not offered with statistics");
  e.tables = new Set(["states"]); e.mode = "range"; e.from = "2026-03-01"; e.to = "2026-03-05";
  const range = el.entityTrimAction(item).range;
  assert.equal(range.to - range.from, 5 * 86400, "both days count: the end is the next midnight");
});

const DBH = {
  available: true, busy: false, cached: false, took_ms: 3200, supported: true, dialect: "sqlite", db_bytes: 11 * 1024 ** 3, wal_bytes: 3 * 1024 ** 3, growth: { known: true, per_day: 80 * 1024 ** 2 }, restart_gaps: 2,
  findings: [
    { kind: "duplicates", level: "problem", groups: 7, capped: false, series: [{ statistic_id: "sensor.a", name: "A <i>x</i>", groups: 5 }] },
    { kind: "statistics_issues", level: "problem", series_total: 1, series: [{ statistic_id: "sensor.b", name: "B", types: ["units_changed", "odd_type"] }] },
    { kind: "recorder_gap", level: "problem", gaps: 2, longest_seconds: 7200, latest: [{ start: 1790000000, end: 1790007200, seconds: 7200, cause: "recorder" }] },
    { kind: "wal_large", level: "hint", wal_bytes: 3 * 1024 ** 3, db_bytes: 11 * 1024 ** 3 },
    { kind: "growth", level: "hint", recent_bytes: 600 * 1024 ** 2, base_bytes: 100 * 1024 ** 2 },
    { kind: "missing_hours", level: "hint", series_total: 1, series: [{ statistic_id: "sensor.c", name: "C", missing: 9 }] }],
};

test("the database card loads once per visit of Maintenance and asks the backend", async () => {
  const { el } = panel("en");
  const calls = [];
  el._hass = { language: "en", callWS: async msg => { if (msg.type.endsWith("/db_health")) calls.push(msg); return DBH; } };
  el.data = { ...DATA };
  el.dbCard(); el.ensureDbHealth(); el.ensureDbHealth();
  await el.loadDbHealth();
  assert.equal(JSON.stringify(calls[0]), JSON.stringify({ type: "ha_housekeeper/db_health", refresh: false }));
  await el.loadDbHealth(true);
  assert.equal(calls.at(-1).refresh, true);
  await el.loadDbHealth(false, true);
  assert.equal(calls.at(-1).check, true);
});

test("only database problems reach the overview to-do list, and only once they were calculated", () => {
  const { el } = panel("en");
  el.data = { ...DATA, quarantine: [] };
  el.dbHealth = null;
  assert.ok(!el.todoItems().some(i => i.key === "db"));
  el.dbHealth = { ...DBH, findings: [DBH.findings[3]] };
  assert.ok(!el.todoItems().some(i => i.key === "db"), "hints stay out");
  el.dbHealth = DBH;
  const item = el.todoItems().find(i => i.key === "db");
  assert.ok(item && item.view === "recorder" && item.hintText.includes("Duplicate statistics timestamps"));
});

const EXPO = {
  available: true, checked: 12, webhooks: 3,
  assistants: [
    { id: "conversation", status: "ok", exposed: 9 },
    { id: "cloud.alexa", status: "inactive", exposed: 0 },
    { id: "cloud.google_assistant", status: "unavailable", exposed: 0 },
  ],
  bridges: [{ kind: "homekit", title: "Bridge <b>", exposed: 4 }],
  exposed_entities: [{ entity_id: "lock.door", name: "Door <i>", assistants: ["conversation", "homekit"] }, { entity_id: "light.a", name: "A", assistants: ["conversation"] }], exposed_total: 2,
  findings: [
    { kind: "sensitive_exposed", level: "hint", count: 12, items: [{ entity_id: "lock.door", name: "Door <i>", assistants: ["conversation", "homekit"] }] },
    { kind: "alias_duplicate", level: "warn", assistant: "conversation", alias: "Küche", count: 2, items: [{ entity_id: "light.a", name: "A" }, { entity_id: "light.b", name: "B" }] },
    { kind: "webhook_orphan", level: "warn", domain: "gone", count: 2 },
  ],
};

test("the exposure view loads once, asks the backend and handles errors and an empty result", async () => {
  const { el } = panel("en");
  const calls = [];
  el._hass = { language: "en", callWS: async msg => { if (msg.type.endsWith("/exposure")) calls.push(msg); return EXPO; } };
  el.data = { ...DATA };
  el.exposureView(); el.ensureExposure();
  await el.loadExposure();
  assert.equal(JSON.stringify(calls[0]), JSON.stringify({ type: "ha_housekeeper/exposure" }));
  el.exposure = { ...EXPO, findings: [] }; el.viewTab = { exposure: "findings" };
  assert.ok(el.exposureView().includes("Nothing unusual in the exposure."));
  el.exposure = null; el.exposureError = "boom";
  assert.ok(el.exposureView().includes("boom"));
});

test("the reliability comparison asks for the period before and shows the difference in words", async () => {
  const { el, shadow } = panel("en");
  const calls = [];
  const row = { entry_id: "e", title: "Hue", domain: "hue", state: "loaded", entities: 3, permanent: 0, availability: 99, shared_outages: 0, longest_outage: 0, layer: null, last_disruption: null, previous_availability: 95.5, delta: 3.5 };
  el._hass = { language: "en", callWS: async msg => { if (msg.type.endsWith("/reliability")) calls.push(msg); return { available: true, busy: false, window_days: 7, entries: [row, { ...row, entry_id: "f", title: "Zigbee", previous_availability: null, delta: null }], unstable: { items: [], total: 0 }, comparison: { requested: true, available: true }, coverage: { known: 3, with_data: 3, observed_share: 100 } }; } };
  el.data = DATA; el.view = "reliability";
  el.relCompare = true;
  await el.loadReliability();
  assert.equal(calls.at(-1).compare, true);
  const html = el.reliabilityView();
  assert.ok(html.includes("+3.5") && html.includes("Change") && html.includes('data-rel-compare'));
  el.relCompare = false;
  await el.loadReliability();
  assert.ok(!("compare" in calls.at(-1)));
});

const QUICK = {
  ...DATA,
  objects: [
    { object_type: "entity", object_id: "sensor.kueche_temp", name: "Küche Temperatur", status: "active", platform: "mqtt" },
    { object_type: "entity", object_id: "light.kueche", name: "Küche Licht", status: "active", platform: "hue" },
    { object_type: "automation", object_id: "automation.kueche_aus", name: "Küche aus", status: "active" },
    { object_type: "device", object_id: "dev1", name: "Hue Bridge", status: "active", manufacturer: "Signify", model: "BSB002" },
    { object_type: "area", object_id: "kueche", name: "Küche", status: "active" },
    { object_type: "entity", object_id: "sensor.<b>x</b>", name: "<b>Küche</b> böse", status: "active" },
  ],
};

test("the top bar search finds entities, devices and automations, best match first, and escapes names", () => {
  const { el } = panel("en");
  el.data = QUICK;
  el.quickQuery = "k"; assert.equal(el.quickResults().length, 0, "one letter does not search");
  el.quickQuery = "küche";
  const names = el.quickResults().map(o => o.object_id);
  assert.ok(names.includes("light.kueche") && names.includes("automation.kueche_aus") && !names.includes("kueche"), "areas are not offered");
  el.quickQuery = "signify bsb"; assert.equal(JSON.stringify(el.quickResults().map(o => o.object_id)), JSON.stringify(["dev1"]), "manufacturer and model count");
  el.quickQuery = "küche"; el.quickOpen = true;
  const html = el.quickSearchBox();
  assert.ok(html.includes('role="combobox"') && html.includes('role="listbox"') && html.includes("data-quick-entry"));
  assert.ok(html.includes("&lt;b&gt;Küche&lt;/b&gt; böse") && !html.includes("<b>Küche</b>"));
  el.quickQuery = "zzzz"; assert.ok(el.quickSearchBox().includes("No results"));
});

test("the search opens the chosen object and closes; the keyboard moves through the results", () => {
  const { el } = panel("en");
  el.data = QUICK;
  const opened = [];
  el.openObject = o => opened.push(o.object_id);
  el.quickQuery = "küche"; el.quickOpen = true;
  const first = el.quickResults()[0].object_id;
  el.quickPick(`entity:${first}`);
  assert.equal(JSON.stringify(opened), JSON.stringify([first]));
  assert.equal(el.quickQuery, ""); assert.equal(el.quickOpen, false);
  el.quickPick("entity:does.not.exist");
  assert.equal(opened.length, 1);
});

test("a list view can be saved under a name, applied again, overwritten and deleted", () => {
  const storage = fakeStorage({});
  const { el } = panel("en", { localStorage: storage });
  const save = name => { el.saveView("inv"); assert.ok(el.viewsControl("inv").includes('class="viewform"')); el.commitView("inv", name); };
  const read = () => JSON.parse(storage.getItem("ha_housekeeper.views"));
  el.data = DATA;
  const st = el.lvState("inv", "name", "asc");
  assert.equal(el.viewsControl("inv"), "", "nothing to save and nothing saved: no control");
  st.q = "sensor"; st.f = { status: "orphaned", type: "" };
  assert.ok(el.viewsControl("inv").includes("data-lview-save"));
  save("Kaputte Sensoren");
  assert.equal(read().inv[0].name, "Kaputte Sensoren");
  assert.equal(JSON.stringify(read().inv[0].f), JSON.stringify({ status: "orphaned" }), "empty filters are not stored");
  st.q = ""; st.f = {}; st.sort = "status"; st.dir = "desc";
  el.applyView("inv", "Kaputte Sensoren");
  assert.equal(st.q, "sensor"); assert.equal(st.f.status, "orphaned"); assert.equal(st.sort, "name"); assert.equal(st.dir, "asc");
  const bar = el.viewsControl("inv");
  assert.ok(bar.includes("data-lview-open") && bar.includes("withname"));
  el._viewOpen = "inv";
  assert.ok(el.viewsControl("inv").includes("data-lview-pick") && el.viewsControl("inv").includes("data-lview-delete"));
  st.q = "neu"; save("Kaputte Sensoren");
  assert.equal(read().inv.length, 1, "the same name overwrites");
  save("  ");
  assert.equal(read().inv.length, 1, "no name, no view");
  el.cancelView("inv");
  assert.ok(!el.viewsControl("inv").includes("data-lview-form"), "cancel closes the form");
  el.deleteView("inv", "Kaputte Sensoren");
  assert.equal(read().inv.length, 0);
});

test("saved views from a broken browser store are ignored and a failing write does not crash", () => {
  const broken = JSON.stringify({ inv: [1, { name: 5 }, { name: "ok", q: "", f: { a: "b", c: 3 }, sort: "name", dir: "up" }, { name: "ok", q: "x", f: { a: "b", c: 3 }, sort: "name", dir: "asc" }], other: "x" });
  const { el } = panel("en", { localStorage: { getItem: () => broken, setItem() { throw new Error("full"); } } });
  el.data = DATA;
  const views = el.viewsStore();
  assert.equal(views.inv.length, 1); assert.equal(JSON.stringify(views.inv[0].f), JSON.stringify({ a: "b" })); assert.ok(!views.other);
  const st = el.lvState("inv", "name", "asc"); st.q = "z";
  el.saveView("inv"); el.commitView("inv", "neu");
  assert.equal(views.inv.length, 2);
});

test("the Recorder view holds the load, the costs and the database, and starts the database check after the load", async () => {
  const queue = [];
  const { el, shadow } = panel("en", { setTimeout: fn => { queue.push(fn); return 0; } });
  el.data = { ...DATA }; el.view = "recorder";
  el._hass = { language: "en", callWS: async msg => (msg.type.endsWith("/storms") ? STORMS : msg.type.endsWith("/db_health") ? DBH : COSTS) };
  el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("Write load") && html.includes("Storage use") && html.includes("Database"));
  assert.equal(queue.length, 1, "only the load query is started at first");
  assert.ok(!el._dbRequested);
  await el.loadStorms();
  assert.equal(el._dbRequested, true, "the database check follows once the load is there");
  assert.ok(el.maintenanceView && !el.maintenanceView().includes("Storage use"));
});

test("the database tab opened directly checks the database first and the load after it", async () => {
  const queue = [];
  const { el } = panel("en", { setTimeout: fn => { queue.push(fn); return 0; } });
  el.data = { ...DATA }; el.view = "recorder"; el.viewTab = { recorder: "db" };
  el._hass = { language: "en", callWS: async msg => (msg.type.endsWith("/storms") ? STORMS : DBH) };
  el.render();
  assert.ok(el._dbRequested && el._stormsRequested === null, "the database query starts, the load waits");
  await el.loadDbHealth();
  assert.equal(el._stormsRequested, el.stormsWindow, "the load follows once the database is there");
});

test("the old load link opens the Recorder view", () => {
  const window = { location: { search: "?view=storms", pathname: "/ha-housekeeper" }, history: { replaceState() {} } };
  const { el } = panel("en", { window });
  el.data = { ...DATA };
  el.applyUrl();
  assert.equal(el.view, "recorder");
});

test("a page exports all its sections as one file in Markdown or JSON, and as CSV files per section", () => {
  const { el } = panel("en");
  const saved = [];
  el.downloadText = (name, text) => saved.push([name, text]);
  el.downloadRows = (name, header, rows) => saved.push([name, header, rows]);
  el.setPageExporter("pg", "page", "Page", [
    { name: "a", title: "A", header: ["Name", "N"], rows: () => [["x|y", 1]] },
    { name: "b", title: "B", header: ["Id"], rows: () => [["z"]] },
  ]);
  assert.ok(el.pageBar({ exportId: "pg" }).includes('data-exp-menu="pg"'));
  el.exportList("pg", "md");
  assert.ok(saved[0][0] === "page.md" && saved[0][1].includes("## A") && saved[0][1].includes("x\\|y") && saved[0][1].includes("## B"));
  el.exportList("pg", "json");
  assert.deepEqual(JSON.parse(saved[1][1]), { a: [{ Name: "x|y", N: 1 }], b: [{ Id: "z" }] });
  el.exportList("pg", "csv");
  assert.equal(saved[2][0], "page-a");
});

test("a list can hide columns and offers its rows as CSV", () => {
  const { el, shadow } = panel("en");
  el.data = DATA; el.view = "inventory"; el.render();
  assert.ok(shadow.innerHTML.includes('data-exp-menu="inventory"') && shadow.innerHTML.includes('data-col-open="inventory"'), "the inventory has one export menu in the list bar");
  assert.ok(!shadow.innerHTML.includes('data-export-list="inventory"') && !shadow.innerHTML.includes("data-xp-open"), "no separate download button and no extra row");
  assert.ok(!shadow.innerHTML.includes('data-exp-fmt'), "the menu is closed at first");
  el._expOpen = "inventory"; el.render();
  assert.ok(shadow.innerHTML.includes('data-exp-fmt="inventory|csv"') && shadow.innerHTML.includes('data-exp-fmt="inventory|json"') && shadow.innerHTML.includes("data-exp-guided"), "the open menu offers the formats and the guided export");
  el._expOpen = "";
  assert.ok(shadow.innerHTML.includes(">Type<"));
  el.toggleCol("inventory", "type");
  assert.ok(!shadow.innerHTML.includes('data-lsort="inventory|type|asc"'), "a hidden column has no header");
  assert.ok(el.colHidden("inventory", "type") && !el.colHidden("inventory", "status"));
  const ex = el._exporters.inventory;
  assert.equal(ex.rows().length, el.filtered().length);
  el._colOpen = "inventory"; el.render();
  const pop = shadow.innerHTML.match(/class="colpop"[\s\S]*?<\/span><\/span>/)[0];
  assert.ok((pop.match(/<label><span>[^<]*<\/span><input type="checkbox" data-col="inventory\|/g) || []).length >= 3, "every column has a row with the name left and the checkbox right");
});

test("the flow tab shows triggers, conditions and nested actions and marks missing objects", () => {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [{ object_type: "entity", object_id: "light.hall", name: "Hall light", status: "active" }], edges: [], findings: [] };
  const item = {
    object_type: "automation", object_id: "automation.hall", name: "Hall",
    triggers: [{ trigger: "state", entity_id: "binary_sensor.gone", to: "on" }], conditions: [{ condition: "state", entity_id: "light.hall", state: "off" }],
    actions: [{ choose: [{ conditions: [{ condition: "template", value_template: "{{ true }}" }], sequence: [{ action: "light.turn_on", target: { entity_id: "light.hall" } }] }], default: [{ delay: { seconds: 5 } }] }],
  };
  assert.ok(el.detailTabs(item, "automation:automation.hall").some(([id]) => id === "flow"));
  const html = el.flowCard(item, "automation:automation.hall");
  assert.ok(html.includes("Choose") && html.includes("Hall light") && html.includes("light.turn_on") && html.includes("Delay") && html.includes("action/0/choose/0/sequence/0"));
  assert.ok(html.includes("binary_sensor.gone") && html.includes("fstep broken"));
  const script = el.flowCard({ object_type: "script", object_id: "script.x", name: "X", actions: [{ delay: "00:01:00" }] }, "script:script.x");
  assert.ok(script.includes("sequence/0") && !html.includes("Trigger</h2>x"));
});

test("findings that began with an update get a line, a tile and a filter", () => {
  const { el } = panel("en");
  const finding = { key: "k1", rule_id: "entity.unavailable", object_id: "light.a", classification: "unavailable", confidence: 0.9, ignored: false };
  el.data = { ...DATA, objects: [{ object_type: "entity", object_id: "light.a", name: "A", status: "unavailable" }], edges: [], findings: [finding, { ...finding, key: "k2", object_id: "light.b" }] };
  el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || "";
  el.corr = { groups: [{ id: "g", kind: "entry_version", at: "2026-10-01T10:05:00+00:00", domain: "hue", from: "1", to: "2", total: 1, keys: ["k1"], only_group: false }], by_key: { k1: "g" } };
  assert.ok(el.corrLine("k1").includes("Update of hue 1 → 2") && el.corrLine("k2") === "");
  assert.deepEqual(el.visibleFindings().length, 2);
  el.findingAfter = true;
  assert.deepEqual(el.visibleFindings().map(f => f.key), ["k1"]);
  assert.ok(el.findingsView().includes('data-fold="corr"') && !el.findingsView().includes('data-finding-after="1"'), "the hint row opens the card; the filter is in it");
  assert.ok(el.findingsView().includes('data-fclear="after"'), "an active filter from the card stays visible as a note");
  assert.ok(!el.corrGroupsCard().includes("Update of hue"));
  el.folds = { corr: true, "corr_g": true };
  const card = el.corrGroupsCard();
  assert.ok(card.includes("Update of hue 1 → 2") && card.includes("1× ") && card.includes('data-object="entity:light.a"'));
});

test("the findings page has an info button that opens the help with every number named", () => {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [], edges: [], causes: [], findings: [] };
  el.view = "findingsNav"; el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || "";
  assert.ok(el.heading().includes('data-fold="findings_help"') && !el.findingsView().includes("helpcard"));
  el.folds = { findings_help: true };
  const help = el.findingsView();
  assert.ok(help.includes("helpcard") && help.includes("Certainty") && help.includes("n incidents"));
});

test("the follow-ups of a chain sit indented below it, and one button opens or closes all heads", () => {
  const { el } = panel("en");
  const cause = { id: "device_down:d1", kind: "device_down", object_type: "device", object_id: "d1", name: "Keypad", follower_count: 2, total_followers: 2, consumers: {}, impact: "high", parent_id: null, child_ids: [], finding_key: "own" };
  const f = (key, extra = {}) => ({ key, rule_id: "entity.state_unavailable", object_id: key, classification: "unavailable", confidence: 0.9, ignored: false, impact: "high", impact_facts: [], first_detected_at: new Date().toISOString(), ...extra });
  el.data = { ...DATA, objects: [], edges: [], causes: [cause], findings: [f("own", { rule_id: "device.down", cause_id: "device_down:d1" }), f("x", { cause_id: "device_down:d1" }), f("y", { cause_id: "device_down:d1" })] };
  el.render = () => {};
  const closed = el.findingsView();
  assert.ok(!closed.includes("og lvl1") && closed.includes("mdi:chevron-right") && closed.includes('data-fold-all="open"'));
  el.foldAllFindings(true);
  const open = el.findingsView();
  assert.ok(open.includes("mdi:chevron-down") && /og lvl1/.test(open) && open.includes('data-fold-all="close"'), "one button, it closes once a head is open");
  el.foldAllFindings(false);
  assert.ok(!el.findingsView().includes("og lvl1"));
});

test("labels are always a row: the own ones, or a note that none are assigned", () => {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [{ object_type: "label", object_id: "l1", name: "Kitchen" }], edges: [], findings: [] };
  const rows = item => el.labelRows(item)[0][1];
  assert.ok(rows({ object_type: "automation", object_id: "automation.a", labels: ["l1"] }).includes("Kitchen"));
  assert.ok(rows({ object_type: "automation", object_id: "automation.a", labels: [] }).includes("No labels assigned"));
  assert.ok(rows({ object_type: "script", object_id: "script.a" }).includes("No labels assigned"));
  assert.ok(el.propertyCards({ object_type: "scene", object_id: "scene.a", labels: [] }).includes("No labels assigned"));
});

test("the selection row of the findings list names the size of the view at its right end", () => {
  const { el } = panel("en");
  const f = key => ({ key, rule_id: "entity.stale", object_id: key, classification: "unused", confidence: 0.7, ignored: false, impact: "info", impact_facts: [] });
  el.data = { ...DATA, objects: [], edges: [], causes: [], findings: [f("a"), f("b"), f("c")] };
  el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || ""; el.series = null; el._seriesFor = el.data;
  assert.ok(/viewcount" role="status">3 findings on 3 objects/.test(el.findingsView()));
  el.findSel = new Set(["a"]);
  assert.ok(/1 selected.*viewcount" role="status">3 findings on 3 objects/s.test(el.findingsView()));
  el.showFollowers = true;
  assert.ok(/viewcount" role="status">3 in this view/.test(el.findingsView()), "the flat list counts findings only");
});

test("a reason tile counts every finding of its reason and names the follow-ups below it", () => {
  const { el } = panel("en");
  const f = (key, cause) => ({ key, rule_id: "entity.state_unavailable", object_id: key, classification: "unavailable", confidence: 0.9, ignored: false, impact: "low", cause_id: cause });
  el.data = { ...DATA, objects: [], edges: [], causes: [], findings: [f("a"), f("b"), f("c", "device:x"), f("d", "device:x")] };
  el.series = null; el._seriesFor = el.data; el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || "";
  const html = el.findingsView();
  assert.ok(html.includes("Unavailable") && /sumvalue">4<\/b><small>2 of them follow-ups/.test(html));
});

test("the button for findings after an update counts every finding and names the follow-ups among them", () => {
  const { el } = panel("en");
  const f = (key, cause) => ({ key, rule_id: "entity.state_unavailable", object_id: key, classification: "unavailable", confidence: 0.9, ignored: false, impact: "low", impact_facts: [], cause_id: cause });
  el.data = { ...DATA, objects: [], edges: [], causes: [], findings: [f("a"), f("b"), f("c", "device:x")] };
  el.corr = { groups: [{ id: "g", kind: "entry_version", at: "2026-10-01T10:05:00+00:00", domain: "hue", from: "1", to: "2", total: 3, keys: ["a", "b", "c"], only_group: false }], by_key: { a: "g", b: "g", c: "g" } };
  el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || ""; el.series = null; el._seriesFor = el.data;
  el.findingAfter = true; el.folds = { corr: true };
  const html = el.findingsView();
  assert.ok(html.includes("3 findings began together with an update") && html.includes("1 of them follow-ups") && html.includes("3 findings on 3 objects"));
});

test("the detail page rates a finding: level with reasons, certainty, and what the next level takes", () => {
  const { el } = panel("en");
  const ago = h => new Date(Date.now() - h * 3600000).toISOString();
  const out = { key: "o", rule_id: "entity.state_unavailable", object_id: "light.a", classification: "unavailable", confidence: 0.75, ignored: false, impact: "low", impact_facts: [], first_detected_at: ago(6) };
  const dup = { key: "d", rule_id: "entity.possible_duplicate", object_id: "sensor.x_2", classification: "possible_duplicate", confidence: 0.7, ignored: false, impact: "info", impact_facts: [], first_detected_at: ago(100) };
  el.data = { ...DATA, objects: [], edges: [], causes: [], findings: [out, dup] };
  const a = el.ratingBlock({ object_type: "entity", object_id: "light.a" }, el.findingKey(out));
  assert.ok(a.includes("for 6 h") && a.includes("75 %") && a.includes("rbar") && a.includes("Medium in 18 h or as soon as an active automation"));
  const b = el.ratingBlock({ object_type: "entity", object_id: "sensor.x_2" }, el.findingKey(dup));
  assert.ok(b.includes("Low as soon as a dashboard") && !b.includes("rbar") && b.includes("70 %"));
  el.data.findings[0].impact = "high";
  assert.ok(el.ratingBlock({ object_type: "entity", object_id: "light.a" }, el.findingKey(out)).includes("highest level"));
  assert.equal(el.ratingBlock({ object_type: "entity", object_id: "light.zz" }, "entity:light.zz"), "");
});

test("the watch after an update shows a band while it runs and a card with what failed since", () => {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [{ object_type: "entity", object_id: "light.a", name: "Hall lamp", status: "unavailable" }], edges: [], findings: [] };
  el._watchRequested = true; el._watchKey = el.data.meta.scanned_at || "";
  const result = { verdict: "worse", new: ["entity:light.a"], fixed: [], transient: [], new_findings: [] };
  const trigger = [{ kind: "ha_version", from: "2026.10.1", to: "2026.10.2" }];
  const running = { id: "w1", started_at: "2026-10-14T03:00:00+00:00", until: new Date(Date.now() + 5 * 3600000).toISOString(), triggers: trigger, before: { at: "2026-10-13T20:00:00+00:00" }, samples: [{}], closed_at: null, result };
  el.watch = { hours: 24, watches: [running] };
  const meta = { started_at: running.started_at, until: running.until, triggers: trigger, samples: 1, new: 1 };
  el.data = { ...el.data, meta: { ...el.data.meta, watch: meta } };
  assert.ok(el.watchBand().includes("Home Assistant update 2026.10.1 → 2026.10.2") && el.watchBand().includes("1 objects affected"));
  el.data = { ...el.data, meta: { ...el.data.meta, watch: { ...meta, samples: 0, new: 0 } } };
  assert.ok(el.watchBand().includes("first check comes 30 minutes"));
  el.data = { ...el.data, meta: { ...el.data.meta, watch: null } };
  assert.equal(el.watchBand(), "");
  el.corr = { groups: [], by_key: {} }; el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || "";
  el.folds = { corr: true, corr_w_w1: true };
  const live = el.corrGroupsCard();
  assert.ok(live.includes("data-watch-end"), "a running watch can be ended from its row");
  el.watch = { hours: 24, watches: [{ ...running, closed_at: "2026-10-15T03:00:00+00:00", result }] };
  const card = el.corrGroupsCard();
  assert.ok(card.includes("Worse") && card.includes("Failed since (1)") && card.includes("Hall lamp") && card.includes('data-object="entity:light.a"') && !card.includes("data-watch-end"));
  el.watch = { hours: 24, watches: [] };
  assert.equal(el.corrGroupsCard(), "");
});

test("a watch joins the incident that holds the same update, and ending it asks first", () => {
  const { el } = panel("en");
  const trigger = { kind: "ha_version", from: "2026.10.1", to: "2026.10.2" };
  el.data = { ...DATA, objects: [], edges: [], findings: [] };
  el._watchRequested = true; el._watchKey = el.data.meta.scanned_at || ""; el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || "";
  el.corr = { groups: [{ id: "g1", kind: "entry_version", at: "2026-10-14T19:30:00+00:00", domain: "hue", from: "1", to: "2", total: 3, keys: [], only_group: false, also: [trigger] }], by_key: {} };
  el.watch = { hours: 24, watches: [{ id: "w1", started_at: "2026-10-14T19:25:00+00:00", until: new Date(Date.now() + 3600000).toISOString(), triggers: [trigger], before: null, samples: [], closed_at: null, result: { verdict: "pending", new: [], fixed: [], transient: [], new_findings: [] } }] };
  const items = el.incidents();
  assert.equal(items.length, 1);
  assert.ok(items[0].group && items[0].watch);
  assert.equal(el.incidentFoldId("w1"), "corr_g1");
  el.folds = { corr: true, corr_g1: true };
  const card = el.corrGroupsCard();
  assert.ok(card.includes("3 findings") && card.includes("Running") && card.includes("data-watch-end") && card.includes("incsec obs"));
  el.askEndWatch();
  assert.ok(el.confirmState && el.confirmState.text.includes("judged now"));
});

test("a device has a history tab with its steps and no note; removed devices show their logbook entry and the plan in the Journal", () => {
  const { el } = panel("en");
  el.data = DATA;
  const device = { object_type: "device", object_id: "d1", name: "Hub", status: "active" };
  assert.ok(el.detailTabs(device, "device:d1").some(([id]) => id === "history"));
  el.life = new Map([["d1", { steps: [{ kind: "discovered", at: "2026-01-01T00:00:00+00:00" }, { kind: "replaced", at: "2026-02-01T00:00:00+00:00", from: "light.old", to: "light.new" }], unstable: "flapping" }]]);
  const html = el.lifeCard(device);
  assert.ok(html.includes("Discovered") && html.includes("light.old → light.new") && html.includes("flapping") && !html.includes("<textarea") && !html.includes("data-life-save"));
  el.journal = [{ plan_id: "p1", created_at: "2026-03-01T00:00:00+00:00", status: "verified", summary: { total: 1, ok: 1, review: 0, blocked: 0 } }];
  el.removed = [{ object_id: "d9", name: "Old hub", kind: "remove_device", group: "device", at: "2026-03-01T00:00:00+00:00", plan_id: "p1" }, { object_id: "d8", name: "Old plug", kind: "forget_device", group: "device", at: "2026-03-02T00:00:00+00:00" }];
  el.data = { ...DATA, notes: [{ id: "n1", title: "Device “Old plug” forgotten", at: "2026-03-02T00:00:00+00:00", target: "device:d8", note: "broken <b>", source: "housekeeper", ref: "forget_device:d8" }] };
  const list = el.removedCard();
  assert.ok(list.includes("Old hub") && list.includes("Device removed") && list.includes("Device “Old plug” forgotten") && list.includes('data-note-edit="n1"') && list.includes("broken &lt;b&gt;") && !list.includes("<b>"));
  assert.ok(list.includes('<button type="button" class="btn small" data-plan-open="p1">Open plan</button>') && list.includes("beyond the 300 newest"), "the plan is one click away, and the list says how far back it reaches");
});

test("missing statistics hours say what all series lack, name the periods and list the series", () => {
  const { el } = panel("en");
  el.data = DATA;
  const f = { kind: "missing_hours", level: "hint", series_total: 2, own_series: 1, gap_hours: 20, gaps_total: 1,
    gaps: [{ start: 1_000_000, end: 1_072_000, hours: 20, cause: "recorder" }],
    series: [{ statistic_id: "sensor.b", name: "B <i>", missing: 30, shared: 20, own: 10 }, { statistic_id: "sensor.a", name: "A", missing: 20, shared: 20, own: 0 }] };
  const text = el.dbFindingText(f);
  assert.ok(text.includes("20 hours are missing from all series at once") && text.includes("single sensors have gaps of their own"));
  const extra = el.dbFindingExtra(f);
  assert.ok(extra.includes("The recorder was not running") && extra.includes("B &lt;i&gt;") && !extra.includes("<i>"));
  assert.ok(extra.includes('data-lsort="dbgaps|start|desc"'), "the gaps are a table");
  assert.ok(el.dbFindingExtra({ kind: "growth" }) === "");
});

test("the browser's back button steps back inside the panel, one history entry in front of it", () => {
  const calls = [];
  const win = { location: { pathname: "/ha-housekeeper", href: "/ha-housekeeper", search: "" }, history: { state: null, pushState: () => calls.push("push"), back: () => calls.push("back"), replaceState() {} } };
  const { el } = panel("en", { window: win });
  el._basePath = "/ha-housekeeper";
  el.view = "inventory";
  el.syncGuard();
  assert.deepEqual(calls, [], "nothing to go back to: no entry");
  el.selected = DATA.objects[0];
  el.syncGuard(); el.syncGuard();
  assert.deepEqual(calls, ["push"], "one entry while there is a way back");
  el.onPopState();
  assert.equal(el.selected, null, "back leaves the detail page");
  assert.equal(el._guard, false);
  el.selected = DATA.objects[0]; el.syncGuard();
  el.selected = null; el.syncGuard();
  assert.deepEqual(calls, ["push", "push", "back"], "own back button: the spare entry is removed");
  el.onPopState();
  assert.equal(el.view, "inventory", "that pop is ignored");
});

test("a finding can be kept on purpose with a reason, put off for days, and comes back as due", async () => {
  const { el } = panel("en");
  const sent = [];
  el._hass = { language: "en", callWS: async msg => { if (msg.type.endsWith("/ignore")) sent.push(msg); return {}; } };
  el.data = { ...DATA, findings: [{ ...DATA.findings[0], key: "k1", ignored: false }, { ...DATA.findings[1], key: "k2", ignored: false, resurfaced: true }] };
  el.openDecide("k1");
  assert.ok(el.actionsCard(el.findObject("entity:sensor.a"), "entity:sensor.a").includes("data-decide-form"));
  el.decide.kind = "keep";
  await el.commitDecide();
  assert.equal(sent.length, 0, "keeping on purpose needs a reason");
  assert.equal(el.decide.error, "decideNeedReason");
  el.decide.reason = " Reserve "; await el.commitDecide();
  assert.equal(JSON.stringify(sent[0]), JSON.stringify({ type: "ha_housekeeper/ignore", finding_key: "k1", ignored: true, kind: "keep", reason: "Reserve" }));
  const f = el.data.findings[0];
  assert.ok(f.ignored && f.ignore_info.kind === "keep" && el.decide === null);
  assert.ok(el.decisionLabel(f).includes("Known") && el.decisionLabel(f).includes("Reserve"));
  el.openDecide("k2"); el.decide.kind = "snooze"; el.decide.days = 0; await el.commitDecide();
  assert.equal(sent[1].kind, "snooze"); assert.equal(sent[1].days, 30, "put off needs a time: 30 days by default");
  assert.equal(el.data.findings[1].resurfaced, false);
  el.data.findings[1].ignored = false; el.data.findings[1].resurfaced = true;
  assert.ok(el.findingRow(el.data.findings[1]).includes("Due again"));
});

test("a mark can be set and cleared on the detail page and hides nothing in the panel by itself", async () => {
  const { el } = panel("en");
  const sent = [];
  el.data = { ...DATA, objects: DATA.objects.map(o => ({ ...o })) };
  el._hass = { language: "en", callWS: async msg => { sent.push(msg); return msg.type.endsWith("/inventory") ? { ...DATA, objects: DATA.objects.map(o => o.object_id === "sensor.b" ? { ...o, mark: { kind: "seasonal", reason: "Winter", until: null, target: null }, } : { ...o }) } : {}; } };
  const item = el.data.objects[1];
  el.selected = item;
  assert.ok(el.markCard(item).includes('data-mark-open="entity:sensor.b"'));
  assert.equal(el.markCard({ object_type: "automation", object_id: "automation.c" }), "", "only entities and devices");
  el.openMark("entity:sensor.b");
  el.markForm.kind = "seasonal"; el.markForm.reason = " Winter "; el.markForm.days = 90;
  await el.commitMark();
  assert.equal(JSON.stringify(sent.find(m => m.type === "ha_housekeeper/mark_set")), JSON.stringify({ type: "ha_housekeeper/mark_set", object_type: "entity", object_id: "sensor.b", kind: "seasonal", reason: "Winter", days: 90 }));
  assert.equal(el.markForm, null);
  assert.ok(el.markCard(el.selected).includes("Seasonal") && el.markCard(el.selected).includes("data-mark-clear"));
  await el.clearMark("entity:sensor.b");
  assert.equal(sent.at(-2).type, "ha_housekeeper/mark_clear");
});

test("findings sort by impact first, then certainty, and say why", () => {
  const { el } = panel("en");
  const f = (id, impact, confidence, facts = []) => ({ rule_id: "entity.state_unavailable", object_id: id, classification: "unavailable", confidence, impact, impact_facts: facts, key: id, ignored: false });
  el.data = { ...DATA, findings: [f("sensor.a", "none", 0.99), f("sensor.b", "medium", 0.5), f("lock.c", "high", 0.4, [{ fact: "critical", why: "kind" }, { fact: "used_by_active", n: 3 }])] };
  assert.deepEqual(el.sortedFindings().map(x => x.object_id), ["lock.c", "sensor.b", "sensor.a"]);
  assert.equal(el.impactLine(el.data.findings[2]), "High impact (critical: kind of object · used by 3 active automations or scripts)");
  assert.equal(el.findingSorts()[0].key, "impact");
});

test("follow-up findings of a cause stay folded until asked for, and the export keeps them", () => {
  const { el } = panel("en");
  const f = (id, cause) => ({ rule_id: "entity.state_unavailable", object_id: id, classification: "unavailable", confidence: 0.75, key: id, ignored: false, cause_id: cause });
  const cause = { id: "integration_down:e1", kind: "integration_down", object_type: "config_entry", object_id: "e1", name: "Cloud", follower_count: 2, consumers: { automation: 1 }, impact: "high", state: "setup_error", error: "timeout" };
  el.data = { ...DATA, findings: [f("sensor.a", cause.id), f("sensor.b", cause.id), f("sensor.c")], causes: [cause] };
  assert.deepEqual(el.collapseFollowers(el.visibleFindings()).map(x => x.object_id), ["sensor.c"]);
  assert.equal(el.exportRows().length, 3);
  const html = el.findingsView();
  assert.ok(html.includes("Integration Cloud is not loaded") && html.includes("2 follow-ups") && html.includes("explains 2 more findings") && html.includes("data-toggle-followers"));
  assert.ok(entriesOf(el).includes("1 automations affected") && !entriesOf(el).includes("timeout"));
  el.showFollowers = true;
  assert.equal(el.collapseFollowers(el.visibleFindings()).length, 3);
  assert.equal(el.todoItems().some(i => i.key === "outages"), true);
  el.data = { ...el.data, causes: [{ ...cause, follower_count: 0, consumers: {} }] };
  assert.ok(entriesOf(el).includes("no entity affected") && entriesOf(el).split("data-fold=").length === 1, "an outage without follow-ups is a plain row, not a fold");
});

test("the findings list is one list: a chain is one entry with a counter and opens into its parts; the flat list names the cause", () => {
  const { el } = panel("en");
  const f = (id, cause) => ({ rule_id: "entity.state_unavailable", object_id: id, classification: "unavailable", confidence: 0.75, key: id, ignored: false, cause_id: cause });
  const app = { id: "app_down:a", kind: "app_down", object_type: "app", object_id: "a", name: "Zigbee2MQTT", follower_count: 0, total_followers: 2, child_ids: ["integration_down:e1"], parent_id: null, consumers: {}, impact: "high" };
  const integ = { id: "integration_down:e1", kind: "integration_down", object_type: "config_entry", object_id: "e1", name: "MQTT", follower_count: 2, total_followers: 2, child_ids: [], parent_id: app.id, consumers: {}, impact: "high" };
  el.data = { ...DATA, findings: [f("sensor.a", integ.id), f("sensor.b", integ.id), f("sensor.c")], causes: [app, integ] };
  assert.equal(el.findingTotal(), 3, "every open finding counts, the follow-ups of the chain too");
  el.folds = { "og:app:a": true, "og:config_entry:e1": true };
  const html = el.findingsView();
  assert.ok(html.includes("App Zigbee2MQTT is stopped") && html.includes("2 follow-ups") && html.includes("Integration MQTT is not loaded") && html.includes("sensor.a") && html.includes("sensor.c"));
  assert.ok(!html.includes("Single findings"), "no separate groups");
  el.data = { ...el.data, findings: [...el.data.findings, { ...f("x", "integration_down:e1"), rule_id: "config_entry.not_loaded", key: "own1" }], causes: [app, { ...integ, finding_key: "own1" }] };
  el.findingsView();
  assert.ok(el._findGroups["og:app:a"].includes("own1"), "an outage with a finding of its own is picked with its head");
  el.findingFollowers = true;
  assert.ok(!el.findingsView().includes("sensor.c"), "the follow-ups of the total tile keep only the chains");
  el.findingFollowers = false; el.showFollowers = true;
  assert.ok(el.findingsView().includes("Follow-up of MQTT"));
});

test("Done lists what a plan fixed and what ended by itself; objects removed or sources not read are not fixed", async () => {
  const { el } = panel("en");
  const now = new Date().toISOString();
  el.data = { ...DATA, findings: [] };
  el.journal = [{ plan_id: "p1", status: "executed", finished_at: now, undoable: true, kinds: ["disable_entity"], done_count: 400, done_objects: ["sensor.z"] }];
  el._hass = { language: "en", callWS: async () => ({ available: true, baseline_at: now, baselines: [], resolved_findings: { items: [{ rule_id: "entity.state_unavailable", object_id: "sensor.back" }, { rule_id: "entity.state_unavailable", object_id: "sensor.z" }] }, ended_findings: { items: [{ rule_id: "entity.state_unavailable", object_id: "sensor.gone", reason: "object_removed" }] } }) };
  el.render = () => {};
  await el.loadEnded();
  assert.equal(el.doneCount(), 2, "the plan and the one that came back; the plan's own object is not counted twice");
  const html = el.fixedList();
  assert.ok(html.includes("Fixed by a plan") && html.includes("Entity disabled") && html.includes("400 objects") && html.includes("can be undone: yes"));
  assert.ok(html.includes("Back in order by itself") && html.includes("sensor.back") && !html.includes("sensor.z</strong>"));
  assert.ok(html.includes("Object removed (not fixed)"));
});

test("the selection bar can mark a device that is down once instead of each of its entities", async () => {
  const { el } = panel("en");
  const calls = [];
  const f = id => ({ rule_id: "entity.state_unknown", object_id: id, classification: "unknown", confidence: 0.9, key: `u|${id}`, ignored: false, evidence: [] });
  const ent = id => ({ object_type: "entity", object_id: id, name: id, status: "unknown", device_id: "tv" });
  el.data = { ...DATA, objects: [ent("sensor.a"), ent("sensor.b"), { object_type: "device", object_id: "tv", name: "TV", status: "active" }], findings: [f("sensor.a"), f("sensor.b")], causes: [] };
  el.findSel = new Set(["u|sensor.a", "u|sensor.b"]);
  assert.equal(el.markDeviceCount(), 0, "a device that still works is never marked as a whole");
  el.data.findings.push({ rule_id: "device.down", object_id: "tv", classification: "problem", key: "d|tv", ignored: false, evidence: [] });
  assert.equal(el.markDeviceCount(), 1);
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return msg.type === "ha_housekeeper/inventory" ? { ...DATA, findings: [], causes: [] } : {}; } };
  el.bulk = { kind: "mark", reason: "", days: 0, markKind: "", error: "", onDevice: true };
  assert.ok(el.bulkForm().includes("data-bulk-ondevice") && el.bulkForm().includes("(1)"));
  await el.commitBulk();
  assert.deepEqual(calls.filter(c => c.type === "ha_housekeeper/mark_set").map(c => `${c.object_type}:${c.object_id}`), ["device:tv"]);
  assert.equal(el.findSel.size, 0);
});

test("the selection bar sets a mark on every picked object that can carry one", async () => {
  const { el } = panel("en");
  const calls = [];
  const obj = (type, id) => ({ object_type: type, object_id: id, name: id, status: "active" });
  const f = (rule, id) => ({ rule_id: rule, object_id: id, classification: "unavailable", confidence: 0.9, key: `${rule}|${id}`, ignored: false, evidence: [] });
  el.data = { ...DATA, objects: [obj("entity", "sensor.a"), obj("automation", "automation.x"), obj("config_entry", "e1")], findings: [f("entity.state_unavailable", "sensor.a"), f("automation.stale", "automation.x"), f("config_entry.not_loaded", "e1")], causes: [] };
  el.findSel = new Set(["entity.state_unavailable|sensor.a", "automation.stale|automation.x"]);
  assert.equal([...el.markTargets().values()].join(), "entity:sensor.a", "an automation cannot be marked");
  assert.ok(el.findSelBar([]).includes('data-fsel-state="mark"'));
  el.findSel.add("config_entry.not_loaded|e1");
  assert.equal(el.markKindsFor(el.markTargets()).join(), "expected_offline,seasonal,spare", "an integration takes fewer kinds");
  el._hass = { language: "en", callWS: async msg => { calls.push(JSON.stringify(msg)); return msg.type === "ha_housekeeper/inventory" ? { ...DATA, findings: [], causes: [] } : {}; } };
  el.bulk = { kind: "mark", reason: "away", days: 30, markKind: "seasonal", error: "" };
  await el.commitBulk();
  assert.equal(calls.filter(c => c.includes("mark_set")).length, 2);
  assert.ok(calls[0].includes('"object_type":"entity"') && calls[0].includes('"kind":"seasonal"') && calls[0].includes('"days":30'));
});

test("an object shows the rules it breaks on its overview, and nothing when there are none", () => {
  const { el } = panel("en", { setTimeout: () => 0 });
  const mk = (id, ignored) => ({ object_type: "entity", object_id: id, name: id, key: `policy.entity_area|${id}|`, ignored, by: null });
  el.policies = { rules: [{ id: "entity_area", enabled: true, count: 2, ignored: 1, items: [mk("light.a", false), mk("light.b", true)] }] };
  const html = el.polObjectCard({ object_type: "entity", object_id: "light.a" });
  assert.ok(html.includes("Policies · 1 violation") && html.includes('data-pol-row="policy.entity_area|light.a|"') && html.includes('data-view="policies"') && !html.includes("data-pol-sel"));
  assert.equal(el.polObjectCard({ object_type: "entity", object_id: "light.b" }), "");
  assert.equal(el.polObjectCard({ object_type: "entity", object_id: "light.c" }), "");
});

test("a policy violation takes the same decisions as a finding and reloads the rules", async () => {
  const calls = [];
  const { el, shadow } = panel("en", { setTimeout: () => 0 });
  const key = "policy.entity_area|light.a|";
  const rules = items => ({ available: true, enabled: 1, violations: 1, rules: [{ id: "entity_area", enabled: true, count: 1, ignored: 0, items }] });
  const open = { object_type: "entity", object_id: "light.a", name: "light.a", key, ignored: false, by: null, resurfaced: true };
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return rules([{ ...open, ignored: true, by: "user", resurfaced: false, ignore_info: { kind: "keep", reason: "Reserve", until: null } }]); } };
  el.policies = rules([open]);
  el.view = "policies";
  el.openDecide(key);
  assert.ok(shadow.innerHTML.includes("data-decide-form") && shadow.innerHTML.includes("Due again"));
  el.decide.kind = "keep"; el.decide.reason = "Reserve";
  await el.commitDecide();
  assert.equal(calls[0].kind, "keep");
  assert.equal(calls[1].type, "ha_housekeeper/policies");
  el.policyShowHidden = true; el.render();
  assert.ok(shadow.innerHTML.includes("Reserve") && el.decide === null);
});

test("a goal leads to the list it counts, with the filter set", () => {
  const { el } = panel("en");
  assert.ok(el.goalJump("broken_references").includes('data-jump="findingsNav"') && el.goalJump("broken_references").includes('data-filter="broken_reference"'));
  assert.ok(el.goalJump("devices_without_area").includes('data-jump-tab="violations"') && el.goalJump("devices_without_area").includes('data-jump-lf="polviol|rule|device_area"'));
  el.setListFilter("polviol", "rule", "device_area");
  assert.deepEqual(JSON.parse(JSON.stringify(el.lvState("polviol", "name", "asc").f)), { rule: "device_area" });
  el.setListFilter("polviol", "rule", "other");
  assert.equal(el.lv.polviol.f.rule, "other");
});

test("maintenance goals show state and values, and a limit is saved through goal_set", async () => {
  const calls = [];
  const { el, shadow } = panel("en", { setTimeout: () => 0 });
  const goal = (id, extra) => ({ id, unit: "count", enabled: true, limit: 10, default: 10, value: 3, never: false, state: "met", ...extra });
  const reply = { goals: [goal("unavailable", { value: 11, state: "missed" }), goal("backup_age", { unit: "hours", limit: 36, value: null, never: true, state: "missed" }), goal("recorder_growth", { unit: "mb_per_day", state: "unknown", value: null })], met: 0, missed: 2 };
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return msg.type === "ha_housekeeper/goals" ? reply : { saved: true }; } };
  await el.loadGoals();
  let html = el.goalsCard();
  assert.ok(html.includes("0 met, 2 missed") && html.includes("now 11 · at most 10") && html.includes("no backup · at most 36 h") && html.includes("cannot be measured yet"));
  assert.ok(html.includes(">Missed<") && html.includes(">Unknown<"));
  el.openGoal("unavailable");
  assert.ok(el.goalsCard().includes("data-goal-form"));
  el.goalForm.limit = "20"; el.goalForm.enabled = false;
  await el.commitGoal();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find(c => c.type === "ha_housekeeper/goal_set"))), { type: "ha_housekeeper/goal_set", goal: "unavailable", enabled: false, limit: 20 });
  assert.equal(el.goalForm, null);
  const compact = el.goalsCard(true);
  assert.ok(compact.includes("data-goals-settings") && !compact.includes("data-goal-open") && compact.includes("no backup"));
});

test("the cleanup journal notes recorder purges with backup, user and result", () => {
  const { el } = panel("en");
  el._hass = { language: "en", user: { id: "u1" } };
  el.purges = [{ at: "2026-10-09T10:00:00+00:00", by: "u1", removed: ["sensor.a", "sensor.b"], skipped: [{ id: "sensor.c", reason: "changed" }], states: true, backup: { job_id: "job-7" }, error: null }];
  const html = el.purgeJournalCard();
  assert.ok(html.includes("Deleted statistics (1)") && html.includes("sensor.a, sensor.b") && html.includes("2 deleted, 1 skipped") && html.includes("backup job-7") && html.includes("by you") && html.includes("with states"));
  el.purges = [];
  assert.equal(el.purgeJournalCard(), "");
});

test("the exchange assistant preselects nothing and turns only confirmed pairs into actions", async () => {
  const calls = [];
  const { el } = panel("en", { setTimeout: () => 0 });
  el.data = { objects: [{ object_type: "device", object_id: "old", name: "Plug A" }, { object_type: "device", object_id: "new", name: "Plug B" }], quarantine: [], findings: [], edges: [], meta: {} };
  const pairs = { old: { device_id: "old", name: "Plug A" }, new: { device_id: "new", name: "Plug B" }, unmatched_new: [], pairs: [
    { object_id: "sensor.a_power", name: "Power", status: "active", used: 2, meter: false, candidates: [{ object_id: "sensor.b_power", name: "Power B", score: 6, reasons: ["same_class", "same_unit"], status: "active" }] },
    { object_id: "sensor.a_total", name: "Total", status: "active", used: 0, meter: true, candidates: [{ object_id: "sensor.b_total", name: "Total B", score: 2, reasons: [], status: "active" }] },
    { object_id: "switch.a", name: "Switch", status: "active", used: 0, meter: false, candidates: [] },
  ] };
  el._hass = { language: "en", callWS: async msg => { calls.push(JSON.parse(JSON.stringify(msg))); return msg.type === "ha_housekeeper/device_pairs" ? pairs : { plan_id: "p1", actions: [], status: "dry_run", summary: {} }; } };
  el.exchangeState().oldDev = "old"; el.exchangeState().newDev = "new";
  await el.loadPairs();
  assert.deepEqual(el.exchangeActions(), [], "nothing is chosen for the person");
  let html = el.exchangeCard();
  assert.ok(html.includes("suggested") && html.includes("same device class, same unit") && html.includes("Nothing to replace") && html.includes("0 pairs confirmed"));
  assert.ok(/data-ex-target="switch.a"[^>]*disabled/.test(html), "a pair without use and without meter cannot be chosen");
  el.ex.choices["sensor.a_power"] = { target: "sensor.b_power" };
  el.ex.choices["sensor.a_total"] = { target: "sensor.b_total", how: "statistics" };
  assert.ok(el.exchangeCard().includes("data-ex-how"));
  el.lv.exchangepairs.f.pick = "chosen";
  html = el.exchangeCard();
  assert.ok(html.includes('data-ex-target="sensor.a_power"') && !html.includes('data-ex-target="switch.a"'), "the pair list filters by what was chosen");
  el.lv.exchangepairs.f.pick = "";
  assert.equal(el.exchangeActions().length, 2, "the choices survive the filter");
  await el.createExchangePlan();
  const create = calls.find(c => c.type === "ha_housekeeper/plan_create");
  assert.deepEqual(create.actions, [{ kind: "replace_references", object_id: "sensor.a_power", target: "sensor.b_power" }, { kind: "migrate_meter", object_id: "sensor.a_total", target: "sensor.b_total", mode: "statistics" }]);
  assert.equal(el.plan.plan_id, "p1");
});

test("a plan shows its follow-up, expected end state and audit report; a regression reaches the to-do list", async () => {
  const { el } = panel("en", { setTimeout: () => 0 });
  const plan = { plan_id: "p1", status: "verified", actions: [], followup: { state: "regression", at: "2026-10-09T10:00:00+00:00", new_count: 2, new: [{ classification: "broken_reference", object_id: "automation.x", key: "k" }] },
    simulation: { removed: 3, removed_devices: 1, disabled: 0, disabled_devices: 0, replaced: 4, replaced_by_source: [{ name: "Light", type: "automation", count: 4 }], meters: 0, remaining_certain: 1, remaining_uncertain: 2, statistics_orphaned_count: 1, blocked: 0 } };
  const follow = el.followupLine(plan);
  assert.ok(follow.includes("Regression") && follow.includes("2 new findings") && follow.includes("broken reference: automation.x"));
  const sim = el.simulationBlock(plan);
  assert.ok(sim.includes("3 entities removed (1 device)") && sim.includes("4 references replaced (Light: 4)") && sim.includes("1 certain uses remain") && sim.includes("2 uncertain or manual uses remain") && sim.includes("1 statistics likely orphaned") && sim.includes("Limits:"));
  const counted = el.simulationBlock({ ...plan, simulation: { ...plan.simulation, rows_counted: true, purge_rows: 1234, history_rows_kept: 56 } });
  assert.ok(counted.includes("recorder rows will be removed") && counted.includes("56 history rows stay"));
  const split = el.simulationBlock({ ...plan, recorder_keep_days: 10, simulation: { ...plan.simulation, removed: 1, removed_devices: 0, rows_counted: true, purge_rows: 0, history_rows_kept: 165, history_states_kept: 163, history_stats_kept: 2 } });
  assert.ok(el.simulationBlock({ ...plan, recorder_auto_purge: false, simulation: { ...plan.simulation, rows_counted: true, purge_rows: 0, history_states_kept: 3, history_stats_kept: 0 } }).includes("3 stored states stay in the database for good"));
  assert.ok(split.includes("1 entity removed<") && split.includes("163 stored states stay in the database until the recorder deletes them after 10 days") && split.includes("2 rows of long-term statistics stay for good"));
  assert.ok(!sim.includes("recorder rows"), "no numbers without a count");
  const calls = [];
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return { filename: "housekeeper-plan-p1.md", anonymized: !msg.anonymize === false, markdown: "# Audit report" }; } };
  await el.loadReport("p1");
  assert.equal(calls[0].anonymize, false);
  assert.ok(el.reportBlock(plan).includes("# Audit report") && el.reportBlock(plan).includes("data-report-download"));
  el.data = { objects: [], quarantine: [], findings: [], edges: [], meta: {}, regressions: [{ plan_id: "p1", at: "2026-10-09T10:00:00+00:00", new_count: 2 }] };
  assert.ok(el.todoItems().some(item => item.key === "followup" && item.count === 1));
});

test("the unused view has a tab for the entities and one for the orphaned statistics", () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true }, orphaned_statistics: [{ statistic_id: "sensor.old", in_energy: false }] };
  el.view = "unreferenced"; el._orphanLastRequested = true;
  el.render();
  assert.ok(shadow.innerHTML.includes('data-view-tab="unreferenced|statistics"'));
  el.pickViewTab("unreferenced|statistics");
  assert.equal(el.unrefTab, "statistics");
  assert.ok(shadow.innerHTML.includes('aria-selected="true"') && shadow.innerHTML.includes('data-psel="sensor.old"'));
});

test("automation diagnostics: quality dimensions, criteria, coverage, comparison and the dry run", async () => {
  const calls = [];
  const { el, shadow } = panel("en", { setTimeout: () => 0 });
  const dim = (level, key = "runs") => ({ level, reasons: [{ key, count: 3 }] });
  const quality = { items: [{ entity_id: "automation.hall", name: "Hall", status: "active", worst: "red", dimensions: { integrity: dim("ok"), reliability: dim("red", "failing"), effectiveness: dim("unknown", "no_criteria"), maintainability: dim("info", "no_description"), restart_safety: dim("ok"), efficiency: dim("ok"), conflicts: dim("warn", "conflict") } }] };
  const answers = {
    "ha_housekeeper/automation_quality": quality,
    "ha_housekeeper/criteria": { entity_id: "automation.hall", criteria: [], stats: { ok: 0, missed: 0 }, recent: [], limits: {} },
    "ha_housekeeper/criteria_set": { entity_id: "automation.hall", criteria: [{ id: "a1", targets: [{ entity_id: "light.hall", state: "on" }], within: 5, hold: 0 }], stats: { ok: 2, missed: 1 }, recent: [] },
    "ha_housekeeper/coverage": { enabled: true, runs: 12, since: "2026-09-20T10:00:00+00:00", ready: true, never: ["trigger/1"], thresholds: { min_runs: 10, min_days: 7 }, rows: [{ id: "trigger/0", kind: "trigger", label: "state: binary_sensor.door", count: 12, mean_ms: 1500, max_ms: 2000 }, { id: "trigger/1", kind: "trigger", label: "time: 07:00", count: 0, mean_ms: null, max_ms: null }] },
    "ha_housekeeper/trace_compare": { runs: [{ run_id: "r1", start: "2026-10-09T08:00:00+00:00", execution: "finished", trigger: "state of x" }, { run_id: "r2", start: "2026-10-09T09:00:00+00:00", execution: "error", trigger: "time" }] },
    "ha_housekeeper/automation_dry_run": { executes: false, triggers: [{ index: 0, result: true, platform: "state" }], conditions: true, branches: ["action/0/default"], calls: [{ service: "lock.unlock", targets: ["lock.front"], certain: false, critical: true, missing: [], disabled: [], templated: false }], uncertain: true, limits: [] },
  };
  el._hass = { language: "en", callWS: async msg => { calls.push(JSON.parse(JSON.stringify(msg))); if (msg.type === "ha_housekeeper/trace_compare" && msg.run_a) return { older: {}, newer: {}, differences: [{ kind: "execution", a: "finished", b: "error" }, { kind: "duration", a: 1000, b: 4000, factor: 4 }], updates_between: [], criterion: { older: true, newer: false } }; return answers[msg.type]; } };
  el.data = { ...DATA, objects: [...DATA.objects] };
  await el.loadQuality();
  let html = el.qualityView();
  assert.ok(html.includes("Hall") && html.includes("Reliability") && html.includes("Restart safety") && html.includes('title="Many errors'));
  assert.ok(!html.includes("Overall"), "no single score");
  assert.ok(!html.includes("data-diag-open"), "the overview has no diagnosis column");
  const hall = { object_type: "automation", object_id: "automation.hall", name: "Hall" };
  assert.ok(el.detailTabs(hall, "automation:automation.hall").some(([id]) => id === "diagnosis"), "the detail page has a diagnosis tab");
  el.diag.loadedFor = "automation.hall";
  await el.loadDiag("automation.hall");
  el.folds = { diag_more: true };
  html = el.diagTab(hall);
  assert.equal(el.diag.sel, "automation.hall");
  assert.ok(html.includes("Reliability") && html.includes("No success criterion defined") && html.includes("never reached") && html.includes("Compare") && html.includes("Test run"));
  el.editCriteria("automation.hall");
  el.diag.draft.push({ targets: [{ entity_id: "light.hall", state: "on" }], within: "5", hold: "0" });
  await el.saveCriteria();
  const set = calls.find(c => c.type === "ha_housekeeper/criteria_set");
  assert.deepEqual(set.criteria, [{ targets: [{ entity_id: "light.hall", state: "on" }], within: 5, hold: 0 }]);
  assert.ok(el.criteriaCard("automation.hall").includes("2 reached, 1 missed"));
  el.editCriteria("automation.hall");
  el.diag.draft = [{ type: "call", service: " notify.phone ", within: "8" }];
  assert.ok(el.criteriaForm().includes('data-crit-service="0"') && !el.criteriaForm().includes("data-crit-hold"));
  calls.length = 0;
  await el.saveCriteria();
  assert.deepEqual(calls.find(c => c.type === "ha_housekeeper/criteria_set").criteria, [{ type: "call", service: "notify.phone", within: 8 }]);
  el.diag.compare.a = "r1"; el.diag.compare.b = "r2";
  await el.runCompare();
  const lines = el.compareLines(el.diag.compare.result);
  assert.ok(lines.includes("finished → error") && lines.includes("factor 4") && lines.includes("older run reached, newer run missed"));
  el.dryState().states[0] = { entity_id: "binary_sensor.door", state: "on" };
  await el.runDry();
  assert.deepEqual(calls.at(-1).states, { "binary_sensor.door": "on" });
  const dry = el.dryResult(el.diag.dry.result);
  assert.ok(dry.includes("lock.unlock") && dry.includes("critical") && dry.includes("uncertain") && dry.includes("fires"));
  el.data = { ...DATA, criteria_alerts: [{ entity_id: "automation.hall", ok: 1, missed: 4 }] };
  assert.ok(el.todoItems().some(item => item.key === "criteria" && item.count === 1));
});

test("the health card names the score and the count; the safety line shows backup, last change, undo and follow-ups; a cause folds its follow-ups", () => {
  const { el, shadow } = panel("en");
  el.view = "overview";
  el.backup = { available: true, checks: [{ id: "newest", level: "ok", values: { age_hours: 5 } }] };
  el.journal = [
    { plan_id: "a", status: "verified", finished_at: "2026-10-08T10:00:00+00:00", undoable: true, followup: "watching" },
    { plan_id: "b", status: "verified", finished_at: "2026-10-01T10:00:00+00:00", undoable: false, followup: "regression" },
  ];
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("class=\"statushead\"") && /data-todo-go=|Nothing urgent|All good/.test(html));
  assert.ok(/of \d+ objects with a finding/.test(html));
  assert.ok(html.includes("Last backup: 5 h ago") && html.includes("undo available") && html.includes("1 plan is being watched") && html.includes("1 regression after a change"));
  el.journal = [{ plan_id: "c", status: "verified", finished_at: "2026-10-08T10:00:00+00:00", undoable: false }];
  assert.ok(el.safetyBar().includes("Last plan: ") && el.safetyBar().includes("no longer undoable"));
  el.data = { ...DATA, causes: [{ id: "integration_down:x", kind: "integration_down", object_type: "config_entry", object_id: "x", name: "Zigbee", follower_count: 47, consumers: { automation: 12, dashboard: 2 } }] };
  assert.ok(entriesOf(el).includes("47 entities, 12 automations, 2 dashboards affected"));
});

test("removing offers the recorder choice and sends it with the plan only when it is not 'keep'", async () => {
  const calls = [];
  const { el } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true } };
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return { plan_id: "p", actions: [], status: "dry_run" }; } };
  el.cleanupKind = "remove_entity"; el.cleanupSel = new Set(["sensor.b"]);
  assert.ok(el.recorderChoice(true).includes("Delete statistics and history"));
  assert.equal(el.recorderChoice(false), "");
  await el.createPlan();
  const created = () => calls.filter(c => c.type === "ha_housekeeper/plan_create");
  assert.equal(JSON.stringify(created()[0].actions), JSON.stringify([{ kind: "remove_entity", object_id: "sensor.b" }]));
  el.cleanupRecorder = "statistics";
  await el.createPlan();
  assert.equal(created()[1].actions[0].recorder, "statistics");
});

test("a removal chooses the recorder data per entity: its own choice, the default, and never for the Energy dashboard", async () => {
  const calls = [];
  const { el } = panel("en");
  const ent = (id, stats) => ({ object_type: "entity", object_id: id, name: id, status: "unavailable", has_statistics: stats });
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true }, objects: [...DATA.objects, ent("sensor.a", true), ent("sensor.b", false), ent("sensor.e", true)], edges: [{ source: "dashboard:energy", target: "entity:sensor.e", relation: "SHOWS", confidence: "certain" }] };
  el._rev = (el._rev || 0) + 1;
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return { plan_id: "p", actions: [], status: "dry_run" }; } };
  el.cleanupKind = "remove_entity"; el.cleanupSel = new Set(["sensor.a", "sensor.b", "sensor.e"]);
  assert.ok(el.recorderOwn(el.findObject("entity:sensor.a")).includes("+ History") && !el.recorderOwn(el.findObject("entity:sensor.a")).includes(">Delete history<"), "an entity with statistics: keep, statistics, + history");
  assert.ok(el.recorderOwn(el.findObject("entity:sensor.b")).includes(">Delete history<"), "without statistics only the history can go");
  assert.ok(el.recorderOwn(el.findObject("entity:sensor.e")).includes("Energy dashboard uses it"));
  el.cleanupRecorder = "statistics"; el.cleanupRecorderOwn = { "sensor.a": "keep", "sensor.b": "states" };
  await el.createPlan();
  assert.equal(JSON.stringify(calls.find(c => c.type === "ha_housekeeper/plan_create").actions), JSON.stringify([{ kind: "remove_entity", object_id: "sensor.a" }, { kind: "remove_entity", object_id: "sensor.b", recorder: "states" }, { kind: "remove_entity", object_id: "sensor.e" }]));
  const sum = el.recorderSummary({ actions: [{ kind: "remove_entity", recorder: "states", used_by: [] }, { kind: "remove_entity", used_by: [] }, { kind: "remove_entity", used_by: [{ source: "dashboard:energy" }] }] });
  assert.ok(sum.includes("1 delete statistics and history") && sum.includes("1 keep their data") && sum.includes("1 data locked (Energy)"));
});

test("the History tab holds the logbook, the plans of the journal that named the object, and the life of a device", () => {
  const { el } = panel("en");
  const ent = { object_type: "entity", object_id: "sensor.h", name: "H", status: "active" }, dev = { object_type: "device", object_id: "d9", name: "D", status: "active" };
  el.data = { ...DATA, objects: [...DATA.objects, ent, dev], notes: [{ id: "n1", title: "Stick replaced", at: "2026-10-08T18:05:00+00:00", target: "entity:sensor.h" }] };
  el._rev = (el._rev || 0) + 1;
  assert.ok(el.plansCard(ent).includes("Loading the journal"), "no journal yet");
  el.journal = [{ plan_id: "p1", created_at: "2026-10-01T10:00:00+00:00", status: "verified", summary: { total: 1, ok: 1, review: 0, blocked: 0 }, objects: ["sensor.h"] }, { plan_id: "p2", created_at: "2026-10-02T10:00:00+00:00", status: "verified", objects: ["sensor.other"] }];
  assert.equal(el.historyCount(ent), 2, "one entry and one plan");
  const html = el.historyTab(ent);
  assert.ok(html.includes("Stick replaced") && html.includes('data-plan-open="p1"') && !html.includes('data-plan-open="p2"') && html.includes("data-note-add-for"));
  assert.ok(el.detailTabs(ent, "entity:sensor.h").some(([id, , n]) => id === "history" && n === 2));
  const seen = { ...ent, status_since: "2026-10-01T10:00:00+00:00", last_changed: "2026-10-10T10:00:00+00:00", created_at: "2025-08-05T12:16:00+00:00" };
  const lines = el.noticedLines(seen, "entity:sensor.h");
  assert.equal(JSON.stringify(lines.map(l => l.text)), JSON.stringify(["Last state change", "Observed since", "Created"]), "dated lines, newest first");
  assert.ok(el.noticedCard(seen, "entity:sensor.h").includes("Noticed by Housekeeper") && el.historyTab(seen).includes("Noticed by Housekeeper"));
  assert.ok(el.knownHistoryLink(seen, "entity:sensor.h").includes('data-goto-tab="history"'));
  assert.ok(el.detailTabs({ object_type: "dashboard", object_id: "x", name: "x" }, "dashboard:x").every(([id]) => id !== "history"), "kinds without a logbook have no tab");
});

test("deleting asks in a dialog first; the deletion runs only from its confirmation", async () => {
  const { el } = panel("en");
  let ran = 0;
  assert.equal(el.confirmDialog(), "");
  el.confirmAsk(el.t("confirmRem", { name: "Filter" }), () => { ran += 1; });
  const html = el.confirmDialog();
  assert.ok(html.includes("Really delete?") && html.includes("The reminder “Filter” and its history will be deleted.") && html.includes("data-confirm-yes") && html.includes("data-confirm-no"));
  assert.equal(ran, 0, "nothing runs before the confirmation");
  el.confirmClose();
  assert.equal(el.confirmState, null);
  assert.equal(ran, 0, "cancel deletes nothing");
  assert.ok(el.t("confirmPlanDelete", { date: "x" }).includes("no longer possible") && el.t("confirmPlan") === "Confirm" && el.t("confirmRemDay", { date: "d", name: "n" }).includes("due day stays"));
});

test("the logbook editor names the object it was opened for and offers the picker only when none is set or on request", () => {
  const { el } = panel("en");
  el.data = { ...DATA, notes: [] };
  el.noteOpen(null, "entity:sensor.a");
  let html = el.noteEditor();
  assert.ok(html.includes("data-note-retarget") && !html.includes('data-picker="note"') && el.logbookView().includes("New entry") && !html.includes("audit report"));
  el.noteDraft.changeTarget = true;
  assert.ok(el.noteEditor().includes('data-picker="note"'), "after 'change' the picker shows");
  el.noteOpen(null, "");
  html = el.noteEditor();
  assert.ok(html.includes('data-picker="note"') && !html.includes("data-note-retarget"), "from the global logbook the object is chosen here");
});

test("the protection mode shows in the safety line and the settings, and is set through the server", async () => {
  const calls = [];
  const { el, shadow } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, protection: "read_only" } };
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return {}; } };
  assert.ok(el.safetyBar().includes("Protection mode: read only"));
  assert.ok(el.eventsCard().includes("ha_housekeeper_backup_overdue") && el.protectionCard().includes('value="read_only" data-protection checked'));
  await el.setProtection("full");
  assert.equal(JSON.stringify(calls.find(c => c.type === "ha_housekeeper/protection_set")), JSON.stringify({ type: "ha_housekeeper/protection_set", mode: "full" }));
  assert.equal(el.data.meta.protection, "full");
  assert.ok(el.safetyBar().includes("Protection mode: standard"));
  void shadow;
});

test("the batteries view shows the forecast with groups and the reminders, which are saved through the server", async () => {
  const calls = [];
  const { el } = panel("en");
  el.view = "batteries";
  el.data = { ...DATA, reminders: [{ id: "r1", name: "Water filter", interval_days: 90, last_done: "2026-07-01", history: ["2026-07-01"], due: "2026-09-29", days_left: -10, state: "due", note: "" }] };
  el.batteryTrend = { available: true, busy: false, unknown: 2, groups: [{ from_days: 14, to_days: 27, entity_ids: ["sensor.a", "sensor.b"] }], rows: [{ entity_id: "sensor.a", name: "Door", level: 40, slope: -1, days_left: 20, state: "falling", points: 12 }] };
  el._btRequested = true; el._sysLightFor = el.data;
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return { reminders: [] }; } };
  const forecast = el.batteryNeed();
  assert.ok(forecast.includes("When which battery runs out") && forecast.includes("no type"));
  const reminders = el.remindersCard();
  assert.ok(reminders.includes("Water filter") && reminders.includes("10 days overdue"));
  assert.ok(el.todoItems().some(i => i.key === "reminders"));
  el.remDraft = { id: "", name: "Descale", interval_days: "30", due: "2026-10-31", dueTouched: true, note: "" };
  await el.reminderCall({ action: "save", name: "Descale", interval_days: 30, due: "2026-10-31", note: "" });
  assert.equal(calls[0].type, "ha_housekeeper/reminder_set");
  assert.equal(el.remDraft, null);
  el.remOpen = ["r1"];
  assert.ok(el.reminderHistory({ id: "r1", name: "Water filter", interval_days: 90, last_done: "2026-07-01", history: ["2026-07-01"], due: "2026-09-29", days_left: -10, state: "due", note: "" }).includes("data-rem-hdel=\"r1|2026-07-01\""));
  el.view = "reminders";
  el.remDraft = el.remBlank();
  const editor = el.remindersView();
  assert.ok(editor.includes("data-rem-form") && editor.includes("New reminder") && editor.includes("page-editor") && !editor.includes('role="dialog"'), "the reminder uses a page editor");
  assert.ok(!editor.includes("data-rem-new") && !el.remindersCard().includes("data-rem-save"));
  el.remDraft = { ...el.remDraft, id: "r1" };
  assert.ok(el.remindersView().includes("Edit reminder"));
  el.remDraft = null;
  assert.ok(el.remindersView().includes("data-rem-new") && !el.remindersView().includes("data-rem-form"));
  const row = el.relRowBody({ title: "Hue", domain: "hue", entities: 3, availability: 99, setup: { count: 2, days: 7, last: "2026-10-08T10:00:00+00:00", state: "setup_retry" } });
  assert.ok(row.includes("Setup failures: 2 in 7 days") && row.includes("Currently in state setup_retry"));
  assert.equal(el.relSetupHint({ availability: 90, setup: { count: 3, days: 7 } }), "relHintOffline");
  assert.equal(el.relSetupHint({ availability: 99.9, setup: { count: 3, days: 7 } }), "relHintEarly");
  assert.equal(el.relSetupHint({ availability: 99, setup: { count: 1, days: 7, state: "setup_error" } }), "relHintError");
  assert.equal(el.relSetupHint({ availability: 99 }), null);
  assert.ok(el.relSetupCell({ count: 2, days: 7, last: "2026-10-08T10:00:00+00:00" }).includes("2 in 7 days"));
});

test("findings get a status: known, snoozed, hidden, new and in work, and the list filters by it", async () => {
  const calls = [];
  const { el } = panel("en");
  const now = new Date().toISOString();
  const base = DATA.findings[0];
  const findings = [
    { ...base, key: "a", object_id: "sensor.a", ignored: true, ignored_by: "user", ignore_info: { kind: "keep", reason: "ok" } },
    { ...base, key: "b", object_id: "sensor.b", ignored: true, ignored_by: "user", ignore_info: { kind: "snooze", until: now } },
    { ...base, key: "c", object_id: "sensor.c", ignored: false, first_detected_at: now },
    { ...base, key: "d", object_id: "sensor.d", ignored: false, first_detected_at: "2020-01-01T00:00:00Z" },
  ];
  el.data = { ...DATA, findings };
  el.journal = [{ plan_id: "p1", status: "dry_run", objects: ["sensor.d"], done_objects: [] }, { plan_id: "p2", status: "executed", finished_at: now, objects: ["sensor.z"], done_objects: ["sensor.z"] }];
  const keys = status => { el.findingStatus = status; return findings.filter(f => el.statusMatch(f)).map(f => f.key).join(""); };
  assert.equal(keys(""), "cd");
  assert.equal(keys("known"), "a");
  assert.equal(keys("snoozed"), "b");
  assert.equal(keys("new"), "c");
  assert.equal(keys("inwork"), "d");
  assert.equal(el.doneEvents().map(p => p.plan_id).join(), "p2");
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return {}; } };
  el.findSel = new Set(["c"]);
  el.bulk = { kind: "known", reason: "", days: 30, error: "" };
  await el.commitBulk();
  assert.equal(el.bulk.error, "decideNeedReason");
  el.bulk.reason = "on purpose";
  await el.commitBulk();
  assert.equal(JSON.stringify(calls.filter(c => c.type === "ha_housekeeper/ignore").map(c => [c.kind, c.reason, c.finding_key])), JSON.stringify([["keep", "on purpose", "c"]]));
  assert.equal(el.decidedState(findings[2]), "known");
});

test("the counter assistant scans, previews with a chart and asks for REPAIR", async () => {
  const { el, shadow } = panel("en");
  const found = { available: true, busy: false, checked: 12, items: [{ statistic_id: "sensor.water", name: "Water", unit: "m³", findings: [{ bad_first: 1788220800, bad_last: 1788260800, low: 41.5, high: 41.5, good_before: 91.69, good_after: 91.8 }] }] };
  const sent = [];
  el.data = stepCData().data; el.journal = []; el.view = "repair"; el.repairTask = "repair_counter"; el.cleanupKind = "repair_counter";
  el._hass = { language: "en", callWS: async msg => { sent.push(msg); return msg.type.endsWith("counter_scan") ? found : { ...REPAIR_PLAN }; } };
  el.render();
  assert.ok(shadow.innerHTML.includes("A counter must never fall") && shadow.innerHTML.includes("data-counter-scan") && shadow.innerHTML.includes("data-range-pick"));
  assert.equal((shadow.innerHTML.match(/data-counter-scan/g) || []).length, 1, "one button starts the check, also before the first one");
  await el.loadCounterScan(true);
  assert.ok(shadow.innerHTML.includes("sensor.water") && shadow.innerHTML.includes("data-counter-pick"));
  el.counterSel = "sensor.water"; el.counterMode = "interpolate";
  await el.createPlan();
  assert.equal(JSON.stringify(sent[1]), JSON.stringify({ type: "ha_housekeeper/plan_create", actions: [{ kind: "repair_counter", object_id: "sensor.water", mode: "interpolate" }] }));
  el.confirmation = { plan_id: "r1", token: "t", execute: ["sensor.water"], needs_acknowledgement: [] };
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("<polyline") && html.includes("5-minute rows") && !html.includes("data-confirm-word"));
  el.view = "repair"; el.render();
  // A range picked by hand becomes a repair_range request with seconds since 1970.
  el.counterId = "sensor.water"; el.rangeFrom = "2026-10-01T10:00"; el.rangeTo = "2026-10-01T12:00"; el.rangeMode = "fixed"; el.rangeFixed = "91,7";
  el.pickRange(shadow);
  await new Promise(r => setTimeout(r, 0));
  const range = sent.at(-1).actions[0];
  assert.equal(range.kind, "repair_range"); assert.equal(range.mode, "fixed"); assert.equal(range.range.fixed, 91.7);
  assert.equal(range.range.to - range.range.from, 7200);
  // A spike found in a measurement fills the range and shows the readings with two sliders.
  el.view = "repair"; el.render();
  el._hass = { language: "en", callWS: async msg => { sent.push(msg); return { error: null, kind: "measurement", unit: "°C", table: "short_term", points: Array.from({ length: 20 }, (_, i) => [1788200000 + i * 300, 20 + (i === 10 ? 65 : 0)]) }; } };
  el.takeRange("sensor.boiler", 1788202900, 1788203300);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(sent.at(-1).type, "ha_housekeeper/range_series");
  assert.ok(shadow.innerHTML.includes('data-range-slide="from"') && shadow.innerHTML.includes("data-range-band"));
  assert.equal(el.rangeFrom, el.localStamp(1788202900)); assert.equal(el.counterId, "sensor.boiler");
  const action = { ...REPAIR_PLAN.actions[0], kind: "repair_range", mode: "hold", counter: { kind: "measurement", unit: "°C", range: { from: 1788220800, to: 1788224400 }, bracket: [1788220000, 20, 1788225000, 21], available: { states: 4, short_term: 0, long_term: 2 },
    counts: { states: 2, short_term: 0, long_term: 1, estimated_long_term: 1, tail_short_term: 0, tail_long_term: 0 }, detail: { states: [[1788221000, "85", "20"]], short_term: { cols: ["mean", "min", "max"], rows: [], tails: [] }, long_term: { cols: ["mean", "min", "max"], rows: [[1788220800, [85, 20, 85], [20, 20, 20]]], tails: [] } }, series: [] } };
  const html2 = el.rangeDetail(action);
  assert.ok(html2.includes("Hourly rows") && html2.includes("no longer there") && html2.includes("estimate") && html2.includes("85 / 20 / 85"));
});

const REPAIR_PLAN = {
  plan_id: "r1", created_at: new Date().toISOString(), status: "dry_run", executed: false, summary: { total: 1, ok: 0, review: 1, blocked: 0 },
  actions: [{ kind: "repair_counter", object_type: "entity", object_id: "sensor.water", mode: "interpolate", name: "Water", verdict: "review", executable: true, reasons: ["counter_write"], used_by: [],
    counter: { unit: "m³", counts: { states: 3, short_term: 10, long_term: 10, tail_short_term: 40, tail_long_term: 30 }, skipped: {},
      findings: [{ bad_first: 1788220800, bad_last: 1788260800, low: 41.5, high: 41.5, good_before: 91.69, good_after: 91.8, series: [[1, 91, 91], [2, 41, 91], [3, 41, 91], [4, 91, 91]] }] } }],
};

test("refactoring hints are shown for reading, without a plan button", () => {
  const { el } = panel("en");
  el.diag = { quality: null, loading: false, error: "", sel: "automation.hall", criteria: {}, draft: null, message: "", detail: {} };
  el.refactorState().by["automation.hall"] = { enabled: true, editable: true, proposals: [{ fix: "hint_long_delay", count: 1, paths: ["action/0"], longest: 1800 }, { fix: "hint_dead_branch", count: 1, paths: ["action/1/choose/0"], entities: ["x.gone"] }] };
  const card = el.refactorCard("automation.hall");
  assert.ok(card.includes("the longest 30 min (action/0)") && card.includes("x.gone") && card.includes("writes nothing here"));
  assert.ok(!card.includes("data-refactor-plan"));
});

test("selected findings get a label through a plan that opens under Cleanup", async () => {
  const calls = [];
  const { el } = panel("en");
  const base = DATA.findings[0];
  el.data = { ...DATA, objects: [...DATA.objects, { object_type: "label", object_id: "review", name: "Review" }], findings: [{ ...base, key: "k1", object_id: DATA.objects.find(o => o.object_type === "entity").object_id }] };
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return { plan_id: "p1", status: "dry_run", actions: [], summary: { total: 1, ok: 1, review: 0, blocked: 0 } }; } };
  el.findSel = new Set(["k1"]);
  el.bulk = { kind: "label", label: "review", reason: "", days: 30, error: "" };
  assert.ok(el.bulkForm().includes('value="review"'));
  const scrolls = [], render = el.render.bind(el);
  el.render = () => { scrolls.push(Boolean(el._scrollPlan)); render(); };
  await el.commitBulk();
  const sent = calls.find(c => c.type === "ha_housekeeper/plan_create");
  assert.equal(JSON.stringify(sent.actions.map(a => [a.kind, a.target])), JSON.stringify([["add_label", "review"]]));
  assert.equal(el.view, "plan");
  await el.planLabel(sent.actions[0].object_id, "review"); // the same from the detail page
  assert.equal(scrolls.filter(Boolean).length, 2, "both open the page at the new plan (issue #8)");
});

test("a failed action shows a message and keeps the page, a failed load still replaces it", async () => {
  const { el } = panel("en");
  const toasts = [];
  el.toast = (text, error) => toasts.push([text, error]);
  el._hass = { language: "en", callWS: async () => { throw new Error("boom"); } };
  await el.planLabel("sensor.a", "review");
  assert.ok(!el.error);
  assert.deepEqual(toasts, [["That did not work: boom", true]]);
  assert.ok(!el.content().includes("Could not load inventory"));
});

test("a second click while a plan is being made sends no second request", async () => {
  const { el } = panel("en");
  const calls = [];
  let finish;
  el._hass = { language: "en", callWS: msg => { if (!msg.type.endsWith("/plan_create")) return Promise.resolve({}); calls.push(msg); return new Promise(resolve => { finish = () => resolve({ plan_id: "p1", status: "dry_run", actions: [] }); }); } };
  const first = el.planLabel("sensor.a", "review");
  assert.ok(el.planBusy);
  await el.planLabel("sensor.a", "review");
  finish(); await first;
  assert.equal(calls.length, 1);
  assert.ok(!el.planBusy && el.plan.plan_id === "p1");
});

test("the details for a bug report hold versions, browser and the last panel errors", () => {
  const { el } = panel("en");
  el.toast = () => {};
  el.failed(new Error("plan refused"));
  const text = el.issueText();
  assert.ok(text.includes("**Home Assistant:**") && text.includes("**Browser / app:**") && /action: plan refused/.test(text));
  assert.ok(text.includes("**AI access:** off") && el.issueText({ calls_24h: 4, changes_24h: 1 }).includes("4 calls and 1 changes in 24 hours"));
  assert.equal(el.diagnosticsData().recent_errors.length, 1);
});

test("every new plan opens through openNewPlan, so none is left out of view (issue #8)", () => {
  const dir = new URL("../panel-src/", import.meta.url);
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith(".js"))) {
    const src = fs.readFileSync(new URL(name, dir), "utf8");
    for (const m of src.matchAll(/type: "ha_housekeeper\/plan_create"/g)) {
      assert.ok(src.slice(m.index, m.index + 400).split("\n").slice(0, 3).join("\n").includes("openNewPlan("), `${name}: plan_create without openNewPlan`);
    }
  }
});

test("a preview that deletes statistics offers the states switch and is cancelled for good", async () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, objects: [], edges: [], findings: [] };
  const act = { kind: "purge_statistics", object_id: "sensor.old", name: "sensor.old", verdict: "review", executable: true, reasons: ["irreversible"], used_by: [], states: true };
  el.plan = { plan_id: "p9", created_at: new Date().toISOString(), status: "dry_run", executed: false, summary: { total: 1, ok: 0, review: 1, blocked: 0 }, actions: [act], simulation: { purge_states_rows: 7 } };
  el.journal = [el.plan]; el.view = "plan";
  const sent = [];
  el._hass = { language: "en", callWS: async msg => { sent.push(msg); return msg.type === "ha_housekeeper/plan_create" ? { ...el.plan, plan_id: "p10", actions: [{ ...act, states: msg.actions[0].states }] } : {}; } };
  el.render();
  assert.ok(shadow.innerHTML.includes("data-purge-states-switch") && shadow.innerHTML.includes("7 stored states"));
  await el.setPurgeStates(false);
  assert.equal(sent.find(m => m.type === "ha_housekeeper/plan_create").actions[0].states, false);
  assert.equal(el.plan.plan_id, "p10");
  assert.ok(sent.some(m => m.type === "ha_housekeeper/plan_delete" && m.plan_id === "p9"));
  await el.discardPlan();
  assert.ok(sent.some(m => m.type === "ha_housekeeper/plan_delete" && m.plan_id === "p10") && !el.journal.length && !el.plan);
});

test("the overview of an object offers its actions: decide a finding, replace a missing entity, disable, label", () => {
  const { el } = panel("en");
  el.lv = {}; el.render = () => {};
  el.data = { ...DATA, objects: [...DATA.objects, { object_type: "label", object_id: "lbl", name: "Check" }], findings: [
    { rule_id: "automation.missing_entity", object_id: "automation.c", classification: "broken_reference", confidence: 0.98, affected_object: "sensor.gone", key: "k9", ignored: false, evidence: [] },
    { ...DATA.findings[0], key: "k1", ignored: false },
  ] };
  const auto = el.actionsCard(el.findObject("automation:automation.c"), "automation:automation.c");
  assert.ok(auto.includes('data-act-replace="sensor.gone"') && auto.includes('data-decide-open=') && !auto.includes("data-act-label-plan") && auto.includes("edit it there"));
  assert.ok(!auto.includes("data-act-disable"));
  const entity = el.actionsCard(el.findObject("entity:sensor.a"), "entity:sensor.a");
  assert.ok(entity.includes('data-act-disable="sensor.a"'));
  const before = el.data;
  el.data = { ...before, objects: before.objects.map(o => o.object_id === "sensor.a" ? { ...o, reason: "not_provided", not_provided_settled: true } : o), findings: [{ ...DATA.findings[0], rule_id: "entity.not_provided", key: "np", ignored: false }], quarantine: [] };
  assert.ok(!el.cleanupCandidates("disable_entity").length && el.cleanupCandidates("remove_entity").some(r => r.item.object_id === "sensor.a"), "a settled entity not provided is removed, not disabled, in Cleanup too");
  el.data = before;
  const gone = el.actionsCard({ ...el.findObject("entity:sensor.a"), reason: "not_provided", not_provided_settled: true }, "entity:sensor.a");
  assert.ok(gone.includes('data-act-remove="sensor.a"') && !gone.includes("data-act-disable="), "an entity no longer provided is removed, not disabled");
  const twinData = el.data;
  el.data = { ...twinData, findings: [{ ...DATA.findings[0], key: "k1", ignored: false }, { rule_id: "entity.possible_duplicate", object_id: "sensor.a", classification: "possible_duplicate", confidence: 0.7, affected_object: "sensor.b", key: "kd", ignored: false }] };
  const twin = el.findingRows("entity:sensor.a");
  assert.ok(twin.includes("Replace by the working entity") && !twin.includes("Replace by another entity"), "with a working twin, replacing is offered once, at the duplicate");
  el.data = twinData;
  assert.ok(el.labelForm({ object_type: "script", object_id: "script.x" }).includes("data-act-label-plan") && el.labelForm({ object_type: "device", object_id: "d1" }) === "", "scripts and scenes take a label too, devices not");
  el.startCleanup("replace_references", () => { el.replOld = "sensor.gone"; });
  assert.equal(el.view, "repair");
  assert.equal(el.repairTask, "replace_references");
  assert.equal(el.replOld, "sensor.gone");
  assert.ok(!el.detailPanel("relations", el.findObject("entity:sensor.a"), "entity:sensor.a").includes("data-decide-open"), "findings moved off the dependencies tab");
  const rel = el.relationsCard("entity:sensor.a");
  assert.ok(rel.includes("<table") || rel.includes("noRelations") || rel.includes("factnote"), "the relations are a table or the empty note");
  assert.ok(!rel.includes("style="), "no inline style");
});

test("the relations of an object are one table: rows open known objects, a missing target is marked, the kind filter and the export follow", () => {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [...DATA.objects, { object_type: "entity", object_id: "sensor.rel", name: "Rel", status: "active" }, { object_type: "automation", object_id: "automation.rel", name: "Rel auto", status: "active" }, { object_type: "device", object_id: "drel", name: "Rel device", status: "active" }],
    edges: [
      { source: "device:drel", target: "entity:sensor.rel", relation: "PROVIDES", confidence: "certain" },
      { source: "automation:automation.rel", target: "entity:sensor.rel", relation: "TARGETS", confidence: "certain" },
      { source: "entity:sensor.rel", target: "entity:sensor.gone", relation: "TARGETS", confidence: "certain", location: "a" },
      { source: "entity:sensor.rel", target: "entity:sensor.gone", relation: "TARGETS", confidence: "certain", location: "b" }],
    findings: [{ key: "kg", rule_id: "x", classification: "broken_reference", affected_object: "sensor.gone", object_id: "sensor.rel" }] };
  const rel = el.relationsCard("entity:sensor.rel");
  assert.ok(rel.includes("<table") && rel.includes('data-lsort="relations|name'), "a table");
  assert.ok(rel.includes('data-object="automation:automation.rel"') && rel.includes('data-object="device:drel"'), "a known object opens");
  assert.ok(!rel.includes('data-object="entity:sensor.gone"') && rel.includes('class="pill red">Missing'), "a missing target is marked and does not open");
  assert.ok(rel.includes("2 places"), "the same relation at two places is one row");
  const rows = () => el._exporters.relations.rows();
  assert.equal(rows().length, 3);
  el.lvState("relations", "name", "asc").f.group = "origin"; el.relationsCard("entity:sensor.rel");
  assert.equal(JSON.stringify(rows().map(r => r[1])), '["device:drel"]', "the kind filter keeps only the origin rows");
});

test("the repair view offers its tasks as tiles; one opens its assistant and the plan is finished there", () => {
  const { el, shadow } = panel("en");
  el.data = stepCData().data; el.journal = []; el.view = "repair"; el.repairTask = null;
  el.render();
  let html = shadow.innerHTML;
  for (const kind of ["repair_counter", "migrate_meter", "replace_references", "exchange_device"]) assert.ok(html.includes(`data-repair-task="${kind}"`), kind);
  assert.ok(!html.includes("data-cleanup-kind") && html.includes("not checked"));
  el.counterScan = { available: true, items: [], checked: 3 }; el.render();
  assert.ok(shadow.innerHTML.includes("none found"));
  el.repairTask = "migrate_meter"; el.cleanupKind = "migrate_meter"; el.render();
  html = shadow.innerHTML;
  assert.ok(html.includes('data-picker="meterOld"') && html.includes('aria-pressed="true" data-repair-task="migrate_meter"') && !html.includes("data-repair-back"));
});

test("the overview has no tile card; a missed goal is a to-do row, not a card of its own", () => {
  const { el } = panel("en");
  el.data = { ...DATA, regressions: [], criteria_alerts: [] };
  el.goals = { met: 2, missed: 1, goals: [{ id: "broken_references", state: "missed", value: 43, limit: 0, unit: "count", enabled: true, default: 0 }, { id: "backup_age", state: "met", value: 3, limit: 48, unit: "hours", enabled: true, default: 48 }] };
  el._goalsRequested = true; el._goalsKey = el.data.meta.scanned_at || "";
  el.folds = { todo_care: true };
  const html = el.overview();
  assert.ok(!html.includes("hk-tiles"));
  assert.ok(html.includes("Broken references") && html.includes("Goal missed") && html.includes("allowed: none") && html.includes("Maintenance goals: 3 of 3 met".replace("3 of 3", "2 of 3")) && html.includes("data-goals-settings"));
  assert.ok(!html.includes('aria-labelledby="hk-goals"') && html.includes("with a finding"));
  el.staleScan = () => null; // an old scan is a state topic and would colour the ring yellow
  assert.ok(el.health().tasks >= 1 && el.health().tone === "ok"); // a missed goal is an open task, but maintenance never colours the status
  el.data = { ...DATA, objects: [], findings: [], regressions: [], criteria_alerts: [] };
  el.goals = { met: 3, missed: 0, goals: [] };
  assert.deepEqual([el.health().percent, el.health().tone], [100, "ok"]);
});

test("detail, maintenance and settings offer their options as tiles that open one thing", () => {
  const { el, shadow } = panel("en");
  const sensor = { object_type: "entity", object_id: "sensor.water", name: "Water", status: "active", has_statistics: true };
  const dev = { object_type: "device", object_id: "dev1", name: "Lamp", status: "active" };
  el.data = { ...DATA, objects: [...DATA.objects, sensor, dev], findings: [] };
  const entity = el.actionsCard(sensor, "entity:sensor.water");
  assert.ok(entity.includes('data-act-repair="sensor.water"') && entity.includes('data-act-meter="sensor.water"') && entity.includes("What would you like to do?"));
  assert.ok(el.actionsCard(dev, "device:dev1").includes('data-act-exchange="dev1"'));
  const sent = [];
  el._hass = { language: "en", callWS: async msg => { sent.push(msg); return { error: null, kind: "counter", unit: "m³", table: "long_term", points: [] }; } };
  el.repairValues("sensor.water");
  assert.equal(el.view, "repair"); assert.equal(el.repairTask, "repair_counter"); assert.equal(el.counterId, "sensor.water");
  assert.equal(sent.at(-1).type, "ha_housekeeper/range_series");
  el.view = "maintenance"; el.render();
  for (const id of ["backup", "updates", "blueprints", "goals"]) assert.ok(shadow.innerHTML.includes(`data-view-tab="maintenance|${id}"`), id);
  el.view = "settings"; el.settingsTab = "protection"; el.render();
  for (const id of ["look", "protection", "exceptions", "scan", "info"]) assert.ok(shadow.innerHTML.includes(`data-set-tab="${id}"`), id);
  assert.ok(shadow.innerHTML.includes("data-protection") && !shadow.innerHTML.includes("data-notify"));
});

test("the language can be set by hand, saved with the preferences, and falls back to Home Assistant", () => {
  const { el, shadow } = panel("en");
  assert.equal(el.lang, "en");
  el.setPref("language", "de");
  assert.equal(el.lang, "de"); assert.equal(el.t("settings"), TEXT_DE_SETTINGS);
  assert.equal(el.sanitizePrefs({ language: "fr" }).language, "auto");
  el.setPref("language", "auto");
  assert.equal(el.lang, "en");
  el.view = "settings"; el.settingsTab = "look"; el.render();
  assert.ok(shadow.innerHTML.includes('data-pref="language|de"') && shadow.innerHTML.includes('data-pref="language|auto"'));
});
test("the sensor field lists matching sensors with statistics while typing and takes the picked one", () => {
  const { el } = panel("en");
  const mk = (id, stats) => ({ object_type: "entity", object_id: id, name: id, status: "active", has_statistics: stats });
  el.data = { ...DATA, objects: [mk("sensor.water_meter", true), mk("sensor.water_temp", true), mk("sensor.water_off", false), mk("light.water", true)] };
  el.counterId = "water"; el._picker = { name: "counter", open: true, index: 0 };
  assert.equal(el.pickerResults("counter").map(o => o.object_id).join(), "sensor.water_meter,sensor.water_temp");
  const html = el.pickerBox("counter", "sensor.x", "data-counter-id");
  assert.ok(html.includes('data-picker-item="entity:sensor.water_meter"') && !html.includes("water_off") && !html.includes("light.water"));
  el.pickerPick("counter", "entity:sensor.water_temp");
  assert.equal(el.counterId, "sensor.water_temp"); assert.equal(el._picker.open, false);
  // the dependency path uses the same search for every kind of object and opens the picked one
  el.data = { ...el.data, objects: [...el.data.objects, { object_type: "device", object_id: "d1", name: "Water pump", status: "active" }] };
  el.graphQuery = "water pump";
  assert.equal(el.pickerResults("graph").map(o => o.object_id).join(), "d1");
  el.noteGraphStep = () => {}; el.pickerPick("graph", "device:d1");
  assert.equal(el.graphSelected.object_id, "d1"); assert.equal(el.graphQuery, "");
});
const TEXT_DE_SETTINGS = "Einstellungen";
test("batteries in volts are not read as percent and sit in the same list with the guessed type", () => {
  const { el } = panel("en");
  const bat = (id, unit, state) => ({ object_type: "entity", object_id: id, name: id, status: "active", device_class: "battery", unit, state });
  el.data = { ...DATA, objects: [bat("sensor.pct", "%", "15"), bat("sensor.volt", "V", "3.1")] };
  assert.equal(el.batteryRows().map(r => r.item.object_id).join(), "sensor.pct");
  el.batteryTrend = { available: true, busy: false, rows: [], groups: [], unknown: 0, voltage: { unknown: 1, rows: [{ entity_id: "sensor.volt", name: "Coin", type: "coin3", limit: 2.5, level: 2.86, state: "falling", days_left: 24 }] } };
  el.batteryFilter = "all";
  const html = el.batteriesView();
  assert.ok(html.includes("2.86 V") && html.includes("3 V cell") && html.includes("2.50 V") && html.includes("sensor.pct"));
});

test("the recorder card of an entity counts on request and shows rows per table", async () => {
  const { el } = panel("en");
  el._hass.callWS = async () => ({ available: true, busy: false, keep_days: 10, states: { rows: 51405, first: 1.7e9, last: 1.7e9 + 864000 }, short: { rows: 0, first: null, last: null }, long: { rows: 0, first: null, last: null } });
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true } };
  const item = { object_type: "entity", object_id: "light.a" };
  assert.ok(el.entityRecorderCard(item).includes('data-erec="light.a"'));
  await el.loadEntityRecorder("light.a");
  const html = el.entityRecorderCard(item);
  assert.ok(html.includes("51,405") || html.includes("51.405"));
  assert.ok(html.includes("nothing stored") && html.includes("retention: 10 days"));
  assert.equal(el.entityRecorderCard({ object_type: "device", object_id: "d" }), "");
});

test("the loudest entities offer ticks, mark what can be excluded and share the selection with the costs", () => {
  const { el, shadow } = panel("en");
  const ent = (id, stats) => ({ object_id: id, object_type: "entity", name: id, has_statistics: stats, status: "active" });
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true }, objects: [ent("light.a", false), ent("sensor.s", true)], edges: [] };
  el._edgeIndex = null;
  el.storms = { available: true, busy: false, findings: [], integrations: [], events: [], entities: [
    { entity_id: "light.a", name: "A", rows: 5000, per_day: 5000, rows_24h: 5000, used: 0, has_statistics: false, suggest_exclude: true, no_new_state: 1, attr_bytes: 100 },
    { entity_id: "sensor.s", name: "S", rows: 4000, per_day: 4000, rows_24h: 4000, used: 0, has_statistics: true, suggest_exclude: false, no_new_state: 0, attr_bytes: 100 },
  ], total_rows: 9000, per_day: 9000, entity_count: 2, event_total: 0 };
  el.view = "recorder"; el.viewTab = { recorder: "entities" };
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes('data-exsel="light.a"') && html.includes("Recommended") && html.includes("has statistics"));
  assert.deepEqual(el._exSuggested, ["light.a"]);
});

test("a plan runs as a wizard: review, confirm with a way back, run, result; long plans come in pages", () => {
  const { el, shadow } = panel("en");
  const action = id => ({ kind: "disable_entity", object_id: id, name: id, verdict: "ok", executable: true, reasons: [] });
  const plan = (status, extra = {}) => ({ plan_id: "p", status, created_at: new Date().toISOString(), summary: { total: 25, ok: 25, review: 0, blocked: 0 }, actions: Array.from({ length: 25 }, (_, i) => action(`sensor.s${i}`)), ...extra });
  const stage = (p, confirming = false) => el.planStage(p, confirming);
  assert.deepEqual([stage(plan("dry_run")), stage(plan("dry_run"), true), stage(plan("running")), stage(plan("executed")), stage(plan("verified", { verification: { ok: true, checks: [] } })), stage(plan("aborted"))], [0, 1, 2, 2, 3, 3]);
  el.plan = plan("dry_run"); el.view = "plan"; el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("1. Review") && html.includes("sensor.s0") && html.includes("sensor.s19") && !html.includes("sensor.s20") && html.includes("data-lpage"), "a long plan comes in pages");
  el.confirmation = { plan_id: "p", token: "t", execute: ["sensor.s0"], needs_acknowledgement: [] }; el.render();
  assert.ok(!shadow.innerHTML.includes("data-plan-back") && !shadow.innerHTML.includes("data-plan-execute"), "no second screen");
  el.confirmation = null; el.render();
  assert.ok(shadow.innerHTML.includes("data-plan-confirm") && !shadow.innerHTML.includes("data-plan-back"));
});

test("the export wizard builds CSV, Markdown and JSON from the chosen fields only and keeps credentials out", () => {
  const { el, shadow, downloads } = panel("en", { localStorage: fakeStorage() });
  const ent = (id, name, extra = {}) => ({ object_type: "entity", object_id: id, name, status: "active", platform: "hue", device_id: "d1", area_id: null, device_class: null, unit: null, ...extra });
  el.data = { ...DATA, meta: { ...DATA.meta }, objects: [
    ent("light.a", "=Lamp *A*", { unit: "lm" }), ent("sensor.b", "Sensor B"), ent("light.c", "C"),
    { object_type: "device", object_id: "d1", name: "Hub", status: "active", area_id: "a1" },
    { object_type: "area", object_id: "a1", name: "Living", status: "active" },
    { object_type: "automation", object_id: "auto1", name: "Evening", status: "active" },
  ], edges: [{ source: "automation:auto1", target: "entity:light.a", relation: "TRIGGERS_ON", confidence: "certain" }] };
  el._rev = (el._rev || 0) + 1;
  el._hass = { language: "en", states: { "light.a": { state: "on", attributes: { brightness: 200, access_token: "SECRET", friendly_name: "A" } }, "sensor.b": { state: "5", attributes: {} } } };
  assert.equal(JSON.stringify([...el.xpEntitiesOf("device:d1")].sort()), JSON.stringify(["light.a", "light.c", "sensor.b"]));
  assert.equal(JSON.stringify(el.xpEntitiesOf("automation:auto1")), JSON.stringify(["light.a"]));
  el.xpOpen(["light.a", "sensor.b"]);
  assert.equal(el.view, "inventory");
  assert.ok(shadow.innerHTML.includes("1. Selection") && shadow.innerHTML.includes("2 selected") && shadow.innerHTML.includes('data-xp-pick="light.c"'));
  // CSV: header, escaping of formulas, related names, no state and no attributes without a tick
  let out = el.xpBuild();
  assert.equal(out.ext, "csv");
  assert.ok(out.text.includes('"entity_id","name","domain","status","area","device","integration","device_class","unit","used_by"') && out.text.includes("\"'=Lamp *A*\"") && out.text.includes("Living") && out.text.includes("Evening"));
  assert.ok(!out.text.includes('"on"') && !out.text.includes("SECRET") && !out.text.includes("brightness"));
  // attributes: offered without the sensitive one, written only when ticked
  el.xp.g.attr = true;
  assert.deepEqual(el.xpOfferedAttrs(), ["brightness", "friendly_name"]);
  el.xp.attrs.add("brightness"); el.xp.g.state = true; el.xp.fmt = "json";
  const json = JSON.parse(el.xpBuild().text);
  assert.equal(json[0].attributes.brightness, 200); assert.equal(json[0].state, "on"); assert.deepEqual(json[0].used_by, ["Evening"]);
  assert.ok(!JSON.stringify(json).includes("SECRET"));
  // Markdown: grouped by area, markdown characters in names escaped
  el.xp.fmt = "md";
  const md = el.xpBuild().text;
  assert.ok(md.includes("## Living") && md.includes("`light.a` =Lamp \\*A\\*") && md.includes("used by: Evening"));
  // placeholders replace names, IDs, areas, devices and users everywhere
  el.xp.ph = true;
  const hidden = el.xpBuild().text;
  assert.ok(!hidden.includes("light.a") && !hidden.includes("Living") && !hidden.includes("Hub") && !hidden.includes("Evening") && hidden.includes("entity_1") && hidden.includes("Automation 1"));
  // templates stay in this browser, and the wizard walks through its four steps
  el.xp.ph = false; el.xp.fmt = "csv";
  el.xpSaveTemplates([{ name: "Docs", g: { zuord: true, rel: false, state: false, attr: false }, attrs: [], fmt: "md", ph: true, sort: false }]);
  el.xpApplyTemplate(el.xpTemplates()[0]);
  assert.equal(el.xp.fmt, "md"); assert.equal(el.xp.ph, true); assert.equal(el.xp.g.rel, false);
  for (const step of [1, 2, 3]) { el.xp.step = step; el.render(); assert.ok(shadow.innerHTML.includes(`aria-current="true"`), `step ${step}`); }
  assert.ok(shadow.innerHTML.includes("data-xp-copy") && shadow.innerHTML.includes("data-xp-download"));
  el.xpDownload();
  assert.equal(downloads.length, 1);
});

test("tables and lists grow with their content: no height limit and no scrolling inside them", () => {
  const css = fs.readFileSync(SOURCE, "utf8");
  assert.ok(!/\.tablewrap[^{}]*\{[^{}]*max-height/.test(css), "no table has a height limit");
  assert.ok(!/\.tablewrap\{[^{}]*overflow:auto/.test(css), "a table scrolls sideways only");
});

test("table sorting uses column headers on desktop and the sort control on mobile", () => {
  const { el } = panel("en");
  el.lvState("unreferenced", "name", "asc");
  el.lvState("cleanup", "name", "asc");
  const sorts = [{ key: "name", label: "sortName", dir: "asc" }];
  assert.ok(el.listBar("unreferenced", { table: true, sorts }).includes('class="sortgroup table-sort"'));
  assert.ok(el.listBar("cleanup", { sorts }).includes('class="sortgroup"'), "row lists keep visible sorting");
  assert.ok(fs.readFileSync(SOURCE, "utf8").includes('@media(min-width:861px){.listbar .sortgroup.table-sort{display:none}}'));
});

test("the logbook has its own tab, entries use page editors, an action can suggest one and the object shows its latest", async () => {
  const { el, shadow } = panel("en");
  const sent = [];
  const entry = { id: "n1", title: "Zigbee stick replaced", at: "2026-10-08T18:05:00+00:00", target: "entity:light.a", note: "new <b>stick</b>", source: "me", ref: "" };
  el.data = { ...DATA, notes: [entry], objects: [...DATA.objects, { object_type: "entity", object_id: "light.a", name: "Lamp A", status: "active" }] };
  el._rev = (el._rev || 0) + 1;
  el._hass.callWS = async msg => { sent.push(msg); return { notes: msg.action === "delete" ? [] : [entry, { ...entry, id: "n2", title: msg.title, source: msg.source || "me", ref: msg.ref || "" }] }; };
  el.compare = { ...COMPARE, current: { objects: 10, findings: 2 }, retention_days: 30 };
  el.view = "changes"; el.render();
  assert.ok(!shadow.innerHTML.includes("Zigbee stick replaced"), "the scan comparison no longer mixes in the entries");
  el.pickViewTab("changes|logbook");
  let html = shadow.innerHTML;
  assert.ok(html.includes("Zigbee stick replaced") && html.includes('data-label="Concerns">Lamp A') && html.includes("new &lt;b&gt;stick&lt;/b&gt;") && !html.includes("<b>stick</b>"), "an entry shows, escaped");
  assert.ok(html.includes("data-note-add") && html.includes('data-note-edit="n1"'));
  assert.ok(/<tr[^>]*data-note-edit="n1"[^>]*role="button"/.test(html) && html.includes('data-lsort="logbook|at'), "the whole row opens the entry in a sortable table");
  el.lvState("logbook", "at", "desc").f.object = "entity:light.a"; el.lvState("logbook", "at", "desc").f.source = "housekeeper"; el.render();
  assert.ok(!shadow.innerHTML.includes('data-note-edit="n1"') && shadow.innerHTML.includes('data-lf-set="logbook||"'), "the source and the object filter the list and show the shared note");
  el.lvState("logbook", "at", "desc").f = { object: "entity:light.a" }; el.render();
  assert.ok(shadow.innerHTML.includes('data-note-edit="n1"') && el._exporters.logbook.rows().length === 1, "the object filter keeps its entry and the export follows");
  el.lvState("logbook", "at", "desc").f = {}; el.render();
  // The editor replaces the global logbook list; chips, validation and actions stay available.
  el.noteOpen(); el.render();
  assert.ok(shadow.innerHTML.includes("page-editor") && shadow.innerHTML.includes("data-note-form") && shadow.innerHTML.includes("data-note-chip") && !shadow.innerHTML.includes("data-note-modal"));
  assert.ok(shadow.innerHTML.indexOf("data-note-cancel") < shadow.innerHTML.indexOf('type="submit"'), "Cancel sits left of Save");
  await el.noteSave();
  assert.ok(el.noteDraft.error.includes("title") && sent.length === 0);
  el.noteDraft.title = "Router update"; el.noteDraft.at = "2026-10-10T20:15";
  await el.noteSave();
  assert.equal(sent[0].type, "ha_housekeeper/note_set"); assert.equal(sent[0].action, "save"); assert.equal(sent[0].title, "Router update"); assert.ok(sent[0].at.endsWith("Z"));
  assert.equal(el.noteDraft, null); assert.equal(el.data.notes.length, 2);
  // Deleting is offered in the editor and asks in the confirmation dialog first.
  el.noteOpen(entry); el.render();
  assert.ok(shadow.innerHTML.includes('data-note-del="n1"') && !shadow.innerHTML.includes("data-note-del-yes"));
  await el.noteDeleteConfirmed("n1");
  assert.equal(sent[1].action, "delete"); assert.equal(el.data.notes.length, 0); assert.equal(el.noteDraft, null);
  // in the tab "History" of the object: the hint while empty, the entries when there are some
  assert.ok(el.noteCard({ object_type: "entity", object_id: "light.a" }).includes("data-note-add-for") && !el.noteCard({ object_type: "entity", object_id: "light.a" }).includes("data-note-edit"));
  el.data = { ...el.data, notes: [entry] };
  const card = el.noteCard({ object_type: "entity", object_id: "light.a" });
  assert.ok(card.includes("Zigbee stick replaced") && card.includes("data-note-edit"));
  el.selected = el.findObject("entity:light.a");
  el.noteOpen(null, "entity:light.a");
  const editingCard = el.noteCard(el.selected);
  assert.ok(editingCard.startsWith('<section class="panel">') && editingCard.includes('class="note-editor inline"') && editingCard.includes("data-note-form") && !editingCard.includes("data-note-add-for") && !editingCard.includes("data-note-modal"), "the object editor stays inside its logbook card");
  assert.ok(!editingCard.includes('data-note-edit="n1"'), "the editor replaces the rows within the card");
  el.noteDraft = null;
  el.selected = null;
  assert.equal(el.noteCard({ object_type: "dashboard", object_id: "d" }), "");
  // a finished replace offers an entry; accepting saves it as suggested by Housekeeper with the plan as reference
  const plan = { plan_id: "p1", status: "verified", actions: [{ kind: "replace_references", object_id: "sensor.old", target: "sensor.new", result: { state: "done" } }] };
  el.plan = plan; el.data = { ...el.data, notes: [] };
  assert.ok(el.logSuggestCard(plan).includes("References replaced: sensor.old → sensor.new"));
  await el.noteSuggestAccept(plan);
  const accepted = sent.at(-1);
  assert.equal(accepted.source, "housekeeper"); assert.equal(accepted.ref, "p1"); assert.equal(accepted.target, "entity:sensor.new");
  assert.equal(el.logSuggestion({ ...plan, status: "dry_run" }), null);
  // the correlation words it as "at about the same time"
  assert.ok(el.corrText({ kind: "note", title: "Zigbee <i>" }).includes("Zigbee &lt;i&gt;"));
});

test("an own scan point is created inside the scan history, keeps its name on failure and is deleted after asking", async () => {
  const { el, shadow } = panel("en");
  const sent = [];
  el._hass.callWS = async msg => { sent.push(msg); return msg.type === "ha_housekeeper/scan" ? el.data : { baselines: [] }; };
  const pin = { id: "pin:2026-10-07T18:02:00+00:00", at: "2026-10-07T18:02:00+00:00", name: "Before the <rebuild>", pinned: true, objects: 5, findings: 3 };
  el.compare = { ...COMPARE, baselines: [{ id: "previous", at: "2026-10-09T23:20:00+00:00", objects: 6, findings: 2 }, pin], current: { objects: 6, findings: 1 }, retention_days: 30 };
  el.view = "changes"; el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("Before the &lt;rebuild&gt;") && html.includes("Own point") && html.includes(`data-baseline="${pin.id}"`) && !html.includes("<rebuild>"), "the point shows by its name, escaped");
  assert.ok(html.indexOf("Previous scan") < html.indexOf("Before the &lt;rebuild&gt;"), "newest first");
  el.pinOpen(); el.render();
  html = shadow.innerHTML;
  assert.ok(html.includes("data-pin-form") && html.includes("data-pin-chip") && !html.includes("data-pin-modal"));
  assert.ok(html.indexOf("data-pin-form") < html.indexOf(`data-baseline="${pin.id}"`), "the editor stays inside the history card above its rows");
  assert.ok(!html.includes("data-pin-add"), "the add button is hidden while editing");
  el.pinDraft.name = "Before the update";
  el.load = async fresh => { sent.push({ type: fresh ? "ha_housekeeper/scan" : "ha_housekeeper/inventory" }); };
  await el.pinSave();
  assert.deepEqual(sent.map(m => m.type), ["ha_housekeeper/scan", "ha_housekeeper/scan_point", "ha_housekeeper/compare"]);
  assert.equal(sent[1].action, "save"); assert.equal(sent[1].name, "Before the update");
  el.compare = { ...COMPARE, baselines: [{ id: "previous", at: "2026-10-09T23:20:00+00:00", objects: 6, findings: 2 }, pin], current: { objects: 6, findings: 1 }, retention_days: 30 };
  el.render();
  assert.ok(shadow.innerHTML.includes(`data-pin-del="${pin.id}"`) && !shadow.innerHTML.includes("data-pin-del-yes"));
  el.compareBaseline = pin.id;
  await el.pinDelete(pin.id);
  assert.equal(sent.at(-2).action, "delete"); assert.equal(sent.at(-2).baseline, pin.id); assert.equal(el.compareBaseline, "previous");
  el.compare = { ...COMPARE, baselines: [pin], current: { objects: 6, findings: 1 }, retention_days: 30 };
  el.pinOpen(); el.pinDraft.name = "Keep this name";
  let finishScan;
  el.load = async () => { await new Promise(resolve => { finishScan = resolve; }); el.error = "Scan failed"; };
  const before = sent.length;
  const saving = el.pinSave();
  assert.equal(el.pinDraft.busy, true);
  assert.ok(shadow.innerHTML.includes('data-pin-form') && shadow.innerHTML.includes('value="Keep this name"') && shadow.innerHTML.includes('aria-busy="true"'), "the editor remains visible and cannot be submitted twice during the scan");
  finishScan();
  await saving;
  assert.equal(el.pinDraft.name, "Keep this name");
  assert.equal(el.pinDraft.busy, false);
  assert.ok(shadow.innerHTML.includes("Scan failed") && shadow.innerHTML.includes("Keep this name"));
  assert.equal(sent.length, before, "a failed scan creates no saved scan point");
});

test("a newer scan comparison wins when an older request finishes last", async () => {
  const { el } = panel("en");
  el.view = "changes"; el.compare = COMPARE;
  const pending = [];
  el._hass.callWS = () => new Promise(resolve => pending.push(resolve));
  const older = el.loadCompare();
  const newer = el.loadCompare();
  const fresh = { ...COMPARE, baseline: "fresh" };
  pending[1](fresh); await newer;
  pending[0]({ ...COMPARE, baseline: "old" }); await older;
  assert.equal(el.compare.baseline, "fresh");
  assert.equal(el.compareLoading, false);
});

test("the entity page sums up what is known in groups with the source of each line; recorder values come on request", () => {
  const { el } = panel("en");
  const light = { object_type: "entity", object_id: "sensor.power", name: "Power", status: "active", state: "412", unit: "W", device_class: "power", state_class: "measurement", has_statistics: true, last_changed: "2026-10-10T10:00:00+00:00", last_reported: "2026-10-10T10:01:00+00:00" };
  el.data = { ...DATA, meta: { ...DATA.meta, recorder_available: true }, objects: [...DATA.objects, light], edges: [{ source: "automation:a1", target: "entity:sensor.power", relation: "TRIGGERED_BY", confidence: "certain" }], notes: [{ id: "n1", title: "Stick replaced", at: "2026-10-08T18:05:00+00:00", target: "entity:sensor.power", note: "", source: "me", ref: "" }] };
  el._rev = (el._rev || 0) + 1;
  el.exposure = { exposed_entities: [{ entity_id: "sensor.power", assistants: ["cloud.alexa"] }], exposed_total: 1 };
  el.ensureExposure = () => {};
  let html = el.knownCard(light, "entity:sensor.power");
  for (const text of ["Known about this entity", "Times", "Last state change", "Used in", "Show history (1)"]) assert.ok(html.includes(text), text);
  for (const text of ["412 W", "Long-term statistics", "Unit: W", "Load recorder values", "Write rate"]) assert.ok(!html.includes(text), `${text} is in the diagnosis or in "In the recorder"`);
  assert.ok(html.includes('class="ksrc">Scan') && html.includes('class="ksrc">Logbook'), "each line names its source");
  const rows = { states: { rows: 10, first: 1760000000, last: 1760100000 }, short: { rows: 0 }, long: { rows: 5, first: 1750000000, last: 1760000000 } };
  assert.ok(!el.entityRecorderRows(rows, "sensor.power").includes("Write rate"), "no rate before the recorder load numbers are there");
  el.storms = { available: true, per_day: 1000, entities: [{ entity_id: "sensor.other", per_day: 500 }, { entity_id: "sensor.power", per_day: 120 }] };
  html = el.entityRecorderRows(rows, "sensor.power");
  assert.ok(html.includes("120 records a day") && html.includes("Rank 2 of the loudest") && html.includes("12 % of all records"));
  el.storms.entities[1].excluded = true;
  assert.ok(el.entityRecorderRows(rows, "sensor.power").includes("Not recorded (recorder filter)"));
});

test("an entity has an Actions tab that holds what changes something; the overview only shows the next step of an open finding", () => {
  const { el } = panel("en");
  const ghost = { object_type: "entity", object_id: "sensor.ghost", name: "Ghost", status: "unavailable", state: "unavailable", reason: "state_unavailable" };
  const finding = { key: "k1", rule_id: "entity.state_unavailable", object_id: "sensor.ghost", classification: "unavailable", confidence: 0.9 };
  el.data = { ...DATA, objects: [...DATA.objects, ghost], findings: [finding] };
  el._rev = (el._rev || 0) + 1;
  const key = "entity:sensor.ghost";
  assert.ok(el.detailTabs(ghost, key).some(([id, , n]) => id === "actions" && n >= 1), "the tab counts what is offered");
  const band = el.nextStepBand(ghost, key);
  assert.ok(band.includes("Next step") && band.includes("data-act-replace") && band.includes('data-detail-tab="actions"'));
  const overview = el.detailPanel("overview", ghost, key);
  assert.ok(overview.includes("Next step") && !overview.includes("data-de-rename") && !overview.includes("data-stale-form"), "no forms on the overview");
  const actions = el.detailPanel("actions", ghost, key);
  assert.ok(actions.includes("Recommended") && actions.includes("Name and classify") && actions.includes("data-de-rename"));
  assert.ok(actions.includes('class="actrow"') && (actions.match(/<section class="panel/g) || []).length === 1, "the forms are rows of one card");
  assert.ok(/<div class="fbtns"><button class="btn primary" data-act-replace="sensor.ghost"/.test(actions) && !actions.includes(">Open</button>"), "the step that answers the finding leads its row");
  assert.ok(actions.includes("data-de-id") && !actions.includes('class="deform" data-de-rename><label'), "the controls sit on the right, the label is the row title");
  // a healthy entity has no next step
  assert.equal(el.nextStepBand({ ...ghost, status: "active" }, "entity:sensor.fine"), "");
});

test("devices, automations and integrations share the layout: the overview reads, the Actions tab changes things and appears only with content", () => {
  const { el } = panel("en");
  const device = { object_type: "device", object_id: "d1", name: "Hub", status: "active", area_id: "" };
  const auto = { object_type: "automation", object_id: "a1", name: "Evening", status: "active" };
  const entry = { object_type: "config_entry", object_id: "c1", name: "Hue", status: "active" };
  el.data = { ...DATA, objects: [...DATA.objects, device, auto, entry, { object_type: "area", object_id: "living", name: "Living", status: "active" }, { object_type: "label", object_id: "l1", name: "Keep", status: "active" }], findings: [] };
  el._rev = (el._rev || 0) + 1;
  const tabs = o => el.detailTabs(o, el.objectKey(o)).map(([id]) => id);
  assert.ok(tabs(device).includes("actions"), "a device offers the exchange and an area");
  assert.ok(tabs(auto).includes("actions"), "an automation can get a label");
  assert.ok(tabs(entry).includes("actions"), "a healthy integration can still get a mark (what to expect of it)");
  assert.ok(el.detailPanel("actions", entry, "config_entry:c1").includes("Notes"));
  assert.ok(el.detailPanel("actions", entry, "config_entry:c1").includes("Here you say what is normal"), "a tab with only the mark says what it is for");
  assert.ok(!el.detailPanel("actions", device, "device:d1").includes("Here you say what is normal"), "not when there is more");
  const overview = el.detailPanel("overview", device, "device:d1");
  assert.ok(!overview.includes("data-de-area") && !overview.includes("data-act-exchange"), "no forms on the overview");
  const actions = el.detailPanel("actions", device, "device:d1");
  assert.ok(actions.includes("data-act-exchange") && actions.includes("data-de-area") && actions.includes("Name and classify"));
  const at = text => actions.indexOf(`>${text}<`);
  assert.ok(!actions.includes(">Recommended<"), "the exchange is no answer to a finding, so nothing is recommended");
  assert.ok(at("Notes") > 0 && at("Notes") < at("More actions") && at("More actions") < at("Name and classify"), "fixed order: notes, more actions, name");
  assert.ok(el.detailPanel("actions", auto, "automation:a1").includes("data-act-label-plan"));
});

test("devices, integrations, automations and scripts sum up what is known in groups with the source of each line", () => {
  const { el } = panel("en");
  const device = { object_type: "device", object_id: "d1", name: "Plug", status: "active", manufacturer: "Shelly", model: "Plug S", sw_version: "1.14.0", area_id: "living", config_entry_ids: ["c1"], created_at: "2026-03-14T10:00:00+00:00" };
  const entry = { object_type: "config_entry", object_id: "c1", name: "Shelly", status: "active", state: "loaded", integration_version: "2026.10.1", device_count: 7, entity_count: 2 };
  const auto = { object_type: "automation", object_id: "automation.evening", name: "Evening", status: "active", state: "on", mode: "single", trigger_count: 2, condition_count: 1, action_count: 3, last_triggered: "2026-10-10T19:02:00+00:00" };
  const e1 = { object_type: "entity", object_id: "sensor.a", name: "A", status: "active", device_id: "d1", config_entry_id: "c1" };
  const e2 = { object_type: "entity", object_id: "sensor.b", name: "B", status: "unavailable", device_id: "d1", config_entry_id: "c1" };
  el.data = { ...DATA, findings: [...DATA.findings, { rule_id: "automation.missing_entity", object_id: "automation.evening", classification: "orphaned", confidence: 0.98, affected_object: "sensor.gone", evidence: [{ location: "triggers[0]" }] }], meta: { ...DATA.meta, recorder_available: true }, objects: [...DATA.objects, device, entry, auto, e1, e2, { object_type: "area", object_id: "living", name: "Living", status: "active" }],
    edges: [{ source: "automation:automation.evening", target: "entity:sensor.a", relation: "TRIGGERS_ON", confidence: "certain" }, { source: "automation:automation.evening", target: "entity:sensor.gone", relation: "TRIGGERS_ON", confidence: "certain" }, { source: "script:script.night", target: "automation:automation.evening", relation: "CALLS", confidence: "certain" }], notes: [] };
  el._rev = (el._rev || 0) + 1;
  const dev = el.knownCard(device, "device:d1");
  for (const text of ["Known about this device", "1 of 2 entities unavailable", "Shelly Plug S", "Firmware 1.14.0", "Living", "1 Automation"]) assert.ok(dev.includes(text), text);
  el.storms = { available: true, per_day: 1000, entities: [{ entity_id: "sensor.a", entry_id: "c1", per_day: 150 }] };
  el.reliability = { available: true, window_days: 7, entries: [{ entry_id: "c1", availability: 98.7, shared_outages: 3, longest_outage: 2460 }] };
  const ent = el.knownCard(entry, "config_entry:c1");
  for (const text of ["Known about this integration", "Loaded", "Availability (7 days)", "98.7 %", "Version 2026.10.1", "7 devices · 2 entities", "at least 150 records a day", "15 % of all records"]) assert.ok(ent.includes(text), text);
  el.runs = { items: [{ entity_id: "automation.evening", runs: 212, errors: 9, conditions: 61, mean_ms: 1200, max_ms: 8400, per_day: [1, 2], findings: [] }] };
  const aut = el.knownCard(auto, "automation:automation.evening");
  for (const text of ["Known about this automation", "212 runs, 9 with an error", "2 triggers, 1 conditions, 3 actions", "2 objects", "1 of them missing", "sensor.gone", "Called by", "Last triggered"]) assert.ok(aut.includes(text), text);
  assert.ok(aut.includes('class="ksrc">Runs'), "the runs are named as the source");
  // the facts card keeps scenes and other objects
  assert.ok(el.factsCard({ object_type: "scene", object_id: "scene.x", name: "S", status: "active" }, "scene:scene.x").includes(el.t("facts")));
  // an outage names its length and when it becomes more serious
  const down = { rule_id: "config_entry.not_loaded", object_id: "e1", classification: "problem", confidence: 1, first_detected_at: new Date(Date.now() - 6 * 3.6e6).toISOString(), ignored: false };
  el.data = { ...el.data, findings: [down], meta: { ...el.data.meta, min_unavailable_days: 7 } };
  const outage = el.factsCard({ object_type: "config_entry", object_id: "e1", name: "MQTT", status: "active" }, "config_entry:e1");
  assert.ok(outage.includes(el.t("chip_outage")) && outage.includes("6 ") && outage.includes(el.t("chip_medium")), "the length and the next level stand in the facts");
});

test("the export started from a detail page returns to that page", () => {
  const { el, shadow } = panel("en");
  const item = { object_type: "entity", object_id: "sensor.a", name: "Sensor A", status: "active" };
  el.data = { ...DATA, objects: [...DATA.objects.filter(o => o.object_id !== "sensor.a"), item] };
  el._rev = (el._rev || 0) + 1;
  el.selected = item; el.detailTab = "technical"; el.view = "overview"; el.render();
  el.xpOpen(["sensor.a"]);
  assert.equal(el.selected, null);
  assert.ok(shadow.innerHTML.includes("data-xp-return") && shadow.innerHTML.includes("Back to Sensor A"));
  el.xpClose();
  assert.equal(el.selected, item); assert.equal(el.detailTab, "technical"); assert.equal(el.xp, null);
  // started from a list, there is no way back to offer
  el.selected = null; el.xpOpen(); assert.ok(!shadow.innerHTML.includes("data-xp-return"));
});

test("the mark is a row of the Actions tab and a line of what is known, no longer a card under the dependencies", () => {
  const { el } = panel("en");
  const item = { object_type: "entity", object_id: "sensor.m", name: "M", status: "unavailable", state: "unavailable", mark: { kind: "seasonal", reason: "winter", until: "2026-12-12T00:00:00+00:00" } };
  el.data = { ...DATA, objects: [...DATA.objects, item], findings: [] };
  el._rev = (el._rev || 0) + 1;
  const key = "entity:sensor.m";
  const actions = el.detailPanel("actions", item, key);
  assert.ok(actions.includes("Mark: Seasonal") && actions.includes('data-mark-open="entity:sensor.m"') && actions.includes('data-mark-clear="entity:sensor.m"'));
  assert.ok(el.knownCard(item, key).includes("Seasonal") && el.knownCard(item, key).includes("Mark"));
  assert.ok(!el.detailPanel("relations", item, key).includes("data-mark-open"), "the dependencies show only relations");
  el.markForm = { key, kind: "seasonal", reason: "", days: 0, target: "", error: "" };
  assert.ok(el.detailPanel("actions", item, key).includes("data-mark-form"), "the form opens below the row");
  assert.ok(el.markRows({ object_type: "automation", object_id: "automation.x" }).length === 0);
});

test("the status is a state in points: each object once by its worst level, weighed 2, 1 and a half; the colour comes from what is open; the ring explains it", () => {
  const { el, shadow } = panel("en");
  const f = (id, impact, extra = {}) => ({ rule_id: "entity.state_missing", object_id: id, classification: "orphaned", confidence: 0.9, evidence: [], impact, key: id, ...extra });
  const objects = Array.from({ length: 20 }, (_, i) => ({ object_type: "entity", object_id: `x.${i}`, name: `x.${i}`, status: "active" }));
  const cause = (id, parent, impact) => ({ id, parent_id: parent, impact, object_type: "entity", object_id: "x.1" });
  el.data = { ...DATA, objects, causes: [cause("a", null, "high"), cause("b", "a", "high")], findings: [f("x.1", "high", { cause_id: "a" }), f("x.2", "medium"), f("x.2", "low", { rule_id: "entity.unused" }), f("x.3", "low"), f("x.4", "low", { ignored: true }), f("x.5", "info")] };
  const items = [{ tone: "warn", key: "quarantine", area: "care", count: 2 }];
  el.todoItems = () => items;
  let h = el.health();
  assert.equal(h.load, 3.5, "the chain counts once at its cause, an object with two findings once, the hidden finding and info not at all");
  assert.equal(h.percent, 82.5);
  assert.equal(h.affected, 3, "the objects with a finding are the rows of the calculation, without info");
  assert.equal(h.tone, "warn", "an object with high impact is yellow while no urgent topic is open");
  assert.equal(el.statusHeadline(), "All good", "maintenance alone is nothing to name in the headline");
  assert.ok(el.statusSubline(h).includes("1 in maintenance"));
  el.data = { ...el.data, causes: [], findings: Array.from({ length: 9 }, (_, i) => f(`x.${i}`, "high")) };
  items.push({ tone: "red", key: "disk", area: "state" }, { tone: "red", key: "backup", area: "state" });
  h = el.health();
  assert.equal([h.percent, h.tone, h.red].join(), "10,red,2");
  el.data = { ...el.data, findings: Array.from({ length: 15 }, (_, i) => f(`x.${i}`, "high")) };
  assert.equal(el.health().percent, 0, "the state never falls below 0");
  el.data = { ...el.data, findings: [f("x.1", "low")] };
  items.splice(1, 2);
  h = el.health();
  assert.equal([h.percent, h.tone].join(), "97.5,ok", "low findings and maintenance alone leave the ring green");
  el.data = { ...el.data, findings: [] };
  items.splice(0, items.length, { tone: "red", key: "disk", area: "state" });
  h = el.health();
  assert.equal([h.percent, h.tone].join(), "100,red", "an urgent state topic makes the ring red, and takes nothing off");
  // the calculation opens from the ring
  el.view = "overview"; el.render();
  assert.ok(shadow.innerHTML.includes("data-health-why") && !shadow.innerHTML.includes('class="healthwhy"'));
  el.healthWhy = true; el.render();
  assert.ok(shadow.innerHTML.includes('class="healthwhy"') && shadow.innerHTML.includes("Remaining") && shadow.innerHTML.includes("100 of 100") && shadow.innerHTML.includes("Urgent"));
  // the rows say what they count
  assert.equal(el.todoCount({ key: "outages", count: 8 }), "8 outages"); assert.equal(el.todoCount({ key: "quarantine", count: 1 }), "1 object");
});

test("batteries are named by their device: the tile, the rows and the search", () => {
  const { el } = panel("en");
  const device = { object_type: "device", object_id: "d1", name: "Kitchen window sensor", status: "active", area_id: "kitchen" };
  const battery = { object_type: "entity", object_id: "sensor.kitchen_window_battery", name: "Battery", status: "active", device_class: "battery", unit: "%", state: "0", device_id: "d1" };
  el.data = { ...DATA, objects: [...DATA.objects, device, battery, { object_type: "area", object_id: "kitchen", name: "Kitchen", status: "active" }] };
  el._rev = (el._rev || 0) + 1;
  el.batteryVoltRows = () => [];
  const html = el.batteriesView();
  assert.ok(html.includes("Lowest level") && html.includes("Kitchen window sensor · Kitchen") && html.includes('data-object="entity:sensor.kitchen_window_battery"'), "the tile names the device and opens the sensor");
  assert.ok(/<strong class="cut">Kitchen window sensor<\/strong><span class="id cut">Battery/.test(html), "the row titles the device and keeps the entity below");
  assert.equal(el.batteryName(battery).title, "Kitchen window sensor"); assert.equal(el.batteryName(battery).entity, "Battery");
  assert.equal(el.batteryName({ ...battery, device_id: "" }).title, "Battery");
});

test("the journal names the end of a follow-up and the safety line counts the watched plans", () => {
  const { el, shadow } = panel("en");
  const plan = (id, followup) => ({ plan_id: id, created_at: "2026-10-10T10:00:00+00:00", status: "verified", executed: true, summary: { total: 1, ok: 1, review: 0, blocked: 0 }, followup, followup_until: followup === "watching" ? "2026-10-11T10:00:00+00:00" : null });
  el.journal = [plan("a", "watching"), plan("b", "clean")];
  el.view = "journal"; el.render();
  const html = shadow.innerHTML;
  assert.equal((html.match(/Follow-up running until/g) || []).length, 1, "only the watched plan names its end");
  assert.ok(el.t("safeWatching", { n: 8 }).includes("8 plans are being watched") && el.t("safeWatching1").includes("1 plan is being watched"));
  assert.ok(el.safetyBar().includes("24 hours after the run"), "the safety line explains the watching in a tooltip");
});

test("the sparkline shows the change over the whole period, and a hint while there are too few points", () => {
  const { el } = panel("en");
  const day = n => new Date(Date.UTC(2026, 9, n)).toISOString();
  el.series = { points: [{ at: day(1), findings: 58, objects: 10 }, { at: day(11), findings: 50, objects: 10 }, { at: day(31), findings: 38, objects: 10 }] };
  const html = el.sparkline("findings", "bad");
  assert.ok(html.includes("<svg") && html.includes("−20 in 30 days") && html.includes('spark-end ok'), "fewer findings is good");
  assert.ok(el.sparkline("findings", "bad") !== el.sparkline("objects") && !el.sparkline("objects").includes("spark-end ok"), "without a direction the end point stays neutral");
  el.series = { points: [{ at: day(1), findings: 5 }, { at: day(2), findings: 6 }] };
  assert.ok(el.sparkline("findings", "bad").includes("appears after a few scans") && !el.sparkline("findings", "bad").includes("<svg"));
});

test("the selection can be trimmed: a plan with a day count for each entity, and the plan shows rows and cannot be undone", async () => {
  const { el } = panel("en");
  el.excludeSel.add("sensor.hue");
  el.excludeSel.add("sensor.hue2");
  el.trimDays = 30;
  const card = el.excludeCard([]);
  assert.ok(card.includes("Trim the old history") && card.includes("2 entities selected") && card.includes("Create preview (2)"));
  let sent;
  el._hass.callWS = async msg => {
    sent = msg;
    return { plan_id: "p1", status: "dry_run", actions: [], summary: {} };
  };
  el.render = () => {};
  await el.trimPlan();
  assert.equal(sent.type, "ha_housekeeper/plan_create");
  assert.equal(JSON.stringify(sent.actions.map(a => [a.kind, a.object_id, a.keep_days])), JSON.stringify([["trim_history", "sensor.hue", 30], ["trim_history", "sensor.hue2", 30]]));
  assert.equal(el.view, "plan");
  const action = { kind: "trim_history", object_id: "sensor.hue", name: "Hue", object_type: "entity", verdict: "review", executable: true, reasons: ["irreversible"], keep_days: 30, trim: { rows: 5000 } };
  const plan = { plan_id: "p2", status: "dry_run", actions: [action], summary: {} };
  assert.ok(el.planCard(plan).includes("older than 30 days: 5000 rows"));
  assert.equal(el.undoBadge(action).includes("mdi:backup-restore"), true);
});

test("batteries: the shopping list counts the types, a detected replacement is offered, the goal history and finding read well", () => {
  const { el } = panel("en");
  el.batteryTrend = {
    available: true, busy: false,
    types: { "sensor.a": "2× AAA", "sensor.b": "2× AAA", "sensor.c": "CR2032" },
    rows: [
      { entity_id: "sensor.a", state: "low", days_left: 0 },
      { entity_id: "sensor.b", state: "falling", days_left: 12 },
      { entity_id: "sensor.c", state: "falling", days_left: 29 },
      { entity_id: "sensor.d", state: "falling", days_left: 20 },
      { entity_id: "sensor.e", state: "falling", days_left: 200 },
    ],
    replaced: [{ entity_id: "sensor.a", day: "2026-10-09", from: 9, to: 100 }],
  };
  const cart = el.batteryNeed();
  assert.ok(cart.includes("4×") && cart.includes("AAA") && cart.includes("1×") && cart.includes("CR2032") && cart.includes("no type"));
  assert.ok(!cart.includes("sensor.e"));
  assert.equal((cart.match(/class="needtile/g) || []).length, 3, "one tile per type, all of one kind");
  const offer = el.batterySuggestions();
  assert.ok(offer.includes("probably a new battery") && offer.includes("Level 9 % → 100 %") && offer.includes("data-bt-enter"));
  assert.ok(el.batteryTypeControls("sensor.z").includes("Type missing"));
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const history = el.critHistory({ days: { [today]: [3, 0], [yesterday]: [1, 1] } });
  assert.ok(history.includes("80 %") && history.includes("missed in 30 days") && history.includes('class="m"'));
  assert.ok(el.critHistory({ days: {} }).includes("No runs with a criterion"));
  const line = el.goalLine({ evidence: [{ missed: 5, reached: 2, window_days: 7 }] });
  assert.equal(line, "Goal missed 5 of 7 times in the last 7 days · criterion set by you");
});

test("battery shopping list includes current low levels without a forecast and low voltage batteries", () => {
  const { el } = panel("en");
  const battery = (id, state, unit = "%") => ({ object_type: "entity", object_id: id, name: id, status: "active", device_class: "battery", unit, state });
  el.data = { ...DATA, objects: [battery("sensor.empty", "0"), battery("sensor.future", "40"), battery("sensor.volt", "2.37", "V")] };
  el.batteryTrend = {
    available: true, busy: false, types: { "sensor.empty": "2× AAA", "sensor.volt": "CR2450" },
    rows: [
      { entity_id: "sensor.empty", name: "Empty", state: "stable", days_left: null, level: 25 },
      { entity_id: "sensor.future", name: "Future", state: "falling", days_left: 10, level: 40 },
    ],
    voltage: { rows: [{ entity_id: "sensor.volt", name: "Volt", type: "coin3", limit: 2.75, level: 2.37, state: "low", days_left: 0 }] },
  };
  const rows = el.batteryNeedRows();
  assert.equal(rows.length, 3);
  assert.equal(rows.filter(r => r.state === "low").map(r => r.entity_id).join(), "sensor.empty,sensor.volt");
  const html = el.batteryNeed();
  assert.ok(html.includes("Low now") && html.includes("In 0 to 13 days") && html.includes("data-fold=\"bt_now\""));
  assert.ok(html.includes("2×") && html.includes("AAA") && html.includes("CR2450"));
  assert.ok(html.includes("0 %") && html.includes("2.37 V"));
  el.batteryTrend = { available: false, busy: false, rows: [], types: {} };
  assert.ok(el.batteryNeed().includes("sensor.empty") && el.batteryNeed().includes("no forecast without a recorder"));
});

test("housekeeper backups: the list marks protected ones, the rule picks the rest, the plan has no undo; an automation finding offers deleting", async () => {
  const { el } = panel("en");
  el.render = () => {};
  el.bkc = {
    available: true,
    rows: [
      { backup_id: "b1", name: "Housekeeper aaaa1111", date: "2026-10-08T10:00:00+00:00", age_days: 2, size: 1000, with_database: true, plan_id: "p1", protected: "watching", only_return: false, suggested: false },
      { backup_id: "b2", name: "Housekeeper bbbb2222", date: "2026-08-30T10:00:00+00:00", age_days: 41, size: 900, with_database: true, plan_id: "p2", protected: null, only_return: true, suggested: true },
    ],
    total: { count: 2, bytes: 1900 },
    suggested: { count: 1, bytes: 900 },
  };
  el.bkcSel = new Set(["b2"]);
  const html = el.backupCleanupCard();
  assert.ok(html.includes("protected: being watched") && html.includes("41 days old") && html.includes("only way to get back"));
  assert.ok(html.includes('data-bkc-sel="b1"') && /data-bkc-sel="b1"[^>]*disabled/.test(html), "a protected backup cannot be ticked");
  assert.ok(html.includes("Prepare deletion (1)"));
  assert.ok(html.includes("<table") && html.includes('data-bkc-page="b2"') && !html.includes('data-bkc-page="b1'), "the backups are a table whose head box covers the ones that can be ticked");
  let sent;
  el._hass.callWS = async msg => { sent = msg; return { plan_id: "p9", status: "dry_run", actions: [], summary: {} }; };
  await el.backupDeletePlan();
  assert.equal(JSON.stringify(sent.actions), JSON.stringify([{ kind: "delete_backup", object_id: "b2" }]));
  assert.equal(el.view, "plan");
  const action = { kind: "delete_backup", object_id: "b2", name: "Housekeeper bbbb2222", object_type: "backup", verdict: "review", executable: true, reasons: ["irreversible", "only_return"], backup: { date: "2026-08-30T10:00:00+00:00", size: 900 } };
  assert.ok(el.undoBadge(action).includes("final"));
  assert.equal(el.planWord({ actions: [action] }), el.t("purgeWord"));
  const auto = { kind: "delete_automation", object_id: "automation.old", name: "Old", object_type: "automation", verdict: "review", executable: true, reasons: ["deletes_config"], yaml: "alias: Old\ntrigger: []\n", used_by: [] };
  const card = el.planCard({ plan_id: "p8", status: "dry_run", actions: [auto], summary: {} });
  assert.ok(card.includes("- alias: Old") && card.includes("removed from the file"));
  assert.ok(el.autoDeleteButton({ rule_id: "automation.stale", object_id: "automation.old" }).includes("data-auto-delete"));
  assert.equal(el.autoDeleteButton({ rule_id: "entity.stale", object_id: "sensor.x" }), "");
});

function policyPanel(calls) {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [...DATA.objects, { object_type: "area", object_id: "kitchen", name: "Kitchen" }] };
  el.policies = { rules: [
    { id: "entity_area", enabled: true, count: 1, items: [{ object_type: "entity", object_id: "sensor.a", name: "A", key: "ka", ignored: false }] },
    { id: "entity_id_suffix", enabled: true, count: 2, items: [
      { object_type: "entity", object_id: "light.hall_2", name: "Hall", key: "kb", ignored: false },
      { object_type: "entity", object_id: "light.room_3", name: "Room", key: "kc", ignored: false }] },
  ] };
  el._hass = { language: "en", callWS: async msg => { if (msg.type.endsWith("/plan_create")) calls.push(msg); return { plan_id: "p2", status: "dry_run", actions: [], summary: { total: 1, ok: 1, review: 0, blocked: 0 } }; } };
  return el;
}

test("ticked policy violations get an area through a plan, by suggestion or by choice", async () => {
  const calls = [];
  const el = policyPanel(calls);
  el.polSel = new Set(["ka"]);
  el.bulk = { kind: "area", area: "", error: "" };
  const bar = el.polSelBar();
  assert.ok(bar.includes("Per entry, as suggested") && bar.includes('value="kitchen"'));
  await el.commitBulk();
  assert.equal(JSON.stringify(calls[0].actions), JSON.stringify([{ kind: "set_area", object_id: "sensor.a" }]));
  el.polSel = new Set(["ka"]); el.bulk = { kind: "area", area: "kitchen", error: "" };
  await el.commitBulk();
  assert.equal(calls[1].actions[0].target, "kitchen");
  assert.equal(el.view, "plan");
});

test("a violation row folds open to a rename that checks the name and plans one rename", async () => {
  const calls = [];
  const el = policyPanel(calls);
  el.data = { ...el.data, objects: [...(el.data.objects || []), { object_type: "entity", object_id: "light.hall", name: "Hall light", status: "active" }, { object_type: "entity", object_id: "light.room", name: "Old", status: "unavailable" }] };
  const item = { object_type: "entity", object_id: "light.hall_2", name: "Hall", key: "kb", rule: "entity_id_suffix", ignored: false };
  assert.equal(el.polMainAction(item), "polActRename");
  assert.equal(el.polCheckText(item, "hall").tone, "bad");
  assert.ok(el.polCheckText(item, "hall").text.includes("Hall light") && !el.polCheckText(item, "hall").dead);
  assert.ok(el.polCheckText({ ...item, object_id: "light.room_2" }, "room").dead, "a name held by an unavailable entity points to the clean-up");
  assert.equal(el.polCheckText(item, "Bad Id").tone, "bad");
  assert.equal(el.polCheckText(item, "hall_wall").tone, "ok");
  el.polOpen = ["kb"];
  const html = el.polDetail(item, '<button data-decide-open="k">Hide</button>');
  assert.ok(html.includes("data-pol-id") && html.includes("data-pol-rename-go") && html.includes("disabled"), "taken: the plan button stays off");
  assert.ok(/data-object=[^>]*>Open object<\/button><button data-decide-open/.test(html), "open object and hide side by side");
  el.polDraft(item).value = "hall_wall";
  await el.makeDetailPlan({ kind: "rename_entity", object_id: item.object_id, target: `light.${el.polDraft(item).value}` });
  assert.equal(calls[0].actions[0].target, "light.hall_wall");
});

test("a rename starts empty, offers free names as picks, and an address in the id gets the name first", () => {
  const calls = [];
  const el = policyPanel(calls);
  el.data = { ...el.data, objects: [...(el.data.objects || []), { object_type: "entity", object_id: "device_tracker.pc_192_168_79_138", name: "3D Printer", status: "active" }, { object_type: "entity", object_id: "light.hall", name: "Hall light", status: "active" }] };
  const ip = { object_type: "entity", object_id: "device_tracker.pc_192_168_79_138", name: "3D Printer", key: "entity_id_address|device_tracker.pc_192_168_79_138|", rule: "entity_id_address", ignored: false };
  assert.equal(el.polDraft(ip).value, "");
  assert.equal(JSON.stringify(el.polSuggestions(ip).list), '["3d_printer"]');
  assert.ok(el.polCheckText(ip, "").text.includes("Pick a suggestion"));
  assert.equal(JSON.stringify(el.polSuggSplit("entity_id_address|device_tracker.x_1||3d_printer")), JSON.stringify({ key: "entity_id_address|device_tracker.x_1|", value: "3d_printer" }));
  const dup = { object_type: "entity", object_id: "light.hall_2", name: "Hall", key: "kc", rule: "entity_id_suffix", ignored: false };
  assert.equal(el.polSuggestions(dup).taken, "hall");
  assert.equal(JSON.stringify(el.polSuggestions({ ...dup, name: "Garden" }).list), '["garden"]');
});

test("the overview counts batteries that report volts as low too", () => {
  const { el } = panel("en");
  el.data = { ...DATA };
  const entity = DATA.objects.find(o => o.object_type === "entity");
  el.batteryTrend = { voltage: { rows: [{ entity_id: entity.object_id, level: 2.1, state: "low" }] } };
  assert.ok(el.lowBatteries().some(r => r.volt));
});

test("the findings tiles carry a sparkline for the total and each class, the status line of the overview the one for the score", () => {
  const { el } = panel("en");
  const day = (n, share, open, unused) => ({ at: `2026-10-0${n}T08:00:00+00:00`, objects: 10, findings: open, open, share, classes: { unused }, lead: open, lead_classes: { unused }, reasons: { unused } });
  el.series = { points: [day(1, 90, 4, 2), day(2, 80, 6, 3), day(3, 70, 8, 5)] };
  const html = el.findingsView();
  assert.ok((html.match(/class="spark"/g) || []).length >= 2);
  assert.ok(el.sparkline("class:unused", "bad").includes("+3"));
  assert.ok(el.sparkline("class:missing", "bad").includes("±0"));
  assert.ok(el.sparkline("lead:unused", "bad").includes("+3"));
  assert.ok(el.sparkline("lead:unused", "bad").includes("spark-hint") === false);
  assert.ok(el.sparkline("reason:unused", "bad").includes("+3"), "the tiles read the open findings by reason");
  assert.ok(!html.includes(`${el.health().percent} %`), "the score is not a tile of this page any more");
  el.view = "overview"; el.render();
  assert.ok(el.shadowRoot.innerHTML.includes("statustext") && /statustext[\s\S]*?class="spark"/.test(el.shadowRoot.innerHTML), "the score history sits under the headline");
});

test("an entity row shows the id in mono under the name and the extra facts in a line of their own", () => {
  const { el } = panel("en");
  assert.equal(el.rowId("sensor.a<b", "3 · x"), '<span class="id">sensor.a&lt;b</span><small>3 · x</small>');
  assert.equal(el.rowId("sensor.a"), '<span class="id">sensor.a</span>');
});

test("the detail page offers a rename and an area for one entity and sends one action each", async () => {
  const calls = [];
  const el = policyPanel(calls);
  const item = { object_type: "entity", object_id: "light.hall_2", name: "Hall", area_id: "", device_id: null };
  el.folds = { detail_edit: true };
  const html = el.detailEditCard(item);
  assert.ok(html.includes('value="hall_2"') && html.includes("Per entry, as suggested") && html.includes('value="kitchen"') && html.includes("data-de-rename-btn disabled"));
  assert.ok(!el.detailIdOk(item, "hall_2") && !el.detailIdOk(item, "Hall") && !el.detailIdOk(item, "") && el.detailIdOk(item, "hall"));
  assert.equal(el.detailEditCard({ object_type: "automation", object_id: "automation.a" }), "");
  await el.makeDetailPlan({ kind: "rename_entity", object_id: item.object_id, target: "light.hall" });
  await el.makeDetailPlan({ kind: "set_area", object_id: item.object_id, target: "kitchen" });
  assert.equal(JSON.stringify(calls.map(c => c.actions[0].kind)), JSON.stringify(["rename_entity", "set_area"]));
});

test("what the recorder already excludes stays pickable for trimming but never reaches the block", () => {
  const { el } = panel("en");
  el.costs = { entities: [{ entity_id: "sensor.done", excluded: true, states: 1200 }, { entity_id: "sensor.open", excluded: false, states: 50 }] };
  el.excludeSel.add("sensor.done"); el.excludeSel.add("sensor.open");
  assert.equal(el.excludeSnippet(), "recorder:\n  exclude:\n    entities:\n      - sensor.open\n");
  assert.ok(el.excludeBox("sensor.done").includes("checked") && !el.excludeBox("sensor.done").includes("disabled"));
  assert.equal(el.t("exTitle"), "Exchange device", "the exchange card keeps its own title");
  assert.ok(el.excludeInfo({ entity_id: "sensor.done", excluded: true }).tags.includes("already excluded") && !el.excludeInfo({ entity_id: "sensor.done", excluded: true }).suggest);
  let html = el.excludeCard([]);
  assert.ok(html.includes("1 selected · 1 to trim") && html.includes("Trim the old history"), "one for the block, one to trim");
  el.excludeSel.clear();
  html = el.excludeCard([]);
  assert.ok(html.includes("Excluded but still stored: 1 entities, at least 1,200 rows") && html.includes("data-ex-left"));
  el.excludeSel.add("sensor.done");
  assert.ok(!el.excludeCard([]).includes("data-ex-left") && el.excludeCard([]).includes("1 to trim") && !el.excludeCard([]).includes("Copy YAML"), "only trimming: no block");
});

test("battery sensors that are no replaceable battery leave the list, wait in a proposal group and are saved through the server", async () => {
  const calls = [];
  const { el } = panel("en");
  const bat = (id, extra = {}) => ({ object_type: "entity", object_id: id, name: id, status: "active", device_class: "battery", unit: "%", state: "50", ...extra });
  el.data = { ...DATA, objects: [...DATA.objects, bat("sensor.door_battery"), bat("sensor.bank_battery", { battery_suggest: { kind: "storage", signals: ["power", "energy_storage"] } }), bat("sensor.car_battery", { battery_kind: "vehicle" }), bat("sensor.back_battery", { battery_kind: "keep" })] };
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return {}; } };
  el.refreshData = async () => {};
  const ids = el.batteryRows().map(r => r.item.object_id);
  assert.ok(ids.includes("sensor.door_battery") && ids.includes("sensor.back_battery") && !ids.includes("sensor.bank_battery") && !ids.includes("sensor.car_battery"));
  const card = el.batteryKindCard();
  assert.ok(card.includes("Probably not a replaceable battery") && card.includes("Device also reports power, storage") && card.includes('data-bk-accept="sensor.bank_battery"'));
  await el.batterySetKinds([{ entity_id: "sensor.bank_battery", kind: "storage" }, { entity_id: "sensor.door_battery", kind: "" }]);
  assert.equal(JSON.stringify(calls[0]), JSON.stringify({ type: "ha_housekeeper/battery_kind_set", items: [{ entity_id: "sensor.bank_battery", kind: "storage" }, { entity_id: "sensor.door_battery", kind: "" }] }));
});

test("broken references of one dashboard card form one row with a readable place and the suggestions", () => {
  const { el } = panel("en");
  const place = { view: "Archiv", view_index: 12, section: 2, card: "custom:charger-card", card_path: "views/12/sections/1/cards/0", card_refs: 4, card_missing: 3 };
  const broken = (id, rest, extra = {}) => ({
    rule_id: "dashboard.missing_entity", object_id: "technik", classification: "broken_reference", confidence: 0.98, impact: "none",
    affected_object: id, key: `dashboard.missing_entity|technik|${id}`,
    evidence: [{ location: `views/12/sections/1/cards/0/${rest}`, place }], ...extra,
  });
  const list = [broken("sensor.a", "details/a"), broken("sensor.b", "details/b", { suggestions: ["sensor.b_new"] }), broken("sensor.c", "details/c")];
  el.data = { ...DATA, objects: [{ object_type: "dashboard", object_id: "technik", name: "Technik", status: "active" }], findings: list };
  const rows = el.groupBroken(list);
  assert.equal(rows.length, 1);
  assert.equal(el.groupBroken([list[0]])[0], list[0], "a card with one broken reference stays a plain row");
  el.folds = { [`bg:technik|${place.card_path}`]: true };
  const html = el.findingGroup(rows[0]);
  assert.ok(html.includes("Technik › Archiv") && html.includes("Card custom:charger-card (Section 2) · 3 broken references"));
  assert.ok(html.includes("looks abandoned: 3 of 4") && html.includes("Maybe: sensor.b_new") && html.includes("details/b"));
  assert.ok(html.includes("<small>sensor.a · details/a"), "inside the group only the part below the card shows");
  assert.equal(el.placeText(list[0]), 'Tab “Archiv” · Card custom:charger-card (Section 2)');
  const diag = el.diagnose(el.data.objects[0]);
  assert.equal(diag.rows.filter(r => r.tone === "red").length, 1, "one diagnosis row per card");
  assert.ok(diag.hint.includes("custom:charger-card") && diag.hint.includes("3 of 4"), "the diagnosis names the abandoned card");
  assert.ok(el.suggestHtml(list[1]).includes('data-act-replace="sensor.b" data-repl-new="sensor.b_new"'), "a suggestion opens the replacement filled in");
});

test("origin filter keeps only core or custom config entries", () => {
  const { el } = panel();
  el.data = { ...DATA, objects: [
    ...DATA.objects,
    { object_type: "config_entry", object_id: "E1", name: "Core", domain: "hue", custom: false, status: "active", entity_count: 2 },
    { object_type: "config_entry", object_id: "E2", name: "Cust", domain: "hacs", custom: true, integration_version: "2.0", status: "active", entity_count: 5 },
  ] };
  el.typeFilter = "config_entry";
  el.originFilter = "custom";
  assert.deepEqual(el.filtered().map(o => o.object_id), ["E2"]);
  el.originFilter = "core";
  assert.deepEqual(el.filtered().map(o => o.object_id), ["E1"]);
  el.typeFilter = "entity";
  assert.equal(el.originFilter, "", "the origin goes with any other type than integration");
});

test("helper filter keeps helper entries and entities and counts what uses them", () => {
  const { el } = panel();
  el.data = { ...DATA, edges: [{ source: "automation:a1", target: "entity:input_boolean.guest", relation: "TRIGGERS_ON" }], objects: [
    { object_type: "entity", object_id: "input_boolean.guest", name: "Guest", platform: "input_boolean", config_entry_id: null, status: "active" },
    { object_type: "entity", object_id: "light.kitchen", name: "Kitchen", platform: "hue", config_entry_id: "E1", status: "active" },
    { object_type: "config_entry", object_id: "E3", name: "Sum", domain: "min_max", status: "active", entity_count: 1 },
    { object_type: "config_entry", object_id: "E1", name: "Hue", domain: "hue", status: "active", entity_count: 1 },
  ] };
  el.typeFilter = "helper";
  assert.deepEqual(el.filtered().map(o => o.object_id).sort(), ["E3", "input_boolean.guest"]);
  assert.equal(el.usedByCount(el.data.objects[0]), 1);
  assert.equal(el.usedByCount(el.data.objects[3]), 0);
});

test("the idle helper hint needs no use and a change older than the chosen days", () => {
  const { el } = panel();
  const old = new Date(Date.now() - 200 * 86400000).toISOString(), fresh = new Date(Date.now() - 5 * 86400000).toISOString();
  el.data = { ...DATA, edges: [{ source: "automation:a1", target: "entity:input_boolean.used", relation: "TRIGGERS_ON" }], objects: [
    { object_type: "entity", object_id: "input_boolean.used", name: "Used", platform: "input_boolean", status: "active", last_changed: old },
    { object_type: "entity", object_id: "input_boolean.idle", name: "Idle", platform: "input_boolean", status: "active", last_changed: old },
    { object_type: "entity", object_id: "input_boolean.recent", name: "Recent", platform: "input_boolean", status: "active", last_changed: fresh },
    { object_type: "entity", object_id: "input_boolean.nodate", name: "No date", platform: "input_boolean", status: "active" },
  ] };
  el.typeFilter = "helper";
  el.helperIdle = "180";
  assert.deepEqual(el.filtered().map(o => o.object_id), ["input_boolean.idle"]);
  assert.ok(el.inventory().includes('data-lf="inventory|idle"') && el.inventory().includes("Housekeeper"), "the select and the hint show in helper mode");
  el.helperIdle = "";
  assert.equal(el.filtered().length, 4);
});

// ---------------------------------------------------------------- Storage & system, access & data flow

const SYSTEM = {
  supervisor: true,
  cpu: { percent: 9.8, count: 4 }, load: { "1m": 0.16, "5m": 0.26, "15m": 0.3 },
  ram: { total: 8e9, used: 2.5e9, percent: 31.4 }, swap: { total: 2.5e9, used: 3.7e8, percent: 14.6 },
  disk: { total: 47.5e9, used: 36.8e9, free: 8.8e9, percent: 96, source: "supervisor" },
  categories: { children: [{ id: "system", label: "System", bytes: 24.8e9 }, { id: "addons_data", label: "<b>apps</b>", bytes: 8e9 }] },
  breakdown: [{ id: "recorder_db", path: "home-assistant_v2.db", bytes: 5.1e9 }, { id: "custom_cards", path: "www", bytes: 1e8 }],
  custom_integrations: [{ domain: "hacs", bytes: 1e7 }],
  apps: [{ slug: "core_ssh", name: "SSH", state: "started", cpu_percent: 0.4, memory_usage: 3e7, memory_limit: 8e9, size_bytes: 1e6 }],
  apps_memory: 3e7,
  cards: [{ id: "1", type: "module", url: "/hacsfiles/card/card.js?hacstag=1", bytes: 4e5, scope: "folder" }],
  cards_total: 4e5,
  blueprints: [{ domain: "automation", path: "me/a.yaml", name: "Motion light", author: "me", bytes: 2048 }],
  other: [{ name: ".storage", dir: true, bytes: 3e6 }], other_rest: { count: 2, bytes: 100 },
};
const ACCESS = {
  with_access: 1, external: 1, high: 1,
  entries: [
    { entry_id: "E2", domain: "zha", title: "Zigbee", iot_class: "local_polling", disabled: false, access: [{ kind: "radio", detail: "Zigbee" }], flows: [], gps: false, camera: false, external: false, risk: "high", risk_reasons: ["radio"] },
    { entry_id: "E3", domain: "dwd_weather", title: "Weather", iot_class: "cloud_polling", disabled: false, access: [], flows: [], gps: false, camera: false, external: true, risk: "medium" },
    { entry_id: "E4", domain: "hue", title: "Hue", iot_class: "local_push", disabled: false, access: [], flows: [], gps: false, camera: false, external: false, risk: "low" },
  ],
};

const SECRETS = { entries: [
  { entry_id: "c1", domain: "demo_cloud", title: "<i>Demo</i>", disabled: false, fields: [{ source: "data", key: "password", kind: "password", set: true }, { source: "data", key: "token.access_token", kind: "token", set: false }] },
  { entry_id: "c2", domain: "netatmo", title: "Netatmo", disabled: false, reauth: true, fields: [] },
  { entry_id: "c3", domain: "onvif", title: "Alte Kamera", disabled: true, fields: [{ source: "data", key: "password", kind: "password", set: true }] },
], accounts: [
  { id: "u1", name: "Roberto", active: true, owner: true, admin: true, local_only: false, mfa: true, logins: true, last_login: "2026-10-16T08:00:00+00:00", inactive: false, token_count: 2 },
  { id: "u2", name: "<b>Partner</b>", active: true, owner: false, admin: true, local_only: false, mfa: false, logins: true, last_login: "2026-10-13T08:00:00+00:00", inactive: false, token_count: 0 },
  { id: "u3", name: "Gast", active: true, owner: false, admin: false, local_only: false, mfa: false, logins: true, last_login: "2026-03-01T08:00:00+00:00", inactive: true, token_count: 0 },
], tokens: [
  { name: "Node-RED", account: "Roberto", account_active: true, created: "2025-09-01T00:00:00+00:00", days: 410, old: true },
  { name: "MCP", account: "Roberto", account_active: true, created: "2026-10-04T00:00:00+00:00", days: 12, old: false },
] };

function systemPanel(lang = "en") {
  const env = panel(lang);
  const calls = [];
  env.el._hass = { language: lang, callWS: async msg => { calls.push(msg); throw new Error("unexpected"); } };
  env.el._sys = {
    storage: { data: SYSTEM, requested: true, loading: false, error: "", at: null },
    dataflow: { data: ACCESS, requested: true, loading: false, error: "", at: null },
    secrets: { data: SECRETS, requested: true, loading: false, error: "", at: null },
  };
  return { ...env, calls };
}

test("apps and integrations groups config entries by domain and opens the page of the domain", () => {
  const { el, shadow } = systemPanel("en");
  const entry = (id, domain, extra = {}) => ({ object_type: "config_entry", object_id: id, name: `Hub ${id}`, domain, integration_name: "Demo", status: "active", entity_count: 2, device_count: 1, ...extra });
  el.data = { ...DATA, objects: [entry("A1", "demo", { custom: true, integration_version: "1.0" }), entry("A2", "demo", { status: "problem" }), entry("B1", "solo")] };
  const [demo] = el.compIntegrations().filter(g => g.domain === "demo");
  assert.equal(demo.entries.length, 2);
  assert.equal(demo.entities, 4);
  assert.equal(demo.status, "problem");
  assert.match(el.compRowAttrs(demo), /data-object="integration:demo"/);
  el.view = "components";
  el.render();
  assert.ok(shadow.innerHTML.includes(el.t("components")));
  assert.ok(!shadow.innerHTML.includes(el.t("renderError")));
  assert.ok(shadow.innerHTML.includes('data-sys-refresh="storage"'), "the page has the refresh bar");
  el.viewTab = { components: "custom" };
  el.render();
  assert.ok(shadow.innerHTML.includes('data-comp-open="demo"') && !shadow.innerHTML.includes('class="compentry"'), "an integration with two entries folds out; closed it shows none");
  assert.ok(/<div class="compname"><span class="tile mute"><button[^>]*data-comp-open="demo"[\s\S]*?<\/span><div class="namecell"/.test(shadow.innerHTML), "arrow and name share one row");
  el.compOpen = ["demo"];
  el.render();
  assert.equal((shadow.innerHTML.match(/class="compentry"/g) || []).length, 2, "opened, one row per entry");
  el.compOpen = [];
  el.data = { ...el.data, objects: [...el.data.objects, { object_type: "app", object_id: "core_ssh", name: "SSH", slug: "core_ssh", state: "started", status: "active", version: "1.0", version_latest: "1.7", update_available: true }] };
  el.viewTab = { components: "apps" };
  el.render();
  assert.ok(shadow.innerHTML.includes("0.4 %") && shadow.innerHTML.includes("<th") && shadow.innerHTML.includes(el.t("sysColRam")), "the apps list shows CPU and RAM from the system report");
  assert.ok(shadow.innerHTML.includes("1.7") && shadow.innerHTML.includes(el.t("compSumAppUpdates")), "the newest version and the number of app updates show");
});

test("the HACS tab lists every repository, puts what HACS removed first and opens the repository in HACS", () => {
  const { el, shadow } = systemPanel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, hacs_available: true } };
  el.view = "components"; el.viewTab = { components: "hacs" };
  el.sysState("hacs").data = { available: true, repositories: [
    { id: "1", name: "Mushroom", full_name: "piitaya/lovelace-mushroom", category: "plugin", installed_version: "v5", available_version: "v5", pending_update: false, archived: false, removed: null },
    { id: "2", name: "Old icons", full_name: "me/old-icons", category: "plugin", installed_version: "v1", available_version: "v1", pending_update: false, archived: true, removed: { name: "me/old-icons", reason: "Repository is archived", ignored: false } },
    { id: "3", name: "Demo", full_name: "me/demo", category: "integration", installed_version: "1.0", available_version: "1.1", pending_update: true, archived: false, removed: null },
    { id: "4", name: "Seen", full_name: "me/seen", category: "theme", installed_version: "2", available_version: "2", pending_update: false, archived: false, removed: { name: "me/seen", reason: "x", ignored: true } },
  ] };
  el.sysState("hacs").requested = true;
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("Removed from HACS") && html.includes("Repository is archived") && html.includes("(ignored)"), "removed repositories show with the reason");
  assert.ok(html.indexOf("Old icons") < html.indexOf("Demo") && html.indexOf("Demo") < html.indexOf("Mushroom"), "removed first, then updates, then the rest");
  assert.ok(html.includes('data-ha-path="/hacs/repository/2"') && html.includes("Card") && html.includes("Theme"), "a row opens HACS; cards and themes are listed");
  assert.ok(html.includes('data-sys-refresh="hacs"'), "the refresh bar reloads the list");
  assert.ok(html.includes("Removed from HACS: what to do?") && html.includes('data-ha-path="/config/repairs"'), "the advice and the link to the repairs show above the list");
  el.data = { ...el.data, meta: { ...el.data.meta, hacs_removed: [{ id: "2", name: "me/old-icons", reason: "Repository is archived", ignored: false }] } };
  const row = el.todoItems().find(i => i.key === "hacs_removed");
  assert.ok(row && row.text.includes("me/old-icons") && row.jump.includes('data-jump-tab="hacs"') && row.jump.includes("hacsrepos|state|removed"), "the to-do card has a row that opens the filtered list");
  assert.ok(el.intHacsCard({ id: "2", full_name: "me/old-icons", installed_version: "1", removed: { reason: "Repository is archived", ignored: false } }).includes("took this repository out of its list: Repository is archived"), "the page of the integration says why");
  el.data = { ...DATA, meta: { ...DATA.meta, hacs_available: false } };
  el.render();
  assert.ok(!shadow.innerHTML.includes("every installed repository"), "without HACS there is no tab");
});

test("the page of an integration covers all its entries for core and custom and every tab renders", async () => {
  for (const custom of [true, false]) {
    const { el, shadow } = systemPanel("en");
    const entry = (id, extra = {}) => ({ object_type: "config_entry", object_id: id, name: `Hub ${id}`, domain: "demo", integration_name: "Demo", custom, integration_version: custom ? "1.0" : null, status: "active", entity_count: 1, device_count: 1, ...(custom ? { hacs: { id: "42", full_name: "me/demo", installed_version: "1.0", available_version: "1.1", pending_update: true } } : {}), ...extra });
    el.data = { ...DATA, objects: [entry("A1"), entry("A2"), { object_type: "entity", object_id: "sensor.x", name: "X", status: "active", config_entry_id: "A2" }], edges: [{ source: "automation:a", target: "entity:sensor.x", relation: "uses" }] };
    const page = el.findObject("integration:demo");
    assert.equal(page.entries.length, 2);
    assert.equal(page.custom, custom);
    await el.openObject(page);
    assert.equal(el.details.has("integration:demo"), true);
    for (const tab of el.detailTabs(page, "integration:demo").map(([id]) => id)) {
      el.detailTab = tab;
      el.render();
      assert.ok(!shadow.innerHTML.includes(el.t("renderError")), `${custom} ${tab}`);
    }
    assert.ok(el.detailTabs(page, "integration:demo").some(([id]) => id === "members"));
    el.detailTab = "overview";
    el.render();
    assert.equal(shadow.innerHTML.includes("/hacs/repository/42") && shadow.innerHTML.includes(el.t("intHacsUpdate")), custom, "HACS card only for a custom integration that HACS knows");
  }
});

test("the three new pages sit under Operation and Security and render in both languages", () => {
  const { NAV_GROUPS, TEXT } = loadPanel();
  const group = label => NAV_GROUPS.find(([name]) => name === label)[1];
  for (const [view, label] of [["storage", "navGroupOperation"], ["dataflow", "navGroupSecurity"], ["secrets", "navGroupSecurity"]]) {
    assert.ok(group(label).includes(view), view);
    for (const lang of ["de", "en"]) assert.ok(TEXT[lang][view] && TEXT[lang][`${view}Subtitle`], `${lang} ${view}`);
  }
  for (const lang of ["de", "en"]) {
    const { el, shadow } = systemPanel(lang);
    for (const view of ["storage", "dataflow"]) {
      el.view = view;
      el.render();
      assert.ok(shadow.innerHTML.includes(el.t(`${view}Subtitle`)), `${lang} ${view} heading`);
      assert.ok(!shadow.innerHTML.includes(el.t("renderError")), `${lang} ${view} renders`);
    }
  }
});

test("storage shows the key figures, a red disk at 96 % and the Supervisor categories escaped", () => {
  const { el, shadow } = systemPanel("de");
  el.view = "storage";
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes('class="sumtile red"'), "a disk this full is red");
  assert.ok(html.includes("Speicher belegt") && html.includes("4 Kerne") && html.includes("frei"));
  assert.ok(html.includes('<span class="sumlabel">Swap</span>') && !html.includes('sumlabel">Speicher frei'), "swap is a tile, free space sits in the disk tile");
  assert.ok(html.includes("&lt;b&gt;apps&lt;/b&gt;") && !html.includes("<b>apps</b>"), "Supervisor labels are escaped");
  el.viewTab = { storage: "misc" };
  el.render();
  assert.ok(shadow.innerHTML.includes('data-fold="sysmisc_0"') && shadow.innerHTML.includes('data-fold="sysmisc_2"') && !shadow.innerHTML.includes("Motion light"), "the three lists are folds, the first one open");
  el.folds = { sysmisc_1: true, sysmisc_2: true }; el.render();
  assert.ok(shadow.innerHTML.includes("card.js") && shadow.innerHTML.includes("Ordner") && shadow.innerHTML.includes("Motion light") && shadow.innerHTML.includes(".storage"), "cards, blueprints and the other entries share one tab");
});

test("the storage tiles draw a line from an hour of samples on, and say it is building before", () => {
  const { el } = panel("en");
  assert.ok(el.sysLine({ points: [], span: 0 }, 2).includes("within the first hour"));
  const points = [0, 1, 2, 3, 4].map(i => [i * 3600, 40, 50 + i, 10, 1, 30]);
  const html = el.sysLine({ points, span: 4 * 3600 }, 3);
  assert.ok(html.includes("<polyline") && html.includes("last 4 h") && html.includes("peak 30"));
  assert.ok(!el.sysLine({ points, span: 4 * 3600 }, 2).includes("peak"), "only the CPU shows a peak");
});

test("without a Supervisor only the folders show and there is nothing to switch", () => {
  const { el, shadow } = systemPanel();
  el._sys.storage.data = { ...SYSTEM, supervisor: false, categories: {}, apps: [] };
  el.view = "storage";
  el.render();
  const html = shadow.innerHTML;
  assert.ok(!html.includes('data-view-tab="storage|category"'), "no category chip without categories");
  assert.ok(html.includes("Recorder database"), "the folders under /config are shown");
  assert.ok(html.includes('data-view="components"'), "a note points to Apps & integrations");
});


test("access and data flow show one list at a time, chosen by the tiles, and the high-risk filter can be removed", () => {
  const { el, shadow } = systemPanel();
  el.view = "dataflow";
  el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("System access &amp; data flow") && html.includes("Cloud data flow"));
  assert.ok(!html.includes('class="sumtiles"'), "the tabs carry the numbers, there is no second row of key figures");
  assert.ok(html.includes("Radio/device (Zigbee)") && html.includes('class="pill red" title="High because: Radio/device (Zigbee)">High'));
  assert.ok(html.includes("Risk: High = access to the system"), "the legend says what the levels mean");
  assert.ok(!html.includes("cloud, polls"), "the cloud list is not open by default");
  el.pickViewTab("dataflow|cloud");
  html = shadow.innerHTML;
  assert.ok(html.includes("cloud, polls"), "the IoT class is translated");
  el.lvState("accsys", "risk", "asc").f.risk = "high"; el.pickViewTab("dataflow|sys");
  html = shadow.innerHTML;
  assert.ok(html.includes('data-lf-set="accsys||"') && !html.includes("data-acc-clear"), "the filter shows once, as the shared note of the list");
  el.lvState("accsys", "risk", "asc").f.risk = ""; el.render();
  assert.ok(!shadow.innerHTML.includes('data-lf-set="accsys||"'));
  html = shadow.innerHTML;
  assert.ok(!html.includes("Hue</strong>"), "an integration without access or cloud is not listed");
});

test("the credential overview shows kind and set or empty, links to Home Assistant and has no value to show", () => {
  const { el, shadow } = systemPanel("de");
  el.view = "secrets";
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("Passwort") && html.includes("Token") && html.includes("1 von 2"));
  assert.ok(html.includes('data-ha-path="/config/integrations/integration/demo_cloud"'), "a row opens the integration in Home Assistant");
  assert.ok(html.includes("&lt;i&gt;Demo&lt;/i&gt;") && !html.includes("<i>Demo</i>"), "titles are escaped");
  assert.ok(!/reveal|credential_reveal/i.test(html), "nothing to reveal");
  assert.ok(!html.includes('class="filteron"'), "no filter note by default");
  el.lvState("seclist", "name", "asc").f.state = "gap"; el.render();
  assert.ok(shadow.innerHTML.includes('class="filteron"') && shadow.innerHTML.includes('data-lf-set="seclist||"') && !shadow.innerHTML.includes('class="pill warn" data-sec-show'), "the filter shows once, as the shared note of the list");
});

test("the credential page shows the accounts with role and two-factor, and its tile opens them filtered", () => {
  const { el, shadow } = systemPanel("de");
  el.view = "secrets";
  el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("Admins ohne Zwei-Faktor") && html.includes("von 2 Admins") && html.includes('data-sec-show="nomfa"'));
  assert.equal((html.match(/class="sumtiles even"/g) || []).length, 2, "two even rows of tiles");
  const tile = { dataset: { secShow: "nomfa" } };
  el.bindSystem({ querySelectorAll: selector => (selector === "[data-sec-show]" ? [tile] : []), querySelector: () => null });
  tile.onclick();
  html = shadow.innerHTML;
  assert.ok(html.includes("&lt;b&gt;Partner&lt;/b&gt;") && !html.includes("Roberto</strong>") && !html.includes("Gast</strong>"), "only the admin without two-factor, escaped");
  assert.ok(html.includes('data-ha-path="/config/users"'), "a row opens the users in Home Assistant");
});

test("an integration that asks for a new login is marked and has a tile of its own", () => {
  const { el, shadow } = systemPanel("de");
  el.view = "secrets";
  el.lvState("seclist", "name", "asc").f.state = "reauth";
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes('data-sec-show="reauth"') && html.includes('class="pill red">Anmeldung nötig'));
  assert.ok(html.includes("Netatmo") && !html.includes("&lt;i&gt;Demo"), "the filter keeps only the one asking");
});

test("a disabled integration that still holds a value has a tile and a filter", () => {
  const { el, shadow } = systemPanel("de");
  el.view = "secrets";
  el.lvState("seclist", "name", "asc").f.state = "disabled";
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("Deaktivierte Integrationen") && html.includes('data-sec-show="disabled"'));
  assert.ok(html.includes("Alte Kamera") && !html.includes("Netatmo</"), "the filter keeps only the disabled one");
});

test("the credential page lists the long-lived tokens by age and never more than name, account and age", () => {
  const { el, shadow } = systemPanel("de");
  el.view = "secrets";
  (el.viewTab ||= {}).secrets = "tokens";
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("1 alt oder wirkungslos") && html.includes("410 Tage") && html.includes("älter als 90 Tage"));
  assert.ok(html.indexOf("Node-RED") < html.indexOf("MCP</strong>"), "oldest first");
});

test("the rights of the apps show under access and data flow, or why they are missing", () => {
  const { el, shadow } = systemPanel("de");
  el._sys.dataflow.data = { ...ACCESS, apps_available: true, apps: [
    { slug: "core_ssh", name: "<b>SSH</b>", state: "started", checked: true, risk: "high", access: [{ kind: "full_access", detail: null, level: "high" }, { kind: "supervisor_api", detail: "manager", level: "high" }] },
    { slug: "x", name: "X", state: "stopped", checked: false, risk: null, access: [] },
  ] };
  el.view = "dataflow";
  el.render();
  let html = shadow.innerHTML;
  el.pickViewTab("dataflow|apps");
  html = shadow.innerHTML;
  assert.ok(html.includes("Voller Hardwarezugriff") && html.includes("Supervisor-API (manager)"));
  assert.ok(html.includes("&lt;b&gt;SSH&lt;/b&gt;") && !html.includes("<b>SSH</b>"), "app names are escaped");
  assert.ok(html.includes('data-ha-path="/hassio/addon/core_ssh/info"'), "a row opens the app in Home Assistant");
  assert.ok(html.includes("nicht prüfbar"), "an app without an answer is not called safe");
  assert.ok(html.includes("1 hoch"), "the apps tab shows how many are high");
  el._sys.dataflow.data = { ...ACCESS, apps_available: false, apps: [] };
  el.render();
  html = shadow.innerHTML;
  assert.ok(html.includes("Apps gibt es nur mit Home Assistant OS oder Supervised.") && html.includes("taskcard t-mute off"));
});

test("the ways in from outside show in their own tab", () => {
  const { el, shadow } = systemPanel("de");
  el._sys.dataflow.data = { ...ACCESS, inbound: [
    { kind: "nabu_casa", name: "Nabu Casa", state: "on", level: "warn" },
    { kind: "vpn", name: "Tailscale", slug: "a0d7b954_tailscale", state: "running", level: "ok" },
  ] };
  el.view = "dataflow";
  el.pickViewTab("dataflow|inbound");
  const html = shadow.innerHTML;
  assert.ok(html.includes("Von außen erreichbar") && html.includes("Fernzugriff auf die Oberfläche über Nabu Casa"));
  assert.ok(html.includes('data-ha-path="/hassio/addon/a0d7b954_tailscale/info"') && html.includes("1 offen"));
});

test("the menu button for Home Assistant's sidebar shows when the sidebar is hidden", () => {
  const Event = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
  const { el, shadow } = panel("en", { Event });
  el.render();
  assert.ok(!shadow.innerHTML.includes("data-ha-menu"), "a docked sidebar needs no button");
  el.narrow = true;
  el.render();
  assert.ok(shadow.innerHTML.includes("data-ha-menu"), "narrow screen");
  el.narrow = false;
  el._hass = { language: "en", dockedSidebar: "always_hidden" };
  el.render();
  assert.ok(shadow.innerHTML.includes("data-ha-menu"), "sidebar hidden in the profile");
  const events = [];
  el.dispatchEvent = ev => events.push(ev);
  el.toggleHaSidebar();
  assert.equal(events[0].type, "hass-toggle-menu");
  assert.ok(events[0].bubbles && events[0].composed, "the event leaves the shadow root");
});

test("the overview shows the system card and a disk row from 75 %, red from 90 %", () => {
  const { el } = panel("en");
  el.data = DATA; el._sysLightFor = el.data;
  el.sysLight = { disk: { percent: 60, free: 4e9, total: 1e10 }, ram: { percent: 40, used: 1e9, total: 2e9 }, cpu: { percent: 12 } };
  assert.ok(el.systemCard().includes("System") && el.systemCard().includes("60 %") && el.systemCard().includes('data-jump="storage"'));
  assert.ok(!el.todoItems().some(i => i.key === "disk"));
  el.sysLight.disk.percent = 80;
  assert.equal(el.todoItems().find(i => i.key === "disk").tone, "warn");
  el.sysLight.disk.percent = 92;
  assert.equal(el.todoItems().find(i => i.key === "disk").tone, "red");
  el.sysLight = null;
  assert.equal(el.systemCard(), "");
});

test("the detail page of an integration has an access tab and a red line in its overview for a high risk", () => {
  const { el } = systemPanel("de");
  const zha = { object_type: "config_entry", object_id: "E2", name: "Zigbee" }, demo = { object_type: "config_entry", object_id: "c1", name: "Demo" };
  assert.equal(el.accessTone(zha), "red");
  assert.equal(el.accessTone(demo), "warn", "a field without a value");
  assert.ok(el.accessAlert(zha).includes("Hoher Systemzugriff") && el.accessAlert(zha).includes("data-detail-tab-go=\"access\""));
  assert.equal(el.accessAlert({ object_type: "config_entry", object_id: "E4" }), "");
  const card = el.accessDetailCard(demo);
  assert.ok(card.includes("hinterlegt") && card.includes("leer") && card.includes("token.access_token") && !card.includes("s3cr3t"));
  el._sys.dataflow.data = null;
  assert.equal(el.accessTone(zha), "", "no dot before the report is read");
  assert.ok(!el.accessDetailCard(demo).includes("token.access_token"), "the card waits for both reports");
});

test("an app is an object of its own: status, detail tabs with rights and load, and the lists open its page", () => {
  const { el, shadow } = systemPanel("de");
  const app = { object_type: "app", object_id: "core_ssh", slug: "core_ssh", name: "SSH", version: "1.0", version_latest: "1.1", update_available: true, repository: "core", stage: "stable", description: "Terminal <b>x</b>", state: "started", status: "active" };
  el.data = { ...DATA, objects: [...DATA.objects, app, { ...app, object_id: "x", slug: "x", name: "X", state: "stopped", status: "stopped", update_available: false }] };
  el._sys.dataflow.data = { ...ACCESS, apps_available: true, apps: [{ slug: "core_ssh", name: "SSH", state: "started", checked: true, risk: "high", access: [{ kind: "full_access", detail: null, level: "high" }] }] };
  assert.equal(el.tone("stopped"), "mute", "a stopped app is not a problem");
  assert.equal(el.haPath(app), "/hassio/addon/core_ssh/info");
  assert.equal(JSON.stringify(el.detailTabs(app, "app:core_ssh").map(t => t[0])), JSON.stringify(["overview", "actions", "access", "storage", "technical"]));
  const appActions = el.detailPanel("actions", app, "app:core_ssh");
  assert.ok(appActions.includes("Notizen") && appActions.includes("data-mark-open"), "the mark of an app is in the Actions tab");
  assert.ok(!el.detailPanel("overview", app, "app:core_ssh").includes("data-mark-open"), "no longer a card on the overview");
  assert.equal(el.accessTone(app), "", "an integration helper is not used for apps");
  assert.equal(el.appAccessTone(app), "red");
  const overview = el.appOverview(app);
  assert.ok(overview.includes("1.0") && overview.includes("Update auf 1.1") && overview.includes("Terminal &lt;b&gt;x&lt;/b&gt;") && !overview.includes("<b>x</b>"));
  assert.ok(el.appAccessCard(app).includes("Voller Hardwarezugriff"));
  assert.ok(/MB/.test(el.appLoadCard(app)) && /0[.,]4 %/.test(el.appLoadCard(app)), "the load tab shows memory and CPU");
  assert.ok(el.appRowAttrs({ slug: "core_ssh", name: "SSH" }).includes('data-object="app:core_ssh"'));
  assert.ok(el.appRowAttrs({ slug: "unknown", name: "U" }).includes("data-ha-path"), "an app the scan does not know opens in Home Assistant");
  el.view = "inventory"; el.render();
  assert.ok(shadow.innerHTML.includes('data-inv-filter="app|"'), "the inventory has a tile for the type");
});

test("the inventory shows the types as a ring and a table: five rows, the rest on request, a row filters and a second click lifts it", () => {
  const { el, shadow } = panel("en");
  const types = ["entity", "device", "automation", "config_entry", "app", "script", "scene"];
  const objects = types.flatMap((type, i) => Array.from({ length: 20 - i * 2 }, (_, k) => ({ object_type: type, object_id: `${type}.${k}`, name: `${type}${k}`, status: type === "entity" && k < 2 ? "unavailable" : "active" })));
  el.data = { ...DATA, objects, edges: [], findings: [] };
  el.view = "inventory"; el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes("Others (2 types)") && html.includes("Show all 7 types") && !html.includes('data-inv-filter="scene|"'));
  assert.ok(html.includes('data-inv-filter="entity|unavailable"') && !html.includes('class="sumtile'), "no tiles, the state columns filter");
  el.invAllTypes = true; el.render();
  assert.ok(shadow.innerHTML.includes('data-inv-filter="scene|"') && shadow.innerHTML.includes("Only the largest 5"));
  el.invAllTypes = false; el.typeFilter = "scene"; el.render();
  assert.ok(shadow.innerHTML.includes('data-inv-filter="scene|"'), "a chosen type is never hidden");
});

test("the findings of the load view are a sortable table with the numbers in columns and clickable tiles", () => {
  const { el } = panel("en");
  el.data = { ...DATA }; el._stormsRequested = 1; el._exposureRequested = true;
  el.storms = STORMS;
  const html = el.stormsView();
  assert.ok(html.includes('data-lf-set="stormfind||"') && html.includes('data-lf-set="stormfind|kind|storm"'));
  assert.ok(html.includes("Rows/day") && html.includes("72,000") && html.includes('data-object="entity:sensor.laut"') && html.includes('data-exsel="sensor.laut"') && html.includes("Nothing selected"));
  assert.ok(!html.includes("stormgroup"));
});

test("with a Supervisor the usage tab switches between categories and folders", () => {
  const { el, shadow } = systemPanel();
  el.view = "storage";
  el.render();
  assert.ok(shadow.innerHTML.includes('data-view-tab="storage|folder"') && !shadow.innerHTML.includes("Recorder database"));
  el.viewTab = { storage: "folder" }; el.render();
  assert.ok(shadow.innerHTML.includes("Recorder database"));
});

test("a cause with more than 20 follow-up findings pages them instead of cutting them off", () => {
  const { el } = panel("en");
  const cause = { id: "integration_down:e1", kind: "integration_down", object_type: "config_entry", object_id: "e1", name: "Cloud", follower_count: 25, consumers: {}, impact: "high", state: "setup_error", error: "timeout" };
  const findings = Array.from({ length: 25 }, (_, i) => ({ rule_id: "entity.state_unavailable", object_id: `sensor.n${i}`, classification: "unavailable", confidence: 0.75, key: `k${i}`, ignored: false, cause_id: cause.id }));
  el.data = { ...DATA, findings, causes: [cause] };
  el.folds = { [`cause_${cause.id}`]: true };
  const first = entriesOf(el);
  assert.ok(first.includes("sensor.n0") && !first.includes("sensor.n24") && first.includes("data-lpage"));
  el.pages[`cause_${cause.id}`] = 2;
  assert.ok(entriesOf(el).includes("sensor.n24"));
});

test("tiles tell their kind: a figure is flat, a filter has a funnel and is marked when on, a link has an arrow; a filter shows its note", () => {
  const { el } = panel("en");
  const html = el.sumTiles([{ label: "Figure", value: "1" }, { label: "Filter", value: "2", filter: "x", active: true }, { label: "Link", value: "3", tab: "findingsNav|all" }]);
  assert.ok(html.includes('<div class="sumtile mute">') && html.includes('class="sumtile filter mute"') && html.includes('aria-pressed="true"') && html.includes('class="sumtile go mute"'));
  assert.ok(el.filterNote(["Errors"], "data-x").includes("Filter on") && el.filterNote([], "data-x") === "");
});

test("the settings list every file Housekeeper keeps with size and purpose, grouped, and shows an unknown file by its name", () => {
  const { el } = panel("en");
  const html = el.storedFiles({ history_days: 30, storage: { journal: { bytes: 2048, changed: 1700000000 }, notes: { bytes: 100, changed: 1700000000 }, observations: { bytes: 5000, changed: 1700000000 }, brandnew: { bytes: 7, changed: 1700000000 } } });
  assert.ok(html.includes("Journal") && html.includes("Logbook") && html.includes("Observations") && html.includes("brandnew"));
  assert.ok(html.includes("Audit trail") && html.includes("Your entries and settings") && html.includes("Other"));
  assert.ok(el.storedFiles({ storage: {} }).includes("No data stored yet"));
  assert.ok(html.includes("<table") && html.includes("Audit trail") && el._exporters.storedfiles.rows()[0].length === 5, "the files are a table with an export");
});

test("the settings list the findings with a status and every mark, each in its own card, and the event list has no inline style", () => {
  const { el } = panel("en");
  const mark = { kind: "seasonal", reason: "", until: "2026-01-01T00:00:00+00:00", at: "2025-10-01T00:00:00+00:00" };
  el.data = { ...DATA, objects: [...DATA.objects, { object_type: "device", object_id: "d1", name: "Tree lights", mark, mark_due: true }], findings: [{ key: "h1", rule_id: "r", object_id: "sensor.a", ignored: true, ignored_by: "label" }, { key: "h2", rule_id: "r", object_id: "sensor.b", ignored: true, ignored_by: "user", ignore_info: { kind: "ignore", reason: "", until: null } }, { key: "h3", rule_id: "r", object_id: "sensor.c", ignored: false, resurfaced: true }] };
  const html = el.statusCard();
  assert.ok(html.includes('data-ignore="h2" data-ignore-value="0"') && !html.includes('data-ignore="h1"') && html.indexOf('data-decide-open="h3"') < html.indexOf('data-decide-open="h2"'), "own status only, a run-out one first; label, mark and rule have their own cards");
  assert.ok(el._exporters.decided && html.includes("(2)"));
  const marks = el.marksCard();
  assert.ok(marks.includes('data-mark-clear="device:d1"') && marks.includes("review date reached"), "a mark is listed even when it hides nothing");
  assert.ok(el.eventsCard().includes('class="evtable"') && !el.eventsCard().includes("style="));
});

test("a long history of scans shows only the newest rows until asked, keeps the chosen base visible and has the choice in its head", () => {
  const { el, shadow } = panel("en");
  const days = Array.from({ length: 12 }, (_, i) => ({ id: `2026-09-${String(20 - i).padStart(2, "0")}T08:00:00+00:00`, at: `2026-09-${String(20 - i).padStart(2, "0")}T08:00:00+00:00`, objects: 5, findings: 1 }));
  el.compare = { ...COMPARE, baselines: [{ id: "previous", at: "2026-09-21T08:00:00+00:00", objects: 5, findings: 1 }, ...days], current: { objects: 5, findings: 1 }, retention_days: 30 };
  el.compareBaseline = days[10].id;
  el.view = "changes"; el.render();
  const rows = () => (shadow.innerHTML.match(/data-baseline=/g) || []).length;
  assert.equal(rows(), 5, "the newest four besides the current scan, plus the chosen one");
  assert.ok(shadow.innerHTML.includes("Show all 14") && shadow.innerHTML.includes('id="baseline"'));
  assert.ok(shadow.innerHTML.indexOf('id="baseline"') < shadow.innerHTML.indexOf("data-baseline="), "the choice sits in the head of the history");
  el.historyAll = true; el.render();
  assert.equal(rows(), 13, "all stored scans, listed once the history is opened");
  assert.ok(shadow.innerHTML.includes("Show fewer"));
});

test("the page of an object tells what was decided about it: a decided finding with kind, date and reason, a label, and a mark", () => {
  const { el } = panel("en");
  const item = { object_type: "entity", object_id: "sensor.spare", name: "Spare", status: "unavailable", mark: { kind: "seasonal", reason: "Summer only", until: "2026-11-01T00:00:00+00:00" } };
  const key = "entity:sensor.spare";
  const f = (extra) => ({ rule_id: "entity.state_unavailable", object_id: "sensor.spare", classification: "unavailable", confidence: 0.75, key: "k1", ignored: true, ignored_by: "user", ...extra });
  el.data = { ...DATA, findings: [f({ ignore_info: { kind: "keep", until: "2026-12-01T00:00:00+00:00", reason: "Spare <b>sensor</b>" } })] };
  let html = el.statusBand(item, key);
  assert.ok(html.includes("data-status-band=\"finding\"") && html.includes("Spare &lt;b&gt;sensor&lt;/b&gt;") && !html.includes("<b>sensor</b>"), "kind and reason of the decision, escaped");
  assert.ok(html.includes('data-ignore="k1"') && html.includes('data-ignore-value="0"') && html.includes("data-status-band=\"mark\"") && html.includes("Marked:") && html.includes('data-mark-clear="entity:sensor.spare"'));
  el.data = { ...DATA, findings: [f({ ignored_by: "label", ignore_info: null })] };
  html = el.statusBand({ ...item, mark: null }, key);
  assert.ok(html.includes("Hidden by a label") && !html.includes("data-ignore="), "a label cannot be taken back here");
  el.data = { ...DATA, findings: [f({ ignored: false, ignored_by: null })] };
  assert.equal(el.statusBand({ ...item, mark: null }, key), "");
});

test("a sort alone can be saved as a view, and the save button goes away when the list is back at its default or equals the chosen view", () => {
  const { el } = panel("en", { localStorage: fakeStorage({}) });
  el.data = DATA;
  const st = el.lvState("inv", "name", "asc");
  assert.equal(el.viewsControl("inv"), "");
  st.sort = "status";
  assert.ok(el.viewsControl("inv").includes("data-lview-save"), "a changed sort is worth saving");
  st.sort = "name"; st.dir = "desc";
  assert.ok(el.viewsControl("inv").includes("data-lview-save"), "so is the direction");
  st.dir = "asc";
  assert.equal(el.viewsControl("inv"), "", "back at the default: nothing to save");
  st.sort = "status"; el.saveView("inv"); el.commitView("inv", "By status");
  assert.ok(!el.viewsControl("inv").includes("data-lview-save"), "equal to the chosen view: nothing new to save");
  st.dir = "desc"; el._viewOpen = "inv";
  assert.ok(el.viewsControl("inv").includes("data-lview-save"), "a change against the chosen view can be saved");
});

test("the coverage of a scan shows in the overview as one line, lists each source with its reason, and names the source behind a not-checked ending", () => {
  const { el } = panel("en");
  const cov = (extra = []) => [{ source: "registry", state: "checked", reason: null }, { source: "apps", state: "absent", reason: "no_supervisor" }, ...extra];
  el.data = { ...DATA, meta: { ...DATA.meta, scanned_at: "2026-10-12T20:22:00+00:00", coverage: cov([{ source: "dashboards", state: "checked", reason: null }]) } };
  assert.equal(el.scanCoverageLine(), "", "no bar in the overview while all is read");
  assert.ok(el.scanCoverageComplete() && el.safetyItems().some(i => i[0] === "coverage" && i[2] === "Scan complete"), "absent sources do not count; one item in the bar under the menu");
  el.data.meta.coverage = cov([{ source: "dashboards", state: "partial", reason: "unreadable", read: 3, failed: 1 }, { source: "statistics", state: "skipped", reason: "not_ready" }]);
  const line = el.scanCoverageLine();
  assert.ok(line.includes("Check: 1 of 3 sources") && line.includes("Dashboards, Long-term statistics") && line.includes("data-cov-details") && line.includes('class="tile warn"'));
  const card = el.scanCoverageCard();
  assert.ok(card.indexOf("Long-term statistics") < card.indexOf("Registry") && card.indexOf("Registry") < card.indexOf(">Apps<"), "gaps first, absent last");
  assert.ok(card.includes("3 read, 1 not") && card.includes("Not present") && card.includes("No Supervisor"));
  el.data.meta.coverage = undefined;
  assert.equal(el.scanCoverageLine(), ""); assert.equal(el.scanCoverageCard(), "");
  assert.equal(el.endedSourceLabel({ rule_id: "dashboard.missing_entity" }), "Source not read: Dashboards");
  assert.equal(el.endedSourceLabel({ rule_id: "entity.state_unavailable" }), "not checked");
});

test("the info page lists the phases of the last scan, longest first, and the refresh of the storage page asks the server for a fresh walk", async () => {
  const { el } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, scan_timing: { entities: 0.4, automations: 2.26, analysis: 1.0, strange_phase: 0.1 } } };
  const html = el.scanTimingCard();
  assert.ok(html.indexOf("Automations, scripts and scenes") < html.indexOf("Evaluating the findings") && html.indexOf("Evaluating the findings") < html.indexOf("Reading entities"), "longest first");
  assert.ok(html.includes("2.3 s") && html.includes("3.8 s in total") && html.includes("strange_phase"), "rounded, summed, an unknown phase by its name");
  el.data.meta.scan_timing = undefined;
  assert.equal(el.scanTimingCard(), "");
  const sent = [];
  el._hass.callWS = async msg => { sent.push(msg); return { read_at: "2026-10-12T20:00:00+00:00" }; };
  await el.sysLoad("storage");
  await el.sysLoad("storage", true);
  const usage = sent.filter(m => m.type === "ha_housekeeper/system_usage");
  assert.equal(usage[0].fresh, undefined); assert.equal(usage[0].quick, true); assert.equal(usage.at(-1).fresh, true);
  sent.length = 0;
  el._hass.callWS = async msg => { sent.push(msg); return { read_at: "2026-10-12T20:00:00+00:00", stale: msg.quick === true }; };
  await el.sysLoad("storage");
  assert.deepEqual(sent.map(m => m.quick), [true, undefined], "kept sizes that are due are asked for once more");
  assert.equal(el.sysState("storage").at, "2026-10-12T20:00:00+00:00", "the page shows when the sizes were read");
});

test("the info page explains Housekeeper's own HACS update state and links to its repository", () => {
  const { el } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, version: "1.5.1", hacs_available: true, hacs_housekeeper: { id: "123", installed_version: "33ccdad", installed_kind: "commit", available_version: "1.6.0", pending_update: false, last_fetched: "2026-10-14T10:30:00+00:00" } } };
  let html = el.housekeeperUpdateCard();
  assert.ok(html.includes("HACS is still tracking a commit") && html.includes("Redownload") && html.includes('data-ha-path="/hacs/repository/123"'));
  assert.ok(html.includes("33ccdad") && html.includes("1.6.0"));

  el.data.meta.hacs_housekeeper = { id: "123", installed_version: "v1.6.0", installed_kind: "release", available_version: "v1.6.0", pending_update: false };
  el.data.meta.version = "1.6.0";
  html = el.housekeeperUpdateCard();
  assert.ok(html.includes("Up to date") && html.includes('class="tile ok"'));

  el.data.meta.version = "1.5.1";
  el.data.meta.hacs_housekeeper = { id: "123", installed_version: "1.5.1", installed_kind: "release", available_version: "v1.6.0", pending_update: false };
  assert.ok(el.housekeeperUpdateCard().includes("Update available"), "the versions reveal an update even when HACS did not set its pending flag");

  el.data.meta.hacs_housekeeper = null;
  assert.ok(el.housekeeperUpdateCard().includes("Not managed by HACS"));
  el.data.meta.hacs_available = false;
  assert.ok(el.housekeeperUpdateCard().includes("HACS not available"));
});

test("the open menu list of a narrow window scrolls instead of outgrowing the sticky bar", () => {
  const { el } = panel("en");
  assert.match(el.styles(), /\.top\.open \.topnav\{display:flex;max-height:[^}]*overflow-y:auto/);
});

test("a top bar that does not fit changes into the menu button instead of being cut off, and goes back once it fits", () => {
  const { el } = panel("en");
  el.navCompact = true;
  assert.ok(el.topbar().includes('class="top compact"'), "the state survives a render");
  el.navCompact = false;
  assert.ok(el.topbar().includes('class="top"'));
  const classes = new Set();
  const rect = right => ({ getBoundingClientRect: () => ({ right }) });
  const bar = (navRight, endRight) => {
    const end = rect(endRight), nav = { ...rect(navRight), scrollWidth: navRight, clientWidth: navRight, querySelector: () => end };
    const top = { classList: { remove: c => classes.delete(c), add: c => classes.add(c) }, querySelector: () => nav };
    return { querySelector: () => top };
  };
  el.fitNav(bar(900, 1400));
  assert.ok(classes.has("compact") && el.navCompact === true, "the last item sticks out: compact");
  el.fitNav(bar(1400, 1400));
  assert.ok(!classes.has("compact") && el.navCompact === false, "it fits again: the full bar");
  el.fitNav({ querySelector: () => null });
});

test("the search finds pages, settings tabs and finding filters, puts the better matching block first, and opens them", () => {
  const { el } = panel("en");
  const known = { rule_id: "entity.state_unavailable", object_id: "sensor.spare", classification: "unavailable", confidence: 0.75, key: "k1", ignored: true, ignored_by: "user", ignore_info: { kind: "keep", reason: "Spare" } };
  el.data = { ...DATA, objects: [...DATA.objects, { object_type: "entity", object_id: "sensor.u", name: "U", status: "unavailable" }], meta: { ...DATA.meta, status_counts: { active: 2, unavailable: 4 } }, findings: [...DATA.findings, known] };
  const kinds = query => { el.quickQuery = query; return el.quickEntries().map(e => `${e.kind}:${e.label || e.item?.object_id}`); };
  assert.equal(kinds("k").length, 0, "one letter does not search");
  const known1 = kinds("known");
  assert.equal(known1[0], "filter:Findings: Known", "a filter that matches best comes first");
  assert.ok(kinds("battery").includes("page:Batteries"), "a page by its name");
  assert.ok(kinds("backup").includes("page:Maintenance"), "a page by a keyword");
  assert.ok(kinds("dunkel").includes("page:Appearance") && kinds("dark").includes("page:Appearance"), "keywords in both languages");
  assert.ok(kinds("unavailable").includes("filter:Inventory: Unavailable"), "an object status with its count");
  assert.equal(kinds("bekannt").filter(x => x.startsWith("filter")).length, 1, "German words for a state");
  // opening
  el.quickQuery = "known"; el.quickOpen = true;
  const html = el.quickSearchBox();
  assert.ok(html.includes('class="grp"') && html.includes("Filters") && html.includes("data-quick-entry=\"0\""));
  el.quickGo(el.quickEntries()[0]);
  assert.equal(el.view, "findingsNav"); assert.equal(el.findingStatus, "known"); assert.equal(el.quickQuery, ""); assert.equal(el.quickOpen, false);
  el.quickQuery = "appearance"; el.quickGo(el.quickEntries().find(e => e.settingsTab === "look"));
  assert.equal(el.view, "settings"); assert.equal(el.settingsTab, "look");
  el.quickQuery = "unavailable"; el.quickGo(el.quickEntries().find(e => e.objectStatus === "unavailable"));
  assert.equal(el.view, "inventory"); assert.equal(el.statusFilter, "unavailable");
  const bar = el.topbar();
  assert.ok(bar.includes('aria-label="Settings"') && bar.includes("nav iconly") && !bar.includes('data-view="overview" ><ha-icon') , "settings is the gear");
  assert.ok(bar.includes('class="brand') && bar.includes("brandtext") && !bar.includes('class="nav  active" data-view="overview"') && !bar.includes('class="nav " data-view="overview"'), "the brand carries the overview");
});

test("the bar shows what the scan counted for the security and runs views, and nothing for one it could not read", () => {
  const { el } = panel("en");
  el.data = { ...el.data, meta: { ...el.data.meta, view_counts: { exposure: 2, secrets: 3, runs: 4 } } };
  const bar = el.topbar();
  const num = view => (bar.match(new RegExp(`data-view="${view}"[^>]*>.*?(?:<em>(\\d+)</em>)?</button>`)) || [])[1];
  assert.equal(num("exposure"), "2"); assert.equal(num("secrets"), "3"); assert.equal(num("runs"), "4");
  assert.equal(num("dataflow"), undefined, "a view left out has no number");
  assert.equal(num("inventory"), undefined, "the stock has none");
});

test("a finding row ends in an impact chip and a menu with the status; a hidden one offers the way back", () => {
  const { el } = panel("en");
  const f = { key: "k1", rule_id: "automation.stale", object_id: "automation.a", impact: "info" };
  assert.ok(el.impactChip("info").includes("Info") && el.impactChip("none") === "");
  const menu = el.rowMenu(f);
  assert.ok(menu.includes('data-decide-open="k1"') && menu.includes('data-auto-delete="automation.a"'));
  assert.ok(el.rowMenu({ ...f, ignored: true, ignored_by: "user" }).includes('data-ignore-value="0"'), "a finding hidden by its own status can be opened again");
  assert.equal(el.rowDecide(f), "");
  assert.ok(el.rowMenu({ key: "k2", rule_id: "entity.possible_duplicate", object_id: "sensor.a_2", affected_object: "sensor.a" }).includes('data-object="entity:sensor.a"'), "a duplicate row opens its working twin from the menu");
});

test("an integration outage is a reason of its own, with a tile and a filter of the list bar", () => {
  const { el } = panel("en");
  const f = (rule, id, classification) => ({ rule_id: rule, object_id: id, classification, confidence: 0.9, key: `${rule}|${id}`, ignored: false, evidence: [], impact: "low" });
  el.data = { ...DATA, objects: [], causes: [], findings: [f("config_entry.not_loaded", "e1", "problem"), f("entity.state_missing", "sensor.a", "orphaned")] };
  assert.equal(el.findingReason(el.data.findings[0]), "outage");
  assert.equal(el.findingReason(el.data.findings[1]), "orphaned");
  const html = el.findingsView();
  assert.ok(html.includes("Outage") && html.includes("All findings") && !html.includes("All reasons"), "the reason is set by the tiles only");
  assert.ok(!html.includes('data-lf="findings|fresh"'), "new and in work are chips of the status row, not a filter of the list bar");
  el.findingFilter = "outage";
  assert.equal(el.visibleFindings().map(x => x.object_id).join(), "e1");
  el.findingFilter = "";
  el.data.findings[1].first_detected_at = "2020-01-01T00:00:00Z";
  el.data.findings[0].first_detected_at = new Date().toISOString();
  el.findingStatus = "new";
  assert.ok(el.findingsView().includes('data-fstatus="new"'), "the chip appears while there is something new");
  assert.equal(el.visibleFindings().map(x => x.object_id).join(), "e1");
});

test("the finding of an outage is the head of its integration, with a filter too, and a row of its own in the flat list", () => {
  const { el } = panel("en");
  const own = { rule_id: "config_entry.not_loaded", object_id: "e1", classification: "problem", confidence: 0.9, key: "config_entry.not_loaded|e1", ignored: false, evidence: [], impact: "low", cause_id: "integration_down:e1" };
  const c = { id: "integration_down:e1", kind: "integration_down", object_type: "config_entry", object_id: "e1", name: "Hue", finding_key: own.key, follower_count: 0, total_followers: 0, child_ids: [], consumers: {}, impact: "low", parent_id: null };
  el.data = { ...DATA, objects: [], causes: [c], findings: [own] };
  assert.equal((el.findingsView().match(/data-fsel="config_entry.not_loaded\|e1"/g) || []).length, 1, "the head of its integration in the grouped list selects its own finding");
  el.findingFilter = "outage";
  assert.equal((el.findingsView().match(/data-fsel="config_entry.not_loaded\|e1"/g) || []).length, 1, "and under a filter too");
  el.showFollowers = true;
  assert.equal((el.findingsView().match(/data-fsel="config_entry.not_loaded\|e1"/g) || []).length, 1, "a row of its own in the flat list");
});

test("object lists share one table: device entities, integration entries, reminders and backups sort, filter and show the state", () => {
  const { el } = panel("en");
  el.data = { ...DATA, reminders: [{ id: "r1", name: "Filter", interval_days: 30, last_done: "", history: [], due: "2026-11-01", days_left: 5, state: "soon", note: "" }] };
  const html = el.objectTable("t-objs", [
    { key: "entity:light.a", type: "entity", name: "A", sub: "light.a", tone: "ok", state: "active", stateLabel: "Active", pill: "<b>ok</b>", value: "on" },
    { key: "entity:light.b", type: "entity", name: "B", sub: "light.b", tone: "red", state: "unavailable", stateLabel: "Unavailable", pill: "<b>bad</b>", value: "" },
  ], { min: 1, extras: [{ key: "value", label: "objColState", get: r => r.value, cell: r => r.value }] });
  assert.ok(html.includes('data-object="entity:light.a"') && html.includes('data-lf="t-objs|state"') && html.includes("<table") && !html.includes("mdi:chevron-right"));
  const rem = el.remindersCard();
  assert.ok(rem.includes('data-lsort="reminders|due') && rem.includes('data-rem-open="r1"') && rem.includes('data-lf="reminders|state"'));
  assert.ok(el.bhBackups([{ date: "2026-10-01T10:00:00+00:00", size: 1000, agents: ["backup.local"], protected: true }]).includes('data-lsort="bhbackups|size'));
  assert.deepEqual([true, false, null, undefined].map(automatic => el.bhKind({ automatic })), ["auto", "manual", "other", "other"], "a backup without the flag is from another tool, not a manual one");
  assert.deepEqual(["hassio.local", "backup.local", "hassio.Backup", "google_drive.me_gmail_com", "cloud.cloud", "foo_bar.x"].map(id => el.bhAgent(id).label), ["Local", "Local", "Network storage: Backup", "Google Drive", "Nabu Casa", "Foo bar"], "targets are named, accounts left out");
  assert.ok(el.bhAgent("hassio.local").local && !el.bhAgent("hassio.Backup").local);
  assert.ok(rem.includes('data-rem-row="r1"') && rem.includes('role="button"'), "the row opens the history");
  assert.ok(rem.includes('data-lf-set="reminders|state|soon"') && rem.includes('data-lf-set="reminders||"'), "the key figures set the state filter");
  assert.ok(rem.includes('data-exp-menu="reminders"') && !rem.includes("data-export-list") && el._exporters.reminders.rows()[0][0] === "Filter", "the list exports to CSV");
});

test("the changes page counts what a filter shows, says so, and lists objects as tables", () => {
  const { el, shadow } = panel("en");
  el.view = "changes";
  el.compare = COMPARE;
  el.render();
  assert.ok(shadow.innerHTML.includes("Search and filter apply to all sections."));
  assert.ok(shadow.innerHTML.includes("<table"), "table");
  assert.ok(!shadow.innerHTML.includes('style="margin'), "inline");
  el.lvState("changes", "", "asc").q = "gone";
  el.openFolds = {};
  el.changesCat = "removedObjects";
  el.render();
  assert.ok(shadow.innerHTML.includes("1 of 1") && shadow.innerHTML.includes("of 1"), "the sections show how many of all");
});

test("the inventory is the shared list: origin only for integrations, core and custom under integration, helper columns, selection and compact rows", () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, objects: [
    ...DATA.objects,
    { object_type: "config_entry", object_id: "E1", name: "Core", domain: "hue", custom: false, status: "active", entity_count: 2 },
    { object_type: "config_entry", object_id: "E2", name: "Cust", domain: "hacs", custom: true, integration_version: "2.0", status: "active", entity_count: 5 },
    { object_type: "entity", object_id: "input_boolean.h", name: "H", platform: "input_boolean", status: "active" },
  ] };
  el.view = "inventory"; el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes('data-lf="inventory|type"') && html.includes("All types") && !html.includes('data-lf="inventory|origin"'), "no origin filter without the integration type");
  assert.ok(html.includes('data-inv-filter="config_entry||custom"') && html.includes("of which custom") && html.includes("data-inv-sel-page"), "sub rows under integration, selection always there");
  assert.ok(html.includes('data-dense="inventory"') && html.includes('data-lsort="inventory|reason|asc"'));
  el.typeFilter = "config_entry"; el.render();
  html = shadow.innerHTML;
  assert.ok(html.includes('data-lf="inventory|origin"') && html.includes('data-lsort="inventory|version|asc"'));
  el.typeFilter = "helper"; el.render();
  html = shadow.innerHTML;
  assert.ok(html.includes('data-lf="inventory|idle"') && html.includes('data-lsort="inventory|usedByCol|desc"') && !html.includes('data-lf="inventory|origin"'));
});

test("the mark form offers a time window and the mark line says when it applies", () => {
  const { el } = panel("en");
  const window = { mode: "time", from: "21:00", to: "06:00" };
  assert.ok(el.markLine({ kind: "expected_offline", window, grace: 30 }).includes("21:00–06:00, then 30 min grace"));
  assert.ok(el.markLine({ kind: "expected_offline", window: { mode: "sun" }, grace: 0 }).includes("in the dark"));
  const form = f => el.markFormHtml({ kind: "expected_offline", reason: "", target: "", days: 0, wmode: "", from: "21:00", to: "06:00", grace: 30, ...f }, "config_entry:x");
  assert.ok(!form({}).includes("data-mark-from"), "no window, no clock fields");
  assert.ok(form({ wmode: "time" }).includes("data-mark-from") && form({ wmode: "time" }).includes("data-mark-grace"));
  assert.ok(!form({ wmode: "sun" }).includes("data-mark-from") && form({ wmode: "sun" }).includes("data-mark-grace"));
  assert.ok(!form({ kind: "keep", wmode: "sun" }).includes("data-mark-wmode"), "keep has no window");
});

test("the mark form warns when the sun entity is missing", () => {
  const { el } = panel("en");
  const form = states => { el._hass = { states }; return el.markFormHtml({ kind: "expected_offline", reason: "", target: "", days: 0, wmode: "sun", from: "21:00", to: "06:00", grace: 30 }, "config_entry:x"); };
  assert.ok(form({}).includes("sun.sun"), "no sun.sun: the form says so");
  assert.ok(!form({ "sun.sun": { state: "below_horizon" } }).includes('role="alert"'));
});

test("the delete button of a list row is the bin only, with the name as tooltip, and says why it is disabled", () => {
  const { el } = panel("en");
  const on = el.deleteButton('data-x="1"', "Delete");
  assert.ok(on.includes('data-x="1"') && on.includes('title="Delete"') && on.includes('aria-label="Delete"') && on.includes("mdi:delete-outline") && !on.includes(">Delete<"));
  const off = el.deleteButton('data-x="1"', "Delete", { why: "In use" });
  assert.ok(off.includes("disabled") && off.includes('title="In use"') && !off.includes('data-x="1"'), "no action while disabled");
});

test("an outdated preview is marked and renewed; a reopened one is checked before it is confirmed", async () => {
  const { el } = panel("en");
  const old = { plan_id: "o1", created_at: new Date(Date.now() - 25 * 3600e3).toISOString(), status: "dry_run", executed: false, actions: [{ kind: "disable_entity", object_id: "sensor.a", name: "A", verdict: "ok", executable: true, reasons: [], used_by: [] }], summary: { total: 1, ok: 1 } };
  assert.ok(el.planStale(old) && !el.planStale({ ...old, created_at: new Date().toISOString() }) && !el.planStale({ ...old, status: "verified" }));
  assert.ok(el.planCard(old).includes("data-plan-renew") && !el.planCard(old).includes("data-plan-confirm"));
  const calls = [];
  el._hass = { language: "en", callWS: async msg => { calls.push(msg.type.split("/")[1]); return msg.type.endsWith("plan_check") ? { current: false, changed: [{ object_id: "sensor.a" }] } : {}; } };
  el.plan = { ...old, plan_id: "o2", created_at: new Date().toISOString() };
  el.reopenedPlanId = "o2";
  await el.confirmAndRun();
  assert.ok(calls.includes("plan_check") && !calls.includes("plan_confirm"));
  assert.equal(el.planChanges.length, 1);
});

test("a quiet outage (info, low) stays off the overview counts and the line names the next level from the thresholds", () => {
  const { el } = panel("en");
  const meta = { ...DATA.meta, outage_info_minutes: 15, outage_low_hours: 1, outage_medium_hours: 24, outage_high_hours: 168 };
  const quiet = { rule_id: "entity.state_unavailable", impact: "low", key: "k1", object_id: "sensor.a", classification: "unavailable", confidence: 0.75, first_detected_at: new Date(Date.now() - 2 * 3600000).toISOString() };
  const loud = { ...quiet, key: "k2", object_id: "sensor.b", impact: "medium" };
  const other = { rule_id: "automation.unused", impact: "low", key: "k3", object_id: "automation.x", classification: "unused", confidence: 0.7 };
  el.data = { ...DATA, meta, findings: [quiet, loud, other], causes: [] };
  assert.equal(el.isQuiet(quiet), true);
  assert.equal(el.isQuiet(loud), false);
  assert.equal(el.isQuiet(other), false, "only the findings of an outage are quiet");
  assert.equal(el.quietCount(), 1);
  const line = el.outageLineOf(quiet);
  assert.ok(line.includes("Medium") || line.includes("medium"), line);
});

test("the watch lists an object that is a finding like the findings list does, and the others with a mark button", () => {
  const { el } = panel("en");
  const object = { object_type: "entity", object_id: "light.a", name: "Hall lamp", status: "unavailable" };
  const finding = { rule_id: "entity.state_unavailable", classification: "unavailable", key: "entity.state_unavailable|light.a|", object_id: "light.a", confidence: 0.75, impact: "medium" };
  el.data = { ...DATA, objects: [object, { object_type: "entity", object_id: "light.b", name: "Porch", status: "unknown" }], edges: [], findings: [finding] };
  const html = el.watchRows(["entity:light.a", "entity:light.b"], "warn");
  assert.ok(html.includes("data-decide-open=") && !html.includes("data-fsel=") && html.includes('data-watch-mark="entity:light.b"'));
  assert.equal(html.includes('data-watch-mark="entity:light.a"'), true, "the menu of a finding row offers the mark on its object, like the selection bar");
  const past = el.watchRows(["entity:light.a"], "mute", true);
  assert.ok(past.includes("Disturbed again now") && !past.includes("data-decide-open"), "a group about the past shows no finding row, only a note");
});

test("an entity that fails regularly gets a hint with a mark prepared for the time it falls out; a dismissed one stays quiet", () => {
  const { el } = panel("en");
  const object = { object_type: "entity", object_id: "sensor.inverter", name: "Inverter", status: "unavailable" };
  const finding = { rule_id: "entity.state_unavailable", classification: "unavailable", key: "entity.state_unavailable|sensor.inverter|", object_id: "sensor.inverter", confidence: 0.75, impact: "low" };
  el.data = { ...DATA, objects: [object], edges: [], findings: [finding] };
  el.reliability = { available: true, window_days: 7, unstable: { entities: { "sensor.inverter": { level: "unstable", episodes: 9, per_day: 1.3, total_seconds: 5400, mean_seconds: 600, pattern_hour: 22 } } } };
  assert.ok(el.oftenChip(finding).includes("between 22:00 and 00:00"), el.oftenChip(finding));
  assert.equal(el.oftenRows(object).length, 1);
  const window = el.oftenWindow({ pattern_hour: 22 });
  assert.equal(`${window.from}-${window.to}`, "22:00-00:00");
  el.openOftenMark("entity:sensor.inverter");
  assert.equal(el.markForm.kind, "expected_offline");
  assert.equal(el.markForm.wmode, "time");
  assert.equal(el.markForm.days, 90);
  assert.equal(el.markForm.from, "22:00");
  el.markForm = null;
  el.skipOften("entity:sensor.inverter");
  assert.equal(el.oftenChip(finding), "");
  assert.equal(el.oftenRows(object).length, 0);
});

test("the suggestions gather the entities of a device that fail together; the mark goes on each of them, the rest stays watched", async () => {
  const { el } = panel("en");
  const ent = id => ({ object_type: "entity", object_id: id, name: id, status: "unknown", device_id: "tv" });
  const f = id => ({ rule_id: "entity.state_unknown", classification: "unknown", key: `u|${id}`, object_id: id, confidence: 0.75, impact: "low", ignored: false });
  const ids = ["sensor.a", "sensor.b", "sensor.c"];
  el.data = { ...DATA, objects: [...ids.map(ent), { ...ent("sensor.d"), status: "active" }, { object_type: "device", object_id: "tv", name: "TV", status: "active" }], edges: [], findings: ids.map(f) };
  const info = { level: "unstable", episodes: 7, per_day: 1, total_seconds: 9000, mean_seconds: 1200, pattern_hour: 23 };
  el.reliability = { available: true, window_days: 7, unstable: { entities: Object.fromEntries(ids.map(id => [id, info])) } };
  const items = el.oftenSuggestions();
  assert.equal(items.map(s => `${s.key}:${s.hides}`).join(), "group:tv:3");
  el.folds = { ...(el.folds || {}), often: true };
  assert.ok(el.oftenCard().includes('data-often-take="group:tv"') && !el.oftenCard().includes("data-often-all"), "one suggestion: no accept all");
  assert.ok(el.oftenCard().includes("TV: 3 entities") && el.oftenCard().includes("the other entity stays watched"), el.oftenCard());
  assert.ok(el.oftenCard().includes("1 object · 3 findings") && el.oftenCard().includes('class="iconbtn" data-often-skip="group:tv"') && el.oftenFindings(1) === "1 finding", "a bar with the sum, a quiet cross, singular and plural");
  const calls = [];
  el._hass = { language: "en", callWS: async msg => { calls.push(msg); return msg.type === "ha_housekeeper/inventory" ? { ...DATA, findings: [], causes: [] } : {}; } };
  el.render = () => {};
  await el.takeOften(["group:tv"]);
  const sets = calls.filter(c => c.type === "ha_housekeeper/mark_set");
  assert.equal(sets.map(c => `${c.object_type}:${c.object_id}`).join(), "entity:sensor.a,entity:sensor.b,entity:sensor.c");
  assert.equal(`${sets[0].kind}:${sets[0].days}:${sets[0].window.from}`, "expected_offline:90:23:00");
});

test("a newer scan found in the background reloads the panel; the same scan or a running one does not", async () => {
  let status = { running: false, scanned_at: DATA.meta.scanned_at };
  const { el } = panel("en");
  el._hass = { language: "en", callWS: async () => status };
  let loads = 0;
  el.load = async () => { loads += 1; };
  await el.checkNewScan();
  assert.equal(loads, 0, "same scan");
  status = { running: true, scanned_at: "2026-10-07T16:00:00+00:00" };
  await el.checkNewScan();
  assert.equal(loads, 0, "a scan that is still running");
  status = { running: false, scanned_at: "2026-10-07T16:00:00+00:00" };
  await el.checkNewScan();
  assert.equal(loads, 1, "a newer scan");
});

test("a new plan opens on its own page, and closing it returns to the page it came from", () => {
  const { el, shadow } = panel("en");
  el.data = DATA; el.journal = []; el.view = "cleanup";
  const plan = { plan_id: "pn", created_at: new Date().toISOString(), status: "dry_run", executed: false, summary: { total: 1, ok: 1, review: 0, blocked: 0 },
    actions: [{ kind: "disable_entity", object_id: "sensor.a", name: "A", verdict: "ok", executable: true, reasons: [], used_by: [] }] };
  el.openNewPlan(plan);
  el.render();
  assert.equal(el.view, "plan");
  assert.ok(shadow.innerHTML.includes("data-plan-card") && shadow.innerHTML.includes('data-action="view-back"'));
  assert.ok(shadow.innerHTML.includes("data-plan-close"));
  el.leavePlan();
  assert.equal(el.view, "cleanup");
  assert.equal(el.plan, null);
  assert.ok(!shadow.innerHTML.includes("data-plan-card"));
});

test("an open request for a new login is a pinned row of the to-do card", () => {
  const { el } = panel("de");
  el.ensureSysLight = el.ensureGoals = el.ensurePolicies = () => {};
  el.staleScan = () => null;
  el.causeList = () => [{ kind: "integration_down", object_id: "e1", follower_count: 14, impact: "medium" }];
  const finding = (id) => ({ rule_id: "config_entry.reauth", object_id: id, classification: "problem", ignored: false });
  el.data = { ...DATA, monitor: [], quarantine: [], findings: [finding("e1")], objects: [{ object_type: "config_entry", object_id: "e1", name: "Tibber" }] };
  el.findObject = key => (key === "config_entry:e1" ? { name: "Tibber" } : null);
  const row = el.todoItems().find(i => i.key === "reauth");
  assert.equal(row.text, "Anmeldung nötig: Tibber");
  assert.equal(row.hintText, "14 Entitäten fallen aus");
  assert.equal(row.filter, "config_entry.reauth");
  el.data = { ...el.data, findings: [finding("e1"), finding("e2")] };
  assert.equal(el.todoItems().find(i => i.key === "reauth").text, "Anmeldung nötig: 2 Integrationen");
});

test("the components page lists what Home Assistant still waits for as information", () => {
  const { el } = panel("de");
  el.sysState("flows").data = { flows: [
    { flow_id: "a", domain: "hue", name: "Hue Bridge", source: "zeroconf", kind: "discovered" },
    { flow_id: "b", domain: "fritz", name: "Fritz!Box", source: "reconfigure", kind: "reconfigure" },
  ] };
  const html = el.openFlowsFold();
  assert.ok(html.includes("Offen in Home Assistant") && html.includes("1 gefundene Geräte") && html.includes("1 Neukonfiguration"));
  el.folds = { open_flows: true };
  assert.ok(el.openFlowsFold().includes("Hue Bridge") && el.openFlowsFold().includes("Gefunden über zeroconf"));
  el.sysState("flows").data = { flows: [] };
  assert.equal(el.openFlowsFold(), "");
});

test("an integration with too few entities for a shared outage says so instead of showing zero", () => {
  const { el } = panel("en");
  el.data = DATA; el.view = "reliability"; el._relRequested = 7;
  el.reliability = { ...RELIABILITY, thresholds: { shared_min_entities: 3 }, entries: [{ ...RELIABILITY.entries[1], entry_id: "s1", title: "Tiny", entities: 2, shared_outages: 0 }] };
  const html = el.reliabilityView();
  assert.ok(html.includes("too small") && html.includes("Shared outages need at least 3 entities."));
});

test("the database tab shows size, growth, retention and purge as tiles and keeps notes for what is unknown", () => {
  const { el } = panel("en");
  el.data = DATA; el._dbRequested = true;
  el.dbHealth = { ...DBH, keep_days: 10, auto_purge: false };
  let html = el.dbCard();
  assert.ok(html.includes("Size") && html.includes("11 GB") && html.includes("WAL 3 GB") && html.includes("Growth per day") && html.includes("+80 MB") && html.includes("0.7 % of the size a day") && html.includes("10 days") && html.includes("Purge automatically") && html.includes("Off"));
  assert.ok(html.includes("Automatic purging is off") && html.includes("2 gaps from restarts (normal)"), "the sentences stay as notes");
  assert.ok(html.includes('data-exp-menu="recdb"'), "the export button is there on the first render");
  el.dbHealth = { ...DBH, growth: { known: true, per_day: -50 * 1024 ** 2 } };
  assert.ok(el.dbCard().includes("−50 MB"), "a database that shrank shows minus, not +0 B");
  el.dbHealth = { ...DBH, supported: false, dialect: "mysql", db_bytes: null, growth: { known: false } };
  html = el.dbCard();
  assert.ok(!html.includes("Growth per day") && html.includes("Size not measurable (database: MariaDB/MySQL)") && html.includes("Growth is being observed"));
  el.dbHealth = { ...DBH, dialect: "mysql", estimated: true, db_bytes: 11 * 1024 ** 3, wal_bytes: null, findings: [] };
  html = el.dbCard();
  assert.ok(html.includes("11 GB") && html.includes("estimated (MariaDB/MySQL)") && !html.includes("WAL"), "a server database has a size but no WAL file");
  el.dbHealth = { ...el.dbHealth, tables: [{ name: "states", bytes: 8 * 1024 ** 3 }], tables_total: 3 };
  html = el.dbCard();
  assert.ok(html.includes("Largest tables") && html.includes("states") && html.includes("73 %") && html.includes("2 more tables"));
});

test("a series named in a database finding opens its entity on the page and stays plain text in the export", () => {
  const { el } = panel("en");
  el.findObject = key => (key === "entity:sensor.a" ? { object_type: "entity" } : null);
  const f = { kind: "duplicates", level: "problem", groups: 2, capped: false, series: [{ statistic_id: "sensor.a", name: "Energy" }, { statistic_id: "sensor.gone", name: "Gone" }] };
  assert.ok(el.dbFindingRow(f).includes('data-object="entity:sensor.a"') && !el.dbFindingRow(f).includes("entity:sensor.gone"));
  assert.ok(!el.dbFindingText(f).includes("<button"));
});

test("every tab of Maintenance can be found by search, and the goals tab says why it is empty", () => {
  const { el, shadow } = panel("en");
  const tabs = el.searchPages().filter(page => page.view === "maintenance" && page.viewTab).map(page => page.viewTab);
  assert.equal(tabs.join(","), "backup,updates,blueprints,goals");
  assert.equal(el.t("mtNotes_1"), "1 note");
  el.goals = { goals: [], met: 0, missed: 0 }; el._goalsRequested = true; el.view = "maintenance"; el.viewTab = { maintenance: "goals" }; el.render();
  assert.ok(shadow.innerHTML.includes("There are no maintenance goals yet."));
  el.goals = null; el.goalsError = "boom"; el.render();
  assert.ok(shadow.innerHTML.includes("boom"));
});

test("the journal has tabs for plans and removed devices, shows a load error and points to older purges from tidy up", () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, objects: [], edges: [], findings: [], quarantine: [], notes: [] };
  el.journal = []; el._journalRequested = true; el.removed = [{ object_id: "d9", name: "Old hub", kind: "remove_device", group: "device", at: "2026-03-01T00:00:00+00:00", plan_id: "gone" }]; el.purges = [];
  el.view = "journal"; el.render();
  let html = shadow.innerHTML;
  assert.ok(html.includes('data-view-tab="journal|plans"') && html.includes('data-view-tab="journal|devices"') && !html.includes('data-view-tab="journal|purges"') && html.includes("data-journal-refresh"));
  el.viewTab = { journal: "devices" }; el.render();
  assert.ok(shadow.innerHTML.includes("Old hub") && !shadow.innerHTML.includes("Open plan"), "a plan that left the journal gets no button");
  el.journalError = "boom"; el.render();
  assert.ok(shadow.innerHTML.includes("boom") && !shadow.innerHTML.includes("Old hub"), "a failed load is shown, not mistaken for an empty journal");
  el.journalError = ""; el.purges = [{ at: "2026-10-01T10:00:00+00:00", removed: ["sensor.a"], skipped: [], states: false }];
  el.view = "cleanup"; el.viewTab = { cleanup: "stats" };
  assert.ok(el.cleanupView().includes('data-jump-tab="purges"'));
});

test("the Backups tab holds the protection and, folded at the foot, the tidy-up of Housekeeper's own backups", () => {
  const { el } = panel("en");
  el._bkcRequested = true;
  el.bkc = { available: true, rows: [{ backup_id: "b2", name: "Housekeeper bbbb2222", date: "2026-08-30T10:00:00+00:00", age_days: 41, size: 900, with_database: true, plan_id: "p2", protected: null, only_return: false, suggested: true }], total: { count: 1, bytes: 900 }, suggested: { count: 1, bytes: 900 } };
  el.backup = { available: true, overall: "note", checks: [{ id: "own_backups", level: "note", values: { count: 12, size: 3145728000 } }], backups: [] };
  let html = el.backupCard();
  assert.ok(html.includes("data-bkc-open") && html.includes('data-fold="bkc"') && html.includes('aria-expanded="false"') && !html.includes("data-bkc-plan"), "folded: nothing to press by accident");
  assert.ok(html.includes("Look first") && html.includes("To check: Housekeeper backups") && html.includes("Latest backup") && html.includes("Backup runs") === false, "a verdict on top, groups only where there are checks");
  assert.ok(html.indexOf("Look first") < html.indexOf("Housekeeper</div>"), "the verdict comes before the groups");
  el.folds = { bkc: true };
  html = el.backupCard();
  assert.ok(html.includes("data-bkc-plan") && html.includes("Housekeeper bbbb2222"));
});

test("the new backup checks say what failed, which target is stale and how much room is left", () => {
  const { el } = panel("en");
  el.backup = { available: true, overall: "problem", counts: { note: 1, problem: 1 }, backup_count: 3, backups: [], checks: [
    { id: "content", level: "problem", values: { failed: ["Cloudflared", "ssl"] } },
    { id: "remote_age", level: "note", values: { agents: [{ agent: "cloud.cloud", age_hours: 216 }, { agent: "hassio.local", age_hours: 5 }], stale: ["cloud.cloud"], limit_hours: 36 } },
    { id: "space", level: "problem", values: { free: 800 * 1024 ** 2, size: 1024 ** 3, need: 1.5 * 1024 ** 3 } },
  ] };
  const html = el.backupCard();
  assert.ok(html.includes("Parts of the newest backup failed: Cloudflared, ssl") && html.includes("Too old (limit 36 h): Nabu Casa: 9 days") && html.includes("Only 800 MB free, the last backup was 1 GB"));
  assert.ok(html.includes("Storage and content") && html.includes("Content") && html.includes("Room for the next backup"));
});

test("the Backups tab draws the sizes of the last backups and marks the newest, left out below three", () => {
  const { el } = panel("en");
  const row = (n, size, extra = {}) => ({ date: `2026-10-${10 + n}T03:00:00+00:00`, size, ...extra });
  el.backup = { available: true, overall: "ok", checks: [{ id: "size", level: "note", values: {} }], backups: [row(3, 4 * 1024 ** 3), row(2, 2 * 1024 ** 3), row(1, 2 * 1024 ** 3), row(0, 1024 ** 3, { own: true })] };
  const html = el.bhSizes(el.backup);
  assert.ok(html.includes("Size of the last backups") && (html.match(/<i /g) || []).length === 3 && html.includes('class="last warn"') && html.includes("from 2 GB to 4 GB"), "own backups stay out");
  assert.equal(el.bhSizes({ ...el.backup, backups: el.backup.backups.slice(0, 2) }), "");
});

test("the configuration check runs on request only and an invalid result stops the verdict", async () => {
  const { el, shadow } = panel("en");
  const sent = [];
  el._hass = { language: "en", callWS: async msg => { sent.push(msg.type); return { valid: false, errors: "Invalid config for [demo] <b>", warnings: null, at: "2026-10-17T10:00:00+00:00", took_ms: 900 }; } };
  el.preflight = { state: { backup: { available: true, level: "ok", age_hours: 5 }, disk: { free: 41e9 }, repairs: [], failed_entries: [], broken: [], updates: [{ entity_id: "update.core", name: "Core", installed: "1", latest: "2", group: "system" }] },
    checks: [{ check: "backup", level: "ok" }], verdict: "ready", counts: { total: 1, system: 1, app: 0, hacs: 0, device: 0, blocked: 0 }, watch: { hours: 24, active: null } };
  el.view = "maintenance"; el.viewTab = { maintenance: "updates" }; el._pfRequested = true; el.render();
  assert.ok(shadow.innerHTML.includes("data-config-check") && shadow.innerHTML.includes("runs only when you press the button") && shadow.innerHTML.includes("Ready"));
  await el.runConfigCheck();
  const html = shadow.innerHTML;
  assert.deepEqual(sent, ["ha_housekeeper/check_config"]);
  assert.ok(html.includes("Stop") && html.includes("To check: Configuration") && html.includes("Invalid config for [demo] &lt;b&gt;") && !html.includes("<b>"));
});

test("the AI access tab shows the two switches and the log with an undo for a change", () => {
  const { el, shadow } = panel("en");
  el.view = "settings"; el.settingsTab = "mcp";
  el.data = { ...el.data, meta: { ...el.data.meta, mcp: { enabled: true, write: false } } };
  el.mcp = { calls_24h: 4, entries: [
    { at: "2026-10-18T10:00:00+00:00", last: "2026-10-18T10:00:00+00:00", n: 1, user: null, fn: "finding_decide", kind: "write", params: { key: "k" }, result: "ok", count: 1, undoable: true },
    { at: "2026-10-18T09:00:00+00:00", last: "2026-10-18T09:30:00+00:00", n: 3, user: "u1", fn: "findings", kind: "read", params: {}, result: "ok", count: 12, undoable: false },
  ] };
  el.render();
  const html = shadow.innerHTML;
  assert.ok(html.includes("data-mcp-enabled") && /data-mcp-write[^>]*>/.test(html));
  assert.ok(html.includes('data-mcp-undo="2026-10-18T10:00:00+00:00"') && html.includes("3 calls until"));
  assert.ok(html.includes("data-set-tab=\"mcp\""));
  assert.ok(html.includes("data-mcp-row") && html.includes("×3") && html.includes("mcplog") && html.includes('data-exp-menu="mcplog"'));
  assert.ok(html.includes("data-mcp-undoall") && html.includes("data-mcp-undoall-hours"));
  el.journal = [{ plan_id: "r", status: "verified", finished_at: "2026-10-08T10:00:00+00:00", undoable: false, followup: "regression" }];
  const keys = el.safetyItems().map(i => i[0]);
  assert.ok(keys[0] === "regress" && keys.includes("ai") && el.safetyBar().includes("AI access: read-only"), "AI access is an item of the safety line; red comes first");
  el.data.meta.mcp = { enabled: true, write: true };
  assert.equal(el.safetyItems().find(i => i[0] === "ai")[1], "warn", "yellow while the AI may change the list");
  assert.ok(html.includes("data-mcp-autooff") && html.includes("after 8 hours") && html.includes("data-mcp-writelimit") && html.includes("data-mcp-readlimit") && html.includes("data-mcp-hide") && html.includes("data-mcp-prompt"));
  el.settingsTab = "look"; el.render();
  assert.ok(shadow.innerHTML.includes('data-safe-key="ai"') && shadow.innerHTML.includes("AI access: with changes to the list") && !shadow.innerHTML.includes("aibar"), "no strip of its own any more");
});

test("the exceptions card builds the editor with chips for areas and the shared search for entities", () => {
  const { el } = panel("de");
  el.exc = { rules: [{ id: "r1", kind: "area", targets: ["keller"], action: "delay", days: 7, scope: "always", enabled: true, note: "", effect: { hold: 2, due: 0 } }],
    areas: [{ id: "keller", name: "Keller" }, { id: "lager", name: "Lager" }], labels: [], integrations: [], domains: [], devices: [], entities: [], vacation: { entity: "input_boolean.urlaub", state: "on", grace_hours: 24 } };
  el.openException = () => {};
  el.excForm = { id: "", kind: "area", targets: ["keller"], action: "hide", scope: "always", search: "", days: 7, enabled: true, note: "", error: "", preview: null };
  let html = el.excCard();
  assert.match(html, /data-exc-target="lager"[^>]*aria-pressed="false"/);
  assert.match(html, /data-exc-target="keller"[^>]*aria-pressed="true"/);
  assert.match(html, /class="policyswitch" data-exc-toggle="r1"/);
  assert.ok(!html.includes("data-picker=\"exc\""));
  el.excForm = { ...el.excForm, kind: "entity", targets: [], scope: "vacation" };
  html = el.excCard();
  assert.match(html, /data-picker="exc"/);
  assert.ok(!html.includes("data-exc-action"), "vacation rules always hide");
  el.excForm = { id: "", kind: "any", targets: [], picks: [{ kind: "area", id: "keller", name: "Keller" }, { kind: "entity", id: "sensor.a", name: "A" }, { kind: "entity", id: "sensor.b", name: "B" }], action: "hide", scope: "always", search: "", days: 7, enabled: true, note: "", error: "", preview: null };
  assert.equal(JSON.stringify(el.excDrafts(el.excForm).map(r => [r.kind, r.targets])), '[["area",["keller"]],["entity",["sensor.a","sensor.b"]]]');
  assert.match(el.excCard(), /data-exc-kind="any"[^>]*aria-pressed="true"/);
});

test("the inventory filters by label and the labels block counts what carries each label", () => {
  const { el } = panel("en");
  el.data = { ...DATA, objects: [
    { object_type: "label", object_id: "housekeeper_keep", name: "housekeeper_keep", status: "active" },
    { object_type: "device", object_id: "d1", name: "Proxy", status: "empty", labels: ["housekeeper_keep"] },
    { object_type: "entity", object_id: "sensor.a", name: "A", status: "active", labels: ["housekeeper_keep"] },
    { object_type: "entity", object_id: "sensor.b", name: "B", status: "active", labels: [] },
  ] };
  el.labelFilter = "housekeeper_keep";
  assert.equal(JSON.stringify(Array.from(el.filtered().map(o => o.object_id))), JSON.stringify(["sensor.a", "d1"]));
  const html = el.labelsCard();
  assert.ok(html.includes("housekeeper_keep") && html.includes("Device: 1") && html.includes("Entity: 1"));
  assert.ok(html.includes("data-jump-lf=\"inventory|label|housekeeper_keep\""));
  assert.ok(html.includes("not created"), "the other two labels are not created yet");
});

test("the grouped findings list indents the rows below a head, offers the device mark in the menu and counts every open finding", () => {
  const { el } = panel("en");
  const device = { object_type: "device", object_id: "d1", name: "Echo", status: "active" };
  const ent = id => ({ object_type: "entity", object_id: id, name: id, status: "unavailable", device_id: id === "sensor.c" ? null : "d1" });
  const f = (id, extra = {}) => ({ rule_id: "entity.state_unavailable", object_id: id, classification: "unavailable", confidence: 0.9, evidence: [], impact: "high", key: `k:${id}`, ...extra });
  el.data = { ...DATA, objects: [device, ent("sensor.a"), ent("sensor.b"), ent("sensor.c")], causes: [{ id: "device_down:d1", kind: "device_down", object_type: "device", object_id: "d1", name: "Echo", impact: "high", follower_count: 2 }],
    findings: [f("sensor.a", { cause_id: "device_down:d1" }), f("sensor.b", { cause_id: "device_down:d1" }), f("sensor.c")] };
  el.lvState("findings", "impact", "desc");
  el.folds = { "og:device:d1": true };
  const html = el.findingsView();
  assert.ok(/og lvl1[^]*finding-fold-gap/.test(html), "a row below a head keeps the room of the arrow");
  assert.ok(html.includes('class="menuitem" data-watch-mark="device:d1"') && !html.includes('class="btn" data-watch-mark'), "the mark on the device is an item of the row menu");
  assert.ok(!el.findingsTable([el.data.findings[2]]).includes("finding-fold-gap"), "without a fold no room is kept");
  el.findingStatus = ""; el.statusCount = () => 1;
  assert.ok(el.statusChips().includes(`Open (${el.findingTotal()})`) && el.findingTotal() === 3, "open counts every finding, the follow-ups too, as the list head does");
});

test("every finding stands below its object: a device gathers all kinds of its entities, one finding is named in the head", () => {
  const { el } = panel("en");
  const ent = (id, status = "unavailable") => ({ object_type: "entity", object_id: id, name: id, status, device_id: "avr" });
  const f = (id, extra = {}) => ({ rule_id: "entity.state_unavailable", object_id: id, classification: "unavailable", confidence: 0.75, ignored: false, impact: "medium", key: `k:${id}`, first_detected_at: "2026-10-01T00:00:00+00:00", ...extra });
  el.data = { ...DATA, causes: [], edges: [], objects: [{ object_type: "device", object_id: "avr", name: "Receiver" }, { object_type: "device", object_id: "car", name: "Audi" }, ent("sensor.a"), ent("sensor.b"), ent("sensor.on", "active"), ent("select.old", "orphaned"), { object_type: "entity", object_id: "lock.car", name: "Lock", device_id: "car", status: "orphaned" }],
    findings: [f("sensor.a"), f("sensor.b", { impact: "high", first_detected_at: "2026-10-10T00:00:00+00:00" }), f("select.old", { rule_id: "entity.not_provided", classification: "orphaned", confidence: 0.98, impact: "info" }), f("lock.car", { rule_id: "entity.not_provided", classification: "orphaned", confidence: 0.98, impact: "info" })] };
  el.lvState("findings", "impact", "desc");
  const html = el.findingsView();
  assert.ok(html.includes("2 of 3 entities without a value · Orphaned (1)") && html.includes("75–98 %") && html.includes("new: "), "summary, span of certainty, the newest beside the oldest");
  assert.ok(html.includes("Audi</strong><small>Lock: "), "a single finding is named in the head");
  assert.ok(html.indexOf("Receiver") < html.indexOf("Audi"), "the worst impact first");
  el.lv.findings.f.type = "entity"; el.lv.findings.q = "select.old";
  assert.ok(el.findingsView().includes("1 of 3 findings match the filter"));
});

test("an exception is added from the menu of a finding or the selection bar, with its object picked, above the findings list", async () => {
  const { el } = panel("en");
  const object = { object_type: "entity", object_id: "light.a", name: "Hall lamp", status: "unavailable" };
  const finding = { rule_id: "entity.state_unavailable", classification: "unavailable", key: "entity.state_unavailable|light.a|", object_id: "light.a", confidence: 0.75, impact: "medium", ignored: false };
  el.data = { ...DATA, objects: [object], edges: [], findings: [finding] };
  el.exc = { rules: [], areas: [], labels: [], integrations: [], domains: [], devices: [], entities: [] };
  const menu = el.rowMenu(finding);
  assert.ok(["fselStatus", "markSet", "excCreate", "fselLabel"].map(k => menu.indexOf(el.t(k))).every((at, i, all) => at > (i ? all[i - 1] : -1)), "the actions in the order of the bar");
  await el.openExceptionFor(["entity:light.a"]);
  assert.equal(el.excForm.picks.map(p => `${p.kind}:${p.id}`).join(), "entity:light.a");
  el.view = "findingsNav";
  assert.ok(el.findingsView().includes("data-exc-form"));
  assert.ok(el.findingsView().includes('data-exp-menu="findings"') && !el.findingsView().includes("data-export="), "the shared export button, no CSV and JSON chips");
});

test("the status of the selection is set in one form; an exception from a finding offers its device, area and integration", async () => {
  const { el } = panel("en");
  const sent = [];
  el._hass = { language: "en", callWS: async msg => { sent.push(msg); return {}; } };
  const finding = { rule_id: "entity.state_unavailable", classification: "unavailable", key: "k1", object_id: "light.a", confidence: 0.75, impact: "medium", ignored: false };
  el.data = { ...DATA, objects: [{ object_type: "entity", object_id: "light.a", name: "Hall lamp", device_id: "d1", platform: "hue" }, { object_type: "device", object_id: "d1", name: "Hue bridge", area_id: "hall", config_entry_ids: [] }], edges: [], findings: [finding] };
  el.findSel = new Set(["k1"]);
  el.bulk = { kind: "status", state: "ignore", reason: "", days: 90, markKind: "", error: "" };
  assert.ok(el.bulkForm().includes("data-bulk-kind"));
  await el.commitBulk();
  assert.equal(`${sent[0].kind}|${sent[0].days}`, "ignore|90");
  assert.ok(el.findingRowContent(el.data.findings[0]).subtitle.includes("Own status"), "the row says why it is hidden");
  el.exc = { rules: [], areas: [{ id: "hall", name: "Hall" }], labels: [], integrations: [{ id: "hue", name: "Philips Hue" }], domains: [], devices: [], entities: [] };
  await el.openExceptionFor(["entity:light.a"]);
  assert.equal(el.excForm.scopes.map(s => `${s.id}:${s.picks.map(p => p.id).join()}`).join(" "), "objects:light.a devices:d1 areas:hall integrations:hue");
});

test("the headline names what is urgent, the to-do card has the same groups, and both add up", () => {
  const { el } = panel("en");
  el.data = { ...DATA, regressions: [], criteria_alerts: [] };
  const items = [{ key: "outages", tone: "red", area: "findings", label: "actOutages", count: 5 }, { key: "critical", tone: "red", area: "findings", label: "actNewCritical", count: 6 }, { key: "stale", tone: "warn", area: "state", text: "Old scan", scan: true }, { key: "updates", tone: "warn", area: "care", text: "Updates" }];
  el.todoItems = () => items;
  assert.equal(el.statusHeadline(), "Outages (5) and New critical findings (6)");
  assert.ok(el.statusSubline(el.health()).includes("Plus 1 open and 1 in maintenance"));
  const card = el.todoCard();
  assert.ok(card.includes('data-todo="outages"') && card.includes("todogrp red") && card.includes("todogrp open") && card.includes('data-fold="todo_care"'), "every counted item is a row of its group");
  items.push({ key: "disk", tone: "red", area: "state", text: "Disk" });
  assert.equal(el.statusHeadline(), "Outages (5) and 2 more urgent items");
});

test("the reason tiles are grouped by their colour: orphaned is tidying up, not a fault", () => {
  const { el } = panel("en");
  const f = (key, classification) => ({ key, rule_id: "entity.x", object_id: key, classification, confidence: 0.9, ignored: false, impact: "low" });
  el.data = { ...DATA, objects: [], edges: [], causes: [], findings: [f("a", "orphaned"), f("b", "unavailable")] };
  el.series = null; el._seriesFor = el.data; el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || "";
  const html = el.findingsView(), tidy = html.indexOf(">Tidying up<"), faults = html.indexOf(">Faults<"), orphaned = html.indexOf(`>${el.statusLabel("orphaned")}<`);
  assert.ok(faults > 0 && tidy > faults && orphaned > tidy, "orphaned sits under tidying up, which follows the faults");
});

test("the findings page: outages are one reason, stale is a fault, a tile starts from a plain list and the head counts within it", () => {
  const { el } = panel("en");
  const f = (key, rule, classification, extra = {}) => ({ key, rule_id: rule, object_id: key, classification, confidence: 0.9, ignored: false, impact: "low", ...extra });
  el.data = { ...DATA, objects: [{ object_type: "entity", object_id: "s1", name: "Kitchen sensor", device_id: "d1", status: "unavailable" }, { object_type: "device", object_id: "d1", name: "Hub" }], edges: [], causes: [],
    findings: [f("d1", "device.down", "problem"), f("s1", "entity.state_unavailable", "unavailable"), f("s2", "entity.stale", "stale"), f("a1", "automation.blocked", "problem"), f("s3", "entity.state_unavailable", "unavailable")] };
  el.series = null; el._seriesFor = el.data; el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || "";
  assert.equal(el.findingReason(el.data.findings[0]), "outage", "a device that is down is an outage, not a problem");
  assert.equal(`${el.reasonTone("stale")}|${el.reasonLabel("problem")}`, "red|Automation impaired");
  el.lvState("findings", "impact", "desc").q = "kitchen";
  el.clearFindingFilters(); el.findingFilter = "unavailable";
  assert.equal(el.lv.findings.q, "", "a tile clears the search before it filters");
  el.lv.findings.q = "kitchen";
  assert.ok(el.findingsView().includes("1 of 2 findings"), "narrowed further, the head names the number of the active tile");
  el.lv.findings.q = "";
  el.journal = [{ plan_id: "p", status: "dry_run", created_at: new Date().toISOString(), objects: ["d1"] }];
  assert.ok(el.inWork(el.data.findings[1]), "a plan for a device puts the findings of its entities in work");
  el.journal = [{ plan_id: "p", status: "dry_run", created_at: new Date(Date.now() - 2 * 864e5).toISOString(), objects: ["d1"] }];
  assert.ok(!el.inWork(el.data.findings[0]), "a preview older than a day does not count");
});

test("the jump to new critical findings is a filter: outage heads without a matching finding stay away", () => {
  const { el } = panel("en");
  const f = (key, rule, classification, extra = {}) => ({ key, rule_id: rule, object_id: key.split("|")[1], classification, confidence: 0.9, ignored: false, impact: "high", ...extra });
  const down = f("device.down|d1|", "device.down", "problem", { cause_id: "device_down:d1" });
  const follower = f("entity.state_unavailable|s1|", "entity.state_unavailable", "unavailable", { cause_id: "device_down:d1" });
  const fresh = f("entity.missing_entity|a1|", "entity.missing_entity", "broken_reference");
  el.data = { ...DATA, objects: [{ object_type: "device", object_id: "d1", name: "Echo Office" }, { object_type: "entity", object_id: "s1", name: "Alarm", device_id: "d1" }], edges: [],
    causes: [{ id: "device_down:d1", kind: "device_down", object_type: "device", object_id: "d1", name: "Echo Office", impact: "high", follower_count: 1, total_followers: 1, finding_key: down.key, child_ids: [], consumers: {} }], findings: [down, follower, fresh] };
  el.series = null; el._seriesFor = el.data; el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || "";
  el.trend = { new_findings: { items: [{ ...fresh }] } };
  el.findingScanNew = true;
  const html = el.findingsView();
  assert.ok(!html.includes("Echo Office is down completely") && !html.includes("match the filter"), "no head of an outage that has nothing new");
  assert.ok(html.includes("1 of 3 findings"));
});

test("the vacation bar says why nothing is held back and offers no empty list", () => {
  const { el } = panel("en");
  el.data = { ...DATA, meta: { ...DATA.meta, vacation: { entity: "input_boolean.away", active: true, held: 0, rules: 2 } } };
  let bar = el.vacationBar();
  assert.ok(bar.includes("holds nothing back right now") && !bar.includes('data-vac-go="hidden"') && bar.includes('data-vac-go="rules"'));
  el.data.meta.vacation.rules = 0;
  bar = el.vacationBar();
  assert.ok(bar.includes("no rule for it") && bar.includes('data-vac-go="new"'));
  el.data.meta.vacation = { entity: "input_boolean.away", active: true, held: 3, rules: 1 };
  assert.ok(el.vacationBar().includes("3 findings held back") && el.vacationBar().includes('data-vac-go="hidden"'));
});

test("the outages row of the overview jumps to exactly the chains it counts, quiet outages left out", () => {
  const { el } = panel("en");
  const f = (key, rule, classification, extra = {}) => ({ key, rule_id: rule, object_id: key, classification, confidence: 0.9, ignored: false, impact: "high", ...extra });
  const cause = (id, impact) => ({ id: `device_down:${id}`, kind: "device_down", object_type: "device", object_id: id, name: id, impact, follower_count: 1, total_followers: 1, finding_key: `own_${id}`, child_ids: [], consumers: {} });
  el.data = { ...DATA, objects: [{ object_type: "device", object_id: "loud", name: "Loud" }, { object_type: "device", object_id: "calm", name: "Calm" }], edges: [], causes: [cause("loud", "high"), cause("calm", "low")],
    findings: [f("own_loud", "device.down", "problem", { cause_id: "device_down:loud" }), f("s1", "entity.state_unavailable", "unavailable", { cause_id: "device_down:loud" }),
      f("own_calm", "device.down", "problem", { cause_id: "device_down:calm", impact: "low" }), f("s2", "entity.state_unavailable", "unavailable", { cause_id: "device_down:calm", impact: "low" }), f("x", "entity.stale", "stale")] };
  el.series = null; el._seriesFor = el.data; el._corrRequested = true; el._corrKey = el.data.meta.scanned_at || "";
  assert.ok(el.todoCard().includes("data-jump-outages"), "the row carries its own filter, not an empty one");
  el.findingOutages = true;
  assert.equal(el.visibleFindings().map(x => x.key).sort().join(), "own_loud,s1");
  assert.ok(el.findingsView().includes("Outages from the overview (1)"));
});

test("a jump from the overview into the findings starts from the plain open list, then sets its own filter", () => {
  const { el, shadow } = panel("en");
  el.data = { ...DATA, findings: [{ key: "u1", rule_id: "automation.never_triggered", object_id: "automation.a", classification: "unused", confidence: 0.8, ignored: false }] };
  el.view = "overview"; el.render();
  el.findingStatus = "hidden"; el.findingAfter = true;
  const st = el.lvState("findings", "impact", "desc"); st.q = "kitchen"; st.f.area = "Kitchen";
  assert.ok(shadow.innerHTML.includes('data-jump="findingsNav" data-filter="unused"'), "the overview offers the jump");
  const jump = { dataset: { jump: "findingsNav", filter: "unused" } };
  shadow.querySelectorAll = selector => (selector === "[data-jump]" ? [jump] : []);
  el.bind();
  jump.onclick();
  assert.equal(`${el.view}|${el.findingStatus}|${el.findingAfter}|${el.findingFilter}|${el.lv.findings.q}|${Object.keys(el.lv.findings.f).length}`, "findingsNav||false|unused||0");
});
