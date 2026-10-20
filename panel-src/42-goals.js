// Maintenance goals: what "in order" means for this house and whether it is so (see goals.py); mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  tilesMissed: "{count} Ziele verfehlt", moreItems: "und {count} weitere", goalsTitle: "Wartungsziele", goalsSub: "Eigene Grenzen für das, was in Ordnung heißt. Housekeeper ändert nichts.", goalsSummary: "{met} erfüllt, {missed} verfehlt", goalsNone: "Es gibt noch keine Wartungsziele.",
  goal_broken_references: "Defekte Referenzen", goal_unavailable: "Nicht verfügbare Entitäten", goal_backup_age: "Alter des letzten Backups", goal_restore_test_age: "Alter des Wiederherstellungstests", goal_recorder_growth: "Datenbankwachstum", goal_weak_batteries: "Schwache Batterien", goal_devices_without_area: "Geräte ohne Bereich", goal_stale_sensors: "Sensoren ohne neue Meldung", goal_recurring_devices: "Wiederkehrende Ausfälle (Geräte)", goal_automation_errors: "Automationen mit Fehlern (30 Tage)", goal_blocked_automations: "Blockierte Automationen", goal_orphaned_statistics: "Verwaiste Statistiken",
  goalLimit: "höchstens {limit}", goalAllowed: "erlaubt: {limit}", goalAllowedNone: "erlaubt: keine", goalMissedPill: "Ziel verfehlt", areaFindings: "Befunde", areaState: "Zustand", areaCare: "Wartung", areaCareSub: "nichts dringend", goalNow: "jetzt {value}", goalNever: "nie", goalNoBackup: "kein Backup", goalUnknownHint: "noch nicht messbar",
  goalState_met: "Erfüllt", goalState_missed: "Verfehlt", goalState_unknown: "Unbekannt", goalState_off: "Aus",
  goalUnit_mb_per_day: "{n} MB pro Tag", goalEdit: "Anpassen", goalLimitLabel: "Grenze", goalEnabled: "Ziel beachten", goalDefault: "Standard: {n}", goalFailed: "Nicht gespeichert: {reason}", goalSave: "Speichern", goalsAdjust: "Grenzen anpassen", goalsAllMet: "Alle {n} beachteten Ziele sind erreicht.",
});
Object.assign(TEXT.en, {
  tilesMissed: "{count} goals missed", moreItems: "and {count} more", goalsTitle: "Maintenance goals", goalsSub: "Your own limits for what in order means. Housekeeper changes nothing.", goalsSummary: "{met} met, {missed} missed", goalsNone: "There are no maintenance goals yet.",
  goal_broken_references: "Broken references", goal_unavailable: "Unavailable entities", goal_backup_age: "Age of the latest backup", goal_restore_test_age: "Age of the restore test", goal_recorder_growth: "Database growth", goal_weak_batteries: "Weak batteries", goal_devices_without_area: "Devices without an area", goal_stale_sensors: "Sensors without a new report", goal_recurring_devices: "Recurring outages (devices)", goal_automation_errors: "Automations with errors (30 days)", goal_blocked_automations: "Blocked automations", goal_orphaned_statistics: "Orphaned statistics",
  goalLimit: "at most {limit}", goalAllowed: "allowed: {limit}", goalAllowedNone: "allowed: none", goalMissedPill: "Goal missed", areaFindings: "Findings", areaState: "State", areaCare: "Maintenance", areaCareSub: "nothing urgent", goalNow: "now {value}", goalNever: "never", goalNoBackup: "no backup", goalUnknownHint: "cannot be measured yet",
  goalState_met: "Met", goalState_missed: "Missed", goalState_unknown: "Unknown", goalState_off: "Off",
  goalUnit_mb_per_day: "{n} MB per day", goalEdit: "Adjust", goalLimitLabel: "Limit", goalEnabled: "Watch this goal", goalDefault: "Default: {n}", goalFailed: "Not saved: {reason}", goalSave: "Save", goalsAdjust: "Adjust limits", goalsAllMet: "All {n} watched goals are met.",
});

