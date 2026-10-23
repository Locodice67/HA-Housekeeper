// AutoPauseMixin: the tab "Auto-Pause" of Reliability and the button on an integration's page. An integration that keeps failing
// to set up is paused (disabled) and tried again later; data is `ha_housekeeper/auto_pause`, changes go through `auto_pause_set`.
// Mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  apTab: "Auto-Pause", apTileHint: "{n} Kandidaten · pausiert Dauerfehler und versucht es später wieder",
  apHead: "Dauerfehler automatisch pausieren", apHeadSub: "Pausiert freigegebene Datenlieferanten, die dauernd an der Einrichtung scheitern, und versucht es später wieder. Eine Pause von Hand braucht diesen Schalter nicht.",
  apOn: "Ein", apOff: "Aus", apAttempts: "Fehlversuche", apHours: "in Stunden", apHouse: "Auch Integrationen pausieren, die eine Hausfunktion tragen",
  apPlan: "Wiederholungen: 3 × 1 Std., 3 × 3 Std., 12 × 6 Std., dann täglich, höchstens {days} Tage ab Beginn der Pause. Danach bleibt die Pause bestehen und Housekeeper meldet es.",
  apPaused: "Pausiert", apNonePaused: "Nichts pausiert.", apCandidates: "Kandidaten", apNoCandidates: "Keine Integration erfüllt die Regel: Cloud-Abruf und nur Daten-Entitäten.",
  apManual: "Integration pausieren", apPick: "Integration wählen", apPause: "Pausieren", apSince: "Seit {span}", apNext: "nächster Versuch in {span}", apTry: "Versuch {n} von {total}",
  apExhausted: "Keine Versuche mehr, bitte prüfen", apReasonAuto: "{n} Fehlversuche", apReasonManual: "von dir pausiert",
  apTryNow: "Jetzt versuchen", apEnd: "Pause beenden", apNever: "Nie pausieren", apRelease: "Freigeben", apUnrelease: "Freigabe entziehen", apReleased: "freigegeben",
  apExcluded: "Nie pausiert", apExcludedNone: "Keine Ausnahmen.", apAllow: "Wieder zulassen", apHouseFn: "trägt eine Hausfunktion", apFailures: "{n} Fehlversuche",
  apLog: "Verlauf", apLogNone: "Noch nichts passiert.", apLog_paused: "pausiert", apLog_tried: "Versuch ohne Erfolg", apLog_back: "läuft wieder", apLog_ended: "Pause beendet", apLog_exhausted: "Pause bleibt, bitte prüfen",
  apSend: "In Auto-Pause schicken", apSendHint: "Vorübergehende Störung? Auto-Pause entlastet die Quelle.", apPausedNow: "Pausiert seit {span}",
  apConfirmTitle: "{name} pausieren?", apConfirmText: "{name} wird deaktiviert und danach in Abständen wieder versucht, höchstens {days} Tage lang.",
  apWarnControl: "Die Integration hat Entitäten, die etwas steuern oder melden. Für die Dauer der Pause sind sie aus Home Assistant verschwunden.", apWarnHouse: "Eine Hausfunktion verlässt sich darauf.",
  apConfirmYes: "Pausieren",
  err_auto_pause_confirm_needed: "Die Integration steuert etwas oder trägt eine Hausfunktion: bitte bestätigen.", err_auto_pause_core: "Diese Integration wird nie pausiert.", err_auto_pause_reauth: "Die Integration braucht eine neue Anmeldung; eine Pause hilft nicht.", err_auto_pause_paused: "Bereits pausiert.", err_auto_pause_disabled: "Die Integration ist schon deaktiviert.", err_auto_pause_not_found: "Integration nicht gefunden.", err_auto_pause_not_paused: "Nicht pausiert.", err_auto_pause_busy: "Es läuft gerade ein Versuch.", err_auto_pause_invalid: "Wert nicht zulässig.",
});
Object.assign(TEXT.en, {
  apTab: "Auto-pause", apTileHint: "{n} candidates · pauses constant failures and tries again later",
  apHead: "Pause constant failures automatically", apHeadSub: "Pauses released data providers that keep failing to set up and tries them again later. A pause you start by hand does not need this switch.",
  apOn: "On", apOff: "Off", apAttempts: "failed attempts", apHours: "within hours", apHouse: "Also pause integrations that carry a house function",
  apPlan: "Retries: 3 × 1 h, 3 × 3 h, 12 × 6 h, then daily, for up to {days} days from the start of the pause. After that the pause stays and Housekeeper tells you.",
  apPaused: "Paused", apNonePaused: "Nothing paused.", apCandidates: "Candidates", apNoCandidates: "No integration meets the rule: cloud polling and data entities only.",
  apManual: "Pause an integration", apPick: "Choose an integration", apPause: "Pause", apSince: "For {span}", apNext: "next try in {span}", apTry: "Try {n} of {total}",
  apExhausted: "No more tries, please look", apReasonAuto: "{n} failed attempts", apReasonManual: "paused by you",
  apTryNow: "Try now", apEnd: "End pause", apNever: "Never pause", apRelease: "Release", apUnrelease: "Withdraw release", apReleased: "released",
  apExcluded: "Never paused", apExcludedNone: "No exceptions.", apAllow: "Allow again", apHouseFn: "carries a house function", apFailures: "{n} failed attempts",
  apLog: "History", apLogNone: "Nothing yet.", apLog_paused: "paused", apLog_tried: "try without success", apLog_back: "is back", apLog_ended: "pause ended", apLog_exhausted: "pause stays, please look",
  apSend: "Send to auto-pause", apSendHint: "A temporary fault? Auto-pause spares the source.", apPausedNow: "Paused for {span}",
  apConfirmTitle: "Pause {name}?", apConfirmText: "{name} will be disabled and tried again at intervals, for up to {days} days.",
  apWarnControl: "The integration has entities that control or report something. They are gone from Home Assistant while it is paused.", apWarnHouse: "A house function relies on it.",
  apConfirmYes: "Pause",
  err_auto_pause_confirm_needed: "The integration controls something or carries a house function: please confirm.", err_auto_pause_core: "This integration is never paused.", err_auto_pause_reauth: "The integration needs a new login; a pause does not help.", err_auto_pause_paused: "Already paused.", err_auto_pause_disabled: "The integration is already disabled.", err_auto_pause_not_found: "Integration not found.", err_auto_pause_not_paused: "Not paused.", err_auto_pause_busy: "An attempt is running.", err_auto_pause_invalid: "Value not allowed.",
});

