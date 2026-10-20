// The Batteries view as one table: level, type and forecast side by side, and the need of the next 30 days above it.
// The forecast comes from ha_housekeeper/battery_trend (loaded in the background, 53-battery-care.js); a battery without
// one still has its row. Mixed into the panel in 99-register.js.
const BATTERY_NEED_DAYS = 30;
const BATTERY_SOON_DAYS = 14;
const BATTERY_FAR_DAYS = 90;
const BATTERY_GROUP_DAYS = 14;

Object.assign(TEXT.de, {
  btColName: "Gerät", btColArea: "Bereich", btColType: "Typ", btColLevel: "Stand", btColSlope: "Verbrauch", btColLeft: "Leer in", btColAct: "Aktion", btColDate: "Datum", btTypeChange: "Typ ändern", btLevelOk: "in Ordnung",
  btSlopeDay: "{n} %/Tag", btVoltDay: "{n} V/Tag", btSlopeStable: "stabil", btLeftLow: "unter Grenze", btLeftDays: "{n} Tage", btLeftFar: "> {n} Tage", btLeftStable: "nicht absehbar",
  btFilterSoon: "Bald leer", btFilterUntyped: "Ohne Typ", btAllTypes: "Alle Typen",
  needNone: "Keine Batterie ist unter ihrer Grenze oder erreicht sie laut Prognose in den nächsten 30 Tagen.", needUntyped: "ohne Typ", needUntypedHint: "Typ in der Tabelle setzen", needNow: "Jetzt niedrig",
  btTableNote: "Prognose nur bis 90 Tage, aus den letzten fünf Wochen: eine Schätzung, keine Zusage. Ohne Prognose: {unknown} (zu wenige Tage oder stabil). Nach einem Wechsel zählt nur der Verlauf danach.",
  btFarMore: "{n} halten laut Prognose länger als 90 Tage.",
  fcTitle: "Wann welche Batterie leer ist", fcHint: "Was du in den nächsten 30 Tagen brauchst und wann die Batterien voraussichtlich die Grenze erreichen (bis 90 Tage, aus den letzten fünf Wochen). Eine Schätzung, keine Zusage.",
  fcWindow: "In {from} bis {to} Tagen", fcTogether: "Gemeinsam wechseln", 
});
Object.assign(TEXT.en, {
  btColName: "Device", btColArea: "Area", btColType: "Type", btColLevel: "Level", btColSlope: "Drain", btColLeft: "Empty in", btColAct: "Action", btColDate: "Date", btTypeChange: "Change type", btLevelOk: "ok",
  btSlopeDay: "{n} %/day", btVoltDay: "{n} V/day", btSlopeStable: "stable", btLeftLow: "below limit", btLeftDays: "{n} days", btLeftFar: "> {n} days", btLeftStable: "no forecast",
  btFilterSoon: "Empty soon", btFilterUntyped: "No type", btAllTypes: "All types",
  needNone: "No battery is below its limit or forecast to reach it within 30 days.", needUntyped: "no type", needUntypedHint: "set the type in the table", needNow: "Low now",
  btTableNote: "Forecast only up to 90 days, from the last five weeks: an estimate, not a promise. No forecast for {unknown} (too few days or stable). After a change only the time since counts.",
  btFarMore: "{n} last longer than 90 days by the forecast.",
  fcTitle: "When which battery runs out", fcHint: "What you need in the next 30 days and when the batteries will probably reach the limit (up to 90 days, from the last five weeks). An estimate, not a promise.",
  fcWindow: "In {from} to {to} days", fcTogether: "Change them together", 
});

class BatteryTableMixin {
  // The forecast of one row: from the percent trend, or the one of a battery that reports volts.
  batteryForecast(row) {
    if (row.volt) return { state: row.volt.state, days: row.volt.days_left, slope: row.volt.slope, unit: "V" };
    const f = (this.batteryTrend?.rows || []).find(r => r.entity_id === row.item.object_id);
    return f ? { state: f.state, days: f.days_left, slope: f.slope, unit: "%" } : null;
  }

  // The battery type of a row: yours, or for volts the guess from the voltage.
  batteryTypeOf(row) { return this.batteryTrend?.types?.[row.item.object_id] || ""; }

