// MaintenanceMixin: recorder costs and the update preflight; mixed into the panel in 99-register.js.
class MaintenanceMixin {
  async loadCosts(refresh = false) {
    this.costsLoading = true; this.costsError = ""; this.render();
    try { this.costs = await this._hass.callWS({ type: "ha_housekeeper/recorder_costs", ...(refresh ? { refresh: true } : {}) }); this.markLoaded("costs"); } catch (err) { this.costs = null; this.costsError = this.errText(err); }
    this.costsLoading = false; this.render();
    this.followUp("costs", "recorder", this.costs, r => this.loadCosts(r), refresh);
  }

  // Opening the costs tab starts the analysis once; the backend answers with the last result at once.
  ensureCosts() {
    if (this.costsLoading || this._costsRequested) return;
    this._costsRequested = true;
    setTimeout(() => this.loadCosts(), 0);
  }

  async loadPreflight() {
    this.preflightLoading = true; this.preflightError = ""; this.render();
    try {
      this.preflight = await this._hass.callWS({ type: "ha_housekeeper/preflight" });
      this.markLoaded("preflight");
    } catch (err) { this.preflightError = this.errText(err); }
    this.preflightLoading = false; this.render();
  }

  formatBytes(bytes) {
    if (bytes === null || bytes === undefined) return this.t("recorderSizeUnknown");
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes, i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
    return `${this.formatNumber(Math.round(value * 10) / 10)} ${units[i]}`;
  }

  suggestedExclusions() { return (this.costs?.entities || []).filter(e => e.suggest_exclude && !e.excluded).map(e => e.entity_id); }

