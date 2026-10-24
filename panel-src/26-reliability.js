// ReliabilityMixin: the reliability view; mixed into the panel in 99-register.js.
const REL_GREEN = 99.5, REL_YELLOW = 95; // availability in percent: green from, yellow from, red below
class ReliabilityMixin {
  // Slow recorder views: an old reply is shown at once and renewed once; when another calculation holds the
  // query lock, the panel asks again by itself a few times instead of asking the user to click.
  // The state of a config entry in words ("Retrying setup"), the raw one where no text exists.
  entryStateLabel(state) { const key = `cs_${state}`, text = this.t(key); return text === key ? state : text; }

  followUp(name, view, result, reload, refresh) {
    if (!result) return;
    if (!refresh && result.stale) { reload(true); return; }
    this._busyTries = this._busyTries || {};
    if (!result.busy) { this._busyTries[name] = 0; return; }
    this._busyTries[name] = (this._busyTries[name] || 0) + 1;
    if (this._busyTries[name] <= BUSY_RETRIES) setTimeout(() => { if (this.view === view) reload(refresh); }, BUSY_WAIT_MS);
  }

  // " · calculated in 2.8 s", or the age of an old reply.
  tookNote(r) {
    if (!r || !r.available) return "";
    if (r.computed_at && (r.stale || r.age_seconds >= 60)) return ` · ${this.t("relAgeNote", { when: this.relTime(new Date(r.computed_at * 1000).toISOString()) })}`;
    if (r.took_ms === null || r.took_ms === undefined) return "";
    return ` · ${this.t(r.cached ? "relCached" : "relTook", { s: this.formatNumber(Math.round(r.took_ms / 100) / 10) })}`;
  }

  async loadReliability(refresh = false) {
    this.relLoading = true; this.relError = ""; this.render();
    try { this.reliability = await this._hass.callWS({ type: "ha_housekeeper/reliability", window_days: this.relWindow, refresh, ...(this.relCompare ? { compare: true } : {}) }); }
    catch (err) { this.relError = this.errText(err); }
    this.relLoading = false; this.render();
    this.followUp("reliability", "reliability", this.reliability, r => this.loadReliability(r), refresh);
  }

  // The first visit and every change of the window load once; the backend keeps the result for a few minutes.
  ensureReliability() {
    if (this.relLoading || this._relRequested === this.relWindow) return;
    this._relRequested = this.relWindow;
    setTimeout(() => this.loadReliability(), 0);
  }

  relDuration(seconds) {
    if (seconds >= 86400) return this.t("relDays", { n: Math.round(seconds / 86400) });
    if (seconds >= 7200) return this.t("relHours", { n: Math.round(seconds / 3600) });
    return this.t("relMinutes", { n: Math.max(1, Math.round(seconds / 60)) });
  }

  relSorts() {
    return [
      { key: "avail", label: "relSortAvail", dir: "asc", get: e => (e.dead ? -1 : e.availability) },
      { key: "title", label: "sortName", dir: "asc", get: e => e.title },
      { key: "outages", label: "relSortOutages", dir: "desc", get: e => e.shared_outages },
    ];
  }

  relRowBody(item) {
    const percent = item.availability;
    const tone = item.dead ? "red" : percent === null ? "mute" : percent >= REL_GREEN ? "ok" : percent >= REL_YELLOW ? "warn" : "red";
    const lines = [`${this.esc(item.domain || "")} · ${this.t("relEntities", { n: item.entities })}${item.permanent ? ` · ${this.t("relPermanent", { n: item.permanent })}` : ""}`];
    const layer = item.shared_outages ? (item.layer === "cloud" ? this.t("relLayerCloud") : this.t("relLayerLocal")) : "";
    if (layer) lines.push(layer);
    const flags = [];
    if (item.reauth) flags.push(`<span class="pill red">${this.t("relReauth")}</span>`);
    const pausing = this.apRowAction(item.entry_id);
    if (item.state && item.state !== "loaded") flags.push(`<span class="pill warn" title="${this.esc(item.state)}">${this.esc(this.entryStateLabel(item.state))}</span>`);
    if (pausing) flags.push(pausing);
    if (item.setup) lines.push(`${item.setup.count ? this.t("relSetup", { n: item.setup.count, days: item.setup.days, last: this.formatDate(item.setup.last) }) : ""}${item.setup.state ? `${item.setup.count ? " · " : ""}${this.t("relSetupNow", { state: item.setup.state })}` : ""}`);
    if (item.setup?.attempts) lines.push(this.t("relAttempts", { n: this.formatNumber(item.setup.attempts), date: this.formatDate(item.setup.attempts_since) }));
    return `<span class="tile ${tone}"><ha-icon icon="mdi:lan-connect"></ha-icon></span><span class="row-text"><strong>${this.esc(item.title)}</strong>${lines.map(line => `<small>${line}</small>`).join("")}${flags.length ? `<span class="relflags">${flags.join(" ")}</span>` : ""}</span><span class="pill ${tone}">${item.dead ? this.t("relDead") : percent === null ? "—" : `${this.formatNumber(percent)} %`}</span>${this.apRowMenu(item.entry_id, item.state)}`;
  }

