// RunsMixin: the automation runs view; mixed into the panel in 99-register.js.
const RUN_FINDINGS = {
  failing: ["rfLabelFailing", "rfFailing"], overlap: ["rfLabelOverlap", "rfOverlap"], never_ok: ["rfLabelNeverOk", "rfNeverOk"],
  no_effect: ["rfLabelNoEffect", "rfNoEffect"], burst: ["rfLabelBurst", "rfBurst"], long_run: ["rfLabelLongRun", "rfLongRun"],
  after_update: ["rfLabelAfterUpdate", "rfAfterUpdate"], long_wait: ["rfLabelLongWait", "rfLongWait"],
  wait_no_timeout: ["rfLabelWaitNoTimeout", "rfWaitNoTimeout"], continue_on_error: ["rfLabelContinue", "rfContinue"],
};

class RunsMixin {
  async loadRuns() {
    this.runsLoading = true; this.runsError = ""; this.render();
    try { this.runs = await this._hass.callWS({ type: "ha_housekeeper/automation_runs" }); this.markLoaded("runs"); }
    catch (err) { this.runsError = this.errText(err); }
    this.runsLoading = false; this.render();
  }

  // Loaded once per visit; the button counts again.
  ensureRuns() {
    if (this.runsLoading || this._runsRequested) return;
    this._runsRequested = true;
    setTimeout(() => this.loadRuns(), 0);
  }

  runsDuration(ms) {
    if (ms === null || ms === undefined) return "—";
    if (ms < 1000) return this.t("runsMs", { n: ms });
    if (ms < 60000) return this.t("runsSec", { n: this.formatNumber(Math.round(ms / 100) / 10) });
    return this.relDuration(ms / 1000);
  }

  runFindingText(f) {
    const p = {
      failing: () => this.t("rfFailing", { errors: f.errors, runs: f.runs }) + (f.step ? this.t("rfFailingStep", { step: this.esc(f.step), count: f.step_count }) : ""),
      overlap: () => this.t("rfOverlap", { n: f.already + f.maxed, mode: this.esc(f.mode || "—") }),
      never_ok: () => this.t("rfNeverOk", { runs: f.runs }),
      no_effect: () => this.t("rfNoEffect", { conditions: f.conditions, runs: f.runs }),
      burst: () => this.t("rfBurst", { perDay: this.formatNumber(f.per_day), normal: this.formatNumber(f.normal) }),
      long_run: () => this.t("rfLongRun", { longest: this.runsDuration(f.longest_ms), normal: this.runsDuration(f.normal_ms) }),
      after_update: () => this.t("rfAfterUpdate", { after: f.rate_after, before: f.rate_before, what: this.esc(f.event === "ha_version" ? this.t("rfWhatHa", { to: f.to || "" }) : this.t("rfWhatEntry", { domain: f.domain || "", to: f.to || "" })) }),
      long_wait: () => this.t("rfLongWait", { duration: this.relDuration(f.seconds) }),
      wait_no_timeout: () => this.t("rfWaitNoTimeout", { n: f.count }),
      continue_on_error: () => this.t("rfContinue", { n: f.count }),
    }[f.kind];
    return p ? p() : "";
  }

  // Pill, figure and hint of each finding; the space keeps the sentences apart where a table sets the line inline.
  runsFindingLines(row) {
    return row.findings.map(f => `<small class="fline"><span class="pill ${f.level === "info" ? "mute" : f.level}">${this.t((RUN_FINDINGS[f.kind] || ["rfLabelFailing"])[0])}</span><span class="fnum">${this.runFindingText(f)}</span> <span class="fnote">${this.t(`rfHint_${f.kind}`)}</span></small>`).join("");
  }

  runsTrend(row, days = row.per_day) {
    const max = Math.max(1, ...days);
    const bars = days.map(n => `<i style="height:${Math.round((n / max) * 100)}%"></i>`).join("");
    return `<span class="runspark" role="img" aria-label="${this.esc(this.t("runsTrendLabel", { values: days.join(", ") }))}">${bars}</span>`;
  }

  // The cells of one possible conflict or loop between automations: what it is and how often it was seen.
  conflictText(c) {
    const names = c.automations.map(a => `<b>${this.esc(a.name)}</b>`);
    return c.kind === "opposing"
      ? this.t("cfOpposing", { first: names[0], second: names[1], entity: `<code>${this.esc(c.entity_id)}</code>`, a: this.esc(c.commands[0]), b: this.esc(c.commands[1]) }) + " " + this.t(`cfWhy_${c.reason}`, { detail: this.esc(c.detail) })
      : this.t("cfLoop", { chain: names.join(", "), path: c.entities.map(e => `<code>${this.esc(e)}</code>`).join(" → ") });
  }