  recorderCard() {
    this.ensureCosts();
    const c = this.costs;
    const bar = (extra = "", attr = "", exportId = "") => this.pageBar({ left: extra, at: this.isoOf(c?.computed_at) || this.loadedAt("costs"), loading: this.costsLoading, attr, refresh: Boolean(attr), exportId });
    const head = (extra = "", attr = "") => `${bar(extra, attr)}<div class="panel">`; // the states without a list: the card holds the message
    if (this.costsLoading) return `<div class="stack">${head("", "data-costs-load")}${this.skeleton("recorderLoading")}</div></div>`;
    if (this.costsError) return `<div class="stack">${head("", "data-costs-load")}${this.notice("err", this.costsError)}</div></div>`;
    if (!c) return `<div class="stack">${head(`<button class="btn primary" data-costs-load>${this.t("recorderLoad")}</button>`)}</div></div>`;
    if (c.busy) return `<div class="stack">${head("", "data-costs-load")}<p class="factnote">${this.t("relBusy")}</p></div></div>`;
    if (!c.available) return `<div class="stack">${head()}<div class="emptymsg"><ha-icon icon="mdi:database-off-outline"></ha-icon>${this.t("recorderUnavailable")}</div></div></div>`;
    const took = c.computed_at && (c.stale || c.age_seconds >= 60) ? this.tookNote(c) : c.took_ms === null || c.took_ms === undefined ? "" : ` · ${this.t(c.cached ? "recorderCached" : "recorderTook", { ms: this.formatNumber(c.took_ms) })}`;
    const summary = this.t("recorderSummary", { states: this.formatNumber(c.total_states), size: this.formatBytes(c.size_bytes), days: c.keep_days ?? "—", stats: this.formatNumber(c.statistics_total) }) + took;
    const all = c.entities || [], max = Math.max(...all.map(e => e.share), 0.1); // the bars are scaled to the largest entry
    const sug = e => e.suggest_exclude && !e.excluded;
    const num = v => this.esc(this.formatNumber(v ?? 0));
    const avg = e => e.per_day_avg ?? e.per_day ?? 0;
    const columns = [
      { key: "sel", label: "stormColSelect", sortable: false, narrow: true, allBox: rows => this.excludeAllBox(rows.map(e => e.entity_id)), cell: e => this.excludeBox(e.entity_id) },
      { key: "name", label: "utName", cell: e => this.nameCell(e.name, e.entity_id) },
      { key: "share", label: "recorderColShare", dir: "desc", cell: e => `<span class="costshare">${this.sysShare(e.share, max)}<span>${this.esc(this.formatNumber(e.share))} %</span></span>` },
      { key: "states", label: "recorderColTotal", dir: "desc", cell: e => num(e.states) },
      { key: "d1", label: "recorderCol24h", dir: "desc", cell: e => num(e.states_24h) },
      { key: "d7", label: "recorderCol7d", dir: "desc", cell: e => num(e.states_7d) },
      { key: "avg", label: "recorderColAvg", dir: "desc", cell: e => num(Math.round(avg(e))) },
      { key: "mark", label: "recorderColMark", sortable: false, cell: e => (e.excluded ? `<span class="pill ok">${this.t("recorderExcluded")}</span>` : sug(e) ? `<span class="pill warn">${this.t("recorderSuggest")}</span>` : `<span class="pill ${e.used ? "mute" : "blue"}">${e.used ? this.t("recorderUsed", { count: e.used }) : this.t("recorderUnused")}</span>`) },
    ];
    this.setPageExporter("reccost", "recorder-costs", `${this.t("recorder")} · ${this.t("recorderTitle")}`, [
      { name: "entities", title: this.t("recorderTitle"), header: [this.t("utName"), "ID", this.t("recorderColShare"), this.t("recorderColTotal"), this.t("recorderCol24h"), this.t("recorderCol7d"), this.t("recorderColAvg")], rows: () => all.map(e => [e.name, e.entity_id, e.share, e.states, e.states_24h ?? "", e.states_7d ?? "", Math.round(avg(e))]) },
      { name: "statistics", title: this.t("recorderStats"), header: [this.t("recorderColStat"), this.t("recorderColRows")], rows: () => (c.statistics || []).map(x => [x.statistic_id, x.rows ?? ""]) },
    ].filter(sec => sec.rows().length));
    const list = this.sysList("costlist", all, {
      sort: "d1", dir: "desc",
      sorts: [
        { key: "d1", label: "recorderCol24h", dir: "desc", get: e => e.states_24h ?? 0 },
        { key: "d7", label: "recorderCol7d", dir: "desc", get: e => e.states_7d ?? 0 },
        { key: "states", label: "recorderColTotal", dir: "desc", get: e => e.states },
        { key: "avg", label: "recorderColAvg", dir: "desc", get: avg },
        { key: "share", label: "recorderColShare", dir: "desc", get: e => e.share },
        { key: "name", label: "utName", dir: "asc", get: e => e.name },
      ],
      filters: [{ name: "state", all: this.t("recorderFilterAll"), options: [["suggest", this.t("recorderSumSuggest")], ["excluded", this.t("recorderSumExcluded")], ["unused", this.t("recorderSumUnused")]] }],
      filterFns: { state: (e, v) => (v === "suggest" ? sug(e) : v === "excluded" ? e.excluded : !e.used) },
      text: e => `${e.name} ${e.entity_id}`, tie: e => e.entity_id, empty: "recorderNone", columns,
      rowAttrs: e => `${this.findObject(`entity:${e.entity_id}`) ? `data-object="${this.esc(`entity:${e.entity_id}`)}" tabindex="0" role="button" aria-label="${this.esc(e.name)}" ` : ""}class="${[e.excluded ? "exdone" : "", sug(e) ? "exsug" : "", this.findObject(`entity:${e.entity_id}`) ? "" : "static"].filter(Boolean).join(" ")}"`,
    });
    const tiles = all.length ? this.sumTiles([
      { label: this.t("recorderSumAll"), value: this.formatNumber(all.length), tone: "mute", lf: ["costlist", "", ""] },
      { label: this.t("recorderSumSuggest"), value: this.formatNumber(all.filter(sug).length), tone: all.some(sug) ? "warn" : "ok", lf: ["costlist", "state", "suggest"] },
      { label: this.t("recorderSumExcluded"), value: this.formatNumber(all.filter(e => e.excluded).length), tone: "mute", lf: ["costlist", "state", "excluded"] },
      { label: this.t("recorderSumUnused"), value: this.formatNumber(all.filter(e => !e.used).length), tone: "mute", lf: ["costlist", "state", "unused"] },
    ]) : "";
    const stats = (c.statistics || []).length ? this.sysList("recorder_stats", c.statistics, {
      sort: "rows", dir: "desc", tie: x => x.statistic_id, empty: "recorderNone",
      sorts: [{ key: "rows", label: "recorderColRows", dir: "desc", get: x => x.rows ?? 0 }, { key: "id", label: "recorderColStat", dir: "asc", get: x => x.statistic_id }],
      text: x => x.statistic_id,
      rowAttrs: x => (this.findObject(`entity:${x.statistic_id}`) ? `data-object="${this.esc(`entity:${x.statistic_id}`)}" tabindex="0" role="button" aria-label="${this.esc(x.statistic_id)}"` : 'class="static"'),
      columns: [
        { key: "id", label: "recorderColStat", dir: "asc", cell: x => this.nameCell(x.statistic_id, "") },
        { key: "rows", label: "recorderColRows", dir: "desc", cell: x => this.esc(this.formatNumber(x.rows)) },
      ],
    }) : "";
    const snippet = this.excludeCard(this.suggestedExclusions(), { only: false });
    // The key figures stand free above the card of the list, with the usual gap.
    return `<div class="stack">${bar("", "data-costs-load data-refresh", "reccost")}${tiles}<div class="panel"><p class="factnote">${this.esc(summary)}</p>${snippet}${list}${stats ? this.fold("recorder_stats", { title: this.t("recorderStats"), pill: this.formatNumber((c.statistics || []).length) }, stats, false) : ""}</div></div>`;
  }

