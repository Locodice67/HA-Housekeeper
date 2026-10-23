// StartsMixin: the tab "Starts" of Storage & system and its tile: how long the last starts of Home Assistant took, and how long
// each integration needed to set up. Mixed into the panel in 99-register.js; the data is `ha_housekeeper/starts` (newest first).
Object.assign(TEXT.de, {
  sysByStarts: "Starts", sysHeadStarts: "Frühere Starts", sysTileStart: "Letzter Start", startsMin: "Min.",
  startsTileLoaded: "bis alles geladen {x}", startsTileNone: "Wird beim nächsten Start gemessen.", startsTileCap: "letzte {n} Starts · Schnitt {avg}",
  startsBuilding: "Der Verlauf entsteht mit weiteren Starts.",
  startsEmpty: "Noch kein Start gemessen. Der erste erscheint, wenn Home Assistant das nächste Mal gestartet und die Anlaufphase vorbei ist.",
  startColAt: "Start", startColTotal: "Gesamt", startColLoaded: "Alles geladen", startColSlowest: "Langsamste Integration", startColShare: "Im Vergleich",
  startsCrash: "nach Absturz", startsCrashHint: "Der Start davor hat sich nie abgemeldet: Absturz, Stromausfall oder beendeter Prozess.", startsDown: "{x} aus", startsDownHint: "So lange war Home Assistant vor diesem Start aus (vom letzten Lebenszeichen an).", startsUnit_s: "s", startsUnit_m: "Min.", startsUnit_h: "Std.", startsUnit_d: "Tage",
  startsUpdate: "nach Update", startsUpdateHint: "Die Version von Home Assistant war eine andere als beim Start davor.",
  startsFromHk: "ab Housekeeper", startsFromHkHint: "Der Beginn des Prozesses ließ sich nicht lesen; die Zeit zählt ab dem Einrichten von Housekeeper und ist deshalb kürzer als der ganze Start.",
  startsOpen: "Integrationen dieses Starts zeigen", startsClose: "Integrationen dieses Starts verbergen",
  startsLoadingHint: "Beim Speichern dieses Starts war die Einrichtung noch nicht fertig; die Zeit ist ein Mindestwert.",
  startsEntries: "{n} Einträge", startsOwn: "eigene", startsOwnHint: "Eigene Integration, nicht von Home Assistant mitgeliefert.", startsOpenObject: "Öffnet die Seite dieser Integration",
  startsVsMore: "{x} langsamer als üblich", startsVsLess: "{x} schneller als üblich", startsVsSame: "wie üblich", startsVsSlow: "wie üblich langsam",
  startsVsAvg: "Schnitt der letzten {n} Starts: {x}", startsVsNone: "Zu wenige frühere Starts zum Vergleichen.",
  startsHaVersion: "Home Assistant {v}", startsDetailHead: "Einrichtung je Integration, langsamste zuerst",
  startsMore: "{n} weitere unter einer Sekunde", startsNoItems: "Für diesen Start liegen keine Zeiten je Integration vor.",
  startState_loaded: "geladen", startState_setup_error: "Fehler", startState_setup_retry: "Wiederholung", startState_not_loaded: "nicht geladen",
  startState_migration_error: "Fehler", startState_failed_unload: "Fehler", startState_setup_in_progress: "lädt",
  startsNote: "Der Balken vergleicht in der Tabelle mit dem längsten Start, in der Liste mit der langsamsten Integration dieses Starts. Die Zeit je Integration misst Home Assistant selbst, vom Beginn bis zum Ende ihrer Einrichtung. Integrationen starten gleichzeitig; die Zeiten ergeben deshalb nicht die Dauer des Starts. „Alles geladen“ ist der Moment, in dem keine Integration mehr geladen hat. Aufgenommen wird ein Start, wenn die Anlaufphase vorbei ist.",
});
Object.assign(TEXT.en, {
  sysByStarts: "Starts", sysHeadStarts: "Earlier starts", sysTileStart: "Last start", startsMin: "min",
  startsTileLoaded: "everything loaded after {x}", startsTileNone: "Measured at the next start.", startsTileCap: "last {n} starts · average {avg}",
  startsBuilding: "The line appears with more starts.",
  startsEmpty: "No start measured yet. The first one appears after Home Assistant has started the next time and the warm-up is over.",
  startColAt: "Start", startColTotal: "Total", startColLoaded: "All loaded", startColSlowest: "Slowest integration", startColShare: "Compared",
  startsCrash: "after crash", startsCrashHint: "The start before never signed off: a crash, a power cut or a killed process.", startsDown: "{x} down", startsDownHint: "How long Home Assistant was down before this start (from its last sign of life).", startsUnit_s: "s", startsUnit_m: "min", startsUnit_h: "h", startsUnit_d: "days",
  startsUpdate: "after update", startsUpdateHint: "The version of Home Assistant was a different one than at the start before.",
  startsFromHk: "from Housekeeper", startsFromHkHint: "The start of the process could not be read; the time counts from the set-up of Housekeeper and is therefore shorter than the whole start.",
  startsOpen: "Show the integrations of this start", startsClose: "Hide the integrations of this start",
  startsLoadingHint: "The set-up was not finished when this start was saved; the time is a minimum.",
  startsEntries: "{n} entries", startsOwn: "custom", startsOwnHint: "A custom integration, not shipped with Home Assistant.", startsOpenObject: "Opens the page of this integration",
  startsVsMore: "{x} slower than usual", startsVsLess: "{x} faster than usual", startsVsSame: "as usual", startsVsSlow: "as usual, and slow",
  startsVsAvg: "Average of the last {n} starts: {x}", startsVsNone: "Too few earlier starts to compare with.",
  startsHaVersion: "Home Assistant {v}", startsDetailHead: "Set-up per integration, slowest first",
  startsMore: "{n} more under a second", startsNoItems: "There are no times per integration for this start.",
  startState_loaded: "loaded", startState_setup_error: "Error", startState_setup_retry: "Retrying", startState_not_loaded: "not loaded",
  startState_migration_error: "Error", startState_failed_unload: "Error", startState_setup_in_progress: "loading",
  startsNote: "The bar compares with the longest start in the table, and with the slowest integration of this start in the list. Home Assistant itself measures the time per integration, from the beginning to the end of its set-up. Integrations start at the same time, so the times do not add up to the length of the start. \"All loaded\" is the moment no integration was loading any more. A start is recorded when the warm-up is over.",
});

