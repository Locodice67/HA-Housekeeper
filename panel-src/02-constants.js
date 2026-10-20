const ICONS = {
  service: "mdi:cog-off-outline", entity: "mdi:shape-outline", device: "mdi:devices", config_entry: "mdi:puzzle-outline", integration: "mdi:puzzle",
  area: "mdi:floor-plan", automation: "mdi:robot-outline", floor: "mdi:layers-outline",
  label: "mdi:label-outline", script: "mdi:script-text-outline", scene: "mdi:palette-outline", dashboard: "mdi:view-dashboard-outline", app: "mdi:package-variant-closed",
};

const REMOVAL_KINDS = ["remove_entity", "remove_device", "forget_device"];
// Kinds that get a Home Assistant backup first (as in the backend).
const BACKUP_KINDS = ["remove_entity", "remove_device", "forget_device", "replace_references", "rename_entity", "migrate_meter", "purge_statistics", "trim_history", "delete_automation", "refactor_automation", "repair_counter", "repair_range"];
// Deleting recorder rows: cannot be undone, only the backup brings them back.
const PURGE_KINDS = ["purge_statistics", "trim_history", "delete_backup"];
// Reasons that mean "all is well, there is nothing to do" and not "Housekeeper may not".
const NOTHING_REASONS = ["nothing_found", "nothing_to_do"];
// A plan removing this share of all entities or devices (or more) gets a warning before it is confirmed.
const LARGE_REMOVAL_SHARE = 0.5;
const REPAIR_KINDS = ["repair_counter", "repair_range"];
const IMPACT_RANK = { none: 0, info: 1, low: 2, medium: 3, high: 4 };
const BACKUP_FAILURES = ["backup_failed", "backup_small_failed", "backup_unavailable", "no_backup_agent", "backup_unverified"];
const DEVICE_KINDS = ["disable_device", "remove_device", "forget_device"];
// What a finished action says it did; kinds not listed just say "done".
const DONE_RESULTS = Object.fromEntries([
  ...REMOVAL_KINDS.map(kind => [kind, "removed"]), ...REPAIR_KINDS.map(kind => [kind, "repaired"]), ...PURGE_KINDS.map(kind => [kind, "purged"]),
  ["delete_automation", "purged"], ["replace_references", "replaced"], ["refactor_automation", "refactored"], ["migrate_meter", "migrated"],
  ["add_label", "labeled"], ["set_entity_state", "entity_state"], ["set_area", "area"], ["rename_entity", "renamed"],
]);