class AutoPauseMixin {
  async loadAutoPause() {
    this.apLoading = true;
    try { this.autoPause = await this._hass.callWS({ type: "ha_housekeeper/auto_pause" }); this.apError = ""; }
    catch (err) { this.apError = this.errText(err); }
    this.apLoading = false; this.render();
  }

  // The first visit loads once; every change comes back with the new state.
  ensureAutoPause() {
    if (this.apLoading || this._apRequested) return;
    this._apRequested = true;
    setTimeout(() => this.loadAutoPause(), 0);
  }

  async apCall(payload) {
    try { this.autoPause = await this._hass.callWS({ type: "ha_housekeeper/auto_pause_set", ...payload }); }
    catch (err) { this.failed(err); }
    this.render();
  }

  apPausedItem(entryId) { return (this.autoPause?.paused || []).find(p => p.entry_id === entryId) || null; }

  apSpan(ms) {
    const hours = Math.max(1, Math.round(ms / 3600000));
    return hours >= 48 ? this.t("relDays", { n: Math.round(hours / 24) }) : hours >= 2 ? this.t("relHours", { n: hours }) : this.t("relMinutes", { n: Math.max(1, Math.round(ms / 60000)) });
  }

  autoPauseTile() {
    const a = this.autoPause, paused = a?.paused?.length || 0;
    return { id: "autopause", icon: "mdi:pause-circle-outline", label: this.t("apTab"), hint: this.t("apTileHint", { n: this.formatNumber(a?.candidates?.length || 0) }), count: a ? paused : undefined, tone: paused ? "warn" : "mute", status: !a };
  }

  // Asks first where pausing has a consequence, then sends the entry into the pause.
  apStart(entryId) {
    const item = (this.autoPause?.pausable || []).find(p => p.entry_id === entryId);
    if (!item) return;
    const days = Math.round((this.autoPause.schedule?.end_hours || 168) / 24);
    const warn = item.warn?.length ? { title: item.warn.includes("house_function") ? this.t("apWarnHouse") : this.t("apWarnControl"), hint: item.warn.length > 1 ? this.t("apWarnControl") : "" } : null;
    this.confirmAsk(this.t("apConfirmText", { name: item.title, days }), () => this.apCall({ action: "pause", entry_id: entryId, confirm: true }), { title: this.t("apConfirmTitle", { name: item.title }), yes: this.t("apConfirmYes"), danger: false, ...(warn ? { warn } : {}) });
  }

