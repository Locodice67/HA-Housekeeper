// AutoPauseMixin: the tab "Auto-Pause" of Reliability and the button on an integration's page. An integration that keeps failing
// to set up is paused (disabled) and tried again later; data is `ha_housekeeper/auto_pause`, changes go through `auto_pause_set`.
// Mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  apTab: "Auto-Pause", apTileHint: "{n} Kandidaten · pausiert Dauerfehler und versucht es später wieder",
  apHead: "Dauerfehler automatisch pausieren", apHeadSub: "Pausiert Datenlieferanten, die dauernd an der Einrichtung scheitern, und versucht es später wieder. Eine Pause von Hand braucht diesen Schalter nicht.",
  apSwitch: "Automatisch pausieren", apStatusOn: "Aktiv · Dienste im Blick: {n}", apStatusOff: "Aus · Dienste, die überwacht würden: {n}",
  apSettings: "Einstellungen", apSettingsSub: "Pausiert nach {a} Fehlversuchen in {h} Std.", apAttempts: "Fehlversuche", apAttemptsHint: "So viele gescheiterte Einrichtungsversuche lösen die Pause aus.", apHours: "Stunden", apHoursHint: "Die Fehlversuche müssen in diesem Zeitraum liegen.",
  apHouse: "Auch Integrationen pausieren, die eine Hausfunktion tragen", apHouseHint: "Aus: Eine Integration, auf die sich eine Hausfunktion verlässt, wird nie von selbst pausiert.",
  apPlan: "Wiederholungen: 3 × 1 Std., 3 × 3 Std., 12 × 6 Std., dann täglich, höchstens {days} Tage ab Beginn der Pause. Danach bleibt die Pause bestehen und Housekeeper meldet es.",
  apPaused: "Pausiert", apManual: "Integration von Hand pausieren", apManualHint: "Wenn du schon weißt, dass es gerade ein Problem gibt.", apPick: "Integration wählen", apPause: "Pausieren", apSince: "Seit {span}", apNext: "nächster Versuch in {span}", apTry: "Versuch {n} von {total}",
  apExhausted: "Keine Versuche mehr, bitte prüfen", apReasonAuto: "{n} Fehlversuche", apReasonManual: "von dir pausiert",
  apTodoOne: "{name} ist pausiert", apTodoMany: "{n} Integrationen pausiert", apTodoHint: "Versuch {n} von {total}, nächster in {span} · seit {since}", apTodoExhaustedOne: "{name}: {days} Tage ohne Erfolg, bitte prüfen", apTodoExhaustedMany: "{n} Pausen ohne Erfolg, bitte prüfen", apTodoExhaustedHint: "Pause bleibt bestehen · Protokoll, Update und Quelle prüfen", apTodoCheck: "Bitte prüfen", apWouldPause: "Auto-Pause würde das pausieren",
  apTryNow: "Jetzt versuchen", apEnd: "Pause beenden", apNever: "Nie pausieren", apNeverPill: "nie pausiert", apAllow: "Wieder zulassen",
  apWatched: "Dienste im Blick", apWatchedHint: "Datenlieferanten ohne Steuerfunktion, die Auto-Pause pausieren würde", apNoWatched: "Keine Integration erfüllt die Regel: Cloud-Abruf und nur Daten-Entitäten.", apHouseFn: "trägt eine Hausfunktion", apFailures: "{n} Fehlversuche",
  apLog: "Verlauf", apLog_paused: "pausiert", apLog_tried: "Versuch ohne Erfolg", apLog_back: "läuft wieder", apLog_ended: "Pause beendet", apLog_exhausted: "Pause bleibt, bitte prüfen",
  apSend: "In Auto-Pause schicken", apSendHint: "Vorübergehende Störung? Auto-Pause entlastet die Quelle.", apPausedNow: "Pausiert seit {span}",
  apConfirmTitle: "{name} pausieren?", apConfirmText: "{name} wird deaktiviert und danach in Abständen wieder versucht, höchstens {days} Tage lang.",
  apWarnControl: "Die Integration hat Entitäten, die etwas steuern oder melden. Für die Dauer der Pause sind sie aus Home Assistant verschwunden.", apWarnHouse: "Eine Hausfunktion verlässt sich darauf.",
  apConfirmYes: "Pausieren",
  err_auto_pause_confirm_needed: "Die Integration steuert etwas oder trägt eine Hausfunktion: bitte bestätigen.", err_auto_pause_core: "Diese Integration wird nie pausiert.", err_auto_pause_reauth: "Die Integration braucht eine neue Anmeldung; eine Pause hilft nicht.", err_auto_pause_paused: "Bereits pausiert.", err_auto_pause_disabled: "Die Integration ist schon deaktiviert.", err_auto_pause_not_found: "Integration nicht gefunden.", err_auto_pause_not_paused: "Nicht pausiert.", err_auto_pause_busy: "Es läuft gerade ein Versuch.", err_auto_pause_invalid: "Wert nicht zulässig.",
});
Object.assign(TEXT.en, {
  apTab: "Auto-pause", apTileHint: "{n} candidates · pauses constant failures and tries again later",
  apHead: "Pause constant failures automatically", apHeadSub: "Pauses data providers that keep failing to set up and tries them again later. A pause you start by hand does not need this switch.",
  apSwitch: "Pause automatically", apStatusOn: "On · services watched: {n}", apStatusOff: "Off · services that would be watched: {n}",
  apSettings: "Settings", apSettingsSub: "Pauses after {a} failed attempts within {h} h", apAttempts: "failed attempts", apAttemptsHint: "This many failed setup attempts start the pause.", apHours: "hours", apHoursHint: "The failed attempts must fall within this time.",
  apHouse: "Also pause integrations that carry a house function", apHouseHint: "Off: an integration that a house function relies on is never paused by itself.",
  apPlan: "Retries: 3 × 1 h, 3 × 3 h, 12 × 6 h, then daily, for up to {days} days from the start of the pause. After that the pause stays and Housekeeper tells you.",
  apPaused: "Paused", apManual: "Pause an integration by hand", apManualHint: "When you already know there is a problem right now.", apPick: "Choose an integration", apPause: "Pause", apSince: "For {span}", apNext: "next try in {span}", apTry: "Try {n} of {total}",
  apExhausted: "No more tries, please look", apReasonAuto: "{n} failed attempts", apReasonManual: "paused by you",
  apTodoOne: "{name} is paused", apTodoMany: "{n} integrations paused", apTodoHint: "Try {n} of {total}, next in {span} · for {since}", apTodoExhaustedOne: "{name}: {days} days without success, please look", apTodoExhaustedMany: "{n} pauses without success, please look", apTodoExhaustedHint: "The pause stays · check the log, the update and the source", apTodoCheck: "Please look", apWouldPause: "Auto-pause would pause this",
  apTryNow: "Try now", apEnd: "End pause", apNever: "Never pause", apNeverPill: "never paused", apAllow: "Allow again",
  apWatched: "Services watched", apWatchedHint: "Data providers without a control function that auto-pause would pause", apNoWatched: "No integration meets the rule: cloud polling and data entities only.", apHouseFn: "carries a house function", apFailures: "{n} failed attempts",
  apLog: "History", apLog_paused: "paused", apLog_tried: "try without success", apLog_back: "is back", apLog_ended: "pause ended", apLog_exhausted: "pause stays, please look",
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
  // Again after every new scan, so that the next try and a used-up schedule are not stale on the overview.
  ensureAutoPause() {
    const key = this.data?.meta?.scanned_at || "";
    if (this.apLoading || (this._apRequested && this._apKey === key)) return;
    this._apRequested = true; this._apKey = key;
    setTimeout(() => this.loadAutoPause(), 0);
  }

  async apCall(payload) {
    try { this.autoPause = await this._hass.callWS({ type: "ha_housekeeper/auto_pause_set", ...payload }); }
    catch (err) { this.failed(err); }
    this.render();
  }

  apPausedItem(entryId) { return (this.autoPause?.paused || []).find(p => p.entry_id === entryId) || null; }

  // The rows of the overview's to-do card: a running pause is maintenance, a used-up schedule is open (never urgent).
  apTodoItems() {
    const a = this.autoPause;
    if (!a?.paused?.length) return [];
    const now = Date.now(), total = a.schedule.offsets.length, items = [];
    const running = a.paused.filter(p => !p.exhausted), spent = a.paused.filter(p => p.exhausted);
    const names = list => list.slice(0, 3).map(p => p.title || p.domain).join(", ") + (list.length > 3 ? ", …" : "");
    const jump = 'data-jump="reliability" data-jump-tab="autopause"';
    if (spent.length) items.push({ key: "autopause_exhausted", area: "state", tone: "warn", icon: "mdi:pause-circle-outline", text: spent.length === 1 ? this.t("apTodoExhaustedOne", { name: spent[0].title || spent[0].domain, days: Math.round(a.schedule.end_hours / 24) }) : this.t("apTodoExhaustedMany", { n: this.formatNumber(spent.length) }), hintText: this.t("apTodoExhaustedHint"), pill: this.t("apTodoCheck"), jump });
    if (running.length) {
      const one = running[0], due = one.next ? Math.max(new Date(one.next).getTime() - now, 0) : null;
      items.push({ key: "autopause", area: "care", tone: "warn", icon: "mdi:pause-circle-outline", text: running.length === 1 ? this.t("apTodoOne", { name: one.title || one.domain }) : this.t("apTodoMany", { n: this.formatNumber(running.length) }),
        hintText: running.length === 1 ? (due !== null ? this.t("apTodoHint", { n: Math.min(one.done + 1, total), total, span: this.apSpan(due), since: this.apSpan(now - new Date(one.since).getTime()) }) : this.t("apSince", { span: this.apSpan(now - new Date(one.since).getTime()) })) : names(running), jump });
    }
    return items;
  }

  // Beside an integration that is not loaded: "Paused" while it is, a button to pause it while it can be.
  apRowAction(entryId, state) {
    const a = this.autoPause;
    if (!a || !entryId) return "";
    if (this.apPausedItem(entryId)) return `<span class="pill warn" role="link" tabindex="0" data-view-tab="reliability|autopause">${this.t("apPaused")}</span>`;
    if (!state || state === "loaded" || !(a.pausable || []).some(p => p.entry_id === entryId)) return "";
    return `<button type="button" class="btn" data-ap-send="${this.esc(entryId)}"><ha-icon icon="mdi:pause-circle-outline"></ha-icon>${this.t("apPause")}</button>`;
  }

  // Only a hint while the automatic pause is off and this integration would be one of its candidates.
  apWouldPause(entryId) {
    const a = this.autoPause;
    return Boolean(a && !a.settings.enabled && a.candidates.some(c => c.entry_id === entryId && !c.excluded));
  }

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
    const watched = a.candidates.filter(c => !c.excluded);
    const menu = (id, key, attr, icon) => `<details class="rowmenu"><summary aria-label="${this.esc(this.t("rowMenu"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div class="menupop"><button type="button" class="menuitem" ${attr}="${this.esc(id)}"><ha-icon icon="${icon}"></ha-icon>${this.t(key)}</button></div></details>`;
    const main = `<section class="panel"><div class="panelhead"><div><h2>${this.t("apHead")}</h2><p>${this.t("apHeadSub")}</p></div></div>
      <div class="row"><span class="tile ${s.enabled ? "ok" : "mute"}"><ha-icon icon="mdi:pause-circle-outline"></ha-icon></span><span class="row-text"><strong>${this.t("apSwitch")}</strong><small>${this.t(s.enabled ? "apStatusOn" : "apStatusOff", { n: this.formatNumber(watched.length) })}</small></span><input class="policyswitch" type="checkbox" role="switch" aria-label="${this.esc(this.t("apSwitch"))}" data-ap-setting="enabled" ${s.enabled ? "checked" : ""}></div></section>`;
    const pausedRows = a.paused.map(p => {
      const due = p.next ? new Date(p.next).getTime() - now : null;
      const sub = [p.exhausted ? this.t("apExhausted") : due !== null ? `${this.t("apTry", { n: Math.min(p.done + 1, a.schedule.offsets.length), total: a.schedule.offsets.length })}, ${this.t("apNext", { span: this.apSpan(Math.max(due, 0)) })}` : "",
        p.reason === "manual" ? this.t("apReasonManual") : this.t("apReasonAuto", { n: this.formatNumber(p.failures || 0) })].filter(Boolean).join(" · ");
      return `<div class="row"><span class="tile warn"><ha-icon icon="mdi:pause-circle-outline"></ha-icon></span><span class="row-text"><strong>${this.esc(p.title || p.domain)}</strong><small>${this.esc(p.domain)} · ${this.esc(this.t("apSince", { span: this.apSpan(now - new Date(p.since).getTime()) }))}</small><small>${this.esc(sub)}</small></span>
        <span class="apbtns"><button class="btn" data-ap-try="${this.esc(p.entry_id)}">${this.t("apTryNow")}</button><button class="btn" data-ap-end="${this.esc(p.entry_id)}">${this.t("apEnd")}</button>${menu(p.entry_id, "apNever", "data-ap-never", "mdi:cancel")}</span></div>`;
    }).join("");
    const paused = a.paused.length ? `<section class="panel"><div class="panelhead"><div><h2>${this.t("apPaused")} <span class="pill warn">${this.formatNumber(a.paused.length)}</span></h2></div></div>${pausedRows}</section>` : "";
    const rows = [...a.candidates].sort((x, y) => Number(x.excluded) - Number(y.excluded)).map(c => {
      const sub = [c.domain !== c.title ? c.domain : "", this.entryStateLabel(c.state), c.attempts ? this.t("apFailures", { n: this.formatNumber(c.attempts) }) : "", c.house_function ? this.t("apHouseFn") : ""].filter(Boolean).join(" · ");
      return `<div class="row"><span class="tile ${c.excluded ? "mute" : c.state === "loaded" ? "ok" : "warn"}"><ha-icon icon="mdi:cloud-${c.state === "loaded" ? "check" : "alert"}-outline"></ha-icon></span><span class="row-text"><strong>${this.esc(c.title || c.domain)}</strong><small>${this.esc(sub)}</small></span>${c.excluded ? `<span class="pill mute">${this.t("apNeverPill")}</span>${menu(c.entry_id, "apAllow", "data-ap-allow", "mdi:undo")}` : menu(c.entry_id, "apNever", "data-ap-never", "mdi:cancel")}</div>`;
    }).join("");
    const watchedFold = this.fold("ap_watched", { tone: "mute", title: this.t("apWatched"), sub: this.t("apWatchedHint"), count: this.formatNumber(a.candidates.length) }, rows || `<p class="factnote">${this.t("apNoWatched")}</p>`, false);
    const num = (key, value, min, max, unit) => `<div class="optcard"><label for="ap-${key}"><strong>${this.t(unit)}</strong></label><p>${this.t(`${unit}Hint`)}</p><div class="unitrow"><input id="ap-${key}" type="number" min="${min}" max="${max}" value="${value}" data-ap-num="${key}"><span>${this.t(unit)}</span></div></div>`;
    const settingsBody = `<div class="optgrid">${num("attempts", s.attempts, 3, 500, "apAttempts")}${num("hours", s.hours, 1, 48, "apHours")}</div>
      <label class="optswitch"><input class="policyswitch" type="checkbox" role="switch" data-ap-setting="house_functions" ${s.house_functions ? "checked" : ""}><span><strong>${this.t("apHouse")}</strong><small>${this.t("apHouseHint")}</small></span></label><p class="factnote">${this.t("apPlan", { days })}</p>`;
    const settingsFold = this.fold("ap_settings", { tone: "mute", title: this.t("apSettings"), sub: this.t("apSettingsSub", { a: s.attempts, h: s.hours }) }, settingsBody, false);
    const options = (a.pausable || []).filter(p => !a.paused.some(q => q.entry_id === p.entry_id)).sort((x, y) => x.title.localeCompare(y.title)).map(p => `<option value="${this.esc(p.entry_id)}">${this.esc(p.title)} (${this.esc(p.domain)})</option>`).join("");
    const manualFold = this.fold("ap_manual", { tone: "mute", title: this.t("apManual"), sub: this.t("apManualHint") }, `<div class="apmanual"><select data-ap-pick aria-label="${this.esc(this.t("apManual"))}"><option value="">${this.t("apPick")}</option>${options}</select><button class="btn" data-ap-pause>${this.t("apPause")}</button></div>`, false);
    const log = a.log.length ? `<section class="panel"><div class="panelhead"><div><h2>${this.t("apLog")}</h2></div></div><div class="tablewrap"><table class="evtable"><tbody>${a.log.map(l => `<tr><td>${this.esc(this.formatDate(l[0]))}</td><td>${this.esc(l[2])}</td><td>${this.esc(this.t(`apLog_${l[1]}`))}</td></tr>`).join("")}</tbody></table></div></section>` : "";
    return `<div class="stack">${main}${paused}<section class="panel">${watchedFold}${settingsFold}${manualFold}</section>${log}</div>`;
  }

  bindAutoPause(root) {
    root.querySelectorAll("[data-ap-setting]").forEach(el => el.onchange = () => this.apCall({ action: "settings", values: { [el.dataset.apSetting]: el.checked } }));
    root.querySelectorAll("[data-ap-num]").forEach(el => el.onchange = () => this.apCall({ action: "settings", values: { [el.dataset.apNum]: Number(el.value) } }));
    root.querySelectorAll("[data-ap-never]").forEach(el => el.onclick = () => this.apCall({ action: "never", entry_id: el.dataset.apNever, on: true }));
    root.querySelectorAll("[data-ap-allow]").forEach(el => el.onclick = () => this.apCall({ action: "never", entry_id: el.dataset.apAllow, on: false }));
    root.querySelectorAll("[data-ap-try]").forEach(el => el.onclick = () => this.apCall({ action: "try", entry_id: el.dataset.apTry }));
    root.querySelectorAll("[data-ap-end]").forEach(el => el.onclick = () => this.apCall({ action: "resume", entry_id: el.dataset.apEnd }));
    root.querySelectorAll("[data-ap-send]").forEach(el => el.onclick = ev => { ev.stopPropagation(); this.apStart(el.dataset.apSend); });
    root.querySelector("[data-ap-pause]")?.addEventListener("click", () => { const id = root.querySelector("[data-ap-pick]")?.value; if (id) this.apStart(id); });
  }
}