const MAX_PLAN_ACTIONS = 200; // as MAX_ACTIONS in cleanup.py: more entries do not fit into one plan
const PREFS_KEY = "ha_housekeeper.prefs";
const DEFAULT_PREFS = { size: "normal", mode: "auto", scheme: "standard", density: "normal", motion: "auto", pageSize: 20, startView: "overview", graphMode: "list", language: "auto" };
const USER_DATA_KEY = "ha_housekeeper";
const OPTION_LIMITS = { outage_info_minutes: [5, 1440], outage_low_hours: [1, 720], outage_medium_hours: [2, 2160], outage_high_hours: [3, 8760], unused_automation_days: [0, 3650], scan_interval_hours: [0, 720], low_battery_percent: [1, 100], stale_hours: [0, 8760], history_days: [1, 365], watch_hours: [0, 168] };
// Text scale only; spacing and icons stay put. Normal is a bit larger than the original 1.0.
const SIZES = { small: 1, normal: 1.1, large: 1.25 };
// The dependency graph shows this many nodes per side at first; "more" adds another step.
const GRAPH_NODE_STEP = 40;
const GRAPH_GROUP_MIN = 5; // leaf nodes of one type on one node from which the graph folds them into one
// Scan thresholds as cards: option key, title, explanation, unit and default (the defaults of const.py).
const OPTION_FIELDS = [
  ["outage_info_minutes", "optOutageInfoTitle", "optOutageInfoHint", "unitMinutes", 15],
  ["outage_low_hours", "optOutageLowTitle", "optOutageLowHint", "unitHours", 1],
  ["outage_medium_hours", "optOutageMediumTitle", "optOutageMediumHint", "unitHours", 24],
  ["outage_high_hours", "optOutageHighTitle", "optOutageHighHint", "unitHours", 168],
  ["unused_automation_days", "optUnusedAutomationTitle", "optUnusedAutomationHint", "unitDays", 90],
  ["scan_interval_hours", "optScanIntervalTitle", "optScanIntervalHint", "unitHours", 6],
  ["low_battery_percent", "optLowBatteryTitle", "optLowBatteryHint", "unitPercent", 20],
  ["stale_hours", "optStaleTitle", "optStaleHint", "unitHours", 48],
  ["history_days", "optHistoryDaysTitle", "optHistoryDaysHint", "unitDays", 30],
  ["watch_hours", "optWatchTitle", "optWatchHint", "unitHours", 24],
];
const OUTAGE_OPTION_KEYS = ["outage_info_minutes", "outage_low_hours", "outage_medium_hours", "outage_high_hours"];
const START_VIEWS = ["overview", "findingsNav", "inventory", "changes", "batteries"];
const SCAN_WATCH_MS = 60000;
const REPO_URL = "https://github.com/bertel2020/HA-Housekeeper";
// Palettes for explicit light/dark; taken from the Zeitarchiv app's design system (app.css).
// "standard" keeps the Home Assistant accent and, in automatic mode, the Home Assistant theme itself.
const SCHEMES = {
  standard: {
    light: { accent: "var(--primary-color,#0789cf)", bg: "#f3f3f3", surface: "#ffffff", soft: "#ececec", text: "#202020", muted: "#5e5e5e", border: "#e6e6e6", positive: "#2e7d32", warning: "#b77a00", danger: "#b30532" },
    dark: { accent: "var(--primary-color,#37c8fd)", on: "#141414", bg: "#141414", surface: "#202020", soft: "#363636", text: "#f3f3f3", muted: "#cccccc", border: "#4a4a4a", positive: "#66bb6a", warning: "#ffd166", danger: "#fd8f90" },
  },
  housekeeper: {
    light: { accent: "#0c6b5d", bg: "#f5f6f1", surface: "#ffffff", soft: "#eef1e9", text: "#131c17", muted: "#4b584e", border: "#e1e6db", positive: "#2e7d46", warning: "#8a6d1e", danger: "#a23b36" },
    dark: { accent: "#4fc3ae", on: "#0e1512", bg: "#0e1512", surface: "#171f1b", soft: "#1e2822", text: "#e8ece4", muted: "#9fac9b", border: "#2a362f", positive: "#6fcb88", warning: "#d4b65e", danger: "#e28a85" },
  },
  modern: {
    light: { accent: "#3157c8", bg: "#f6f7fb", surface: "#ffffff", soft: "#eef1f6", text: "#172033", muted: "#566176", border: "#d9dee8", positive: "#1f8a54", warning: "#a96700", danger: "#c83737" },
    dark: { accent: "#7ea1ff", on: "#0f1218", bg: "#0f1218", surface: "#171c25", soft: "#222936", text: "#f3f6fb", muted: "#b3bdcc", border: "#303949", positive: "#5fcb89", warning: "#e6a15a", danger: "#f07a7a" },
  },
  aurora: {
    light: { accent: "#7a3ff2", bg: "#f7f5fb", surface: "#ffffff", soft: "#f0ecf8", text: "#1c1730", muted: "#5d5675", border: "#e1dbef", positive: "#1f8a5b", warning: "#a45d00", danger: "#c42a4f" },
    dark: { accent: "#b79cff", on: "#130f1d", bg: "#130f1d", surface: "#1c1728", soft: "#272037", text: "#f4f1fb", muted: "#b9b1cc", border: "#362d4a", positive: "#62d19a", warning: "#f0b35c", danger: "#ff8aa3" },
  },
  honey: {
    light: { accent: "#a16207", bg: "#fbf8ef", surface: "#ffffff", soft: "#f4eedb", text: "#261f0f", muted: "#6b5f3f", border: "#e9e0c4", positive: "#2f7d46", warning: "#b8470f", danger: "#b3261e" },
    dark: { accent: "#f5c542", on: "#16130a", bg: "#16130a", surface: "#201c10", soft: "#2d2717", text: "#faf5e4", muted: "#c9bd98", border: "#403819", positive: "#7fd68f", warning: "#ff9f5a", danger: "#ff8f87" },
  },
  lagoon: {
    light: { accent: "#0b7a8f", bg: "#f2f8fa", surface: "#ffffff", soft: "#e5f1f4", text: "#0f2229", muted: "#4a6770", border: "#d3e5ea", positive: "#1f8a54", warning: "#9a6200", danger: "#c23b3b" },
    dark: { accent: "#4fd8ee", on: "#0b1619", bg: "#0b1619", surface: "#122126", soft: "#1a2f36", text: "#e8f6f9", muted: "#9fc0c8", border: "#25404a", positive: "#62d19a", warning: "#f0b35c", danger: "#ff8a8a" },
  },
  emerald: {
    light: { accent: "#047857", bg: "#f1f8f5", surface: "#ffffff", soft: "#e2f1ea", text: "#0b1f18", muted: "#46665a", border: "#cfe6dc", positive: "#3a8f2f", warning: "#9a6200", danger: "#c0392b" },
    dark: { accent: "#34d399", on: "#07140f", bg: "#07140f", surface: "#0e1f18", soft: "#162d23", text: "#e6f7ef", muted: "#98c2b0", border: "#1f3b2f", positive: "#86d96a", warning: "#f0b35c", danger: "#ff8a80" },
  },
  frost: {
    light: { accent: "#3b6a8f", bg: "#f3f6f8", surface: "#ffffff", soft: "#e6ecf0", text: "#14202a", muted: "#51636f", border: "#d6dfe5", positive: "#2a8a5a", warning: "#9a6200", danger: "#c23b3b" },
    dark: { accent: "#8cc1e8", on: "#0d1318", bg: "#0d1318", surface: "#151d24", soft: "#1e2a33", text: "#eaf1f6", muted: "#a3b5c2", border: "#2a3a46", positive: "#62d19a", warning: "#f0b35c", danger: "#ff8a8a" },
  },
  midnight: {
    light: { accent: "#0b4f9c", bg: "#f2f6fb", surface: "#ffffff", soft: "#e4ecf6", text: "#0c1a2e", muted: "#485a74", border: "#d2deec", positive: "#1f8a54", warning: "#9a6200", danger: "#c23b3b" },
    dark: { accent: "#5aa9ff", on: "#060c18", bg: "#060c18", surface: "#0d1626", soft: "#15233a", text: "#e9f1fc", muted: "#9db2cf", border: "#1f3250", positive: "#62d19a", warning: "#f0b35c", danger: "#ff8a8a" },
  },
  olive: {
    light: { accent: "#5f6b1f", bg: "#f7f7ee", surface: "#ffffff", soft: "#ecedd9", text: "#1c1f0c", muted: "#5a5e3a", border: "#dee0c4", positive: "#2f7d46", warning: "#9a6200", danger: "#b3261e" },
    dark: { accent: "#c4cf5a", on: "#12140a", bg: "#12140a", surface: "#1b1e10", soft: "#272b17", text: "#f3f5e2", muted: "#b8bd90", border: "#353a1f", positive: "#7fd68f", warning: "#f0b35c", danger: "#ff8f87" },
  },
};
// Earlier builds saved other scheme names.
const SCHEME_ALIASES = { teal: "housekeeper", amber: "housekeeper", sage: "housekeeper", zeitarchiv: "housekeeper", indigo: "modern" };