  // Rows with the forecast joined on, for the table, the filters and the sorting.
  batteryTableRows() {
    return [...this.batteryRows(), ...this.batteryVoltRows()].map(row => {
      const fc = this.batteryForecast(row);
      return { ...row, fc, type: this.batteryTypeOf(row), days: row.low ? 0 : fc?.state === "falling" ? fc.days : null };
    });
  }

  batteryTableSorts() {
    const left = r => (r.low ? 0 : r.days ?? 1e5) * 1000 + (r.level ?? 999) / 1000 + (r.volt ? 0.5 : 0);
    return [
      { key: "left", label: "btColLeft", dir: "asc", get: left },
      { key: "level", label: "btColLevel", dir: "asc", get: r => (r.low ? 0 : 1e6) + (r.volt ? 1000 : 0) + (r.level ?? -1) },
      { key: "slope", label: "btColSlope", dir: "asc", get: r => r.fc && r.fc.slope !== null && r.fc.slope !== undefined ? r.fc.slope : 1e6 },
      { key: "name", label: "btColName", dir: "asc", get: r => this.batteryName(r.item).title },
      { key: "area", label: "btColArea", dir: "asc", get: r => this.areaName(r.item) },
      { key: "type", label: "btColType", dir: "asc", get: r => r.type || "~" },
    ];
  }

  batteryLevelCell(row, limit) {
    const { item, level, low, volt } = row;
    if (row.unavailable) return `<span class="pill warn" title="${this.esc(this.t("batteryUnavailableSub"))}">${this.t("batteryUnavailableShort")}</span>`;
    if (volt && volt.percent !== undefined) {
      const tone = low ? (volt.percent <= limit / 2 ? "red" : "amber") : volt.percent <= limit * 2 ? "amber" : "green";
      return `<div class="lvl"><div class="bar"><i style="width:${Math.max(2, Math.min(100, volt.percent))}%;background:var(--hk-${tone})"></i></div><span class="lvlnum ${low ? "red" : ""}">${volt.percent} %<small>${this.esc(this.voltNum(level))}</small></span></div>`;
    }
    if (volt) return `<span class="${low ? "red" : ""}">${this.esc(this.voltNum(level))}</span>`;
    if (level === null || level === undefined) return `<span class="pill ${low ? "red" : "mute"}">${this.t(low ? "batteryLow" : "btLevelOk")}</span>`;
    const tone = low ? (level <= limit / 2 ? "red" : "amber") : level <= limit * 2 ? "amber" : "green";
    const width = Math.max(2, Math.min(100, level));
    return `<div class="lvl"><div class="bar"><i style="width:${width}%;background:var(--hk-${tone})"></i></div><span class="lvlnum ${low ? "red" : ""}">${this.esc(`${Math.round(level)} ${item.unit || "%"}`)}</span></div>`;
  }

