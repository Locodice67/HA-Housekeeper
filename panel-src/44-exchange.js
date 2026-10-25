// Device exchange, follow-up, audit report and end state simulation of a plan (see device_pairs.py, followup.py, audit_report.py, simulation.py); mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  kindExchange: "Gerät austauschen",
  exTitle: "Gerät austauschen", exHint: "Wähle das alte und das neue Gerät. Housekeeper schlägt zu jeder alten Entität eine neue vor; nichts ist vorausgewählt. Was du bestätigst, wird eine normale Vorschau mit Backup, Prüfung und Rückgängig.",
  exOld: "Altes Gerät", exNew: "Neues Gerät", exPick: "Gerät wählen", exLoad: "Vorschläge laden", exLoading: "Lade …", exFailed: "Keine Vorschläge: {reason}",
  exNoPairs: "Das alte Gerät hat keine Entitäten.", exNoTarget: "Kein Ersatz", exSuggested: "Vorschlag", exUsed: "{count} Verwendungen", exUnused: "Nichts zu ersetzen",
  exHow: "Art", exHow_replace: "Referenzen ersetzen", exHow_both: "Zähler wechseln (Verlauf und ID)", exHow_statistics: "Zähler wechseln (nur Verlauf)", exHow_id: "Zähler wechseln (nur ID)",
  exChosen: "{count} Paare bestätigt", exCreate: "Vorschau erstellen ({count})", exUnmatched: "Ohne Gegenstück am alten Gerät: {list}",
  exDisableOld: "Altes Gerät deaktivieren …", exDisableHint: "Erst nach dem Austausch. Das geht nur, wenn am alten Gerät nichts mehr funktioniert und nichts mehr darauf verweist.",
  exReason_same_class: "gleiche Geräteklasse", exReason_same_unit: "gleiche Einheit", exReason_same_state_class: "gleiche Zustandsklasse", exReason_same_area: "gleicher Bereich", exReason_similar_name: "ähnlicher Name", exReason_same_id_tail: "gleiche ID-Endung",
  exSumPairs: "{count} Paare", exSumSuggest: "{count} mit Vorschlag", exSumNone: "{count} ohne Verwendung", exSumUses: "{count} Verwendungen insgesamt",
  exPlanSummary: "{changes} Änderungen in {sources} Quellen", exPlanMeters: "{count} Zählerwechsel", exPlanEnergy: "Energie-Dashboard",
  fuWatching: "Nachkontrolle läuft bis {date}", fuClean: "Nachkontrolle bestanden: bis {date} nichts Neues", fuRegression: "Nachkontrolle: {count} neue Funde seit {date}", fuStopped: "Nachkontrolle beendet (Plan rückgängig gemacht)",
  fu_watching: "Beobachtet", fu_clean: "Sauber", fu_regression: "Rückfall", fu_stopped: "Beendet",
  fu_class_broken_reference: "defekte Referenz", fu_class_unavailable: "nicht verfügbar", fu_class_recurring: "Gerät kehrt wieder",
  actFollowup: "Nachkontrolle meldet neue Funde", actFollowupHint: "Nach einem Plan sind neue Probleme aufgetreten.",
  reportButton: "Prüfbericht", reportNames: "Echte Namen und IDs verwenden", reportNamesHint: "Ohne Haken ersetzen Platzhalter alle Namen und IDs. So kannst du den Bericht teilen, ohne etwas preiszugeben.", reportDownload: "Herunterladen", reportCopy: "Kopieren", reportCopied: "Kopiert", reportFailed: "Bericht nicht erstellt: {reason}", reportAnonymous: "IDs und Namen sind durch Platzhalter ersetzt.",
  simPurgeRows: "{count} Zeilen im Recorder werden entfernt", simPurgeStatRows: "Statistik: {count} Zeilen werden gelöscht", simPurgeStateRows: "Rohdaten: {count} gespeicherte Zustände werden gelöscht", simKeptRows: "{count} Zeilen Verlauf bleiben in der Datenbank", simKeptStates: "{count} gespeicherte Zustände bleiben in der Datenbank, bis der Recorder sie nach {days} Tagen löscht", simKeptStatesOpen: "{count} gespeicherte Zustände bleiben in der Datenbank, bis der Recorder alte Daten löscht", simKeptStatesForever: "{count} gespeicherte Zustände bleiben dauerhaft in der Datenbank, die automatische Bereinigung des Recorders ist aus", simKeptStats: "{count} Zeilen Langzeitstatistik bleiben dauerhaft erhalten",
  simTitle: "Erwarteter Endzustand", simPurged: "{count} Statistiken werden gelöscht (nur per Backup umkehrbar)",
  simRemoved: "{count} Entitäten entfernt", simRemovedOne: "1 Entität entfernt", simDisabled: "{count} Entitäten deaktiviert", simDisabledOne: "1 Entität deaktiviert", simDevices: " ({devices} Geräte)", simDevicesOne: " (1 Gerät)", simReplaced: "{count} Referenzen ersetzt", simMeters: "{count} Zählerwechsel",
  simCertain: "{count} sichere Verwendungen bleiben bestehen", simUncertain: "{count} unsichere oder manuelle Verwendungen bleiben bestehen", simOrphaned: "{count} Statistiken voraussichtlich verwaist", simBlocked: "{count} Aktionen laufen nicht",
  sim_reloaded: "{count} Integration(en) werden neu geladen (einige Sekunden nicht erreichbar, nichts wird gelöscht)", sim_labeled: "{count} Entitäten bekommen ein Label", sim_area_set: "{count} Objekte bekommen einen Bereich", sim_refactored: "{count} Automationen werden umgebaut", sim_enabled: "{count} Entitäten werden aktiviert", sim_hidden: "{count} Entitäten werden ausgeblendet", sim_unhidden: "{count} Entitäten werden eingeblendet", sim_backups_deleted: "{count} Backups werden gelöscht", sim_automations_deleted: "{count} Automationen werden gelöscht",
  simLimits: "Grenzen: Die Datenbankdatei schrumpft erst nach einem Repack. Verweise in Vorlagen und außerhalb von Home Assistant sind nicht sicher prüfbar; eine Speicherersparnis wird nicht geschätzt.",
});
Object.assign(TEXT.en, {
  kindExchange: "Exchange device",
  exTitle: "Exchange device", exHint: "Pick the old and the new device. Housekeeper proposes a new entity for each old one; nothing is preselected. What you confirm becomes an ordinary preview with backup, verification and undo.",
  exOld: "Old device", exNew: "New device", exPick: "Pick a device", exLoad: "Load proposals", exLoading: "Loading …", exFailed: "No proposals: {reason}",
  exNoPairs: "The old device has no entities.", exNoTarget: "No replacement", exSuggested: "suggested", exUsed: "{count} uses", exUnused: "Nothing to replace",
  exHow: "Kind", exHow_replace: "Replace references", exHow_both: "Switch meter (history and ID)", exHow_statistics: "Switch meter (history only)", exHow_id: "Switch meter (ID only)",
  exChosen: "{count} pairs confirmed", exCreate: "Create preview ({count})", exUnmatched: "Without a counterpart on the old device: {list}",
  exDisableOld: "Disable old device …", exDisableHint: "Only after the exchange. It works only when nothing on the old device works any more and nothing refers to it.",
  exReason_same_class: "same device class", exReason_same_unit: "same unit", exReason_same_state_class: "same state class", exReason_same_area: "same area", exReason_similar_name: "similar name", exReason_same_id_tail: "same ID ending",
  exSumPairs: "{count} pairs", exSumSuggest: "{count} with a proposal", exSumNone: "{count} unused", exSumUses: "{count} uses in total",
  exPlanSummary: "{changes} changes in {sources} sources", exPlanMeters: "{count} meter switches", exPlanEnergy: "Energy dashboard",
  fuWatching: "Follow-up running until {date}", fuClean: "Follow-up passed: nothing new until {date}", fuRegression: "Follow-up: {count} new findings since {date}", fuStopped: "Follow-up ended (plan undone)",
  fu_watching: "Watching", fu_clean: "Clean", fu_regression: "Regression", fu_stopped: "Ended",
  fu_class_broken_reference: "broken reference", fu_class_unavailable: "unavailable", fu_class_recurring: "device came back",
  actFollowup: "Follow-up reports new findings", actFollowupHint: "New problems appeared after a cleanup plan.",
  reportButton: "Audit report", reportNames: "Use real names and IDs", reportNamesHint: "Without the tick, placeholders replace all names and IDs, so you can share the report without giving anything away.", reportDownload: "Download", reportCopy: "Copy", reportCopied: "Copied", reportFailed: "Report not created: {reason}", reportAnonymous: "IDs and names are replaced by placeholders.",
  simPurgeRows: "{count} recorder rows will be removed", simPurgeStatRows: "Statistics: {count} rows are deleted", simPurgeStateRows: "Raw data: {count} stored states are deleted", simKeptRows: "{count} history rows stay in the database", simKeptStates: "{count} stored states stay in the database until the recorder deletes them after {days} days", simKeptStatesOpen: "{count} stored states stay in the database until the recorder deletes old data", simKeptStatesForever: "{count} stored states stay in the database for good, the recorder's automatic purge is off", simKeptStats: "{count} rows of long-term statistics stay for good",
  simTitle: "Expected end state", simPurged: "{count} statistics will be deleted (reversible only from the backup)",
  simRemoved: "{count} entities removed", simRemovedOne: "1 entity removed", simDisabled: "{count} entities disabled", simDisabledOne: "1 entity disabled", simDevices: " ({devices} devices)", simDevicesOne: " (1 device)", simReplaced: "{count} references replaced", simMeters: "{count} meter switches",
  simCertain: "{count} certain uses remain", simUncertain: "{count} uncertain or manual uses remain", simOrphaned: "{count} statistics likely orphaned", simBlocked: "{count} actions will not run",
  sim_reloaded: "{count} integration(s) will be reloaded (unreachable for a few seconds, nothing is deleted)", sim_labeled: "{count} entities get a label", sim_area_set: "{count} objects get an area", sim_refactored: "{count} automations are rewritten", sim_enabled: "{count} entities are enabled", sim_hidden: "{count} entities are hidden", sim_unhidden: "{count} entities are shown again", sim_backups_deleted: "{count} backups are deleted", sim_automations_deleted: "{count} automations are deleted",
  simLimits: "Limits: the database file only shrinks after a repack. References inside templates and outside Home Assistant cannot be checked for certain; saved storage is not estimated.",
});