  // The button on the page of an integration: send it in, or its state while it is paused.
  apPageActions(entryId, state) {
    const a = this.autoPause;
    if (!a || !entryId) return "";
    const paused = this.apPausedItem(entryId);
    if (paused) {
      const span = this.apSpan(Date.now() - new Date(paused.since).getTime());
      return `<span class="pill warn">${this.esc(this.t("apPausedNow", { span }))}</span><button class="btn" data-ap-try="${this.esc(entryId)}">${this.t("apTryNow")}</button><button class="btn" data-ap-end="${this.esc(entryId)}">${this.t("apEnd")}</button>`;
    }
    if (!(a.pausable || []).some(p => p.entry_id === entryId)) return "";
    const failing = state && state !== "loaded";
    return `<button class="btn${failing ? " primary" : ""}" data-ap-send="${this.esc(entryId)}" title="${this.esc(failing ? this.t("apSendHint") : "")}"><ha-icon icon="mdi:pause-circle-outline"></ha-icon>${this.t("apSend")}</button>`;
  }

  autoPauseView() {
    this.ensureAutoPause();
    const a = this.autoPause;
    if (this.apError) return `<div class="panel">${this.notice("err", this.apError)}</div>`;
    if (!a) return `<div class="panel">${this.skeleton("relLoading")}</div>`;
    const s = a.settings, days = Math.round(a.schedule.end_hours / 24), now = Date.now();
    const num = (key, value, min, max) => `<label class="apnum"><input type="number" min="${min}" max="${max}" value="${value}" data-ap-num="${key}"> <span>${this.t(key === "attempts" ? "apAttempts" : "apHours")}</span></label>`;
    const settings = `<section class="panel"><div class="panelhead"><div><h2>${this.t("apHead")}</h2><p>${this.t("apHeadSub")}</p></div><label class="apswitch"><input type="checkbox" data-ap-setting="enabled" ${s.enabled ? "checked" : ""}> ${this.t(s.enabled ? "apOn" : "apOff")}</label></div>
      <div class="apsettings">${num("attempts", s.attempts, 3, 500)}${num("hours", s.hours, 1, 48)}<label><input type="checkbox" data-ap-setting="house_functions" ${s.house_functions ? "checked" : ""}> ${this.t("apHouse")}</label></div>
      <p class="factnote">${this.t("apPlan", { days })}</p></section>`;
    const pausedRows = a.paused.map(p => {
      const due = p.next ? new Date(p.next).getTime() - now : null;
      const sub = [p.exhausted ? this.t("apExhausted") : due !== null ? `${this.t("apTry", { n: Math.min(p.done + 1, a.schedule.offsets.length), total: a.schedule.offsets.length })}, ${this.t("apNext", { span: this.apSpan(Math.max(due, 0)) })}` : "",
        p.reason === "manual" ? this.t("apReasonManual") : this.t("apReasonAuto", { n: this.formatNumber(p.failures || 0) })].filter(Boolean).join(" · ");
      return `<div class="row"><span class="tile warn"><ha-icon icon="mdi:pause-circle-outline"></ha-icon></span><span class="row-text"><strong>${this.esc(p.title)}</strong><small>${this.esc(p.domain)} · ${this.esc(this.t("apSince", { span: this.apSpan(now - new Date(p.since).getTime()) }))}</small><small>${this.esc(sub)}</small></span>
        <span class="apbtns"><button class="btn" data-ap-try="${this.esc(p.entry_id)}">${this.t("apTryNow")}</button><button class="btn" data-ap-end="${this.esc(p.entry_id)}">${this.t("apEnd")}</button><button class="btn" data-ap-never="${this.esc(p.entry_id)}">${this.t("apNever")}</button></span></div>`;
    }).join("");
    const options = (a.pausable || []).filter(p => !a.paused.some(q => q.entry_id === p.entry_id)).sort((x, y) => x.title.localeCompare(y.title)).map(p => `<option value="${this.esc(p.entry_id)}">${this.esc(p.title)} (${this.esc(p.domain)})</option>`).join("");
    const manual = `<div class="apmanual"><select data-ap-pick aria-label="${this.esc(this.t("apManual"))}"><option value="">${this.t("apPick")}</option>${options}</select><button class="btn" data-ap-pause>${this.t("apPause")}</button></div>`;
    const candRows = a.candidates.filter(c => !c.excluded).map(c => `<div class="row"><span class="tile ${c.approved ? "ok" : "mute"}"><ha-icon icon="mdi:cloud-outline"></ha-icon></span><span class="row-text"><strong>${this.esc(c.title)}</strong><small>${this.esc(c.domain)} · ${this.esc(this.entryStateLabel(c.state))}${c.attempts ? ` · ${this.esc(this.t("apFailures", { n: this.formatNumber(c.attempts) }))}` : ""}${c.house_function ? ` · ${this.esc(this.t("apHouseFn"))}` : ""}</small></span>
        <span class="apbtns">${c.approved ? `<span class="pill ok">${this.t("apReleased")}</span><button class="btn" data-ap-release="${this.esc(c.entry_id)}" data-on="0">${this.t("apUnrelease")}</button>` : `<button class="btn" data-ap-release="${this.esc(c.entry_id)}" data-on="1">${this.t("apRelease")}</button>`}<button class="btn" data-ap-never="${this.esc(c.entry_id)}">${this.t("apNever")}</button></span></div>`).join("");
    const titleOf = id => (a.candidates.find(c => c.entry_id === id) || (a.pausable || []).find(p => p.entry_id === id) || {}).title || id;
    const excluded = a.exclude.length ? a.exclude.map(id => `<span class="pill mute">${this.esc(titleOf(id))} <button class="link" data-ap-allow="${this.esc(id)}" title="${this.esc(this.t("apAllow"))}" aria-label="${this.esc(this.t("apAllow"))}">✕</button></span>`).join(" ") : `<span class="factnote">${this.t("apExcludedNone")}</span>`;
    const log = a.log.length ? `<div class="tablewrap"><table class="evtable"><tbody>${a.log.map(l => `<tr><td>${this.esc(this.formatDate(l[0]))}</td><td>${this.esc(l[2])}</td><td>${this.esc(this.t(`apLog_${l[1]}`))}</td></tr>`).join("")}</tbody></table></div>` : `<p class="factnote">${this.t("apLogNone")}</p>`;
    return `<div class="stack">${settings}
      <section class="panel"><div class="panelhead"><div><h2>${this.t("apPaused")} (${a.paused.length})</h2></div></div>${pausedRows || `<p class="factnote">${this.t("apNonePaused")}</p>`}${manual}</section>
      <section class="panel"><div class="panelhead"><div><h2>${this.t("apCandidates")} (${a.candidates.filter(c => !c.excluded).length})</h2></div></div>${candRows || `<p class="factnote">${this.t("apNoCandidates")}</p>`}<div class="sectionlabel">${this.t("apExcluded")}</div><div>${excluded}</div></section>
      <section class="panel"><div class="panelhead"><div><h2>${this.t("apLog")}</h2></div></div>${log}</section></div>`;
  }