  // One line per check; `level` decides the colour.
  preflightRows(state, checks) {
    const detail = {
      backup: () => {
        const b = state.backup || {};
        if (!b.available) return this.t("pf_backup_unavailable");
        if (b.age_hours === null || b.age_hours === undefined) return this.t("pf_backup_none");
        return this.t(b.level === "ok" ? "pf_backup_ok" : "pf_backup_old", { hours: Math.round(b.age_hours) });
      },
      disk: () => this.t("pf_disk_text", { free: this.formatBytes(state.disk?.free) }),
    };
    return checks.map(c => {
      const items = { repairs: state.repairs, failed_entries: state.failed_entries, broken: state.broken }[c.check];
      const names = (items || []).slice(0, 5).map(i => i.title || i.name || i.issue_id || i.object_id).filter(Boolean).map(n => this.esc(n)).join(", ");
      const text = detail[c.check] ? detail[c.check]() : c.count ? `${c.count}${names ? ` · ${names}` : ""}` : this.t("pf_count_none");
      const tone = { ok: "ok", warn: "warn", red: "red" }[c.level] || "mute";
      const icon = c.level === "ok" ? "mdi:check" : c.level === "red" ? "mdi:close-octagon-outline" : "mdi:alert-outline";
      return `<div class="row rel"><span class="tile ${tone}"><ha-icon icon="${icon}"></ha-icon></span><span class="row-text"><strong>${this.t(`pf_${c.check}`)}</strong><small>${text}</small></span>${c.check === "backup" ? `<button class="btn quiet" data-jump="maintenance" data-jump-tab="backup">${this.t("pfOpenBackup")}</button>` : ""}</div>`;
    }).join("");
  }

  // What follows an update: the watch (on, running, or off), with the way to its results.
  preflightAfter(watch) {
    if (!watch) return "";
    const active = watch.active;
    const text = !(watch.hours > 0) ? this.t("pfAfterOff")
      : active ? this.t("pfAfterRunning", { what: this.watchWhat(active), hours: Math.max(0, Math.ceil((Date.parse(active.until) - Date.now()) / 3600000)), n: this.formatNumber(active.new) })
      : this.t("pfAfterOn", { hours: watch.hours });
    const go = active ? ` <button class="btn" data-watch-go="${this.esc(active.id || "")}">${this.t("watchGo")}</button>` : "";
    return `<div class="panelhead topline"><div><h3>${this.t("pfAfterTitle")}</h3></div></div><p class="factnote">${text}${go}</p>`;
  }

