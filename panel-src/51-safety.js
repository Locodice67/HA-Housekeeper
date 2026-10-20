// SafetyMixin: the thin status line under the navigation that says how safe the writing parts are.
class SafetyMixin {
  ensureSafetyData() {
    if (this.journal === null && !this._journalRequested) { this._journalRequested = true; this.loadJournal(); }
    this.ensureBackup();
  }

  // Each item is [key, tone, text, target view]; what needs a look (red, then yellow) comes first, the rest keeps its order.
  // Nothing is invented when data is missing.
  safetyItems() {
    const items = [], plans = this.journal || [];
    const mode = this.data?.meta?.protection || "full";
    items.push(["mode", mode === "full" ? "mute" : "warn", this.t(`safeMode_${mode}`), "settings"]);
    const check = this.backup?.available ? (this.backup.checks || []).find(c => c.id === "newest") : null;
    if (this.plan && ["backup", "running"].includes(this.plan.status)) items.push(["run", "warn", this.t(this.plan.status === "backup" ? "safeBackupRunning" : "safeRunning"), "journal"]);
    if (check) items.push(["backup", check.level === "ok" ? "ok" : "warn", check.values?.age_hours === null || check.values?.age_hours === undefined ? this.t("safeNoBackup") : this.t("safeBackup", { age: this.bhAge(check.values.age_hours) }), "maintenance"]);
    const last = plans.find(p => p.finished_at);
    if (last) items.push(["last", last.undoable ? "ok" : "mute", `${this.t("safeLast", { when: this.formatDate(last.finished_at) })} · ${this.t(last.undoable ? "safeUndo" : "safeNoUndo")}`, "journal"]);
    if (this.scanCoverageComplete()) items.push(["coverage", "ok", this.t("covBar"), "settings"]);
    // AI access while it is on, so it is not forgotten; yellow while it may change the list.
    const mcp = this.data?.meta?.mcp;
    if (mcp?.enabled) {
      const off = mcp.off_at ? ` · ${this.t("mcpOffAt", { date: `${this.mcpDay(mcp.off_at)}, ${this.mcpTime(mcp.off_at).slice(0, 5)}` })}` : "";
      items.push(["ai", mcp.write ? "warn" : "mute", `${this.t("safeAi", { mode: this.t(mcp.write ? "mcpBarWrite" : "mcpBarRead") })}${off}`, "settings"]);
    }
    const watching = plans.filter(p => p.followup === "watching").length;
    if (watching) items.push(["watch", "warn", this.t(watching === 1 ? "safeWatching1" : "safeWatching", { n: watching }), "journal"]);
    const regress = plans.filter(p => p.followup === "regression").length;
    if (regress) items.push(["regress", "red", this.t("safeRegression", { n: regress }), "journal"]);
    const rank = tone => ({ red: 0, warn: 1 })[tone] ?? 2;
    return items.map((item, i) => [item, i]).sort((a, b) => rank(a[0][1]) - rank(b[0][1]) || a[1] - b[1]).map(([item]) => item);
  }

  // Settings > Scan: the protection mode, which the server enforces, and the events Housekeeper fires.
  protectionCard() {
    const mode = this.data?.meta?.protection || "full";
    const icons = { read_only: "mdi:eye-outline", quarantine: "mdi:archive-lock-outline", confirmed: "mdi:shield-check-outline", full: "mdi:shield-lock-outline" };
    const options = ["read_only", "quarantine", "confirmed", "full"].map(m => `<label class="modeopt${m === mode ? " on" : ""}"><input type="radio" name="hk-protection" value="${m}" data-protection ${m === mode ? "checked" : ""}><span class="tile ${m === mode ? (m === "full" ? "ok" : "warn") : "mute"}"><ha-icon icon="${icons[m]}"></ha-icon></span><span class="row-text"><strong>${this.t(`mode_${m}`)}</strong><small>${this.t(`modeText_${m}`)}</small></span></label>`).join("");
    return `<section class="panel modepanel"><div class="panelhead"><div><h2>${this.t("modeTitle")}</h2><p>${this.t("modeHint")}</p></div><span class="pill ${mode === "full" ? "ok" : "warn"}">${this.t(`modeBadge_${mode}`)}</span></div>
      <div class="modeopts" role="radiogroup" aria-label="${this.esc(this.t("modeLabel"))}">${options}</div></section>`;
  }