// Helpers: config-entry domains (inventory type config_entry) and entity platforms (inventory type entity).
const HELPER_DOMAINS = new Set(["template", "derivative", "integration", "min_max", "threshold", "utility_meter", "statistics", "trend", "filter", "history_stats", "switch_as_x", "compensation", "generic_hygrostat", "generic_thermostat", "bayesian", "mold_indicator", "group", "random", "tod"]);
const HELPER_PLATFORMS = new Set(["input_boolean", "input_button", "input_datetime", "input_number", "input_select", "input_text", "counter", "timer", "schedule", "group"]);
const USAGE_RELATIONS = ["TRIGGERS_ON", "USES_AS_CONDITION", "TARGETS", "REFERENCES", "SHOWS", "INCLUDES"];

// Pause after the last key stroke in a search field before the list is rebuilt.
const SEARCH_DEBOUNCE_MS = 150;

// What can carry a label: everything with an entry in the entity registry.
// Objects whose page keeps reading on the overview and puts everything that changes something under the tab "Actions".
const MARK_TYPES = ["entity", "device", "config_entry", "app"];
const ACTION_TYPES = ["entity", "device", "config_entry", "automation", "script", "scene"];
// Objects whose overview sums up what is known in groups ("Known about …"); scenes keep the facts card.
const KNOWN_TYPES = ["entity", "device", "config_entry", "automation", "script"];
// The reasons on the findings page: what needs a look first, and what is tidying up. Anything else counts as urgent.
const FINDING_URGENT = ["problem", "unavailable", "outage", "broken_reference", "run_error", "recurring"];
const FINDING_TIDY = ["unknown", "unused", "stale", "possible_duplicate"];
// The state of the house: what each object with a finding takes off, by its worst level (as in history.py).
const HEALTH_WEIGHTS = { high: 2, medium: 1, low: 0.5, info: 0 };
const LABEL_TYPES = ["entity", "automation", "script", "scene"];
// One icon per action, the same in the selection bar and in the menu of a row.
const FSEL_ICONS = { known: "mdi:bookmark-check-outline", snoozed: "mdi:clock-outline", hide: "mdi:eye-off-outline", mark: "mdi:bookmark-plus-outline", exc: "mdi:filter-remove-outline", label: "mdi:label-outline" };