  // Home Assistant's own configuration check, on request only: it loads every file and takes a few seconds.
  async runConfigCheck() {
    if (this.configChecking) return;
    this.configChecking = true; this.configCheckError = ""; this.render();
    try { this.configCheck = await this._hass.callWS({ type: "ha_housekeeper/check_config" }); }
    catch (err) { this.configCheckError = this.errText(err); }
    this.configChecking = false; this.render();
  }

  configRow() {
    const r = this.configCheck, busy = this.configChecking, failed = this.configCheckError;
    const tone = busy || (!r && !failed) ? "mute" : failed ? "warn" : !r.valid ? "red" : r.warnings ? "warn" : "ok";
    const icon = { ok: "mdi:check", warn: "mdi:alert-outline", red: "mdi:close-octagon-outline", mute: "mdi:file-cog-outline" }[tone];
    const clip = text => this.esc(String(text).slice(0, 600));
    const text = busy ? this.t("pfConfigRunning") : failed ? this.esc(failed) : !r ? this.t("pfConfigHint")
      : !r.valid ? `${this.t("pfConfigBad")}<span class="cfgout">${clip(r.errors)}</span>`
      : r.warnings ? `${this.t("pfConfigWarn", { time: this.formatDate(r.at) })}<span class="cfgout">${clip(r.warnings)}</span>`
      : this.t("pfConfigOk", { time: this.formatDate(r.at) });
    return `<div class="row rel"><span class="tile ${tone}"><ha-icon icon="${icon}"></ha-icon></span><span class="row-text"><strong>${this.t("pf_config")}</strong><small>${text}</small></span><button class="btn" data-config-check>${this.t(r ? "pfConfigAgain" : "pfConfigRun")}</button></div>`;
  }

  // Loads once and again after every new scan, so the overview and the Updates tab never show an old report.
  ensurePreflight() {
    const key = this.data?.meta?.scanned_at || "";
    if (this.preflightLoading || (this._pfKey === key && this._pfRequested)) return;
    this._pfRequested = true; this._pfKey = key;
    setTimeout(() => this.loadPreflight(), 0);
  }

  // The icon of an update: the picture Home Assistant knows, if it is a same-origin or https address.
  updatePicture(u) {
    const ok = typeof u.picture === "string" && (u.picture.startsWith("/") && !u.picture.startsWith("//") || u.picture.startsWith("https://"));
    const icon = u.group === "system" ? "mdi:home-assistant" : "mdi:package-up";
    return ok ? `<img class="updpic" src="${this.esc(u.picture)}" alt="" loading="lazy" data-fallback-icon="${icon}">` : `<ha-icon icon="${icon}"></ha-icon>`;
  }