// Where a goal leads: the page, its tab, and the filter that leaves only what the goal counts (lf: "list|name|value").
const GOAL_JUMPS = {
  broken_references: { view: "findingsNav", filter: "broken_reference" },
  unavailable: { view: "findingsNav", filter: "unavailable" },
  stale_sensors: { view: "findingsNav", filter: "stale" },
  blocked_automations: { view: "findingsNav", filter: "automation.blocked" },
  backup_age: { view: "maintenance", tab: "backup" },
  restore_test_age: { view: "maintenance", tab: "backup" },
  recorder_growth: { view: "recorder", tab: "db" },
  weak_batteries: { view: "batteries", battery: "low", clear: "batteries" },
  devices_without_area: { view: "policies", tab: "violations", lf: "polviol|rule|device_area" },
  recurring_devices: { view: "cleanup", tab: "devices", clear: "cleanup" },
  orphaned_statistics: { view: "cleanup", tab: "stats", clear: "orphanstats" },
  automation_errors: { view: "runs", tab: "overview", lf: "overview|runs|errors" },
};
const GOAL_TONES = { met: "ok", missed: "red", unknown: "mute", off: "mute" };

class GoalsMixin {
  async loadGoals() {
    this.goalsLoading = true; this.goalsError = "";
    try { this.goals = await this._hass.callWS({ type: "ha_housekeeper/goals" }); this.markLoaded("goals"); }
    catch (err) { this.goals = null; this.goalsError = this.errText(err); }
    this.goalsLoading = false; this.render();
  }

  // Loads once, and again after every new scan.
  ensureGoals() {
    const key = this.data?.meta?.scanned_at || "";
    if (this.goalsLoading || (this._goalsKey === key && this._goalsRequested)) return;
    this._goalsRequested = true; this._goalsKey = key;
    setTimeout(() => this.loadGoals(), 0);
  }

  goalAmount(g, n) {
    if (g.unit === "hours") return this.bhAge(n);
    if (g.unit === "days") return this.t("daysValue", { n });
    if (g.unit === "mb_per_day") return this.t("goalUnit_mb_per_day", { n: this.formatNumber(n) });
    return this.formatNumber(n);
  }

  goalNow(g) {
    if (g.never) return this.t(g.id === "backup_age" ? "goalNoBackup" : "goalNever");
    return g.value === null ? this.t("goalUnknownHint") : this.t("goalNow", { value: this.goalAmount(g, g.value) });
  }

  goalJump(id) {
    const j = GOAL_JUMPS[id];
    return `data-jump="${j.view}"${j.tab ? ` data-jump-tab="${j.tab}"` : ""}${j.filter ? ` data-filter="${j.filter}"` : ""}${j.lf ? ` data-jump-lf="${j.lf}"` : ""}${j.battery ? ` data-jump-battery="${j.battery}"` : ""}${j.clear ? ` data-jump-clear="${j.clear}"` : ""}`;
  }

  goalRow(g, editable = true) {
    const form = editable && this.goalForm?.id === g.id ? this.goalFormHtml(g) : "";
    const title = `<button class="linklike" ${this.goalJump(g.id)}><strong>${this.t(`goal_${g.id}`)}</strong></button>`;
    return `<div class="row"><span class="tile ${GOAL_TONES[g.state]}"><ha-icon icon="${g.state === "met" ? "mdi:check-circle-outline" : g.state === "missed" ? "mdi:alert-circle-outline" : "mdi:help-circle-outline"}"></ha-icon></span><span class="row-text">${title}<small>${this.esc(this.goalNow(g))} · ${this.esc(this.t("goalLimit", { limit: this.goalAmount(g, g.limit) }))}</small></span><span class="pill ${GOAL_TONES[g.state]}">${this.t(`goalState_${g.state}`)}</span>${editable ? `<button class="btn quiet" data-goal-open="${g.id}">${this.t("goalEdit")}</button>` : ""}</div>${form}`;
  }

  goalFormHtml(g) {
    const f = this.goalForm;
    return `<form class="pad polform" data-goal-form="${g.id}"><label>${this.t("goalLimitLabel")} <input type="number" data-goal-limit min="0" step="1" value="${this.esc(String(f.limit))}"></label>
      <label><input type="checkbox" data-goal-enabled ${f.enabled ? "checked" : ""}> ${this.t("goalEnabled")}</label><small>${this.t("goalDefault", { n: this.goalAmount(g, g.default) })}</small>
      <button type="submit" class="btn primary">${this.t("goalSave")}</button><button type="button" class="btn quiet" data-goal-cancel>${this.t("cancelRun")}</button>
      ${f.error ? `${this.notice("err", f.error)}` : ""}</form>`;
  }