const NAV = [
  ["overview", "mdi:view-dashboard-outline"],
  ["findingsNav", "mdi:alert-outline"],
  ["changes", "mdi:compare-horizontal"],
  ["inventory", "mdi:database-outline"],
  ["components", "mdi:puzzle-outline"],
  ["graph", "mdi:source-fork"],
  ["cleanup", "mdi:broom"],
  ["repair", "mdi:tools"],
  ["journal", "mdi:clipboard-text-clock-outline"],
  ["storage", "mdi:harddisk"],
  ["dataflow", "mdi:transit-connection-variant"],
  ["secrets", "mdi:key-variant"],
  ["maintenance", "mdi:wrench-clock"],
  ["exposure", "mdi:shield-search"],
  ["policies", "mdi:clipboard-check-outline"],
  ["reliability", "mdi:chart-timeline-variant"],
  ["monitor", "mdi:home-heart"],
  ["runs", "mdi:robot-outline"],
  ["recorder", "mdi:database-clock-outline"],
  ["batteries", "mdi:battery-alert-variant-outline"],
  ["reminders", "mdi:calendar-clock-outline"],
  ["settings", "mdi:cog-outline"],
];

// The sidebar groups every view but "settings", which stands alone at the foot.
const NAV_GROUPS = [
  ["navGroupActions", ["overview", "findingsNav"]],
  ["navGroupClean", ["cleanup", "repair", "journal"]],
  ["navGroupMaintain", ["maintenance", "batteries", "reminders", "policies"]],
  ["navGroupOperation", ["monitor", "reliability", "runs", "recorder", "storage"]],
  ["navGroupSecurity", ["exposure", "dataflow", "secrets"]],
  ["navGroupExplore", ["inventory", "components", "graph", "changes"]],
];
const BUSY_RETRIES = 12, BUSY_WAIT_MS = 8000; // another recorder query holds the lock: ask again by itself
const NAV_ICONS = { ...Object.fromEntries(NAV), unreferenced: "mdi:link-variant-off" };