const EXCHANGE_HOW = ["replace", "both", "statistics", "id"];

class ExchangeMixin {
  exchangeState() {
    return (this.ex ||= { oldDev: "", newDev: "", result: null, choices: {}, loading: false, error: "", planned: "" });
  }

  // The text a device field shows: what was typed, or the name of the chosen device.
  deviceText(side) {
    const ex = this.exchangeState();
    return ex[`${side}Text`] ?? this.findObject(`device:${ex[`${side}Dev`]}`)?.name ?? "";
  }

  // Typing or picking changes the device; whatever was loaded for the old pair no longer fits.
  setDevice(side, id, text) {
    const ex = this.exchangeState();
    ex[`${side}Dev`] = id; ex[`${side}Text`] = text;
    ex.result = null; ex.choices = {};
  }

  deviceSub(o) {
    return [[o.manufacturer, o.model].filter(Boolean).join(" "), this.areaName(o)].filter(Boolean).join(" · ") || this.t("device");
  }

  async loadPairs() {
    const ex = this.exchangeState();
    if (!ex.oldDev || !ex.newDev || ex.loading) return;
    ex.loading = true; ex.error = ""; ex.choices = {}; this.render();
    try { ex.result = await this._hass.callWS({ type: "ha_housekeeper/device_pairs", old_device_id: ex.oldDev, new_device_id: ex.newDev }); }
    catch (err) { ex.result = null; ex.error = this.t("exFailed", { reason: this.errText(err) }); }
    ex.loading = false; this.render();
  }