  batterySlopeCell(row) {
    const fc = row.fc;
    if (!fc || fc.slope === null || fc.slope === undefined) return `<span class="muted">—</span>`;
    if (fc.state === "stable") return `<span class="muted">${this.t("btSlopeStable")}</span>`;
    const digits = fc.unit === "V" ? 3 : 1, n = new Intl.NumberFormat(this.lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(fc.slope).replace("-", "−");
    return this.t(fc.unit === "V" ? "btVoltDay" : "btSlopeDay", { n });
  }

  batteryLeftCell(row) {
    const fc = row.fc;
    if (row.low) return `<b class="red">${this.t("btLeftLow")}</b>`;
    if (!fc) return `<span class="muted">—</span>`;
    if (fc.state === "falling") return `<b class="${fc.days <= BATTERY_SOON_DAYS ? "red" : fc.days <= BATTERY_NEED_DAYS ? "amber" : ""}">${this.t("btLeftDays", { n: fc.days })}</b>`;
    if (fc.state === "far") return `<span class="muted">${this.t("btLeftFar", { n: BATTERY_FAR_DAYS })}</span>`;
    return `<span class="muted">${this.t("btLeftStable")}</span>`;
  }

  batteryTypeCell(row) {
    const id = row.item.object_id;
    if (this.btEdit === id) return this.batteryTypeControls(id);
    if (row.type) return `<span class="btctl"><span class="pill">${this.esc(row.type)}</span><button class="btn quiet iconbtn" data-bt-type="${this.esc(id)}" title="${this.esc(this.t("btTypeChange"))}" aria-label="${this.esc(this.t("btTypeLabel", { name: this.batteryName(row.item).title }))}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button></span>`;
    if (row.volt) return `<span class="muted" title="${this.esc(this.t("bvLine", { now: this.voltNum(row.level), kind: this.t(`bvType_${row.volt.type}`), limit: this.voltNum(row.volt.limit) }))}">${this.esc(this.t(`bvType_${row.volt.type}`).split(" (")[0])}</span><button class="btn quiet iconbtn" data-bt-type="${this.esc(id)}" title="${this.t("btTypeChange")}" aria-label="${this.t("btTypeChange")}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>`;
    return `<button class="btn quiet miss" data-bt-type="${this.esc(id)}" title="${this.esc(this.t("btTypeChange"))}">${this.t("btTypeNone")}<ha-icon icon="mdi:pencil-outline"></ha-icon></button>`;
  }

  // The table: one row per battery. A row opens the device; the buttons inside it do not (90-panel.js ignores their clicks).
  batteryTable(rows) {
    const limit = this.data.meta.low_battery_percent ?? 20;
    this.lvState("batteries", "left", "asc");
    const pg = this.paginate(`batteries-${this.batteryFilter}`, rows);
    const columns = [
      { key: "name", label: "btColName", dir: "asc", cell: r => { const n = this.batteryName(r.item); return this.nameCell(n.title, n.entity || r.item.object_id); } },
      { key: "area", label: "btColArea", dir: "asc", cell: r => this.esc(this.areaName(r.item) || "—") },
      { key: "type", label: "btColType", dir: "asc", cell: r => this.batteryTypeCell(r) },
      { key: "level", label: "btColLevel", dir: "asc", cell: r => this.batteryLevelCell(r, limit) },
      { key: "slope", label: "btColSlope", dir: "asc", cell: r => this.batterySlopeCell(r) },
      { key: "left", label: "btColLeft", dir: "asc", cell: r => this.batteryLeftCell(r) },
      { key: "act", label: "btColAct", sortable: false, cell: r => `${this.batteryKindControl(r.item)}${this.batteryKindForm(r.item)}` },
    ];
    const table = this.listTable("batteries", columns, pg.rows, { cls: "batt", rowAttrs: r => `data-object="${this.esc(this.objectKey(r.item))}" tabindex="0" role="button" aria-label="${this.esc(this.batteryName(r.item).title)}"` });
    return `${table}${pg.footer}`;
  }

  // Include the current low state even when there is not enough recorder history for a forecast.
  batteryNeedRows() {
    const b = this.batteryTrend;
    const byId = new Map([...(b?.rows || []), ...(b?.voltage?.rows || [])].map(r => [r.entity_id, r]));
    for (const row of this.batteryRows()) {
      if (!row.low) continue;
      const id = row.item.object_id, forecast = byId.get(id) || {};
      byId.set(id, { ...forecast, entity_id: id, name: row.item.name, level: row.level, state: "low", days_left: 0 });
    }
    return [...byId.values()].filter(r => r.state === "low" || (Number.isFinite(r.days_left) && r.days_left <= BATTERY_NEED_DAYS))
      .sort((x, y) => (x.state === "low" ? -1 : x.days_left) - (y.state === "low" ? -1 : y.days_left) || String(x.name || "").localeCompare(String(y.name || "")));
  }

  // When which battery runs out: how many of which cell to buy in the next 30 days (tiles of one size), then the batteries
  // in folds, the low ones first and then a fortnight each up to 90 days, the nearest open.
  batteryNeed(rows = this.batteryTableRows()) {
    const b = this.batteryTrend;
    const head = `<div class="panelhead"><div><h2>${this.t("fcTitle")}</h2><p>${this.t("fcHint")}</p></div></div>`;
    if (this.batteryTrendError) return `<div class="panel">${this.notice("err", this.batteryTrendError)}</div>`;
    if (!b) return `<div class="panel">${head}${this.skeleton("btLoading")}</div>`;
    if (b.busy) return `<div class="panel"><p class="factnote">${this.t("relBusy")}</p></div>`;
    const soon = this.batteryNeedRows();
    const counts = new Map();
    let untyped = 0;
    for (const r of soon) {
      const type = b.types?.[r.entity_id];
      if (!type) { untyped++; continue; }
      const match = /^(\d+)\s*[×x]\s*(.+)$/i.exec(type);
      const [n, name] = match ? [Number(match[1]), match[2].trim()] : [1, type];
      counts.set(name, (counts.get(name) || 0) + n);
    }
    const tile = (count, name, cls = "") => `<div class="needtile ${cls}"><b>${this.esc(count)}</b><span>${this.esc(name)}</span></div>`;
    const tiles = [...counts].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([name, n]) => tile(`${this.formatNumber(n)}×`, name));
    if (untyped) tiles.push(tile(this.formatNumber(untyped), `${this.t("needUntyped")} · ${this.t("needUntypedHint")}`, "miss"));
    const slots = new Map();
    for (const r of rows) {
      if (r.low || r.days === null || r.days === undefined || r.days > BATTERY_FAR_DAYS) continue;
      const slot = Math.floor(r.days / BATTERY_GROUP_DAYS);
      slots.set(slot, [...(slots.get(slot) || []), r]);
    }
    const byDays = (x, y) => x.days - y.days || this.batteryName(x.item).title.localeCompare(this.batteryName(y.item).title);
    const windows = [];
    const now = rows.filter(r => r.low).sort(byDays);
    if (now.length) windows.push({ id: "bt_now", tone: "red", title: this.t("needNow"), list: now });
    for (const [slot, list] of [...slots].sort((x, y) => x[0] - y[0])) {
      const from = slot * BATTERY_GROUP_DAYS, to = Math.min(from + BATTERY_GROUP_DAYS - 1, BATTERY_FAR_DAYS);
      windows.push({ id: `bt_${from}`, tone: from <= BATTERY_SOON_DAYS - 1 ? "red" : from <= 41 ? "warn" : "ok", title: this.t("fcWindow", { from, to }), sub: list.length > 1 ? this.t("fcTogether") : "", list: list.sort(byDays) });
    }
    this.lvState("batwin", "left", "asc");
    const columns = [
      { key: "name", label: "btColName", sortable: false, cell: r => { const n = this.batteryName(r.item); return this.nameCell(n.title, n.entity || r.item.object_id); } },
      { key: "area", label: "btColArea", sortable: false, cell: r => this.esc(this.areaName(r.item) || "—") },
      { key: "type", label: "btColType", sortable: false, cell: r => (r.type ? `<span class="pill">${this.esc(r.type)}</span>` : `<span class="muted">${this.t("btTypeNone")}</span>`) },
      { key: "level", label: "btColLevel", sortable: false, cell: r => this.batteryLevelCell(r, this.data.meta.low_battery_percent ?? 20) },
      { key: "date", label: "btColDate", sortable: false, cell: r => (r.low ? "—" : this.esc(this.formatDate(new Date(Date.now() + r.days * 86400000).toISOString()).split(",")[0])) },
      { key: "left", label: "btColLeft", sortable: false, cell: r => this.batteryLeftCell(r) },
    ];
    const rowAttrs = r => `data-object="${this.esc(this.objectKey(r.item))}" tabindex="0" role="button" aria-label="${this.esc(this.batteryName(r.item).title)}"`;
    const folds = windows.map((w, index) => this.fold(w.id, { tone: w.tone, title: w.title, sub: w.sub || "", pill: this.formatNumber(w.list.length) }, this.listTable("batwin", columns, w.list, { cls: "batt", rowAttrs }), index === 0)).join("");
    const body = tiles.length || folds ? `${tiles.length ? `<div class="needgrid">${tiles.join("")}</div>` : ""}${folds}` : `<div class="emptymsg"><ha-icon icon="mdi:battery-check-outline"></ha-icon>${this.t("needNone")}</div>`;
    return `<div class="panel">${head}${this.batterySuggestions()}${body}${b.available ? "" : `<p class="factnote">${this.t("btNoRecorder")}</p>`}</div>`;
  }
}
