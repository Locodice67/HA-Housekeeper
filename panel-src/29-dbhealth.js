// DbHealthMixin: the database card in Maintenance; mixed into the panel in 99-register.js.
class DbHealthMixin {
  async loadDbHealth(refresh = false, check = false) {
    this.dbLoading = true; this.dbError = ""; this.render();
    try { this.dbHealth = await this._hass.callWS({ type: "ha_housekeeper/db_health", refresh, ...(check ? { check } : {}) }); }
    catch (err) { this.dbError = this.errText(err); }
    this.dbLoading = false; this.render();
    this.followUp("db", "recorder", this.dbHealth, r => this.loadDbHealth(r), refresh);
    // The full check runs on in the background: look again until it is done (cached reply, no new query).
    globalThis.clearTimeout?.(this._dbCheckTimer);
    if (this.dbHealth?.integrity?.running) this._dbCheckTimer = setTimeout(() => this.loadDbHealth(false), 5000);
  }

  // Loads on the first visit of Maintenance only: the query reads the recorder, so the overview never starts it.
  ensureDbHealth() {
    if (this.dbLoading || this._dbRequested) return;
    this._dbRequested = true;
    setTimeout(() => this.loadDbHealth(), 0);
  }

  // A series that is a known entity opens it on the page; the export gets plain names.
  dbSeriesName(s, links) {
    const key = `entity:${s.statistic_id}`, name = this.esc(s.name || s.statistic_id);
    return links && this.findObject(key) ? `<button type="button" class="linklike" data-object="${this.esc(key)}">${name}</button>` : name;
  }

  dbSeriesList(series, links) {
    return series.map(s => this.dbSeriesName(s, links)).join(", ");
  }

  // Growth a day with its sign: a database that shrank after a purge shows minus, not zero. plus also marks growth.
  dbGrowthSize(bytes, plus = false) {
    return `${bytes < 0 ? "−" : plus ? "+" : ""}${this.formatBytes(Math.abs(bytes))}`;
  }

  // The recorder names MariaDB "mysql"; the panel names both.
  dbDialect(dialect) {
    return { sqlite: "SQLite", mysql: "MariaDB/MySQL", postgresql: "PostgreSQL" }[dialect] || dialect || "?";
  }

  dbFindingText(f, links = false) {
    const n = v => this.formatNumber(v), size = v => this.formatBytes(v);
    if (f.kind === "wal_large") return this.t("dbWal", { wal: size(f.wal_bytes), db: size(f.db_bytes) });
    if (f.kind === "growth") return this.t("dbGrowth", { recent: size(f.recent_bytes), base: size(f.base_bytes) });
    if (f.kind === "duplicates") return this.t("dbDuplicates", { n: n(f.groups), more: f.capped ? "+" : "", list: this.dbSeriesList(f.series, links) });
    if (f.kind === "missing_hours") {
      if (!f.gap_hours) return this.t("dbMissingOwnOnly", { n: n(f.series_total) });
      return `${this.t("dbMissingShared", { n: n(f.series_total), hours: n(f.gap_hours), count: n(f.gaps_total) })} ${f.own_series ? this.t("dbMissingOwn", { n: n(f.own_series) }) : this.t("dbMissingOnlyShared")}`;
    }
    if (f.kind === "statistics_issues") return this.t("dbIssues", { n: n(f.series_total), list: f.series.map(s => `${this.dbSeriesName(s, links)} (${s.types.map(type => this.t(`dbIssue_${type}`) === `dbIssue_${type}` ? type : this.t(`dbIssue_${type}`)).join(", ")})`).join(", ") });
    if (f.kind === "disk_low") return this.t("dbDiskLow", { free: size(f.free_bytes), total: size(f.total_bytes) });
    if (f.kind === "corrupt_files") return this.t("dbCorruptFiles", { n: n(f.files), size: size(f.bytes), list: f.names.map(x => this.esc(x)).join(", ") });
    if (f.kind === "integrity") return this.t("dbIntegrity", { at: this.formatDate(f.at), lines: f.lines.map(l => this.esc(l)).join("; ") }) + (f.unclean_starts ? ` ${this.t("dbIntegrityCrash", { n: n(f.unclean_starts) })}` : "");
    return this.t("dbRecorderGap", { n: n(f.gaps), longest: this.relDuration(f.longest_seconds), latest: this.formatDate(new Date(f.latest[0].start * 1000).toISOString()) });
  }