  // The row of one config entry in the loaded numbers, for its detail page.
  reliabilityRow(item) {
    if (item.object_type !== "config_entry") return null;
    return (this.reliability?.entries || []).find(row => row.entry_id === item.object_id) || null;
  }

  reliabilityDetailCard(row) {
    const r = this.reliability;
    const items = row.affected || [];
    const list = this.objectTable(`relaffected-${row.entry_id || row.domain || ""}`, items.map(m => {
      const tone = m.availability >= REL_GREEN ? "ok" : m.availability >= REL_YELLOW ? "warn" : "red";
      return { key: `entity:${m.entity_id}`, type: "entity", name: m.name, sub: m.entity_id, tone, state: tone, stateLabel: this.t({ ok: "relAvailOk", warn: "relAvailWarn", red: "relAvailRed" }[tone]), avail: m.availability, pill: `<span class="pill ${tone}">${this.formatNumber(m.availability)} %</span>`, rank: m.availability };
    }), { extras: [{ key: "avail", label: "relColAvail", get: r => r.avail, cell: r => `${this.formatNumber(r.avail)} %` }], empty: "" });
    const more = row.affected_total > items.length ? `<p class="factnote">${this.t("relAffectedMore", { shown: items.length, total: row.affected_total })}</p>` : "";
    const hintKey = this.relSetupHint(row);
    const hint = hintKey ? `<div class="factnote"><strong>${this.t("relHintTitle")}</strong> ${this.t(hintKey, { n: row.setup.count, days: row.setup.days })}</div>` : "";
    const summary = `<div class="row">${this.relRowBody(row)}</div>${hint}`;
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("relTab")}</h2><p>${this.t(`relWindow${r.window_days}`)}${r.stale || r.age_seconds ? ` · ${this.t("relAgeNote", { when: this.relTime(new Date(r.computed_at * 1000).toISOString()) })}` : ""}</p></div></div>${summary}${this.relDetailExtras(row)}<div class="sectionlabel">${this.t("relAffected", { n: this.formatNumber(row.affected_total || 0) })}</div>${list || `<p class="factnote">${this.t("relNoAffected")}</p>`}${more}</section>`;
  }

  // The house functions that rely on the integration: a member is one of its entities, or one of its devices.
  // The recorder keeps less than the window asks for: the numbers reach back only that far.
  keepNote(r) {
    return r?.keep_days && r.window_days > r.keep_days ? `<p class="factnote">${this.t("relKeepShort", { keep: this.formatNumber(r.keep_days), days: r.window_days })}</p>` : "";
  }

  relHouseFunctions(entryId) {
    return this.monitorFunctions().filter(fn => (fn.members || []).some(m => {
      const object = this.findObject(m.object_key);
      return object && (object.config_entry_id === entryId || (object.config_entry_ids || []).includes(entryId));
    }));
  }

  // Figures, day strip and outage periods of one integration, from the periods the backend found in the window.
  relDetailExtras(row) {
    const r = this.reliability, days = row.days || [], periods = row.periods || [];
    const tile = (value, label) => `<div class="avail-tile"><b>${this.esc(value)}</b><span>${this.esc(label)}</span></div>`;
    const comparing = row.delta !== null && row.delta !== undefined;
    const tiles = [
      tile(row.dead ? "–" : this.formatNumber(row.shared_outages || 0), this.t("relSortOutages")),
      row.shared_outages ? tile(this.relDuration(row.longest_outage), this.t("relColLongest")) : "",
      comparing ? tile(`${row.delta > 0 ? "+" : row.delta < 0 ? "−" : "±"}${this.formatNumber(Math.abs(row.delta))}`, this.t("relDeltaPoints")) : "",
    ].filter(Boolean).join("");
    const dayClass = d => (!d.seconds ? "ok" : d.seconds < 864 ? "problem short" : "problem");
    const strip = days.length >= 7
      ? `<div class="monitor-days" role="img" aria-label="${this.esc(this.t("relStrip"))}">${days.map(d => `<i class="${dayClass(d)}" title="${this.esc(`${d.date}: ${d.seconds ? this.relDuration(d.seconds) : this.t("monitorAvailOk")}`)}"></i>`).join("")}</div><div class="monitor-axis"><span>${this.t("monitorAvailFrom", { days: days.length - 1 })}</span><span>${this.t("monitorAvailToday")}</span></div><div class="monitor-legend"><span><i class="ok"></i>${this.t("monitorAvailOk")}</span><span><i class="problem short"></i>${this.t("monitorAvailShort")}</span><span><i class="problem"></i>${this.t("monitorAvailLong")}</span></div>`
      : "";
    const kinds = { shared: "relKindShared", single: "relKindSingle", down: "relKindDown" };
    const when = p => this.formatDate(new Date(p.start * 1000).toISOString());
    const table = periods.length
      ? `<div class="sectionlabel">${this.t("relPeriods", { n: this.formatNumber(row.period_total ?? periods.length) })}</div><div class="tablewrap"><table class="evtable"><thead><tr><th>${this.t("relColStart")}</th><th>${this.t("relColDuration")}</th><th>${this.t("relColAffected")}</th><th>${this.t("relColKind")}</th></tr></thead><tbody>${periods.map(p => `<tr><td>${this.esc(when(p))}</td><td>${this.esc(this.relDuration(p.seconds))}</td><td>${this.esc(this.t("relOfEntities", { n: p.affected, m: row.entities + row.permanent }))}</td><td><span class="pill ${p.kind === "shared" || p.kind === "down" ? "warn" : "mute"}">${this.t(kinds[p.kind] || "relKindSingle")}</span></td></tr>`).join("")}</tbody></table></div>${(row.period_total || 0) > periods.length ? `<p class="factnote">${this.t("relPeriodsMore", { shown: periods.length, total: row.period_total })}</p>` : ""}`
      : "";
    const functions = this.relHouseFunctions(row.entry_id);
    const carries = functions.length ? `<p class="factnote">${this.t("relCarries")}: ${functions.map(fn => `<button class="link" data-monitor-last="${this.esc(fn.id)}">${this.esc(fn.name)}</button>`).join(", ")}</p>` : "";
    return `<div class="avail-tiles">${tiles}</div>${strip}${table}${carries}`;
  }

  // A guess at the cause from the setup failures and the availability, worded as a possibility.
  relSetupHint(row) {
    const setup = row.setup;
    if (!setup) return null;
    if (setup.state === "failed_unload" || setup.state === "migration_error") return "relHintUnload";
    if (setup.state === "setup_error") return "relHintError";
    if (setup.count >= 2 && row.availability !== null && row.availability !== undefined && row.availability < 95) return row.layer === "cloud" ? "relHintCloud" : "relHintOffline";
    return setup.count >= 2 ? "relHintEarly" : null;
  }

  // One row per integration entry: the numbers sit in columns so the list sorts by them; the sentences live on the detail page.
  relSetupCell(setup) {
    if (!setup) return "–";
    const now = setup.state ? `<small>${this.t("relSetupNow", { state: this.esc(this.entryStateLabel(setup.state)) })}</small>` : "";
    const last = setup.last ? `<small>${this.t("relSetupLast", { date: this.formatDate(setup.last) })}</small>` : "";
    const tries = setup.attempts ? `<small>${this.t("relAttempts", { n: this.formatNumber(setup.attempts), date: this.formatDate(setup.attempts_since) })}</small>` : "";
    return `${setup.count ? this.t("relSetupCount", { n: setup.count, days: setup.days }) : ""}${last}${tries}${now}`;
  }

  relEntriesList(r) {
    const tone = p => (p === null || p === undefined ? "mute" : p >= REL_GREEN ? "ok" : p >= REL_YELLOW ? "warn" : "red");
    const minEntities = r.thresholds?.shared_min_entities ?? 3;
    const outagesCell = e => (e.dead ? "–" : !e.shared_outages && e.entities < minEntities ? `<span class="pill mute" title="${this.esc(this.t("relTooSmallHint", { n: minEntities }))}">${this.t("relTooSmall")}</span>` : num(e.shared_outages));
    const availCell = e => (e.dead ? `<span class="pill red">${this.t("relDead")}</span><small>${this.t("relDeadSub", { n: e.permanent })}</small>` : e.availability === null || e.availability === undefined ? "–" : `<span class="pill ${tone(e.availability)}">${this.esc(this.formatNumber(e.availability))} %</span>`);
    const num = v => (v === null || v === undefined ? "–" : this.esc(this.formatNumber(v)));
    const compare = Boolean(r.comparison?.available);
    const delta = e => (e.delta === null || e.delta === undefined ? null : e.delta);
    const columns = [
      { key: "title", label: "utName", cell: e => this.nameCell(e.title, `${e.domain || ""} · ${this.t("relEntities", { n: e.entities })}`) },
      { key: "status", label: "relColStatus", sortable: false, cell: e => [e.reauth ? `<span class="pill red" role="link" tabindex="0" ${this.findObject(`config_entry:${e.entry_id}`) ? `data-object="${this.esc(`config_entry:${e.entry_id}`)}"` : 'data-jump="findingsNav" data-filter="config_entry.reauth"'} title="${this.esc(this.t("relReauthOpen"))}">${this.t("relReauth")}</span>` : "", e.state && e.state !== "loaded" ? `<span class="pill warn" title="${this.esc(e.state)}">${this.esc(this.entryStateLabel(e.state))}</span>` : "", this.apRowAction(e.entry_id), e.shared_outages && e.layer === "cloud" ? `<span class="pill mute">${this.t("relLayerCloud")}</span>` : ""].filter(Boolean).join(" ").replace(/^(.+)$/, '<span class="relpills">$1</span>') },
      { key: "setup", label: "relColSetup", dir: "desc", cell: e => this.relSetupCell(e.setup) },
      { key: "avail", label: "relSortAvail", dir: "asc", cell: availCell },
      // The longest outage stands below their count instead of in a column of its own, so the table fits a window;
      // it stays a sort of the list bar.
      { key: "outages", label: "relSortOutages", dir: "desc", cell: e => `${outagesCell(e)}${e.shared_outages ? `<small class="muted u-block">${this.esc(this.t("relLongestSub", { d: this.relDuration(e.longest_outage) }))}</small>` : ""}` },
      { key: "last", label: "relColLast", dir: "desc", cell: e => (e.last_disruption ? `${this.esc(this.formatDate(new Date(e.last_disruption.end * 1000).toISOString()))}<small class="muted u-block">${this.esc(this.relDuration(e.last_disruption.seconds))}</small>` : this.esc(this.t("relNoDisruption"))) },
      ...(compare ? [{ key: "delta", label: "relColDelta", dir: "asc", cell: e => (delta(e) === null ? "–" : this.esc(`${delta(e) > 0 ? "+" : delta(e) < 0 ? "−" : "±"}${this.formatNumber(Math.abs(delta(e)))}`)) }] : []),
      { key: "menu", label: "rowMenu", narrow: true, sortable: false, cell: e => this.apRowMenu(e.entry_id, e.state) },
    ];
    return this.sysList("relentries", r.entries, {
      sort: "avail", dir: "asc",
      sorts: [
        ...this.relSorts(),
        { key: "setup", label: "relColSetup", dir: "desc", get: e => e.setup?.count ?? 0 },
        { key: "longest", label: "relColLongest", dir: "desc", get: e => e.longest_outage ?? null },
        { key: "last", label: "relColLast", dir: "desc", get: e => e.last_disruption?.end ?? null },
        ...(compare ? [{ key: "delta", label: "relColDelta", dir: "asc", get: delta }] : []),
      ],
      filters: [{ name: "state", all: this.t("relAllStates"), options: [["dead", this.t("relOnlyDead")], ["outages", this.t("relOnlyOutages")], ["setup", this.t("relOnlySetup")]] }],
      filterFns: { state: (e, v) => (v === "dead" ? Boolean(e.dead) : v === "outages" ? e.shared_outages > 0 : Boolean(e.setup)) },
      text: e => [e.title, e.domain].join(" "), tie: e => e.title, empty: "relEmpty", columns,
      rowAttrs: e => (this.findObject(`config_entry:${e.entry_id}`) ? `data-object="${this.esc(`config_entry:${e.entry_id}`)}" tabindex="0" role="button" aria-label="${this.esc(e.title)}"` : 'class="static"'),
      exportName: "reliability", header: [this.t("utName"), "Domain", this.t("relSortAvail"), this.t("relSortOutages"), this.t("relColLongest")], rows: e => [e.title, e.domain, e.availability ?? "", e.shared_outages ?? 0, e.longest_outage ?? ""],
    });
  }

  reliabilityView() {
    this.ensureReliability();
    this.ensureAutoPause();
    const r = this.reliability;
    const apOpen = (this.viewTab ||= {}).reliability === "autopause";
    const windows = [[1, "relWindow1"], [7, "relWindow7"], [30, "relWindow30"]].map(([days, key]) => `<button class="chip ${this.relWindow === days ? "active" : ""}" data-rel-window="${days}" aria-pressed="${this.relWindow === days}">${this.t(key)}</button>`).join("") + `<button class="chip ${this.relCompare ? "active" : ""}" data-rel-compare aria-pressed="${this.relCompare}">${this.t("relCompare")}</button>`;
    const aged = Boolean(r?.computed_at && (r.stale || r.age_seconds >= 60)), took = aged ? "" : this.tookNote(r).replace(/^ · /, "");
    const head = apOpen
      ? this.pageBar({ left: "", loading: this.apLoading, attr: "data-ap-refresh" })
      : this.pageBar({ left: `${windows}${took ? `<span>${this.esc(took)}</span>` : ""}`, at: r?.computed_at ? new Date(r.computed_at * 1000).toISOString() : null, loading: this.relLoading, attr: "data-rel-refresh" });
    // Without numbers (no recorder, still loading) the tiles stay, so Auto-Pause is always reachable: it does not need them.
    const alone = inner => {
      const tabs = [
        { id: "integrations", icon: "mdi:puzzle-outline", label: this.t("relTabIntegrations"), hint: "", status: true },
        { id: "unstable", icon: "mdi:pulse", label: this.t("relTabUnstable"), hint: "", status: true },
        this.autoPauseTile(),
      ];
      const open = this.viewTabOf("reliability", tabs, "integrations");
      return `<div class="stack">${head}${this.navTiles("reliability", tabs, open, this.t("reliability"), true)}${open === "autopause" ? this.autoPauseView() : `<div class="panel">${inner}</div>`}</div>`;
    };
    if (this.relError) return alone(`${this.notice("err", this.relError)}`);
    if (!r) return alone(this.skeleton("relLoading"));
    if (!r.available) return alone(`<p class="factnote">${this.t("relNoRecorder")}</p>`);
    if (r.busy) return alone(`${this.skeleton("relBusy")}<p class="factnote">${this.t("relBusy")}</p>`);
    if (!r.entries.length) return alone(`<div class="emptymsg">${this.t("relEmpty")}</div>`);
    const loading = (this.relLoading ? `<p class="factnote">${this.t("relLoading")}</p>` : "") + this.keepNote(r);
    const th = r.thresholds || {};
    const cov = r.coverage;
    const coverage = cov && cov.observed_share !== null && cov.observed_share !== undefined ? this.coverageNote(this.t("relCoverage", { days: r.window_days, withData: this.formatNumber(cov.with_data), known: this.formatNumber(cov.known), share: cov.observed_share })) : "";
    const list = this.relEntriesList(r);
    const u = r.unstable || { total: 0, entities: {} };
    const flapping = Object.values(u.entities || {}).filter(e => e.level === "flapping").length;
    const outages = r.entries.filter(e => e.shared_outages > 0).length;
    const attention = r.entries.filter(e => e.reauth || (e.state && e.state !== "loaded")).length;
    const dead = r.entries.filter(e => e.dead).length;
    const figures = r.entries.filter(e => !e.dead && e.availability !== null && e.availability !== undefined);
    const overall = figures.length ? figures.reduce((n, e) => n + e.availability, 0) / figures.length : null;
    const availText = overall === null ? "–" : `${this.formatNumber(Math.round(overall * 10) / 10)} %`;
    const odd = r.entries.filter(e => e.dead || e.shared_outages > 0 || e.reauth || (e.state && e.state !== "loaded") || e.setup).length;
    const setupCount = r.entries.filter(e => e.setup).length;
    // The average availability stands in the area tile above; the row below counts integrations only.
    const tiles = this.sumTiles([
      { label: this.t("relSumAll"), value: this.formatNumber(r.entries.length), tone: "mute", lf: ["relentries", "", ""] },
      { label: this.t("relOnlyDead"), value: this.formatNumber(dead), tone: dead ? "red" : "ok", lf: ["relentries", "state", "dead"] },
      { label: this.t("relOnlyOutages"), value: this.formatNumber(outages), tone: outages ? "warn" : "ok", lf: ["relentries", "state", "outages"] },
      { label: this.t("relOnlySetup"), value: this.formatNumber(setupCount), tone: setupCount ? "warn" : "ok", lf: ["relentries", "state", "setup"] },
    ]);
    const tabs = [
      { id: "integrations", icon: "mdi:puzzle-outline", label: this.t("relTabIntegrations"), hint: this.t("relTileIntHint", { avail: availText, window: this.t(`relWindow${r.window_days}`) }), count: r.entries.length, tone: outages || attention ? "warn" : "ok", pill: odd ? this.t("relTilePill", { n: this.formatNumber(odd) }) : "", pillTone: attention ? "red" : "warn" },
      { id: "unstable", icon: "mdi:pulse", label: this.t("relTabUnstable"), hint: this.t("relTileUnstableHint"), count: u.total || 0, tone: flapping ? "red" : u.total ? "warn" : "ok", pill: flapping ? this.t("relSumFlapping", { n: this.formatNumber(flapping) }) : "" },
      this.autoPauseTile(),
    ];
    const open = this.viewTabOf("reliability", tabs, u.total && !outages ? "unstable" : "integrations");
    const body = open === "autopause" ? this.autoPauseView() : open === "unstable" ? this.unstableCard(r) : `<div class="panel">${coverage}${loading}${list}${this.howCounted("relFootnote", { days: r.window_days, share: th.shared_share_percent ?? 80, entities: th.shared_min_entities ?? 3, minutes: Math.round((th.shared_min_seconds ?? 300) / 60), green: this.formatNumber(REL_GREEN), yellow: this.formatNumber(REL_YELLOW) })}</div>`;
    return `<div class="stack">${head}${this.navTiles("reliability", tabs, open, this.t("reliability"), true)}${open === "integrations" ? tiles : ""}${body}</div>`;
  }

  // The numbers behind "unstable" or "flapping" as lines of text; also used on the entity's detail page.
  unstableLines(item, days) {
    const lines = [this.t("relEpisodes", { n: item.episodes, days, rate: this.formatNumber(item.per_day), total: this.relDuration(item.total_seconds), mean: this.relDuration(item.mean_seconds) })];
    if (item.pattern_hour !== null && item.pattern_hour !== undefined) lines.push(this.t("relPattern", { from: String(item.pattern_hour).padStart(2, "0"), to: String((item.pattern_hour + 2) % 24).padStart(2, "0") }));
    if (item.used) lines.push(this.t("relFollowers", { n: item.used }));
    return lines;
  }

  // The stability of an entity for its detail page, from numbers that already exist: it never starts the recorder query.
  ensureStability() {
    if (this._stabRequested === this.relWindow || this.reliability?.available) return;
    this._stabRequested = this.relWindow;
    setTimeout(async () => {
      try { this.stability = await this._hass.callWS({ type: "ha_housekeeper/reliability", window_days: this.relWindow, cached_only: true }); } catch (_) { return; }
      if (this.selected?.object_type === "entity" || this.view === "findingsNav") this.render();
    }, 0);
  }

  // null: unknown; { missing }: never calculated; { info: null }: calculated, stable; { info }: unstable or flapping.
  stabilityOf(item) {
    const r = this.reliability?.available && !this.reliability.busy ? this.reliability : this.stability;
    if (!r || !r.available) return null;
    if (r.missing) return { missing: true };
    const map = r.unstable?.entities;
    if (!map) return null; // a reply kept by an older version
    return { r, info: map[item.object_id] || null };
  }

  unstableCard(r) {
    const u = r.unstable, th = r.thresholds || {};
    if (!u) return "";
    const head = `${r.coverage ? this.coverageNote(this.t("relUnstableCoverage", { days: r.window_days, withData: this.formatNumber(r.coverage.with_data) }) + ` ${this.excludedText(u.excluded)}`.trimEnd()) : ""}`;
    if (!u.items.length) return `<div class="panel">${head}<div class="emptymsg">${this.t("relUnstableNone")}</div></div>`;
    const more = u.total > u.items.length ? `<p class="factnote">${this.t("relUnstableMore", { shown: u.items.length, total: u.total })}</p>` : "";
    const rank = new Map(u.items.map((item, i) => [item, i]));
    const sorts = [
      { key: "rank", label: "relSortRank", dir: "asc", get: item => rank.get(item) },
      { key: "name", label: "sortName", dir: "asc", get: item => item.name },
      { key: "episodes", label: "relSortEpisodes", dir: "desc", get: item => item.episodes },
      { key: "rate", label: "relSortRate", dir: "desc", get: item => item.per_day },
      { key: "duration", label: "relSortDuration", dir: "desc", get: item => item.total_seconds },
    ];
    const tone = item => (item.level === "flapping" ? "red" : "warn");
    // The hours in which most outages begin, as "3–5 Uhr", with the whole sentence as tooltip.
    const hours = item => ({ from: String(item.pattern_hour).padStart(2, "0"), to: String((item.pattern_hour + 2) % 24).padStart(2, "0") });
    const pattern = item => (item.pattern_hour === null || item.pattern_hour === undefined ? null : this.t("relPatternCell", hours(item)));
    const list = this.sysList("relunstable", u.items, {
      sort: "rank", dir: "asc",
      sorts: [...sorts, { key: "pattern", label: "relColPattern", dir: "asc", get: item => item.pattern_hour ?? null }],
      filters: [{ name: "level", all: this.t("relAllStates"), options: [["flapping", this.t("relOnlyFlapping")], ["unstable", this.t("relOnlyUnstable")]] }],
      filterFns: { level: (item, v) => item.level === v },
      text: item => [item.name, item.entity_id, item.entry_title].join(" "), tie: item => item.entity_id, empty: "relUnstableNone",
      rowAttrs: item => `data-object="entity:${this.esc(item.entity_id)}" tabindex="0" role="button" aria-label="${this.esc(item.name)}"`,
      columns: [
        { key: "name", label: "utName", cell: item => this.nameCell(item.name, `${item.entity_id}${item.entry_title ? ` · ${item.entry_title}` : ""}`) },
        { key: "level", label: "relColLevel", sortable: false, cell: item => `<span class="pill ${tone(item)}">${this.t(item.level === "flapping" ? "relFlapping" : "relUnstable")}</span>` },
        { key: "episodes", label: "relSortEpisodes", dir: "desc", cell: item => this.esc(this.formatNumber(item.episodes)) },
        { key: "rate", label: "relSortRate", dir: "desc", cell: item => this.esc(this.formatNumber(item.per_day)) },
        { key: "duration", label: "relSortDuration", dir: "desc", cell: item => this.esc(this.relDuration(item.total_seconds)) },
        { key: "pattern", label: "relColPattern", dir: "asc", cell: item => (pattern(item) ? `<span title="${this.esc(this.t("relPattern", hours(item)))}">${this.esc(pattern(item))}</span>` : "–") },
      ],
      exportName: "reliability-unstable", header: [this.t("utName"), "ID", this.t("relSortEpisodes"), this.t("relSortRate"), this.t("relSortDuration")], rows: item => [item.name, item.entity_id, item.episodes, item.per_day, item.total_seconds],
    });
    const count = level => u.items.filter(item => item.level === level).length;
    const tiles = this.sumTiles([
      // "All" counts every unstable entity; the list holds the most noticeable of them, which the sub line says.
      { label: this.t("relSumAll"), value: this.formatNumber(u.total ?? u.items.length), sub: u.total > u.items.length ? this.esc(this.t("relUnstableShownSub", { n: this.formatNumber(u.items.length) })) : "", tone: "mute", lf: ["relunstable", "", ""] },
      { label: this.t("relOnlyFlapping"), value: this.formatNumber(count("flapping")), tone: count("flapping") ? "red" : "ok", lf: ["relunstable", "level", "flapping"] },
      { label: this.t("relOnlyUnstable"), value: this.formatNumber(count("unstable")), tone: count("unstable") ? "warn" : "ok", lf: ["relunstable", "level", "unstable"] },
    ]);
    return `${tiles}<div class="panel">${head}${list}${more}${this.howCounted("relUnstableFootnote", { episodes: th.unstable_min_episodes ?? 3, rate: this.formatNumber(th.unstable_per_day ?? 0.5), flap: this.formatNumber(th.flapping_per_day ?? 1.5) })}</div>`;
  }
}