  conflictSeen(c) {
    return c.stage === "static" ? this.t("cfStatic") : this.t(c.kind === "loop" ? "cfSeenLoop" : "cfSeen", { n: c.days, min: this.runs?.thresholds?.conflicts_loop_min_runs_per_day ?? 20 });
  }

  // Possible conflicts and loops between automations as a table; only shown when the check found something.
  conflictsPanel(r) {
    const c = r.conflicts;
    if (!c) return "";
    if (!c.items.length) return `<p class="factnote">${this.t("cfNone")}</p>`;
    const rank = { confirmed: 0, observed: 1, static: 2 };
    const key = item => `${item.kind}|${item.entity_id || (item.entities || []).join(",")}|${item.automations.map(a => a.entity_id).join(",")}`;
    const tone = item => (item.stage === "confirmed" && !item.ignored ? "warn" : "mute");
    const list = this.sysList("runs_conflicts", c.items, {
      sort: "stage", dir: "asc", tie: key, empty: "cfNone",
      sorts: [
        { key: "stage", label: "cfColStage", dir: "asc", get: item => rank[item.stage] ?? 3 },
        { key: "kind", label: "cfColKind", dir: "asc", get: item => this.t(`cfKind_${item.kind}`) },
      ],
      filters: [{ name: "kind", all: this.t("cfAllKinds"), options: [["opposing", this.t("cfKind_opposing")], ["loop", this.t("cfKind_loop")]] }],
      filterFns: { kind: (item, v) => item.kind === v },
      text: item => [...item.automations.map(a => a.name), item.entity_id, ...(item.entities || [])].join(" "),
      columns: [
        { key: "stage", label: "cfColStage", dir: "asc", cell: item => `<span class="pill ${tone(item)}">${this.t(`cfStage_${item.stage}`)}</span>` },
        { key: "kind", label: "cfColKind", dir: "asc", cell: item => this.t(`cfKind_${item.kind}`) },
        { key: "what", label: "cfColWhat", sortable: false, cell: item => `${this.conflictText(item)}<small>${this.esc(this.conflictSeen(item))}</small><small class="fnote">${this.t(`cfHint_${item.kind}`)}</small>${item.ignored ? `<small>${this.t("cfKnownNote")}</small>` : ""}` },
        { key: "autos", label: "cfColAutomations", sortable: false, cell: item => item.automations.map(a => `<button class="link" data-object="${this.esc(`automation:${a.entity_id}`)}">${this.esc(a.name)}</button>`).join(" · ") },
        { key: "act", label: "cfColAction", sortable: false, cell: item => `<button class="btn" data-conflict-key="${this.esc(item.key)}" data-conflict-value="${item.ignored ? 0 : 1}">${this.t(item.ignored ? "cfReport" : "cfKnown")}</button>` },
      ],
    });
    return `<div class="panel">${this.fold("runs_conflicts", { tone: "warn", title: this.t("cfTitle"), sub: this.t("cfHint"), pill: this.formatNumber(c.total) }, list, false)}</div>`;
  }

  runsSorts() {
    return [
      { key: "name", label: "runsColName", dir: "asc", get: r => r.name },
      { key: "runs", label: "runsColRuns", dir: "desc", get: r => r.runs },
      { key: "errors", label: "runsColErrors", dir: "desc", get: r => r.errors },
      { key: "conditions", label: "runsColConditions", dir: "desc", get: r => r.conditions },
      { key: "duration", label: "runsColDuration", dir: "desc", get: r => r.mean_ms },
    ];
  }

  // Search text and the two filters of the runs view; they cut the table and the list of what stands out alike.
  runsMatch(row) {
    const st = this.lv.runs, q = st.q.trim().toLowerCase();
    if (q && ![row.name, row.entity_id].join(" ").toLowerCase().includes(q)) return false;
    if (st.f.type && row.object_type !== st.f.type) return false;
    if (st.f.outcome === "errors" && !row.errors) return false;
    if (st.f.outcome === "flagged" && !row.findings.length) return false;
    if (st.f.outcome === "never" && !row.findings.some(f => f.kind === "never_ok")) return false;
    return true;
  }