  // What lies behind a finding: the periods all series lack, and the series with their own and their shared hours.
  dbFindingExtra(f) {
    if (f.kind !== "missing_hours" || !(f.gaps?.length || f.series?.length)) return "";
    const day = seconds => this.formatDate(new Date(seconds * 1000).toISOString());
    const gaps = f.gaps?.length ? this.sysList("dbgaps", f.gaps, {
      sort: "start", dir: "desc", tie: g => g.start, empty: "dbSeriesNone",
      sorts: [{ key: "start", label: "dbColFrom", dir: "desc", get: g => g.start }, { key: "hours", label: "dbColHours", dir: "desc", get: g => g.hours ?? 0 }],
      text: g => `${day(g.start)} ${day(g.end)} ${this.t(`dbGapCause_${g.cause}`)}`,
      columns: [
        { key: "start", label: "dbColFrom", dir: "desc", cell: g => this.esc(day(g.start)) },
        { key: "end", label: "dbColTo", sortable: false, cell: g => this.esc(day(g.end)) },
        { key: "hours", label: "dbColHours", dir: "desc", cell: g => this.esc(this.t("dbMissingHours", { n: this.formatNumber(g.hours) })) },
        { key: "cause", label: "dbColCause", sortable: false, cell: g => `<span class="pill ${g.cause === "restart" ? "mute" : "warn"}">${this.t(`dbGapCause_${g.cause}`)}</span>` },
      ],
    }) : "";
    const shared = Boolean(f.gap_hours);
    const sorts = [
      { key: "name", label: "utName", dir: "asc", get: x => x.name || x.statistic_id },
      { key: "own", label: "dbColOwn", dir: "desc", get: x => x.own ?? 0 },
      ...(shared ? [{ key: "shared", label: "dbColShared", dir: "desc", get: x => x.shared ?? 0 }] : []),
      { key: "missing", label: "dbColMissing", dir: "desc", get: x => x.missing ?? 0 },
    ];
    const num = key => x => this.formatNumber(x[key] ?? 0);
    const table = this.sysList("dbseries", f.series, {
      sort: "missing", dir: "desc", sorts, text: x => `${x.name || ""} ${x.statistic_id}`, tie: x => x.statistic_id, empty: "dbSeriesNone",
      rowAttrs: x => this.findObject(`entity:${x.statistic_id}`) ? `data-object="${this.esc(`entity:${x.statistic_id}`)}" tabindex="0" role="button"` : 'class="static"',
      columns: [
        { key: "name", label: "utName", dir: "asc", cell: x => this.nameCell(x.name || x.statistic_id, x.statistic_id) },
        { key: "own", label: "dbColOwn", dir: "desc", cell: num("own") },
        ...(shared ? [{ key: "shared", label: "dbColShared", dir: "desc", cell: num("shared") }] : []),
        { key: "missing", label: "dbColMissing", dir: "desc", cell: num("missing") },
      ],
    });
    const more = f.series_total > f.series.length ? `<p class="factnote">${this.t("relUnstableMore", { shown: f.series.length, total: f.series_total })}</p>` : "";
    return `<div class="dbextra">${gaps ? `<div class="sectionlabel">${this.t("dbGapsTitle")}</div>${gaps}` : ""}<div class="sectionlabel">${this.t("dbSeriesTitle", { n: this.formatNumber(f.series_total) })}</div>${table}${more}</div>`;
  }

  dbFindingRow(f) {
    const tone = f.level === "problem" ? "red" : "warn";
    return `<div class="row"><span class="tile ${tone}"><ha-icon icon="mdi:database-alert-outline"></ha-icon></span><span class="row-text"><strong>${this.t(`dbKind_${f.kind}`)}</strong><small>${this.dbFindingText(f, true)}</small><small>${this.t(`dbAdvice_${f.kind}`)}</small></span><span class="pill ${tone}">${this.t(f.level === "problem" ? "dbProblem" : "dbHint")}</span></div>${this.dbFindingExtra(f)}`;
  }