  // Only what the person chose becomes an action: a pair without a chosen target is left out.
  exchangeActions() {
    const ex = this.exchangeState();
    return Object.entries(ex.choices).filter(([, c]) => c.target).map(([object_id, c]) => (c.how && c.how !== "replace"
      ? { kind: "migrate_meter", object_id, target: c.target, mode: c.how }
      : { kind: "replace_references", object_id, target: c.target }));
  }

  async createExchangePlan() {
    const actions = this.exchangeActions();
    if (!actions.length) return;
    this.cleanupBusy = true; this.cleanupError = ""; this.render();
    try {
      const plan = await this._hass.callWS({ type: "ha_housekeeper/plan_create", actions });
      this.openNewPlan(plan, null);
      this.exchangeState().planned = this.exchangeState().oldDev;
    } catch (err) { this.cleanupError = this.errText(err); }
    this.cleanupBusy = false; this.render();
  }

  // The target and the way for one pair: the person's choice is kept in `ex.choices`, whatever the list shows.
  pairTargetCell(pair) {
    const ex = this.exchangeState(), choice = ex.choices[pair.object_id] || {};
    const candidates = pair.candidates.map((c, i) => {
      const why = c.reasons.map(r => this.t(`exReason_${r}`)).join(", ");
      return `<option value="${this.esc(c.object_id)}" ${choice.target === c.object_id ? "selected" : ""}>${this.esc(c.name)} (${this.esc(c.object_id)})${i === 0 && c.score > 0 ? ` · ${this.t("exSuggested")}` : ""}${why ? ` · ${this.esc(why)}` : ""}</option>`;
    }).join("");
    const locked = !pair.used && !pair.meter;
    const picked = pair.candidates.find(c => c.object_id === choice.target);
    const tags = picked && picked.reasons.length ? `<span class="exptags">${picked.reasons.map(r => `<span class="tag">${this.esc(this.t(`exReason_${r}`))}</span>`).join("")}</span>` : "";
    return `<select data-ex-target="${this.esc(pair.object_id)}" aria-label="${this.esc(pair.name)}" ${locked ? "disabled" : ""}><option value="">${this.t("exNoTarget")}</option>${candidates}</select>${tags}`;
  }