  runsBar(rows = []) {
    this.setExporter("runs", "runs", [this.t("runsColName"), "ID", this.t("runsColRuns"), this.t("runsColErrors"), this.t("runsColConditions"), `${this.t("runsColDuration")} (ms, mean)`, `${this.t("runsColDuration")} (ms, max)`], () => rows.map(r => [r.name, r.entity_id, r.runs, r.errors, r.conditions, r.mean_ms ?? "", r.max_ms ?? ""]));
    return this.listBar("runs", { table: true, dense: true, columns: [{ key: "runs", label: "runsColRuns" }, { key: "errors", label: "runsColErrors" }, { key: "conditions", label: "runsColConditions" }, { key: "duration", label: "runsColDuration" }, { key: "trend", label: "runsColTrend" }], sorts: this.runsSorts(), filters: [
      { name: "type", all: this.t("allTypes"), options: [["automation", this.t("automation")], ["script", this.t("script")]] },
      { name: "outcome", all: this.t("runsAllOutcomes"), options: [["errors", this.t("runsOnlyErrors")], ["flagged", this.t("runsOnlyFlagged")], ["never", this.t("ovRunsNever")]] },
    ] });
  }

  runsTable(rows) {
    this.lvState("runs", "runs", "desc");
    const pg = this.paginate("runsall", rows);
    const columns = [
      { key: "name", label: "runsColName", dir: "asc", cell: row => this.nameCell(row.name, row.entity_id) + this.runsFindingLines(row) },
      { key: "runs", label: "runsColRuns", dir: "desc", cell: row => `${this.formatNumber(row.runs)}${row.lower_bound ? "+" : ""}` },
      { key: "errors", label: "runsColErrors", dir: "desc", cell: row => this.formatNumber(row.errors) },
      { key: "conditions", label: "runsColConditions", dir: "desc", cell: row => this.formatNumber(row.conditions) },
      { key: "duration", label: "runsColDuration", dir: "desc", cell: row => `${this.runsDuration(row.mean_ms)} / ${this.runsDuration(row.max_ms)}` },
      { key: "trend", label: "runsColTrend", sortable: false, cell: row => this.runsTrend(row) },
    ];
    const table = this.listTable("runs", columns, pg.rows, { cls: "runs", rowAttrs: row => `data-object="${this.esc(`${row.object_type}:${row.entity_id}`)}" tabindex="0" role="button" aria-label="${this.esc(row.name)}"` });
    return `${table}${pg.footer}`;
  }

  // The numbers of one automation or script for its detail page; only when runs were counted for it.
  runsRow(item) {
    if (!["automation", "script"].includes(item.object_type)) return null;
    return (this.runs?.items || []).find(row => row.entity_id === item.object_id && (row.runs || row.findings.length)) || null;
  }

