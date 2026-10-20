// UnusedMixin: methods of the panel element, mixed into the class in 99-register.js.
class UnusedMixin {
  batteryRows() {
    const rows = [];
    for (const o of this.data.objects) {
      if (o.object_type !== "entity" || o.device_class !== "battery" || o.status !== "active" || this.batteryExcluded(o)) continue;
      const domain = o.object_id.split(".")[0];
      if (domain === "binary_sensor") rows.push({ item: o, level: null, low: o.state === "on" });
      else if (domain === "sensor" && (!o.unit || o.unit === "%") && o.state !== null && o.state !== "" && !Number.isNaN(Number(o.state))) rows.push({ item: o, level: Number(o.state), low: false });
    }
    const limit = this.data.meta.low_battery_percent ?? 20;
    rows.forEach(r => { r.low = r.low || (r.level !== null && r.level <= limit); });
    return rows.sort((a, b) => (Number(b.low) - Number(a.low)) || ((a.level ?? -1) - (b.level ?? -1)) || a.item.name.localeCompare(b.item.name));
  }

  // Active entities no source refers to. A hint only; see unreferencedHint for the blind spots.
  unreferencedRows() {
    const { used } = this.edgeIndex();
    const SELF = ["automation", "script", "scene"];
    return this.data.objects.filter(o => o.object_type === "entity" && o.status === "active" && !o.entity_category
      && !SELF.includes(o.object_id.split(".")[0]) && !used.has(this.objectKey(o)))
      .sort((a, b) => a.object_id.localeCompare(b.object_id));
  }

  unrefTabs() {
    if (this._embedUnref) return "";
    const stats = this.data.orphaned_statistics || [];
    const tabs = [{ id: "entities", label: this.t("unreferencedEntities"), count: this.unreferencedRows().length }, { id: "statistics", label: this.t("orphanStats"), count: stats.length }];
    return this.viewTabBar("unreferenced", tabs, this.unrefTab === "statistics" ? "statistics" : "entities");
  }