  pairHowCell(pair) {
    const choice = this.exchangeState().choices[pair.object_id] || {};
    return choice.target && pair.meter ? `<select data-ex-how="${this.esc(pair.object_id)}" aria-label="${this.t("exHow")}">${EXCHANGE_HOW.map(h => `<option value="${h}" ${(choice.how || "replace") === h ? "selected" : ""}>${this.t(`exHow_${h}`)}</option>`).join("")}</select>` : "–";
  }

  // The pairs as a list: search, filter, sort and pages like every other list.
  pairsList(pairs) {
    const ex = this.exchangeState();
    const hasHow = pairs.some(p => p.meter);
    const sorts = [
      { key: "name", label: "exColEntity", dir: "asc", get: p => p.name },
      { key: "used", label: "exColUsed", dir: "desc", get: p => p.used || 0 },
    ];
    const columns = [
      { key: "name", label: "exColEntity", dir: "asc", cell: p => this.nameCell(p.name, p.object_id) },
      { key: "used", label: "exColUsed", dir: "desc", cell: p => this.esc(p.used ? this.t("exUsed", { count: p.used }) : this.t("exUnused")) },
      { key: "target", label: "exColTarget", sortable: false, cell: p => this.pairTargetCell(p) },
      ...(hasHow ? [{ key: "how", label: "exColHow", sortable: false, cell: p => this.pairHowCell(p) }] : []),
    ];
    return this.sysList("exchangepairs", pairs, {
      sort: "name", dir: "asc", sorts, columns, cls: "pairs", empty: "exNoPairs",
      filters: [{ name: "pick", all: this.t("exAllPairs"), options: [["suggest", this.t("exFilterSuggest")], ["none", this.t("exFilterNone")], ["chosen", this.t("exFilterChosen")]] }],
      filterFns: { pick: (p, v) => (v === "suggest" ? p.candidates[0]?.score > 0 : v === "none" ? !p.used && !p.meter : Boolean(ex.choices[p.object_id]?.target)) },
      text: p => `${p.name} ${p.object_id}`, tie: p => p.object_id,
    });
  }