  // The full integrity check on demand: a button, and the result of the last run.
  dbCheckRow(r) {
    const c = r.integrity || {};
    const note = c.running ? this.t("dbChecking")
      : c.state === "ok" ? this.t("dbCheckOk", { at: this.formatDate(c.at) })
      : c.state === "failed" ? this.t("dbCheckFailed", { at: this.formatDate(c.at) })
      : c.state === "damaged" ? "" : this.t("dbCheckNever");
    return `<div class="row"><span class="row-text"><small>${this.esc(note)}</small><small>${this.t("dbCheckHint")}</small></span><button class="btn" data-db-check${c.running ? " disabled" : ""}>${this.t("dbCheck")}</button></div>`;
  }

  // What the page shows, for its export; registered before the page bar so the button is there on the first render.
  dbExporter(r) {
    const dialect = this.esc(this.dbDialect(r.dialect)), server = r.dialect !== "sqlite";
    const facts = [];
    if (r.supported && r.db_bytes !== null && r.db_bytes !== undefined) facts.push(server ? this.t(r.estimated ? "dbSizeEstimated" : "dbSizeServer", { db: this.formatBytes(r.db_bytes), dialect }) : this.t("dbSize", { db: this.formatBytes(r.db_bytes), wal: this.formatBytes(r.wal_bytes || 0) }));
    else facts.push(this.t("dbNoSize", { dialect }));
    if (r.growth?.known) facts.push(this.t("dbPerDay", { size: this.dbGrowthSize(r.growth.per_day) }));
    else facts.push(this.t("dbGrowthUnknown"));
    if (r.keep_days) facts.push(this.t("dbKeep", { n: this.formatNumber(r.keep_days) }));
    if (r.auto_purge === false) facts.push(this.t("dbOvPurgeOff"));
    if (r.restart_gaps) facts.push(this.t("dbRestartGaps", { n: this.formatNumber(r.restart_gaps) }));
    this.setPageExporter("recdb", "recorder-database", `${this.t("recorder")} · ${this.t("dbTitle")}`, [
      { name: "findings", title: this.t("stormTabFindings"), header: [this.t("stormColKinds"), this.t("expColLevel"), this.t("expColText"), this.t("expColAdvice")], rows: () => r.findings.map(f => [this.t(`dbKind_${f.kind}`), this.t(f.level === "problem" ? "dbProblem" : "dbHint"), this.plainText(this.dbFindingText(f)), this.t(`dbAdvice_${f.kind}`)]) },
      { name: "facts", title: this.t("expColFact"), header: [this.t("expColFact")], rows: () => facts.map(x => [this.plainText(x)]) },
      { name: "tables", title: this.t("dbTablesTitle"), header: [this.t("dbColTable"), this.t("dbColBytes")], rows: () => (r.tables || []).map(t => [t.name, t.bytes]) },
    ].filter(sec => sec.rows().length));
  }