  eventsCard() {
    const rows = ["critical_finding", "backup_overdue", "quarantine_expired", "followup_regression", "integration_down", "reminder_due"].map(e => `<tr><td><code>ha_housekeeper_${e}</code></td><td>${this.t(`event_${e}`)}</td><td class="evcopy"><button class="iconbtn" data-copy-event="ha_housekeeper_${e}" title="${this.esc(this.t("eventCopy"))}" aria-label="${this.esc(this.t("eventCopy"))}"><ha-icon icon="${this.copiedEvent === e ? "mdi:check" : "mdi:content-copy"}"></ha-icon></button></td></tr>`).join("");
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("eventsTitle")}</h2><p>${this.t("eventsHint")}</p></div></div><div class="tablewrap"><table class="evtable"><thead><tr><th>${this.t("eventColName")}</th><th>${this.t("eventColWhen")}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  async setProtection(mode) {
    try { await this._hass.callWS({ type: "ha_housekeeper/protection_set", mode }); this.data.meta.protection = mode; }
    catch (err) { this.failed(err); }
    this.render();
  }

  safetyBar() {
    if (!this.data) return "";
    const items = this.safetyItems();
    if (!items.length) return "";
    return `<div class="safebar" role="region" aria-label="${this.esc(this.t("safeLabel"))}">${items.map(([key, tone, text, view]) => `<button class="safeitem ${tone}" data-safe="${view}" data-safe-key="${key}"${key === "watch" ? ` title="${this.esc(this.t("safeWatchingTip"))}"` : ""}><span class="dot ${tone}" aria-hidden="true"></span>${this.esc(text)}</button>`).join("")}</div>`;
  }
}
Object.assign(TEXT.de, {
  safeLabel: "Sicherheitsstatus", safeBackup: "Letztes Backup: vor {age}", safeNoBackup: "Kein Backup gefunden",
  safeLast: "Letzter Plan: {when}", safeUndo: "rückgängig möglich", safeNoUndo: "nicht mehr rückgängig", safeAi: "KI-Zugriff: {mode}",
  safeRunning: "Ein Plan läuft", safeBackupRunning: "Backup für einen Plan läuft", safeWatching: "{n} Pläne werden nachbeobachtet", safeWatching1: "1 Plan wird nachbeobachtet", safeWatchingTip: "Bis 24 Stunden nach der Ausführung prüft Housekeeper bei jedem Scan, ob neue Befunde dazugekommen sind.", safeRegression: "{n} Rückfall nach Änderung",
  healthScore: "{percent} / 100 gesund", healthAffected: "{affected} von {base} bewerteten Objekten betroffen",
  healthWord_ok: "In Ordnung", healthWord_warn: "Prüfen nötig", healthWord_red: "Handlungsbedarf",
  causeCounts: "{parts} betroffen", causeN_entity: "{n} Entitäten", causeN_automation: "{n} Automationen", causeN_script: "{n} Skripte", causeN_dashboard: "{n} Dashboards", causeN_entity1: "1 Entität", causeN_automation1: "1 Automation", causeN_script1: "1 Skript", causeN_dashboard1: "1 Dashboard",
});
Object.assign(TEXT.en, {
  safeLabel: "Safety status", safeBackup: "Last backup: {age} ago", safeNoBackup: "No backup found",
  safeLast: "Last plan: {when}", safeUndo: "undo available", safeNoUndo: "no longer undoable", safeAi: "AI access: {mode}",
  safeRunning: "A plan is running", safeBackupRunning: "Backup for a plan is running", safeWatching: "{n} plans are being watched", safeWatching1: "1 plan is being watched", safeWatchingTip: "For up to 24 hours after the run, Housekeeper checks at every scan whether new findings appeared.", safeRegression: "{n} regression after a change",
  healthScore: "{percent} / 100 healthy", healthAffected: "{affected} of {base} rated objects affected",
  healthWord_ok: "All good", healthWord_warn: "Needs a look", healthWord_red: "Action needed",
  causeCounts: "{parts} affected", causeN_entity: "{n} entities", causeN_automation: "{n} automations", causeN_script: "{n} scripts", causeN_dashboard: "{n} dashboards", causeN_entity1: "1 entity", causeN_automation1: "1 automation", causeN_script1: "1 script", causeN_dashboard1: "1 dashboard",
});
Object.assign(TEXT.de, {
  modeBadge_full: "Alles erlaubt", modeBadge_read_only: "Nur lesen", modeBadge_quarantine: "Nur Quarantäne", modeBadge_confirmed: "Ohne endgültiges Löschen",
  safeMode_full: "Schutzmodus: Standard", safeMode_read_only: "Schutzmodus: nur lesen", safeMode_quarantine: "Schutzmodus: nur Quarantäne", safeMode_confirmed: "Schutzmodus: ohne endgültiges Löschen",
  modeTitle: "Schutzmodus", modeHint: "Legt auf dem Server fest, was Pläne ändern dürfen. Das gilt für Bestätigen, Starten und Rückgängig, nicht nur für Knöpfe im Panel. Pläne anlegen und alle Ansichten bleiben immer erlaubt.", modeLabel: "Was Housekeeper ändern darf",
  mode_read_only: "1 · Nur lesen", mode_quarantine: "2 · Quarantäne erlaubt", mode_confirmed: "3 · Bestätigte Änderungen mit Backup", mode_full: "4 · Voller Wartungsmodus",
  modeText_read_only: "Nichts wird geändert, auch kein Rückgängig.", modeText_quarantine: "Nur Deaktivieren (und dessen Rückgängig) ist erlaubt.", modeText_confirmed: "Alles mit Einzelbestätigung und Backup außer unumkehrbarem Löschen von Recorder-Daten.", modeText_full: "Alles, wie bisher.",
  plan: "Plan", planPageSubtitle: "Vorschau, Prüfung und Ergebnis eines Plans. Nichts wird geändert, bevor du bestätigst.", planNone: "Dieser Plan ist nicht mehr geöffnet. Alle Pläne stehen im Journal.",
  nothingToRun: "Noch nichts zum Ausführen: Hake darunter an, dass du die zu prüfenden Einträge gesehen hast.",
  modeBlockTitle: "Der Schutzmodus „{mode}“ erlaubt diesen Plan nicht", modeBlockText: "{count} Schritt(e) darf Housekeeper in diesem Modus nicht ausführen. Du kannst den Plan ansehen, aber erst nach einer Änderung des Modus bestätigen.", modeBlockLink: "Schutzmodus ändern",
  err_protection_mode: "Der Schutzmodus erlaubt das nicht. Ändere ihn unter Einstellungen → Schutzmodus.",
  eventsTitle: "Ereignisse für eigene Automationen", eventsHint: "Nach jedem Scan löst Housekeeper für jede neue Lage ein Ereignis aus, einmal je Lage, beim ersten Mal still. Nichts verlässt Home Assistant.", eventColName: "Ereignis", eventColWhen: "Wann", eventCopy: "Namen kopieren",
  event_critical_finding: "neuer Befund mit hoher Auswirkung", event_backup_overdue: "Backup überfällig", event_quarantine_expired: "Quarantäne abgelaufen", event_followup_regression: "Nachkontrolle: Rückfall", event_integration_down: "Integration nicht geladen",
});
Object.assign(TEXT.en, {
  modeBadge_full: "Everything allowed", modeBadge_read_only: "Read only", modeBadge_quarantine: "Quarantine only", modeBadge_confirmed: "No irreversible deletions",
  safeMode_full: "Protection mode: standard", safeMode_read_only: "Protection mode: read only", safeMode_quarantine: "Protection mode: quarantine only", safeMode_confirmed: "Protection mode: no irreversible deletions",
  modeTitle: "Protection mode", modeHint: "Sets on the server what plans may change. It holds for confirming, starting and undoing, not only for buttons in the panel. Making plans and every view stay allowed.", modeLabel: "What Housekeeper may change",
  mode_read_only: "1 · Read only", mode_quarantine: "2 · Quarantine allowed", mode_confirmed: "3 · Confirmed changes with backup", mode_full: "4 · Full maintenance",
  modeText_read_only: "Nothing is changed, not even an undo.", modeText_quarantine: "Only disabling (and undoing it) is allowed.", modeText_confirmed: "Everything with one-by-one confirmation and backup except irreversible deletion of recorder data.", modeText_full: "Everything, as before.",
  plan: "Plan", planPageSubtitle: "Preview, check and result of a plan. Nothing changes before you confirm.", planNone: "This plan is no longer open. All plans are in the journal.",
  nothingToRun: "Nothing to run yet: tick the box below this line to say you have seen the entries to review.",
  modeBlockTitle: "The protection mode “{mode}” does not allow this plan", modeBlockText: "Housekeeper may not run {count} step(s) in this mode. You can look at the plan, but only confirm it after changing the mode.", modeBlockLink: "Change protection mode",
  err_protection_mode: "The protection mode does not allow this. Change it under Settings → Protection mode.",
  eventsTitle: "Events for your own automations", eventsHint: "After each scan Housekeeper fires an event for each new situation, once per situation, silent the first time. Nothing leaves Home Assistant.", eventColName: "Event", eventColWhen: "When", eventCopy: "Copy name",
  event_critical_finding: "new finding with high impact", event_backup_overdue: "backup overdue", event_quarantine_expired: "quarantine expired", event_followup_regression: "follow-up: regression", event_integration_down: "integration not loaded",
});