  exchangeCard() {
    const ex = this.exchangeState(), chosen = this.exchangeActions().length;
    const planDone = ["executed", "verified"].includes(this.plan?.status) && ex.planned && ex.planned === ex.oldDev;
    const pairs = ex.result?.pairs || [];
    const sum = pairs.length ? `<div class="exsum"><strong>${this.t("exSumPairs", { count: pairs.length })}</strong><span class="pill ok">${this.t("exSumSuggest", { count: pairs.filter(p => p.candidates[0]?.score > 0).length })}</span><span class="pill">${this.t("exSumNone", { count: pairs.filter(p => !p.used && !p.meter).length })}</span><span class="pill">${this.t("exSumUses", { count: pairs.reduce((n, p) => n + (p.used || 0), 0) })}</span></div>` : "";
    const rows = ex.result ? (ex.result.pairs.length ? sum + this.pairsList(ex.result.pairs) : `<div class="emptymsg">${this.t("exNoPairs")}</div>`) : "";
    const unmatched = ex.result?.unmatched_new?.length ? `<p class="factnote">${this.t("exUnmatched", { list: this.esc(ex.result.unmatched_new.slice(0, 10).join(", ")) })}</p>` : "";
    const create = ex.result ? `<div class="setrow planfoot"><small class="u-m0">${this.t("exChosen", { count: chosen })} · ${this.t("repairDryRun")}</small><button class="btn primary" data-ex-create ${chosen && !this.cleanupBusy ? "" : "disabled"}>${this.cleanupBusy ? this.t("planCreating") : this.t("exCreate", { count: chosen })}</button></div>` : "";
    const disable = planDone ? `<div class="setrow planfoot"><small class="u-m0">${this.t("exDisableHint")}</small><button class="btn" data-ex-disable>${this.t("exDisableOld")}</button></div>` : "";
    return `<div class="panel ovvis"><div class="panelhead"><div><h2>${this.t("exTitle")}</h2><p>${this.t("exHint")}</p></div><div class="actions">${this.kindSelect()}</div></div>
      <div class="setrow"><div><label>${this.t("exOld")}</label></div>${this.pickerBox("exOld", this.t("exPick"))}</div>
      <div class="setrow"><div><label>${this.t("exNew")}</label></div>${this.pickerBox("exNew", this.t("exPick"))}</div>
      <div class="setrow planfoot"><small class="u-m0">${this.esc(ex.error)}</small><button class="btn" data-ex-load ${ex.oldDev && ex.newDev && !ex.loading ? "" : "disabled"}>${ex.loading ? this.t("exLoading") : this.t("exLoad")}</button></div>
      ${rows}${unmatched}${create}${disable}</div>`;
  }

  bindExchange(root) {
    const ex = () => this.exchangeState();
    root.querySelector("[data-ex-load]")?.addEventListener("click", () => this.loadPairs());
    root.querySelector("[data-ex-create]")?.addEventListener("click", () => this.createExchangePlan());
    root.querySelectorAll("[data-ex-target]").forEach(el => el.onchange = () => { const id = el.dataset.exTarget; ex().choices[id] = { ...(ex().choices[id] || {}), target: el.value }; this.render(); });
    root.querySelectorAll("[data-ex-how]").forEach(el => el.onchange = () => { const id = el.dataset.exHow; ex().choices[id] = { ...(ex().choices[id] || {}), how: el.value }; this.render(); });
    root.querySelector("[data-ex-disable]")?.addEventListener("click", () => { this.cleanupKind = "disable_device"; this.cleanupSel = new Set([ex().oldDev]); this.view = "cleanup"; (this.viewTab ||= {}).cleanup = "devices"; this.render(); });
    root.querySelectorAll("[data-report]").forEach(el => el.onclick = () => { if (this.report?.plan_id === el.dataset.report) { this.report = null; this.reportMessage = ""; this.render(); } else this.loadReport(el.dataset.report); });
    root.querySelector("[data-report-names]")?.addEventListener("change", e => { this.reportClear = e.target.checked; if (this.report) this.loadReport(this.report.plan_id); else this.render(); });
    root.querySelector("[data-report-download]")?.addEventListener("click", () => this.downloadReport());
    root.querySelector("[data-report-copy]")?.addEventListener("click", () => this.copyReport());
  }