  // The pending updates as one standard list: name, versions, group, state and the buttons.
  updatesList(updates, watching) {
    const id = "updates";
    this.lvState(id, "group", "asc");
    const groups = ["system", "app", "hacs", "device"];
    const sorts = [
      { key: "group", label: "updColGroup", get: u => groups.indexOf(u.group) },
      { key: "name", label: "updColName", get: u => u.name },
    ];
    const bar = this.listBar(id, { table: true, dense: true, sorts, filters: [
      { name: "group", all: this.t("updAllGroups"), options: groups.filter(g => updates.some(u => u.group === g)).map(g => [g, this.t(`updGroup_${g}`)]) },
    ] });
    const rows = this.refine(id, updates, { text: u => [u.name, u.installed, u.latest, u.release_summary].join(" "), filters: { group: (u, v) => u.group === v }, sorts, tie: u => u.name });
    const pg = this.paginate(id, rows, [10, 20]);
    const pills = u => [
      u.blocked ? `<span class="pill red">${this.t("updBlocked")}</span>` : "",
      u.in_progress ? `<span class="pill blue">${this.t("updRunning")}</span>` : "",
      u.auto_update ? `<span class="pill mute">${this.t("updAuto")}</span>` : "",
      u.group === "system" && watching ? `<span class="pill blue">${this.t("updWatch")}</span>` : "",
    ].join("");
    const columns = [
      { key: "name", label: "updColName", cell: u => `<div class="statcell"><span class="tile mute">${this.updatePicture(u)}</span><div><strong>${this.esc(u.name)}</strong>${u.release_summary ? `<small>${this.esc(u.release_summary)}</small>` : ""}</div></div>` },
      { key: "version", label: "updColVersion", sortable: false, cell: u => `<span class="verchip">${this.esc(u.installed ?? "–")} → ${this.esc(u.latest ?? "–")}</span>` },
      { key: "group", label: "updColGroup", cell: u => `<span class="pill mute">${this.t(`updGroup_${u.group}`)}</span>` },
      { key: "state", label: "updColState", sortable: false, cell: u => pills(u) || "–" },
      { key: "actions", label: "updColActions", sortable: false, cell: u => `<span class="updact">${typeof u.release_url === "string" && u.release_url.startsWith("https://") ? `<a class="btn quiet" href="${this.esc(u.release_url)}" target="_blank" rel="noopener noreferrer">${this.t("updNotes")}</a>` : ""}<button class="btn quiet" data-ha-path="/config/updates" title="${this.esc(this.t("updOpenHa"))}">${this.t("updOpen")}</button></span>` },
    ];
    const table = rows.length ? this.listTable(id, columns, pg.rows, { cls: "upds", rowAttrs: () => 'class="static"' }) : `<div class="emptymsg">${this.noMatches(id)}</div>`;
    const current = groups.filter(g => !updates.some(u => u.group === g)).map(g => `<div class="row rel"><span class="tile ok"><ha-icon icon="mdi:check"></ha-icon></span><span class="row-text"><strong>${this.t(`updCurrent_${g}`)}</strong></span></div>`).join("");
    return `<div class="panel"><div class="sectionlabel">${this.t("updListTitle")} · ${this.formatNumber(updates.length)}</div>${bar}${table}${pg.footer}</div>${current ? `<div class="panel">${current}</div>` : ""}`;
  }

  updatesCard() {
    const p = this.preflight;
    const head = this.pageBar({ at: this.loadedAt("preflight"), loading: this.preflightLoading, attr: "data-pf-refresh" });
    if (this.preflightError) return `<div class="stack">${head}<div class="panel">${this.notice("err", this.preflightError)}</div></div>`;
    if (!p) return `<div class="stack">${head}<div class="panel">${this.skeleton("preflightLoading")}</div></div>`;
    const updates = p.state.updates || [], counts = p.counts || {};
    const total = counts.total ?? updates.length;
    // An invalid configuration, once it was checked, stops whatever the other lines say.
    const cfg = this.configCheck, level = cfg && !cfg.valid ? "stop" : p.verdict;
    const tone = { ready: "ok", look: "warn", stop: "red" }[level] || "mute";
    const icon = { ready: "mdi:check-circle-outline", look: "mdi:alert-outline", stop: "mdi:close-octagon-outline" }[level] || "mdi:help-circle-outline";
    const open = [...p.checks.filter(c => c.level !== "ok").map(c => this.t(`pf_${c.check}`)), ...(cfg && !cfg.valid ? [this.t("pf_config")] : [])];
    const title = total ? this.t(`updVerdict_${level}`) : this.t("updVerdictNone");
    const sub = [total ? this.t(total === 1 ? "updPending_1" : "updPending_n", { n: this.formatNumber(total) }) : "", open.length ? this.t("updCheckFirst", { items: open.join(", ") }) : ""].filter(Boolean).join(" · ");
    const verdict = `<div class="row rel"><span class="tile ${total ? tone : "ok"}"><ha-icon icon="${total ? icon : "mdi:check-circle-outline"}"></ha-icon></span><span class="row-text"><strong>${title}</strong>${sub ? `<small>${this.esc(sub)}</small>` : ""}</span></div>`;
    const tiles = this.sumTiles([
      { label: this.t("updSumOpen"), value: this.formatNumber(total), tone: total ? "warn" : "ok" },
      { label: this.t("updGroup_system"), value: this.formatNumber(counts.system ?? 0), tone: "mute" },
      { label: this.t("updGroup_app"), value: this.formatNumber(counts.app ?? 0), tone: "mute" },
      { label: this.t("updSumBlocked"), value: this.formatNumber(counts.blocked ?? 0), tone: counts.blocked ? "red" : "ok" },
    ]);
    const watching = p.watch?.hours > 0;
    const list = total ? this.updatesList(updates, watching) : `<div class="panel"><div class="emptymsg"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${this.t("updAllCurrent")}</div></div>`;
    return `<div class="stack">${head}${tiles}<div class="panel">${verdict}${this.preflightRows(p.state, p.checks)}${this.configRow()}</div>${list}<div class="panel">${this.preflightAfter(p.watch)}</div></div>`;
  }