  dbCard() {
    const r = this.dbHealth;
    // An older result has its time in the bar on the right; the note on the left then would only say it again.
    const aged = Boolean(r?.computed_at && (r.stale || r.age_seconds >= 60)), took = aged ? "" : this.tookNote(r).replace(/^ · /, "");
    const ready = Boolean(r?.available && !r.busy);
    if (ready && !this.dbError) this.dbExporter(r);
    const head = this.pageBar({ left: took ? `<span>${this.esc(took)}</span>` : "", at: this.isoOf(r?.computed_at), loading: this.dbLoading, attr: "data-db-refresh", exportId: ready && !this.dbError ? "recdb" : "" });
    if (this.dbError) return `<div class="stack">${head}<div class="panel">${this.notice("err", this.dbError)}</div></div>`;
    if (!r) return `<div class="stack">${head}<div class="panel">${this.skeleton("dbLoading")}</div></div>`;
    if (!r.available) return `<div class="stack">${head}<div class="panel"><p class="factnote">${this.t("relNoRecorder")}</p></div></div>`;
    if (r.busy) return `<div class="stack">${head}<div class="panel">${this.skeleton("relBusy")}<p class="factnote">${this.t("relBusy")}</p></div></div>`;
    const th = r.thresholds || {};
    const dialect = this.esc(this.dbDialect(r.dialect)), server = r.dialect !== "sqlite";
    const rows = r.findings.length ? r.findings.map(f => this.dbFindingRow(f)).join("") : `<div class="emptymsg"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${this.t("dbNone")}</div>`;
    // The figures stand as tiles; what could not be measured, and the normal restart gaps, stay as short notes.
    const sizeKnown = r.supported && r.db_bytes !== null && r.db_bytes !== undefined, growthKnown = Boolean(r.growth?.known);
    const tiles = this.sumTiles([
      sizeKnown ? { label: this.t("dbTileSize"), value: this.formatBytes(r.db_bytes), sub: server ? this.t(r.estimated ? "dbTileEstimated" : "dbTileServer", { dialect }) : this.t("dbTileWal", { wal: this.formatBytes(r.wal_bytes || 0) }), tone: "mute" } : null,
      growthKnown ? { label: this.t("dbTileGrowth"), value: this.dbGrowthSize(r.growth.per_day, true), sub: sizeKnown && r.db_bytes > 0 ? this.t("dbTileGrowthShare", { pct: this.formatNumber(Math.round(Math.abs(r.growth.per_day) / r.db_bytes * 1000) / 10) }) : "", tone: "mute" } : null,
      r.keep_days ? { label: this.t("dbTileKeep"), value: this.t("dbTileDays", { n: this.formatNumber(r.keep_days) }), tone: "mute" } : null,
      r.auto_purge !== undefined && r.auto_purge !== null ? { label: this.t("dbTilePurge"), value: this.t(r.auto_purge === false ? "dbTileOff" : "dbTileOn"), tone: r.auto_purge === false ? "warn" : "ok" } : null,
    ]);
    const notes = [sizeKnown ? "" : this.t("dbNoSize", { dialect }), growthKnown ? "" : this.t("dbGrowthUnknown"), r.auto_purge === false ? this.t("dbOvPurgeOff") : "", r.restart_gaps ? this.t("dbRestartGaps", { n: this.formatNumber(r.restart_gaps) }) : ""].filter(Boolean);
    return `<div class="stack">${head}${tiles}<div class="panel">${rows}${this.dbCheckRow(r)}${notes.length ? `<p class="factnote">${notes.join(" · ")}</p>` : ""}${this.howCounted("dbFootnote", { gap: th.state_gap_minutes ?? 10, gapDays: th.state_gap_window_days ?? 7, missing: th.gap_min_hours ?? 6, missingDays: th.gap_window_days ?? 30 })}</div>${this.dbTablesCard(r)}</div>`;
  }

  // The largest tables (data and indexes); SQLite measures them once a day, a server from its catalog.
  dbTablesCard(r) {
    const tables = r.tables || [];
    if (!tables.length) return "";
    const total = r.db_bytes || tables.reduce((sum, t) => sum + t.bytes, 0);
    const rows = tables.map(t => `<div class="fact"><span>${this.esc(t.name)}</span><b>${this.esc(this.formatBytes(t.bytes))}${total ? `<small>${this.formatNumber(Math.round(t.bytes / total * 100))} %</small>` : ""}</b></div>`).join("");
    const more = r.tables_total > tables.length ? `<p class="factnote">${this.t("dbTablesMore", { n: this.formatNumber(r.tables_total - tables.length) })}</p>` : "";
    const at = r.tables_at ? ` ${this.t("dbTablesAt", { at: this.esc(this.relTime(new Date(r.tables_at * 1000).toISOString())) })}` : "";
    return `<div class="panel"><div class="panelhead"><div><h2>${this.t("dbTablesTitle")}</h2><p>${this.t(r.dialect === "sqlite" ? "dbTablesHintSqlite" : "dbTablesHint")}${at}</p></div></div><div class="facts">${rows}</div>${more}</div>`;
  }
}