  // The overview shows only what is missed (or that all is met) and leads to Maintenance, where the limits are set.
  goalsCard(compact = false) {
    this.ensureGoals();
    const r = this.goals;
    if (!compact) {
      // The tab in Maintenance says what is going on instead of staying empty.
      const head = this.pageBar({ at: this.loadedAt("goals"), loading: this.goalsLoading, attr: "data-goals-refresh" });
      if (this.goalsError) return `<div class="stack">${head}<div class="panel">${this.notice("err", this.goalsError)}</div></div>`;
      if (!r) return `<div class="stack">${head}<div class="panel">${this.skeleton("loading")}</div></div>`;
      if (!r.goals?.length) return `<div class="stack">${head}<div class="panel"><div class="emptymsg">${this.t("goalsNone")}</div></div></div>`;
    }
    if (!r?.goals?.length) return "";
    if (compact) {
      const missed = r.goals.filter(g => g.state === "missed");
      const body = missed.length ? missed.map(g => this.goalRow(g, false)).join("") : `<div class="pad"><small>${this.t("goalsAllMet", { n: r.met })}</small></div>`;
      return `<section class="panel u-mb14" aria-labelledby="hk-goals"><div class="panelhead"><div><h2 id="hk-goals">${this.t("goalsTitle")}</h2></div><span class="date">${this.t("goalsSummary", { met: r.met, missed: r.missed })}</span><button class="btn quiet" data-goals-settings>${this.t("goalsAdjust")}</button></div>${body}</section>`;
    }
    const head = this.pageBar({ at: this.loadedAt("goals"), loading: this.goalsLoading, attr: "data-goals-refresh" });
    return `<div class="stack">${head}<section class="panel u-mb14" aria-label="${this.esc(this.t("goalsTitle"))}"><p class="factnote pad">${this.t("goalsSummary", { met: r.met, missed: r.missed })}</p>${r.goals.map(g => this.goalRow(g)).join("")}</section></div>`;
  }

  openGoal(id) {
    const g = this.goals?.goals?.find(x => x.id === id);
    if (!g) return;
    this.goalForm = { id, limit: g.limit, enabled: g.enabled, error: "" };
    this.render();
    this.shadowRoot?.querySelector?.("[data-goal-limit]")?.focus?.();
  }

  async commitGoal() {
    const f = this.goalForm;
    if (!f) return;
    const limit = Number.parseInt(f.limit, 10);
    if (!Number.isFinite(limit)) { f.error = this.t("goalFailed", { reason: "?" }); this.render(); return; }
    try {
      await this._hass.callWS({ type: "ha_housekeeper/goal_set", goal: f.id, enabled: f.enabled, limit });
      this.goalForm = null;
      await this.loadGoals();
    } catch (err) { f.error = this.t("goalFailed", { reason: this.errText(err) }); this.render(); }
  }

  bindGoals(root) {
    root.querySelectorAll("[data-goals-settings]").forEach(el => el.onclick = () => { (this.viewTab ||= {}).maintenance = "goals"; this.noteJump?.("maintenance"); this.view = "maintenance"; this.selected = null; this.pages = {}; this.render(); });
    root.querySelector("[data-goals-refresh]")?.addEventListener("click", () => this.loadGoals());
    root.querySelectorAll("[data-goal-open]").forEach(el => el.onclick = () => this.openGoal(el.dataset.goalOpen));
    root.querySelectorAll("[data-goal-cancel]").forEach(el => el.onclick = () => { this.goalForm = null; this.render(); });
    root.querySelectorAll("[data-goal-form]").forEach(form => {
      form.onsubmit = ev => { ev.preventDefault(); this.commitGoal(); };
      form.querySelector("[data-goal-limit]").oninput = ev => { this.goalForm.limit = ev.target.value; };
      form.querySelector("[data-goal-enabled]").onchange = ev => { this.goalForm.enabled = ev.target.checked; };
      form.onkeydown = ev => { if (ev.key === "Escape") { ev.preventDefault(); this.goalForm = null; this.render(); } };
    });
  }
}