// Cleanup removes what is no longer needed; everything else a plan can do repairs something that stays.
const CLEANUP_KINDS = ["disable_entity", "remove_entity", "disable_device", "remove_device", "forget_device"];
const REPAIR_TASKS = [
  ["repair_counter", "mdi:chart-line", "repairTaskCounter", "repairTaskCounterHint"],
  ["migrate_meter", "mdi:gauge", "repairTaskMeter", "repairTaskMeterHint"],
  ["replace_references", "mdi:swap-horizontal", "repairTaskReplace", "repairTaskReplaceHint"],
  ["exchange_device", "mdi:devices", "repairTaskExchange", "repairTaskExchangeHint"],
];
// The view in which the person finishes a plan of this kind.
const viewForKind = kind => (["repair_counter", "repair_range", "migrate_meter", "replace_references", "exchange_device", "refactor_automation"].includes(kind) ? "repair" : "cleanup");

// IBM Plex, shipped with the integration. A shadow root cannot declare fonts, so the rules go into the document once.
const FONT_BASE = "/ha_housekeeper/fonts/";
const FONT_CSS = `@font-face{font-family:"IBM Plex Sans";font-weight:400 700;font-display:swap;src:url(${FONT_BASE}ibm-plex-sans-latin.woff2) format("woff2");unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD}@font-face{font-family:"IBM Plex Sans";font-weight:400 700;font-display:swap;src:url(${FONT_BASE}ibm-plex-sans-latin-ext.woff2) format("woff2");unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF}@font-face{font-family:"IBM Plex Mono";font-weight:400;font-display:swap;src:url(${FONT_BASE}ibm-plex-mono-400-latin.woff2) format("woff2");unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD}@font-face{font-family:"IBM Plex Mono";font-weight:500;font-display:swap;src:url(${FONT_BASE}ibm-plex-mono-500-latin.woff2) format("woff2");unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD}`;

const STATUS_TONE = {
  active: "ok", orphaned: "warn", unavailable: "red", problem: "red", broken_reference: "red",
  disabled: "mute", stopped: "mute", empty: "mute", unknown: "violet", ignored: "mute", possible_duplicate: "violet", unused: "mute", stale: "warn",
};

// Finding classes that call for action when they are new.
// The findings that belong to a cause itself (an integration, a device, an app); the others are its follow-up findings.
const CAUSE_OWN_RULES = ["config_entry.not_loaded", "config_entry.reauth", "device.down", "app.stopped_in_use"];
// The findings of an outage are quiet (info, low) at first and loud from medium on; quiet ones stay on the findings page only.
const OUTAGE_RULES = ["entity.state_unavailable", "entity.state_unknown", "device.down", "config_entry.not_loaded", "app.stopped_in_use"];
const CRITICAL_CLASSES = ["broken_reference", "unavailable", "problem"];

// Object types the housekeeping status is calculated from.
const HEALTH_TYPES = ["entity", "automation", "script", "scene", "config_entry", "device"];

// One CSV cell, quoted. Text a spreadsheet would run as a formula (leading =, +, -, @) gets a leading
// apostrophe; numbers, also negative ones as text such as "-3.5", stay numbers.
const csvCell = v => {
  let t = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(t) && !/^[+-]?\d+([.,]\d+)?([eE][+-]?\d+)?$/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
};
// Pages whose subtitle only explains what the page does or does not do; it sits behind an (i) after the title.
// Pages whose subtitle stays visible under the title; the long text sits behind the (i).
const VIEW_HINT = { storage: "sysHint", dataflow: "accHint", secrets: "secHint", reliability: "relHint", exposure: "expoHint", policies: "polHint", maintenance: "maintHint", recorder: "recorderHint" };
const INFO_SUB_VIEWS = ["exposure", "maintenance", "repair", "policies", "recorder", "reliability", "storage", "dataflow", "secrets", "components"];