class StartsMixin {
  startList() { return this.sysState("starts").data?.starts || []; }

  // 228 s as "3:48 Min."; under a minute in seconds.
  startClock(seconds) {
    if (!Number.isFinite(seconds)) return "–";
    const total = Math.round(seconds);
    if (total < 60) return `${this.formatNumber(total)} s`;
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} ${this.t("startsMin")}`;
  }

  // The set-up of one integration in seconds: a decimal under ten, whole above.
  startSeconds(seconds) {
    const n = Number(seconds) || 0;
    return `${this.formatNumber(n < 10 ? Math.round(n * 10) / 10 : Math.round(n))} s`;
  }

  // The pause before a start: seconds, minutes, hours or days, whichever fits.
  startPause(seconds) {
    const n = Number(seconds) || 0, u = k => this.t(`startsUnit_${k}`), f = v => this.formatNumber(Math.round(v * 10) / 10);
    if (n < 90) return `${f(n)} ${u("s")}`;
    if (n < 5400) return `${f(n / 60)} ${u("m")}`;
    if (n < 172800) return `${f(n / 3600)} ${u("h")}`;
    return `${f(n / 86400)} ${u("d")}`;
  }

  startName(item) { return item.title || item.domain; }

  startSlowest(start) { return (start.items || []).find(i => i.seconds > 0) || null; }

  // The fourth tile of the page: the last start as a figure, a bar against the longest start, the line of the last starts.
  startTile() {
    const starts = this.startList();
    const label = this.t("sysTileStart");
    const last = starts[0];
    if (!last || !Number.isFinite(last.boot_s)) return { label, value: "–", sub: this.esc(this.t("startsTileNone")), tone: "mute" };
    const times = starts.map(s => s.boot_s).filter(Number.isFinite).reverse();
    const before = times.slice(0, -1), avg = times.reduce((a, b) => a + b, 0) / times.length;
    const tone = before.length >= 2 && last.boot_s > (before.reduce((a, b) => a + b, 0) / before.length) * 1.25 ? "warn" : "ok";
    const width = Math.max(2, Math.round((last.boot_s / Math.max(...times)) * 100));
    const meter = `<span class="sysmeter ${tone}" role="img" aria-label="${this.esc(this.startClock(last.boot_s))}"><i style="width:${width}%"></i></span>`;
    const sub = Number.isFinite(last.loaded_s) ? this.esc(this.t("startsTileLoaded", { x: this.startClock(last.loaded_s) })) : "";
    return { label, value: this.esc(this.startClock(last.boot_s)), sub, tone, spark: `${meter}${this.startLine(times, avg)}` };
  }

  startLine(values, avg) {
    const rows = values.slice(-12), n = rows.length;
    if (n < 3) return `<span class="spark-hint">${this.t("startsBuilding")}</span>`;
    const w = 200, h = 36, pad = 4;
    let lo = Math.min(...rows), hi = Math.max(...rows);
    if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - 5); hi = lo + 10; }
    const x = i => pad + ((w - 2 * pad) * i) / (n - 1), y = v => h - pad - ((h - 2 * pad) * (v - lo)) / (hi - lo);
    const cap = this.t("startsTileCap", { n: this.formatNumber(n), avg: this.startClock(avg) });
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${this.esc(cap)}"><polyline fill="none" stroke="var(--hk-muted)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="${rows.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/><line class="spark-end sys-spark-end" x1="${x(n - 1).toFixed(1)}" y1="${y(rows[n - 1]).toFixed(1)}" x2="${x(n - 1).toFixed(1)}" y2="${y(rows[n - 1]).toFixed(1)}"/></svg><span class="spark-cap">${this.esc(cap)}</span>`;
  }

  startKey(start) { return `start:${start.at}`; }

  startState(item) {
    if (!item.state) return `<span class="muted">–</span>`;
    const key = `startState_${item.state}`, text = this.t(key);
    const tone = item.state === "loaded" ? "ok" : item.state === "setup_retry" ? "warn" : item.state === "not_loaded" || item.state === "setup_in_progress" ? "mute" : "red";
    const hint = item.state === "setup_in_progress" ? ` title="${this.esc(this.t("startsLoadingHint"))}"` : "";
    return `<span class="pill ${tone}"${hint}>${this.esc(text === key ? item.state : text)}</span>`;
  }

  // What an integration usually needs: the average of its set-up in up to five earlier starts; null under two.
  startUsual(start, item) {
    const list = this.startList(), older = list.slice(list.indexOf(start) + 1, list.indexOf(start) + 6);
    const times = older.map(o => (o.items || []).find(i => i.domain === item.domain)).filter(Boolean).map(i => i.seconds);
    return times.length < 2 ? null : { avg: times.reduce((a, b) => a + b, 0) / times.length, n: times.length };
  }

  // The set-up of one integration against its usual time, as words.
  startCompare(start, item) {
    const usual = this.startUsual(start, item);
    if (!usual) return `<span class="muted" title="${this.esc(this.t("startsVsNone"))}">–</span>`;
    const delta = item.seconds - usual.avg, edge = Math.max(5, usual.avg * 0.25);
    const [tone, text] = delta >= edge ? ["warn", this.t("startsVsMore", { x: this.startSeconds(delta) })]
      : delta <= -edge ? ["ok", this.t("startsVsLess", { x: this.startSeconds(-delta) })]
      : ["mute", this.t(usual.avg >= 30 ? "startsVsSlow" : "startsVsSame")];
    const hint = this.t("startsVsAvg", { n: this.formatNumber(usual.n), x: this.startSeconds(usual.avg) });
    return `<span class="pill ${tone}" title="${this.esc(hint)}">${this.esc(text)}</span>`;
  }

  // One integration of a start: name (a link to its page where the scan knows it), entries, origin, reason, state, time.
  startRow(start, i, max, known) {
    const group = known.get(i.domain);
    const link = group ? ` data-object="${this.esc(`integration:${i.domain}`)}" tabindex="0" role="button" title="${this.esc(this.t("startsOpenObject"))}"` : "";
    const sub = [i.title ? i.domain : "", i.entries > 1 ? this.t("startsEntries", { n: this.formatNumber(i.entries) }) : ""].filter(Boolean).map(x => this.esc(x)).join(" · ");
    const own = group?.custom ? ` <span class="pill mute" title="${this.esc(this.t("startsOwnHint"))}">${this.t("startsOwn")}</span>` : "";
    const reason = i.reason ? `<small class="muted cut" title="${this.esc(i.reason)}">${this.esc(i.reason)}</small>` : "";
    const name = `<span class="startname"><strong class="cut">${this.esc(this.startName(i))}${own}</strong>${sub ? `<span class="id cut">${sub}</span>` : ""}${reason}</span>`;
    return `<div class="startint${group ? " link" : ""}"${link}>${name}<span>${this.startState(i)}</span><b>${this.esc(this.startSeconds(i.seconds))}</b><span>${this.startCompare(start, i)}</span>${this.sysShare(i.seconds, max)}</div>`;
  }

  // The integrations of one start: those that took a second or more, and every one that did not load.
  startDetail(start) {
    if (!(this.bhOpen || []).includes(this.startKey(start))) return "";
    const items = start.items || [];
    const shown = items.filter(i => i.seconds >= 1 || (i.state && !["loaded", "not_loaded"].includes(i.state)));
    const max = Math.max(0, ...shown.map(i => i.seconds));
    const known = new Map(this.compIntegrations().map(g => [g.domain, g]));
    const rows = shown.map(i => this.startRow(start, i, max, known)).join("");
    const rest = items.length - shown.length;
    const body = shown.length ? `<div class="sectionlabel">${this.t("startsDetailHead")}</div>${rows}${rest > 0 ? `<p class="factnote">${this.t("startsMore", { n: this.formatNumber(rest) })}</p>` : ""}` : `<p class="factnote">${this.t("startsNoItems")}</p>`;
    return `<tr class="static remhist"><td colspan="5">${body}</td></tr>`;
  }

  sysStarts() {
    const starts = this.startList();
    if (!starts.length) return `<div class="emptymsg">${this.t("startsEmpty")}</div>`;
    const open = s => (this.bhOpen || []).includes(this.startKey(s));
    const max = Math.max(0, ...starts.map(s => s.boot_s || 0));
    const slowest = s => { const i = this.startSlowest(s); return i ? `${this.startName(i)} · ${this.startSeconds(i.seconds)}` : "–"; };
    const sorts = [
      { key: "at", label: "startColAt", dir: "desc", get: s => s.at },
      { key: "total", label: "startColTotal", dir: "desc", get: s => s.boot_s ?? null },
      { key: "loaded", label: "startColLoaded", dir: "desc", get: s => s.loaded_s ?? null },
    ];
    return this.sysList("sysstarts", starts, {
      sort: "at", dir: "desc", sorts, text: s => `${this.formatDate(s.at)} ${s.version || ""} ${slowest(s)}`, tie: s => s.at, empty: "startsEmpty",
      rowAttrs: s => `data-bh-row="${this.esc(this.startKey(s))}" tabindex="0" role="button" aria-expanded="${open(s)}"`,
      after: s => this.startDetail(s),
      columns: [
        { key: "at", label: "startColAt", dir: "desc", cell: s => `<div class="statcell">${this.expandBtn("data-bh-more", this.startKey(s), open(s), this.t(open(s) ? "startsClose" : "startsOpen"))}<div><strong>${this.esc(this.formatDate(s.at))}</strong>${s.version ? `<small>${this.esc(this.t("startsHaVersion", { v: s.version }))}</small>` : ""}${Number.isFinite(s.down_s) ? `<small title="${this.esc(this.t("startsDownHint"))}">${this.esc(this.t("startsDown", { x: this.startPause(s.down_s) }))}</small>` : ""}${s.unclean ? ` <span class="pill red" title="${this.esc(this.t("startsCrashHint"))}">${this.t("startsCrash")}</span>` : ""}${s.update ? ` <span class="pill warn" title="${this.esc(this.t("startsUpdateHint"))}">${this.t("startsUpdate")}</span>` : ""}</div></div>` },
        { key: "total", label: "startColTotal", dir: "desc", cell: s => `${this.esc(this.startClock(s.boot_s))}${s.boot_from === "housekeeper" ? ` <span class="pill mute" title="${this.esc(this.t("startsFromHkHint"))}">${this.t("startsFromHk")}</span>` : ""}` },
        { key: "loaded", label: "startColLoaded", dir: "desc", cell: s => this.esc(this.startClock(s.loaded_s)) },
        { key: "slowest", label: "startColSlowest", sortable: false, cell: s => this.esc(slowest(s)) },
        { key: "share", label: "startColShare", sortable: false, cell: s => this.sysShare(s.boot_s || 0, max) },
      ],
      exportName: "storage-starts", header: [this.t("startColAt"), "Home Assistant", this.t("startColTotal"), this.t("startColLoaded"), this.t("startColSlowest")],
      rows: s => [s.at, s.version || "", s.boot_s ?? "", s.loaded_s ?? "", slowest(s)],
    });
  }
}