  // A plan with several pairs: the totals above the rows, whose details are folded.
  exchangeSummary(plan) {
    const acts = plan.actions || [];
    if (acts.length < 2 || !acts.every(a => ["replace_references", "migrate_meter"].includes(a.kind))) return "";
    const sources = acts.flatMap(a => (a.sources || []).filter(src => src.writable && src.change_count));
    const changes = sources.reduce((n, src) => n + src.change_count, 0);
    const meters = acts.filter(a => a.kind === "migrate_meter").length, energy = sources.some(src => src.type === "energy");
    return `<div class="exsum"><strong>${this.t("exSumPairs", { count: acts.length })}</strong><span class="pill">${this.t("exPlanSummary", { changes: this.formatNumber(changes), sources: sources.length })}</span>${meters ? `<span class="pill">${this.t("exPlanMeters", { count: meters })}</span>` : ""}${energy ? `<span class="pill warn">${this.t("exPlanEnergy")}</span>` : ""}</div>`;
  }

  // -- follow-up --------------------------------------------------------------------------

  followupLine(plan) {
    const f = plan.followup;
    if (!f) return "";
    const key = { watching: "fuWatching", clean: "fuClean", regression: "fuRegression", stopped: "fuStopped" }[f.state];
    const date = this.formatDate(f.state === "watching" ? f.until : f.at || f.until);
    const items = (f.new || []).map(n => `<small class="u-block">${this.esc(this.t(`fu_class_${n.classification}`))}: ${this.esc(n.object_id)}</small>`).join("");
    return `<p class="factnote"><span class="pill ${this.followupTone(f.state)}">${this.t(`fu_${f.state}`)}</span> ${this.esc(this.t(key, { date, count: f.new_count ?? 0 }))}${items}</p>`;
  }

  followupTone(state) { return { watching: "mute", clean: "ok", regression: "red", stopped: "mute" }[state] || "mute"; }

  // -- audit report -----------------------------------------------------------------------

  async loadReport(planId) {
    try {
      const reply = await this._hass.callWS({ type: "ha_housekeeper/plan_report", plan_id: planId, anonymize: !this.reportClear, lang: this.lang });
      this.report = { plan_id: planId, ...reply }; this.reportMessage = "";
    } catch (err) { this.report = null; this.reportMessage = this.t("reportFailed", { reason: this.errText(err) }); }
    this.render();
  }