  runsDetailCard(row) {
    const since = this.runs?.since ? this.t("runsTabHint", { date: this.formatDate(this.runs.since) }) : "";
    const facts = [["runsColRuns", `${this.formatNumber(row.runs)}${row.lower_bound ? "+" : ""}`], ["runsColErrors", this.formatNumber(row.errors)], ["runsColConditions", this.formatNumber(row.conditions)], ["runsColDuration", `${this.runsDuration(row.mean_ms)} / ${this.runsDuration(row.max_ms)}`]]
      .map(([label, value]) => `<dt>${this.t(label)}</dt><dd>${value}</dd>`).join("");
    const notes = row.findings.length ? `<div class="pad">${this.runsFindingLines(row)}</div>` : "";
    const c = row.change;
    const side = s => this.t("runsChangeSide", { errors: this.formatNumber(s.errors), runs: this.formatNumber(s.runs) });
    const change = c ? `<div class="pad"><p class="factnote"><ha-icon icon="mdi:source-commit"></ha-icon> ${this.esc(this.t("runsChange", { date: this.formatDate(c.at), after: side(c.after), before: side(c.before) }))}</p></div>` : "";
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("runsTab")}</h2><p>${since}</p></div></div><div class="pad"><dl class="kv">${facts}<dt>${this.t("runsTrend30")}</dt><dd>${this.runsTrend(row, row.per_day_30 || row.per_day)}</dd></dl></div>${change}${notes}${this.howCounted("runsFootnote", this.runsLimits(this.runs || {}))}</section>`;
  }

  // Two tabs: the counted runs, and the quality of each automation (46-diagnostics.js).
  runsView() {
    const tabs = [
      { id: "overview", icon: "mdi:clipboard-pulse-outline", label: this.t("qualityTab"), hint: this.t("runsTileQualityHint"), tone: "mute" },
      { id: "runs", icon: "mdi:run-fast", label: this.t("runsTabRuns"), hint: this.t("runsTileRunsHint"), tone: "mute" },
      { id: "scripts", icon: "mdi:script-text-outline", label: this.t("scTab"), hint: this.t("scTabHint"), tone: "mute" },
    ];
    const open = this.viewTabOf("runs", tabs, "overview");
    if (open === "overview") return `<div class="stack">${this.navTiles("runs", tabs, open, this.t("runs"), true)}${this.qualityView()}</div>`;
    const body = open === "scripts" ? this.scriptsView() : this.runsListView();
    return `<div class="stack">${this.navTiles("runs", tabs, open, this.t("runs"), true)}${body}</div>`;
  }

  runsLimits(r) {
    const th = r.thresholds || {};
    return { days: r.window_days, errors: th.failing_min_errors ?? 3, rate: Math.round((th.failing_min_rate ?? 0.2) * 100), neverOk: th.never_ok_min_runs ?? 5, overlap: th.overlap_min ?? 3, idle: th.no_effect_min_runs ?? 20, idleShare: Math.round((th.no_effect_share ?? 0.9) * 100), burst: th.burst_factor ?? 5, baseline: th.baseline_days ?? 28, burstMin: th.burst_min_per_day ?? 100, longFactor: th.long_run_factor ?? 10, longSeconds: Math.round((th.long_run_min_ms ?? 60000) / 1000) };
  }

  runsListView() {
    this.ensureRuns();
    const r = this.runs;
    const since = r?.since ? ` · ${this.t("runsSince", { date: this.formatDate(r.since) })}` : "";
    const head = this.pageBar({ left: since ? `<span>${this.esc(since.replace(/^ · /, ""))}</span>` : "", at: this.loadedAt("runs"), loading: this.runsLoading, attr: "data-runs-refresh" });
    if (this.runsError) return `<div class="stack">${head}<div class="panel">${this.notice("err", this.runsError)}</div></div>`;
    if (!r) return `<div class="stack">${head}<div class="panel">${this.skeleton("runsLoading")}</div></div>`;
    this.lvState("runs", "runs", "desc");
    const lower = r.items.filter(row => row.lower_bound).length;
    const coverage = this.coverageNote(this.t(lower ? (lower === 1 ? "runsCoverageLower1" : "runsCoverageLower") : "runsCoverageFull", { n: this.formatNumber(lower), days: r.window_days }) + ` ${this.excludedText(r.excluded)}`.trimEnd());
    const everyCounted = r.items.filter(row => row.runs);
    const counted = this.refine("runs", everyCounted.filter(row => this.runsMatch(row)), { text: row => [row.name, row.entity_id].join(" "), sorts: this.runsSorts(), tie: row => row.entity_id });
    const bar = everyCounted.length > 5 || this.lv.runs.q ? this.runsBar(counted) : "";
    const more = r.total > r.items.length ? `<p class="factnote">${this.t("runsMore", { shown: r.items.length, total: r.total })}</p>` : "";
    const all = everyCounted.length ? `<div class="panel"><div class="panelhead"><div><h2>${this.t("runsAll")}</h2></div></div>${bar}${counted.length ? this.runsTable(counted) : `<div class="emptymsg">${this.t("noMatches")}</div>`}${more}${this.howCounted("runsFootnote", this.runsLimits(r))}</div>` : "";
    const runTotal = r.items.reduce((n, row) => n + row.runs, 0), errorTotal = r.items.reduce((n, row) => n + row.errors, 0);
    const neverOk = r.items.filter(row => row.findings.some(f => f.kind === "never_ok")).length;
    const allFlagged = r.items.filter(row => row.findings.length).length;
    const tiles = this.sumTiles([
      { label: this.t("runsSumRuns"), value: this.formatNumber(runTotal), sub: this.t("runsSumOf", { n: this.formatNumber(everyCounted.length) }), tone: "mute" },
      { label: this.t("runsColErrors"), value: this.formatNumber(errorTotal), sub: runTotal ? this.t("runsSumShare", { n: this.formatNumber(Math.round((1000 * errorTotal) / runTotal) / 10) }) : "", tone: errorTotal ? "warn" : "ok", lf: ["runs", "outcome", "errors"] },
      { label: this.t("runsSumFlagged"), value: this.formatNumber(allFlagged), tone: allFlagged ? "warn" : "ok", lf: ["runs", "outcome", "flagged"] },
      { label: this.t("runsSumNeverOk"), value: this.formatNumber(neverOk), tone: neverOk ? "red" : "ok", lf: ["runs", "outcome", "never"] },
    ]);
    return `<div class="stack">${head}${tiles}<div class="panel">${coverage}${!everyCounted.length ? `<div class="emptymsg">${this.t("runsNoData")}</div>` : allFlagged ? "" : `<p class="factnote">${this.t("runsNone")}</p>`}</div>${all}${this.conflictsPanel(r)}</div>`;
  }
}
