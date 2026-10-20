// BatteryCareMixin: the battery forecast and the maintenance reminders in the Batteries view.
class BatteryCareMixin {
  async loadBatteryTrend(refresh = false) {
    this.batteryTrendLoading = true; this.render();
    const epoch = this._btEpoch || 0;
    try { const reply = await this._hass.callWS({ type: "ha_housekeeper/battery_trend", refresh }); if (epoch === (this._btEpoch || 0)) { this.batteryTrend = reply; this._btRequested = true; } else this._btRequested = false; this.batteryTrendError = ""; this.markLoaded("batteries"); }
    catch (err) { this.batteryTrendError = this.errText(err); }
    this.batteryTrendLoading = false; this.render();
  }

  ensureBatteryTrend() {
    if (this.batteryTrendLoading || this._btRequested) return;
    this._btRequested = true;
    setTimeout(() => this.loadBatteryTrend(), 0);
  }

  // Batteries that report volts, as rows of the same list: the type is guessed from the full voltage, the limit comes from the type.
  batteryVoltRows() {
    return (this.batteryTrend?.voltage?.rows || []).map(v => {
      const item = this.findObject(`entity:${v.entity_id}`);
      return item ? { item, level: v.level, low: v.state === "low", volt: v } : null;
    }).filter(Boolean);
  }

  voltNum(n) { return `${Number(n).toLocaleString(this.lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} V`; }

  voltNote() {
    const v = this.batteryTrend?.voltage;
    return v && (v.rows.length || v.unknown) ? `<p class="factnote">${this.t("bvNote", { unknown: this.formatNumber(v.unknown) })}</p>` : "";
  }

  // The reminders table: one row each with its due day as a pill, the history folds open under the row.
  remDay(iso) {
    try { return new Intl.DateTimeFormat(this.lang, { dateStyle: "medium" }).format(new Date(`${iso}T12:00:00Z`)); }
    catch (_) { return iso; }
  }

  remToday() { return new Date().toISOString().slice(0, 10); }