  downloadReport() {
    if (!this.report || typeof document === "undefined") return;
    const url = URL.createObjectURL(new Blob([this.report.markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url; link.download = this.report.filename; link.click();
    URL.revokeObjectURL(url);
  }

  async copyReport() {
    try { await this.copyText(this.report.markdown); this.reportMessage = this.t("reportCopied"); }
    catch (err) { this.reportMessage = this.t("reportFailed", { reason: this.errText(err) }); }
    this.render();
  }

  // `extra` adds a button after the report button, e.g. "Close" on a preview with nothing to run.
  reportBlock(plan, extra = "") {
    const shown = this.report?.plan_id === plan.plan_id ? this.report : null;
    const body = shown ? `<div class="reportbox"><div class="reporthead"><strong><ha-icon icon="mdi:file-document-outline"></ha-icon>${this.t("reportTitle")}</strong><span class="reportbtns"><button class="btn accent" data-report-copy><ha-icon icon="mdi:content-copy"></ha-icon>${this.t("reportCopy")}</button><button class="btn accent" data-report-download><ha-icon icon="mdi:download"></ha-icon>${this.t("reportDownload")}</button></span></div><pre class="reportpre">${this.esc(shown.markdown)}</pre>${shown.anonymized || this.reportMessage ? `<p class="reportnote">${this.esc(shown.anonymized ? this.t("reportAnonymous") : "")} ${this.esc(this.reportMessage || "")}</p>` : ""}</div>` : (this.reportMessage ? `${this.notice("err", this.reportMessage)}` : "");
    return `<div class="setrow planfoot"><label class="factnote reportopt"><input type="checkbox" data-report-names ${this.reportClear ? "checked" : ""}><span><strong>${this.t("reportNames")}</strong><small>${this.t("reportNamesHint")}</small></span></label>${extra ? `<span class="reportextra">` : ""}<button class="btn accent" data-report="${this.esc(plan.plan_id)}"><ha-icon icon="mdi:${shown ? "chevron-up" : "file-document-outline"}"></ha-icon>${this.t("reportButton")}</button>${extra ? `${extra}</span>` : ""}</div>${body}`;
  }

  // -- end state simulation ---------------------------------------------------------------

  simulationBlock(plan) {
    const s = plan.simulation;
    if (!s) return "";
    const lines = [];
    // "1 entity", and the devices only when there are any.
    const entities = (key, n, d) => `${n === 1 ? this.t(`${key}One`) : this.t(key, { count: n })}${d ? (d === 1 ? this.t("simDevicesOne") : this.t("simDevices", { devices: d })) : ""}`;
    if (s.removed) lines.push(entities("simRemoved", s.removed, s.removed_devices));
    if (s.disabled) lines.push(entities("simDisabled", s.disabled, s.disabled_devices));
    if (s.replaced) lines.push(this.t("simReplaced", { count: s.replaced }) + (s.replaced_by_source.length ? ` (${s.replaced_by_source.slice(0, 5).map(r => `${r.name}: ${r.count}`).join(", ")})` : ""));
    if (s.meters) lines.push(this.t("simMeters", { count: s.meters }));
    if (s.repaired) lines.push(this.t("simRepaired", { count: s.repaired }));
    if (s.purged) lines.push(this.t("simPurged", { count: s.purged }));
    if (s.remaining_certain) lines.push(this.t("simCertain", { count: s.remaining_certain }));
    if (s.remaining_uncertain) lines.push(this.t("simUncertain", { count: s.remaining_uncertain }));
    if (s.statistics_orphaned_count) lines.push(this.t("simOrphaned", { count: s.statistics_orphaned_count }));
    if (s.rows_counted) { const other = s.purge_rows - (s.purge_stat_rows || 0) - (s.purge_states_rows || 0); if (s.purge_stat_rows) lines.push(this.t("simPurgeStatRows", { count: this.formatNumber(s.purge_stat_rows) })); if (s.purge_states_rows) lines.push(this.t("simPurgeStateRows", { count: this.formatNumber(s.purge_states_rows) })); if (other > 0) lines.push(this.t("simPurgeRows", { count: this.formatNumber(other) })); if (s.history_states_kept === undefined) { if (s.history_rows_kept) lines.push(this.t("simKeptRows", { count: this.formatNumber(s.history_rows_kept) })); } else { if (s.history_states_kept) lines.push(this.t(plan.recorder_auto_purge === false ? "simKeptStatesForever" : plan.recorder_keep_days ? "simKeptStates" : "simKeptStatesOpen", { count: this.formatNumber(s.history_states_kept), days: plan.recorder_keep_days })); if (s.history_stats_kept) lines.push(this.t("simKeptStats", { count: this.formatNumber(s.history_stats_kept) })); } }
    for (const key of ["reloaded", "labeled", "area_set", "refactored", "enabled", "hidden", "unhidden", "backups_deleted", "automations_deleted"]) if (s[key]) lines.push(this.t(`sim_${key}`, { count: s[key] }));
    if (s.blocked) lines.push(this.t("simBlocked", { count: s.blocked }));
    if (!lines.length) return "";
    return `<div class="simbox"><details ${plan.status === "dry_run" ? "open" : ""}><summary>${this.t("simTitle")}</summary><ul class="simlist">${lines.map(l => `<li>${this.esc(l)}</li>`).join("")}</ul><p class="simlimits">${this.t("simLimits")}</p></details></div>`;
  }
}