  maintenanceView() {
    this.ensurePreflight();
    this.ensureBackup();
    const checks = this.backup?.available ? this.backup.checks || [] : [];
    const problems = checks.filter(c => c.level === "problem").length, notes = checks.filter(c => c.level === "note").length;
    const pf = this.preflight;
    const updates = pf?.counts?.total ?? pf?.state?.updates?.length ?? 0;
    const backupTone = !this.backup?.available ? "mute" : problems ? "red" : notes ? "warn" : "ok";
    const pfTone = !pf ? "mute" : !updates ? "ok" : { stop: "red", look: "warn" }[pf.verdict] || "ok";
    const goalsMissed = (this.goals?.goals || []).filter(g => g.state === "missed").length;
    this.ensureGoals();
    this.ensureBlueprints(); // the pill of the tab needs the numbers before the tab is opened
    const bp = this.blueprints, bpBad = bp ? (bp.missing || 0) + (bp.broken || 0) : 0;
    const tabs = [
      { id: "backup", icon: "mdi:backup-restore", label: this.t("backupsTab"), hint: "maintHintBackup", pill: !this.backup?.available ? "" : problems ? this.t(problems === 1 ? "mtProblems_1" : "mtProblems_n", { n: problems }) : notes ? this.t(notes === 1 ? "mtNotes_1" : "mtNotes_n", { n: notes }) : this.t("bhLevel_ok"), tone: backupTone },
      { id: "updates", icon: "mdi:package-up", label: this.t("updatesTab"), hint: "maintHintUpdates", pill: updates ? this.formatNumber(updates) : "", tone: pfTone },
      { id: "blueprints", icon: "mdi:file-code-outline", label: this.t("bpTab"), hint: "maintHintBlueprints", pill: bpBad ? this.t("mtOpen", { n: bpBad }) : "", tone: "warn" },
      { id: "goals", icon: "mdi:target", label: this.t("goalsTab"), hint: "maintHintGoals", pill: goalsMissed ? this.t("tilesMissed", { count: goalsMissed }) : "", tone: "red" },
    ];
    this.ensureBackupCleanup();
    const open = this.viewTabOf("maintenance", tabs, "backup");
    // A tab whose numbers are there and show nothing open says so, as on Clean up; while they load it stays plain.
    const loaded = { backup: Boolean(this.backup?.available), updates: Boolean(pf), blueprints: Boolean(bp), goals: Boolean(this.goals) };
    const grid = this.navTiles("maintenance", tabs.map(tab => ({ ...tab, hint: this.t(tab.hint), tone: tab.pill ? tab.tone : "ok", facts: !tab.pill && loaded[tab.id] ? [{ text: this.t("cleanupNothing"), tone: "ok" }] : [] })), open, this.t("maintenance"), true);
    return `<div class="stack">${grid}${open === "goals" ? this.goalsCard() : open === "updates" ? this.updatesCard() : open === "blueprints" ? this.blueprintsCard() : this.backupCard()}</div>`;
  }
}