  // Key figures of the unused entities (the counts themselves are in the cleanup tiles above).
  unrefTiles() {
    const rows = this.unreferencedRows();
    const top = list => { const counts = new Map(); list.forEach(x => x && counts.set(x, (counts.get(x) || 0) + 1)); return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]; };
    const domain = top(rows.map(o => o.object_id.split(".")[0])), platform = top(rows.map(o => o.platform));
    const withStats = rows.filter(o => o.has_statistics).length;
    return this.sumTiles([
      this.data.meta.recorder_available && rows.length ? { label: this.t("unrefSumStats"), value: this.formatNumber(withStats), sub: this.t("unrefSumStatsHint"), tone: "mute" } : null,
      domain ? { label: this.t("unrefSumDomain"), value: this.esc(domain[0]), sub: this.formatNumber(domain[1]), tone: "mute" } : null,
      platform ? { label: this.t("unrefSumPlatform"), value: this.esc(platform[0]), sub: this.formatNumber(platform[1]), tone: "mute" } : null,
    ]);
  }

  // Active entities that look like what an orphaned statistic became after a rename: same domain, same unit, similar name.
  statSuccessors(orphan) { return this.successorsOf(orphan.statistic_id, orphan.unit, 2); }

  // The same idea for any entity id; `unit` is optional. Hints only, never chosen for the person.
  successorsOf(id, unit, limit = 5) {
    const [domain, name = ""] = String(id || "").split(".");
    if (!domain) return [];
    const words = new Set(name.split("_").filter(Boolean));
    const found = [];
    for (const o of this.data.objects) {
      if (o.object_type !== "entity" || o.status !== "active" || o.object_id === id || !o.object_id.startsWith(`${domain}.`)) continue;
      if (unit && o.unit !== unit) continue;
      const other = new Set(o.object_id.split(".")[1].split("_").filter(Boolean));
      const shared = [...words].filter(w => other.has(w)).length;
      const score = shared / (words.size + other.size - shared || 1);
      if (score >= 0.5) found.push({ item: o, score });
    }
    return found.sort((a, b) => b.score - a.score || a.item.object_id.localeCompare(b.item.object_id)).slice(0, limit).map(f => f.item);
  }

  statSuccessorLine(orphan) {
    const successors = this.statSuccessors(orphan);
    if (!successors.length) return "";
    const links = successors.map(s => `<button class="linklike" data-object="entity:${this.esc(s.object_id)}">${this.esc(s.object_id)}</button>`).join(", ");
    return `<small class="statsucc">${this.t("statSuccessors")} ${links}</small>`;
  }

  // The same as plain text, for the tooltip of the name while the rows are compact.
  statSuccessorText(orphan) {
    const successors = this.statSuccessors(orphan);
    return successors.length ? `${this.t("statSuccessors")} ${successors.map(s => s.object_id).join(", ")}` : null;
  }

  // When the statistic last received a value: read on the first visit of the list, never during a scan.
  async loadOrphanLast(refresh = false) {
    this.orphanLastLoading = true; this.render();
    try { this.orphanLast = await this._hass.callWS({ type: "ha_housekeeper/statistics_last", refresh }); }
    catch (_) { this.orphanLast = null; }
    this.orphanLastLoading = false; this.render();
  }

  // Switching to the tab asks again after a failure or a busy recorder; rendering alone never loops.
  retryOrphanLast() {
    if (!this.orphanLast || this.orphanLast.busy) this._orphanLastRequested = false;
  }

  ensureOrphanLast() {
    if (this.orphanLastLoading || this._orphanLastRequested || !this.data?.meta?.recorder_available) return;
    this._orphanLastRequested = true;
    setTimeout(() => this.loadOrphanLast(), 0);
  }

  orphanStatsView() {
    const all = this.data.orphaned_statistics || [];
    this.lvState("orphanstats", "id", "asc");
    const kind = o => (o.has_sum && o.has_mean ? "kindBoth" : o.has_sum ? "kindSum" : "kindMean");
    const lastOf = o => this.orphanLast?.last?.[o.statistic_id];
    const firstOf = o => this.orphanLast?.first?.[o.statistic_id];
    const rowsOf = o => this.orphanLast?.rows?.[o.statistic_id];
    const sorts = [
      { key: "id", label: "sortId", dir: "asc", get: o => o.statistic_id },
      { key: "kind", label: "sortKind", dir: "asc", get: o => this.t(kind(o)) },
      { key: "unit", label: "sortUnit", dir: "asc", get: o => o.unit },
      { key: "last", label: "sortLastEntry", dir: "desc", get: lastOf },
      { key: "first", label: "sortFirstEntry", dir: "asc", get: firstOf },
      { key: "rows", label: "sortRows", dir: "desc", get: rowsOf },
    ];
    this.ensureOrphanLast();
    const kinds = [...new Set(all.map(kind))];
    const units = [...new Set(all.map(o => o.unit).filter(Boolean))].sort();
    const AGES = [30, 365, 730];
    this.setExporter("orphanstats", "orphaned-statistics", ["ID", this.t("utKind"), this.t("utUnit"), this.t("utFirst"), this.t("utLast"), this.t("utRows"), this.t("inEnergy")], () => rows.map(o => [o.statistic_id, this.t(kind(o)), o.unit || "", firstOf(o) ? new Date(firstOf(o) * 1000).toISOString() : "", lastOf(o) ? new Date(lastOf(o) * 1000).toISOString() : "", rowsOf(o) ?? "", o.in_energy ? "yes" : "no"]));
    const bar = this.listBar("orphanstats", { table: true, dense: true, columns: [{ key: "kind", label: "utKind" }, { key: "unit", label: "utUnit" }, { key: "first", label: "utFirst" }, { key: "last", label: "utLast" }, { key: "rows", label: "utRows" }, { key: "energy", label: "utEnergy" }], sorts, filters: [
      { name: "kind", all: this.t("allKinds"), options: kinds.map(k => [k, this.t(k)]) },
      { name: "unit", all: this.t("allUnits"), options: units.map(u => [u, u]) },
      { name: "age", all: this.t("allAges"), options: AGES.map(d => [String(d), this.t(`statAge${d}`)]) },
    ] });
    const refined = this.refine("orphanstats", all, { text: o => [o.statistic_id, o.unit].join(" "), filters: {
      kind: (o, v) => kind(o) === v, unit: (o, v) => o.unit === v,
      age: (o, v) => { const ts = lastOf(o); return typeof ts === "number" && Date.now() - ts * 1000 > Number(v) * 864e5; },
    }, sorts, tie: o => o.statistic_id });
    const rows = this.selOnly?.orphanstats ? refined.filter(o => this.purgeSel.has(o.statistic_id)) : refined;
    const pg = this.paginate("orphanstats", rows);
    this._purgeTotal = rows.length;
    this._purgePage = pg.rows.filter(o => !o.in_energy).map(o => o.statistic_id);
    const lastCell = o => {
      if (this.orphanLastLoading && !this.orphanLast) return `<span class="muted">${this.t("loadingShort")}</span>`;
      if (this.orphanLast?.busy) return `<span class="muted">${this.t("lastEntryBusyShort")}</span>`;
      const ts = lastOf(o);
      if (ts === null || ts === undefined) return `<span class="muted">${this.orphanLast?.available ? this.t("lastEntryNone") : "–"}</span>`;
      return this.ageCell(new Date(ts * 1000).toISOString());
    };
    const firstCell = o => {
      const ts = firstOf(o);
      return ts ? this.ageCell(new Date(ts * 1000).toISOString()) : `<span class="muted">${this.orphanLast?.busy || (this.orphanLastLoading && !this.orphanLast) ? this.t("loadingShort") : "–"}</span>`;
    };
    const rowsCell = o => { const n = rowsOf(o); return typeof n === "number" ? this.formatNumber(n) : `<span class="muted">${this.t("loadingShort")}</span>`; };
    const columns = [
      { key: "id", label: "utStatId", dir: "asc", headPrefix: () => this.purgeHeadBox(), cell: o => `<div class="statcell">${this.purgeBox(o)}<div>${this.nameCell(o.statistic_id, "", "div", this.statSuccessorText(o))}${this.statSuccessorLine(o)}</div></div>` },
      { key: "kind", label: "utKind", cell: o => this.esc(this.t(kind(o))) },
      { key: "unit", label: "utUnit", cell: o => this.esc(o.unit || "–") },
      { key: "first", label: "utFirst", dir: "asc", cell: firstCell },
      { key: "last", label: "utLast", dir: "desc", cell: lastCell },
      { key: "rows", label: "utRows", dir: "desc", cell: rowsCell },
      { key: "energy", label: "utEnergy", sortable: false, cell: o => (o.in_energy ? `<span class="pill warn">${this.t("inEnergy")}</span>` : "") },
    ];
    const empty = this.data.meta.recorder_available ? (all.length ? this.noMatches("orphanstats") : this.t("noOrphanStats")) : this.t("noRecorder");
    const table = rows.length ? this.listTable("orphanstats", columns, pg.rows, { cls: "stat", rowAttrs: () => 'class="static"' }) : `<div class="emptymsg"><ha-icon icon="mdi:chart-line-variant"></ha-icon>${empty}</div>`;
    return `<div class="stack">${this.unrefTabs()}<div class="panel"><p class="factnote">${this.t("orphanStatsHint")}</p>${this.purgeBar()}${bar}${table}${pg.footer}</div></div>`;
  }

  // Deleting the recorder data of entities that are gone: pick rows, confirm with a word; a backup comes first.
  purgeBox(o) {
    if (!this.data.meta.recorder_available || o.in_energy) return "";
    return `<input type="checkbox" class="selbox" data-psel="${this.esc(o.statistic_id)}" ${this.purgeSel.has(o.statistic_id) ? "checked" : ""} aria-label="${this.esc(o.statistic_id)}">`;
  }

  // Header box: ticks every selectable row of the shown page; half-ticked when only some are.
  purgeHeadBox() {
    if (!this.data.meta.recorder_available || !this._purgePage?.length) return "";
    const n = this._purgePage.filter(id => this.purgeSel.has(id)).length;
    return `<input type="checkbox" class="selbox" data-psel-all ${n === this._purgePage.length ? "checked" : ""} ${n && n < this._purgePage.length ? "data-partial" : ""} aria-label="${this.esc(this.t("selectPage"))}">`;
  }

  purgeBar() {
    if (!this.data.meta.recorder_available) return "";
    const n = this.purgeSel.size, r = this.purgeResult;
    const result = r ? `<p class="${r.error ? "error" : "factnote"}">${this.esc(r.error ? this.t("purgeNotDeleted", { reason: `${this.t(`purgeReason_${r.error}`)}${r.detail ? ` (${r.detail})` : ""}` }) : this.t("purgeDone", { n: r.removed.length, skipped: r.skipped.length }))}</p>` : "";
    const over = n > MAX_PLAN_ACTIONS;
    return `${result}<div class="toolbar"><button class="btn quiet" data-purge-page>${this.t("selectPage")}</button>${this.selTools("orphanstats", n, "data-purge-clear")}<span class="toolgap"></span><button class="btn dangersoft" data-purge-run ${n && !this.purgeBusy ? "" : "disabled"}><ha-icon icon="mdi:delete-outline"></ha-icon>${n ? this.t("purgeOpenCount", { n: this.formatNumber(n) }) : this.t("purgeOpen")}</button>${this.viewCount(this._purgeTotal || 0)}</div>${over ? `<p class="factnote">${this.t("purgeChunk", { max: MAX_PLAN_ACTIONS, n, rest: n - MAX_PLAN_ACTIONS })}</p>` : ""}`;
  }

  async purgeRun() {
    // The deletion is an ordinary plan: preview, confirmation of each ID, backup, verification. It is made here and run under Cleanup.
    this.purgeBusy = true; this.purgeResult = null; this.render();
    try {
      const chosen = [...this.purgeSel], now = chosen.slice(0, MAX_PLAN_ACTIONS);
      const actions = now.map(object_id => ({ kind: "purge_statistics", object_id, states: true }));
      const plan = await this._hass.callWS({ type: "ha_housekeeper/plan_create", actions });
      this.purgeSel = new Set(chosen.slice(MAX_PLAN_ACTIONS)); 
      this.openNewPlan(plan);
    } catch (err) { this.purgeResult = { removed: [], skipped: [], error: "failed", detail: this.errText(err) }; }
    this.purgeBusy = false;
    this.render();
  }

  unreferencedView() {
    if (this.unrefTab === "statistics") return this.orphanStatsView();
    const all = this.unreferencedRows();
    this.lvState("unreferenced", "name", "asc");
    const domainOf = o => o.object_id.split(".")[0];
    const deviceName = o => (o.device_id ? this.findObject(`device:${o.device_id}`)?.name : "") || "";
    const ts = v => (v ? Date.parse(v) || null : null);
    const sorts = [
      { key: "id", label: "sortId", dir: "asc", get: o => o.object_id },
      { key: "name", label: "sortName", dir: "asc", get: o => o.name },
      { key: "domain", label: "sortDomain", dir: "asc", get: domainOf },
      { key: "device", label: "sortDevice", dir: "asc", get: deviceName },
      { key: "area", label: "sortArea", dir: "asc", get: o => this.areaName(o) },
      { key: "platform", label: "sortIntegration", dir: "asc", get: o => o.platform },
      { key: "changed", label: "sortChanged", dir: "desc", get: o => ts(o.last_changed) },
      { key: "reported", label: "sortReported", dir: "desc", get: o => ts(o.last_reported || o.last_updated) },
      { key: "since", label: "sortSince", dir: "asc", get: o => ts(o.status_since) },
      { key: "stats", label: "sortStats", dir: "desc", get: o => (o.has_statistics ? 1 : 0) },
    ];
    const domains = [...new Set(all.map(domainOf))].sort();
    const areas = [...new Set(all.map(o => this.areaName(o)).filter(Boolean))].sort();
    const platforms = [...new Set(all.map(o => o.platform).filter(Boolean))].sort();
    const pickCols = ["domain", "device", "area", "platform", "changed", "reported", "since", "stats"].map(k => ({ key: k, label: { domain: "utDomain", device: "utDevice", area: "utArea", platform: "utIntegration", changed: "utChanged", reported: "utReported", since: "utSince", stats: "utStats" }[k] }));
    this.setExporter("unreferenced", "unused-entities", [this.t("utName"), "ID", this.t("utDomain"), this.t("utDevice"), this.t("utArea"), this.t("utIntegration"), this.t("utChanged"), this.t("utReported"), this.t("utSince"), this.t("utStats")], () => rows.map(o => [o.name, o.object_id, domainOf(o), deviceName(o), this.areaName(o), o.platform || "", o.last_changed || "", o.last_reported || o.last_updated || "", o.status_since || "", this.data.meta.recorder_available ? (o.has_statistics ? "yes" : "no") : ""]));
    const bar = this.listBar("unreferenced", { table: true, dense: true, columns: pickCols, sorts, filters: [
      { name: "domain", all: this.t("allDomains"), options: domains.map(d => [d, `${d} (${all.filter(o => domainOf(o) === d).length})`]) },
      { name: "area", all: this.t("allAreas"), options: areas.map(a => [a, a]) },
      { name: "platform", all: this.t("allIntegrations"), options: platforms.map(p => [p, p]) },
    ] });
    const rows = this.refine("unreferenced", all, {
      text: o => [o.name, o.object_id, this.areaName(o), deviceName(o), o.platform].join(" "),
      filters: { domain: (o, v) => domainOf(o) === v, area: (o, v) => this.areaName(o) === v, platform: (o, v) => o.platform === v }, sorts, tie: o => o.object_id,
    });
    const pg = this.paginate("unreferenced", rows);
    const dash = `<span class="muted">–</span>`;
    const columns = [
      { key: "name", label: "utName", dir: "asc", sortKeys: ["id"], headSuffix: () => `<button type="button" class="thbtn th-alt" data-lsort="unreferenced|id|asc">ID${this.lv.unreferenced.sort === "id" ? ` <span aria-hidden="true">${this.lv.unreferenced.dir === "desc" ? "↓" : "↑"}</span>` : ""}</button>`, cell: o => this.nameCell(o.name, o.object_id) },
      { key: "domain", label: "utDomain", cell: o => this.esc(domainOf(o)) },
      { key: "device", label: "utDevice", cell: o => this.esc(deviceName(o)) || dash },
      { key: "area", label: "utArea", cell: o => this.esc(this.areaName(o)) || dash },
      { key: "platform", label: "utIntegration", cell: o => this.esc(o.platform || "") || dash },
      { key: "changed", label: "utChanged", dir: "desc", cell: o => this.ageCell(o.last_changed) },
      { key: "reported", label: "utReported", dir: "desc", cell: o => this.ageCell(o.last_reported || o.last_updated) },
      { key: "since", label: "utSince", cell: o => this.ageCell(o.status_since) },
      { key: "stats", label: "utStats", dir: "desc", cell: o => (this.data.meta.recorder_available ? this.t(o.has_statistics ? "yes" : "no") : dash) },
    ];
    const table = rows.length ? this.listTable("unreferenced", columns, pg.rows, { cls: "unref", rowAttrs: o => `data-object="${this.esc(this.objectKey(o))}" tabindex="0" role="button" aria-label="${this.esc(o.name)}"` }) : `<div class="emptymsg"><ha-icon icon="mdi:link-variant"></ha-icon>${all.length ? this.noMatches("unreferenced") : this.t("noUnreferenced")}</div>`;
    return `<div class="stack">${this._embedUnref ? "" : this.unrefTiles()}${this.unrefTabs()}<div class="panel"><p class="factnote">${this.t("unreferencedHint")}</p>${bar}${table}${pg.footer}</div></div>`;
  }

  // A battery entity is mostly called "Battery"; the device is the name one recognises.
  batteryName(item) {
    const device = item.device_id ? this.findObject(`device:${item.device_id}`) : null;
    return { title: device?.name || item.name, entity: device?.name && device.name !== item.name ? item.name : "", device };
  }

  batterySorts() {
    return [
      // Low batteries first, then the lowest level.
      { key: "level", label: "sortLevel", dir: "asc", get: r => (r.low ? 0 : 1e6) + (r.volt ? 1000 : 0) + (r.level ?? -1) },
      { key: "name", label: "sortName", dir: "asc", get: r => this.batteryName(r.item).title },
      { key: "area", label: "sortArea", dir: "asc", get: r => this.areaName(r.item) },
    ];
  }

  // Percent sensors plus the batteries that report volts; the volts come with the trend data, which is loaded in the background.
  lowBatteries() { return this.data ? [...this.batteryRows(), ...this.batteryVoltRows()].filter(r => r.low) : []; }

  batteriesView() {
    const all = this.batteryTableRows(), low = all.filter(r => r.low);
    this.lvState("batteries", "left", "asc");
    const areas = [...new Set(all.map(r => this.areaName(r.item)).filter(Boolean))].sort();
    const types = [...new Set(all.map(r => r.type).filter(Boolean))].sort();
    const need = this.data.meta.low_battery_percent ?? 20;
    const bar = this.listBar("batteries", { table: true, dense: true, sorts: this.batteryTableSorts(), filters: [
      { name: "soon", all: this.t("batteryAll"), options: [["soon", this.t("btFilterSoon")], ["untyped", this.t("btFilterUntyped")]] },
      { name: "type", all: this.t("btAllTypes"), options: types.map(x => [x, x]) },
      { name: "area", all: this.t("allAreas"), options: areas.map(a => [a, a]) },
    ] });
    const list = this.refine("batteries", this.batteryFilter === "low" ? low : all, {
      text: r => [this.batteryName(r.item).title, r.item.name, r.item.object_id, this.areaName(r.item), r.type].join(" "),
      filters: { area: (r, v) => this.areaName(r.item) === v, type: (r, v) => r.type === v, soon: (r, v) => (v === "soon" ? r.low || (r.days !== null && r.days <= 30) : !r.type) },
      sorts: this.batteryTableSorts(), tie: r => r.item.object_id,
    });
    const lowest = all.filter(r => !r.volt && r.level !== null && r.level !== undefined).sort((x, y) => x.level - y.level)[0];
    const chips = this.sumTiles([
      { label: this.t("batteryAll"), value: this.formatNumber(all.length), tone: "mute", attr: ["data-battery-filter", "all"], active: this.batteryFilter !== "low" },
      { label: this.t("batteryLow"), value: this.formatNumber(low.length), sub: this.t("batterySumLimit", { n: need }), tone: low.length ? "red" : "ok", attr: ["data-battery-filter", "low"], active: this.batteryFilter === "low" },
      lowest ? { label: this.t("batterySumLowest"), value: `${this.formatNumber(lowest.level)} %`, sub: this.esc([this.batteryName(lowest.item).title, this.areaName(lowest.item)].filter(Boolean).join(" · ")), tone: lowest.low ? "warn" : "mute", attr: ["data-object", this.objectKey(lowest.item)] } : null,
    ]);
    const unknown = this.batteryTrend?.unknown;
    const notes = `${this.batteryTrend?.available && unknown !== undefined ? `<p class="factnote">${this.t("btTableNote", { unknown: this.formatNumber(unknown) })}</p>` : ""}${this.voltNote()}`;
    const head = `<div class="panelhead"><div><h2>${this.t("btTitle")}</h2><p>${this.t("btHint")}</p></div></div>`;
    const body = list.length ? this.batteryTable(list) : `<div class="emptymsg"><ha-icon icon="mdi:battery-check-outline"></ha-icon>${this.t(all.length ? "noMatches" : "noBatteries")}</div>`;
    this.ensureBatteryTrend();
    const bar2 = this.pageBar({ at: this.loadedAt("batteries"), loading: this.batteryTrendLoading, attr: "data-bt-refresh" });
    // One column: when which battery runs out (need and forecast together), the list, then the kinds that need a look.
    return `<div class="stack">${bar2}${chips}${this.batteryNeed(all)}<div class="panel">${head}${this.filterNote(this.batteryFilter === "low" ? [this.t("batteryLow")] : [], 'data-battery-filter="all"')}${bar}${body}${notes}</div>${this.batteryCustomTypes()}${this.batteryKindCard()}</div>`;
  }
}