  bindAutoPause(root) {
    root.querySelectorAll("[data-ap-setting]").forEach(el => el.onchange = () => this.apCall({ action: "settings", values: { [el.dataset.apSetting]: el.checked } }));
    root.querySelectorAll("[data-ap-num]").forEach(el => el.onchange = () => this.apCall({ action: "settings", values: { [el.dataset.apNum]: Number(el.value) } }));
    root.querySelectorAll("[data-ap-release]").forEach(el => el.onclick = () => this.apCall({ action: "release", entry_id: el.dataset.apRelease, on: el.dataset.on === "1" }));
    root.querySelectorAll("[data-ap-never]").forEach(el => el.onclick = () => this.apCall({ action: "never", entry_id: el.dataset.apNever, on: true }));
    root.querySelectorAll("[data-ap-allow]").forEach(el => el.onclick = () => this.apCall({ action: "never", entry_id: el.dataset.apAllow, on: false }));
    root.querySelectorAll("[data-ap-try]").forEach(el => el.onclick = () => this.apCall({ action: "try", entry_id: el.dataset.apTry }));
    root.querySelectorAll("[data-ap-end]").forEach(el => el.onclick = () => this.apCall({ action: "resume", entry_id: el.dataset.apEnd }));
    root.querySelectorAll("[data-ap-send]").forEach(el => el.onclick = () => this.apStart(el.dataset.apSend));
    root.querySelector("[data-ap-pause]")?.addEventListener("click", () => { const id = root.querySelector("[data-ap-pick]")?.value; if (id) this.apStart(id); });
  }
}