  remAddDays(iso, n) { return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10); }

  remDaysLeft(iso) { return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${this.remToday()}T00:00:00Z`)) / 864e5); }

  remWhen(left) { return left < 0 ? this.t("remOverdue", { n: -left }) : left === 0 ? this.t("remToday") : this.t("remIn", { n: left }); }

  remBlank() { return { id: "", name: "", interval_days: 90, due: this.remAddDays(this.remToday(), 90), dueTouched: false, note: "" }; }

  // The row under a reminder that is open: the days it was done, each with a delete button.
  reminderHistory(r) {
    if (!(this.remOpen || []).includes(r.id)) return "";
    const id = this.esc(r.id), hist = r.history || [];
    const list = hist.length ? `<ul>${hist.map(d => `<li>${this.esc(this.remDay(d))}${this.deleteButton(`data-rem-hdel="${id}|${this.esc(d)}"`, this.t("remDelete"), { small: true })}</li>`).join("")}</ul>` : `<p class="muted">${this.t("remNoHistory")}</p>`;
    return `<tr class="static remhist"><td colspan="6"><h3>${this.t("remHistory", { n: hist.length })}</h3>${list}</td></tr>`;
  }

  reminderColumns(page = []) {
    const tone = r => ({ due: "red", soon: "warn", ok: "ok" }[r.state]), sel = (this.remSel ||= new Set());
    return [
      { key: "sel", label: "selectPage", narrow: true, sortable: false,
        allBox: () => { const n = page.filter(r => sel.has(r.id)).length; return `<input type="checkbox" class="selbox" data-rem-page ${n && n === page.length ? "checked" : ""} ${n && n < page.length ? "data-partial" : ""} aria-label="${this.esc(this.t("selectPage"))}">`; },
        cell: r => `<input type="checkbox" class="selbox" data-rem-sel="${this.esc(r.id)}" ${sel.has(r.id) ? "checked" : ""} aria-label="${this.esc(r.name)}">` },
      { key: "name", label: "remColName", dir: "asc", cell: r => `<div class="statcell">${this.expandBtn("data-rem-open", r.id, (this.remOpen || []).includes(r.id), this.t((this.remOpen || []).includes(r.id) ? "remHistoryClose" : "remHistoryOpen"))}<div><strong>${this.esc(r.name)}</strong>${r.note ? `<small class="remnote">${this.esc(r.note)}</small>` : ""}</div></div>` },
      { key: "every", label: "remColEvery", dir: "asc", cell: r => this.esc(this.t("remEveryN", { n: r.interval_days })) },
      { key: "last", label: "remColLast", dir: "desc", cell: r => r.last_done ? this.esc(this.remDay(r.last_done)) : `<span class="muted">–</span>` },
      { key: "due", label: "remColDue", dir: "asc", cell: r => `<span class="pill ${tone(r)}" title="${this.esc(this.remDay(r.due))}">${this.esc(this.remWhen(r.days_left))}</span>` },
      // "Done" is the step of a reminder and stays in its row; change and delete sit in the menu, as in the other lists.
      { key: "act", label: "remColActions", sortable: false, cell: r => { const id = this.esc(r.id); return `<span class="remact"><button class="btn small" data-rem-done="${id}">${this.t("remDone")}</button><details class="rowmenu"><summary aria-label="${this.esc(this.t("rowMenu"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div class="menupop"><button type="button" class="menuitem" data-rem-edit="${id}"><ha-icon icon="mdi:pencil-outline"></ha-icon>${this.t("remEdit")}</button><hr class="menusep"><button type="button" class="menuitem" data-rem-del="${id}"><ha-icon icon="mdi:delete-outline"></ha-icon>${this.t("remDelete")}</button></div></details></span>`; } },
    ];
  }

  // The page editor for a new or an edited reminder; "due" follows the interval until it is set by hand.
  remEditor() {
    const d = this.remDraft;
    if (!d) return "";
    const field = (key, label, body, extra = "") => `<label class="remfield ${extra}"><span>${this.t(label)}</span>${body}</label>`;
    const chips = [30, 90, 180, 365].map(n => `<button type="button" class="chip${Number(d.interval_days) === n ? " on" : ""}" data-rem-chip="${n}">${n}</button>`).join("");
    return `<div class="page-editor rem-editor"><form data-rem-form><section class="panel u-mb14"><div class="panelhead"><h2>${this.t(d.id ? "remDialogEdit" : "remDialogNew")}</h2></div>
      <div class="remgrid">${field("name", "remFName", `<input data-rem-field="name" placeholder="${this.esc(this.t("remName"))}" value="${this.esc(d.name)}" maxlength="80" required>`, "wide")}${field("interval_days", "remFEvery", `<input data-rem-field="interval_days" type="number" min="1" max="3650" value="${this.esc(d.interval_days)}" required><span class="remchips">${chips}</span>`)}${field("due", "remFDue", `<input data-rem-field="due" type="date" value="${this.esc(d.due)}" required><span class="remhint" data-rem-hint>${this.esc(this.remWhen(this.remDaysLeft(d.due)))}</span>`)}${field("note", "remFNote", `<input data-rem-field="note" placeholder="${this.esc(this.t("remNote"))}" value="${this.esc(d.note)}" maxlength="200">`, "full")}</div></section>
      <div class="toolbar savebar"><span role="alert">${this.esc(this.remError || "")}</span><span class="toolgap"></span><button type="button" class="btn" data-rem-cancel>${this.t("remCancel")}</button><button type="submit" class="btn primary" data-rem-save>${this.t(d.id ? "remSave" : "remAdd")}</button></div></form></div>`;
  }

  // Own view under "Maintain": own reminders (filter, descaling, changing batteries) with a date when they are due.
  remindersView() { return this.remDraft ? this.remEditor() : `<div class="stack">${this.remindersCard()}</div>`; }

  remindersCard() {
    const items = this.data.reminders || [];
    const head = `<div class="panelhead"><div><h2>${this.t("remTitle")}</h2><p>${this.t("remHint")}</p></div><div class="actions"><button class="btn primary" data-rem-new>${this.t("remNew")}</button></div></div>`;
    this.lvState("reminders", "due", "asc");
    const sorts = [
      { key: "name", label: "remColName", dir: "asc", get: r => r.name },
      { key: "every", label: "remColEvery", dir: "asc", get: r => r.interval_days },
      { key: "last", label: "remColLast", dir: "desc", get: r => r.last_done || "" },
      { key: "due", label: "remColDue", dir: "asc", get: r => r.days_left },
    ];
    const count = state => items.filter(r => r.state === state).length;
    const tiles = items.length ? this.sumTiles([
      { label: this.t("remSumAll"), value: this.formatNumber(items.length), tone: "mute", lf: ["reminders", "", ""] },
      { label: this.t("remStateDue"), value: this.formatNumber(count("due")), tone: count("due") ? "red" : "ok", lf: ["reminders", "state", "due"] },
      { label: this.t("remStateSoon"), value: this.formatNumber(count("soon")), tone: count("soon") ? "warn" : "ok", lf: ["reminders", "state", "soon"] },
      { label: this.t("remStateOk"), value: this.formatNumber(count("ok")), tone: "ok", lf: ["reminders", "state", "ok"] },
    ]) : "";
    this.setExporter("reminders", "reminders", [this.t("remColName"), this.t("remColEvery"), this.t("remColLast"), this.t("remColDue"), this.t("remFNote")], () => this.refine("reminders", items, { text: r => [r.name, r.note].join(" "), filters: { state: (r, v) => r.state === v }, sorts, tie: r => r.id }).map(r => [r.name, this.t("remEveryN", { n: r.interval_days }), r.last_done || "", r.due, r.note || ""]));
    const bar = items.length ? this.listBar("reminders", { table: true, dense: true, sorts, filters: [{ name: "state", all: this.t("remAllStates"), options: [["due", this.t("remStateDue")], ["soon", this.t("remStateSoon")], ["ok", this.t("remStateOk")]] }] }) : "";
    const sel = (this.remSel ||= new Set());
    for (const id of [...sel]) if (!items.some(r => r.id === id)) sel.delete(id);
    const rows = this.refine("reminders", this.selOnly?.reminders ? items.filter(r => sel.has(r.id)) : items, { text: r => [r.name, r.note].join(" "), filters: { state: (r, v) => r.state === v }, sorts, tie: r => r.id });
    const pg = this.paginate("reminders", rows);
    this._remVisible = pg.rows.map(r => r.id);
    // Several reminders done at once: tick them, then one button.
    const n = sel.size;
    const tools = items.length ? `<div class="toolbar${n ? "" : " nosel"}">${this.selTools("reminders", n, "data-rem-clear")}<span class="toolgap"></span><button type="button" class="btn" data-rem-done-picked ${n ? "" : "disabled"}><ha-icon icon="mdi:check"></ha-icon>${this.t("remDoneN", { n: this.formatNumber(n) })}</button></div>` : "";
    const table = !items.length ? `<div class="emptymsg"><ha-icon icon="mdi:calendar-clock-outline"></ha-icon>${this.t("remEmpty")}</div>`
      : rows.length ? this.listTable("reminders", this.reminderColumns(pg.rows), pg.rows, { cls: "rem", rowAttrs: r => `data-rem-row="${this.esc(r.id)}" tabindex="0" role="button" aria-expanded="${(this.remOpen || []).includes(r.id)}"`, after: r => this.reminderHistory(r) }) : `<div class="emptymsg">${this.noMatches("reminders")}</div>`;
    return `${tiles}<div class="panel">${head}${bar}${tools}${table}${pg.footer}</div>`;
  }

  // Marks the picked reminders as done, one request each; the list shows the answer of the last one.
  async remDonePicked() {
    const sel = this.remSel || new Set();
    this.remError = "";
    for (const id of [...sel]) {
      try { const reply = await this._hass.callWS({ type: "ha_housekeeper/reminder_set", action: "done", reminder_id: id }); this.data.reminders = reply.reminders; sel.delete(id); }
      catch (err) { this.remError = this.t("remInvalid", { field: String(err?.message || err).replace(/^Not accepted: /, "") }); break; }
    }
    this.render();
  }

  async reminderCall(msg) {
    this.remError = "";
    try { const reply = await this._hass.callWS({ type: "ha_housekeeper/reminder_set", ...msg }); this.data.reminders = reply.reminders; if (msg.action === "save") this.remDraft = null; }
    catch (err) { this.remError = this.t("remInvalid", { field: String(err?.message || err).replace(/^Not accepted: /, "") }); }
    this.render();
  }

  bindBatteryCare(root) {
    this.bindBatteryType(root);
    this.bindBatteryKind(root);
    root.querySelector("[data-bt-refresh]")?.addEventListener("click", () => this.loadBatteryTrend(true));
    root.querySelector("[data-rem-new]")?.addEventListener("click", () => { this.remDraft = this.remBlank(); this.remError = ""; this._remFocus = true; this.render(); });
    root.querySelector("[data-rem-cancel]")?.addEventListener("click", () => { this.remDraft = null; this.remError = ""; this.render(); });
    const syncForm = () => {
      const d = this.remDraft;
      if (!d) return;
      const set = (key, value) => { const el = root.querySelector(`[data-rem-field="${key}"]`); if (el && el.value !== value) el.value = value; };
      if (!d.dueTouched) { d.due = this.remAddDays(this.remToday(), Number(d.interval_days) || 0); set("due", d.due); }
      const hint = root.querySelector("[data-rem-hint]");
      if (hint) hint.textContent = d.due ? this.remWhen(this.remDaysLeft(d.due)) : "";
      root.querySelectorAll("[data-rem-chip]").forEach(c => c.classList.toggle("on", Number(c.dataset.remChip) === Number(d.interval_days)));
    };
    root.querySelectorAll("[data-rem-field]").forEach(el => el.addEventListener("input", () => {
      const key = el.dataset.remField;
      this.remDraft[key] = el.value;
      if (key === "due") this.remDraft.dueTouched = true;
      syncForm();
    }));
    root.querySelectorAll("[data-rem-chip]").forEach(el => el.addEventListener("click", () => {
      this.remDraft.interval_days = Number(el.dataset.remChip);
      const input = root.querySelector('[data-rem-field="interval_days"]');
      if (input) input.value = this.remDraft.interval_days;
      syncForm();
    }));
    if (this._remFocus && root.querySelector("[data-rem-form]")) { this._remFocus = false; root.querySelector('[data-rem-field="name"]')?.focus(); }
    root.querySelector("[data-rem-form]")?.addEventListener("submit", ev => {
      ev.preventDefault();
      const d = this.remDraft;
      this.reminderCall({ action: "save", ...(d.id ? { reminder_id: d.id } : {}), name: d.name, interval_days: Number(d.interval_days), due: d.due, note: d.note });
    });
    root.querySelectorAll("[data-rem-open], [data-rem-row]").forEach(el => el.addEventListener("click", ev => {
      const inner = ev?.target?.closest?.("button, select, input, a, label, summary, .menupop");
      if (el.dataset.remRow !== undefined && inner && inner !== el && el.contains(inner)) return;
      const id = el.dataset.remOpen ?? el.dataset.remRow;
      const open = this.remOpen || [];
      this.remOpen = open.includes(id) ? open.filter(x => x !== id) : [...open, id];
      this.render();
    }));
    root.querySelectorAll("[data-rem-edit]").forEach(el => el.addEventListener("click", () => {
      const r = (this.data.reminders || []).find(x => x.id === el.dataset.remEdit);
      if (!r) return;
      this._remFocus = true;
      this.remDraft = { id: r.id, name: r.name, interval_days: r.interval_days, due: r.due, dueTouched: true, note: r.note || "" };
      this.remError = "";
      this.render();
    }));
    root.querySelectorAll("[data-rem-done]").forEach(el => el.addEventListener("click", () => this.reminderCall({ action: "done", reminder_id: el.dataset.remDone })));
    const remSel = () => (this.remSel ||= new Set());
    root.querySelectorAll("[data-rem-sel]").forEach(el => el.onchange = () => { this.pickRows("reminders", el.dataset.remSel, el.checked, remSel(), this._remVisible); this.render(); });
    const remPage = root.querySelector("[data-rem-page]");
    if (remPage) { remPage.indeterminate = remPage.hasAttribute("data-partial"); remPage.onchange = ev => { (this._remVisible || []).forEach(id => (ev.target.checked ? remSel().add(id) : remSel().delete(id))); this.render(); }; }
    root.querySelector("[data-rem-clear]")?.addEventListener("click", () => { remSel().clear(); this.render(); });
    root.querySelector("[data-rem-done-picked]")?.addEventListener("click", () => this.remDonePicked());
    root.querySelectorAll("[data-rem-hdel]").forEach(el => el.addEventListener("click", () => {
      const [id, day] = el.dataset.remHdel.split("|"), r = (this.data.reminders || []).find(x => x.id === id);
      this.confirmAsk(this.t("confirmRemDay", { date: this.remDay(day), name: r?.name || "" }), () => this.reminderCall({ action: "history_delete", reminder_id: id, day }));
    }));
    root.querySelectorAll("[data-rem-del]").forEach(el => el.addEventListener("click", () => {
      const id = el.dataset.remDel, r = (this.data.reminders || []).find(x => x.id === id);
      this.confirmAsk(this.t("confirmRem", { name: r?.name || "" }), () => this.reminderCall({ action: "delete", reminder_id: id }));
    }));
  }
}
Object.assign(TEXT.de, {
  bvTitle: "Batterien mit Spannung", bvHint: "Sensoren, die Volt statt Prozent melden. Housekeeper schätzt den Typ aus der höchsten Spannung der letzten Wochen und nimmt dessen Grenze.", bvStable: "stabil",
  bvLine: "Jetzt {now} · erkannt als {kind} · Grenze {limit}", bvNote: "Der Typ ist eine Schätzung; liegt er falsch, ist auch die Grenze falsch. Ohne Angabe: {unknown} (zu wenige Tage oder eine Spannung, die zu keinem Typ passt).",
  bvType_cell15: "Einzelzelle 1,5 V (AA/AAA, Alkaline oder NiMH)", bvType_coin3: "3-V-Zelle (z. B. CR2032 oder 2 × AA)", bvType_lithium: "Lithium-Ionen-Zelle", bvType_cells3: "3 Zellen in Reihe (4,5 V)", bvType_cells4: "4 Zellen in Reihe (6 V)", bvType_block9: "9-V-Block", bvType_lead12: "12-V-Akku",
  btTitle: "Alle Batterien", btHint: "Stand, Verbrauch und die Prognose, wann eine Batterie die Grenze erreicht (bis 90 Tage).", btLoading: "Prognose wird berechnet …", btNoRecorder: "Ohne Recorder gibt es keine Prognose.",
  remTitle: "Deine Erinnerungen", remHint: "Filter, Entkalken, Batteriewechsel: du trägst Name, Abstand und Fälligkeit ein, Housekeeper sagt, wann es dran ist, und merkt sich, wann du es erledigt hast. Es ändert nichts in Home Assistant.", remEmpty: "Noch keine Erinnerung. Lege zum Beispiel den Wasserfilter oder den Rauchmelder-Test an.",
  remName: "z. B. Wasserfilter", remNote: "z. B. Batterietyp CR2032", remAdd: "Hinzufügen", remSave: "Speichern", remCancel: "Abbrechen", remDone: "Erledigt", remDoneN: "Erledigt ({n})", remDelete: "Löschen", remEdit: "Ändern", remNew: "+ Erinnerung hinzufügen",
  remFName: "Name", remFEvery: "Abstand in Tagen", remFDue: "Fällig am", remFNote: "Notiz (optional)", remAllStates: "Alle Zustände", remSumAll: "Alle", remStateDue: "Überfällig", remStateSoon: "Bald fällig", remStateOk: "In Ordnung", remColName: "Name", remColEvery: "Abstand", remColLast: "Zuletzt erledigt", remColDue: "Fällig", remColActions: "Aktionen",
  remDialogNew: "Neue Erinnerung", remDialogEdit: "Erinnerung bearbeiten", remEveryN: "alle {n} Tage", remHistory: "Historie · {n}× erledigt", remNoHistory: "Noch nie erledigt.", remHistoryOpen: "Historie aufklappen", remHistoryClose: "Historie zuklappen", remToday: "heute", remOverdue: "{n} Tage überfällig", remIn: "in {n} Tagen", remInvalid: "Nicht gespeichert, bitte prüfen: {field}",
  reminders: "Erinnerungen", remindersSubtitle: "Termine für das, was du regelmäßig erledigst.", actReminders: "Wartung fällig", actRemindersHint: "Eine eigene Erinnerung ist erreicht",
  relSetup: "Einrichtungsfehler: {n} in {days} Tagen, zuletzt {last}", relSetupNow: "Gerade im Zustand {state}", relSetupNote: "Aus den Scans gezählt, so fein wie das Scan-Intervall.",
  event_reminder_due: "Wartungserinnerung fällig",
});
Object.assign(TEXT.en, {
  bvTitle: "Batteries in volts", bvHint: "Sensors that report volts instead of percent. Housekeeper guesses the type from the highest voltage of the last weeks and uses its limit.", bvStable: "stable",
  bvLine: "Now {now} · recognised as {kind} · limit {limit}", bvNote: "The type is a guess; if it is wrong, so is the limit. Without a result: {unknown} (too few days or a voltage that fits no type).",
  bvType_cell15: "single 1.5 V cell (AA/AAA, alkaline or NiMH)", bvType_coin3: "3 V cell (e.g. CR2032 or 2 × AA)", bvType_lithium: "lithium-ion cell", bvType_cells3: "3 cells in series (4.5 V)", bvType_cells4: "4 cells in series (6 V)", bvType_block9: "9 V block", bvType_lead12: "12 V battery",
  btTitle: "All batteries", btHint: "Level, drain and the forecast of when a battery reaches the limit (up to 90 days).", btLoading: "Calculating the forecast …", btNoRecorder: "There is no forecast without a recorder.",
  remTitle: "Your reminders", remHint: "Filter, descaling, battery change: you enter a name, an interval and the due date, Housekeeper tells you when it is due and keeps when you did it. It changes nothing in Home Assistant.", remEmpty: "No reminder yet. Add the water filter or the smoke detector test, for example.",
  remName: "e.g. water filter", remNote: "e.g. battery type CR2032", remAdd: "Add", remSave: "Save", remCancel: "Cancel", remDone: "Done", remDoneN: "Done ({n})", remDelete: "Delete", remEdit: "Edit", remNew: "+ Add reminder",
  remFName: "Name", remFEvery: "Interval in days", remFDue: "Due on", remFNote: "Note (optional)", remAllStates: "All states", remSumAll: "All", remStateDue: "Overdue", remStateSoon: "Due soon", remStateOk: "On track", remColName: "Name", remColEvery: "Interval", remColLast: "Last done", remColDue: "Due", remColActions: "Actions",
  remDialogNew: "New reminder", remDialogEdit: "Edit reminder", remEveryN: "every {n} days", remHistory: "History · done {n}×", remNoHistory: "Never done yet.", remHistoryOpen: "Show history", remHistoryClose: "Hide history", remToday: "today", remOverdue: "{n} days overdue", remIn: "in {n} days", remInvalid: "Not saved, please check: {field}",
  reminders: "Reminders", remindersSubtitle: "Dates for what you do regularly.", actReminders: "Maintenance due", actRemindersHint: "One of your own reminders is reached",
  relSetup: "Setup failures: {n} in {days} days, last {last}", relSetupNow: "Currently in state {state}", relSetupNote: "Counted from the scans, as fine as the scan interval.",
  event_reminder_due: "maintenance reminder due",
});
