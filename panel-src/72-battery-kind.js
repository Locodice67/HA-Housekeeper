// Battery sensors that are not a battery you change (storage, vehicle, a device's own pack).
// The scan proposes them from the device's other sensors (battery_suggest); you confirm, correct or say
// "it is a battery". Only Housekeeper's own list changes. Mixed into the panel in 99-register.js.
const BATTERY_KINDS = ["device", "storage", "vehicle", "other"];

Object.assign(TEXT.de, {
  bkSet: "Keine Wechselbatterie?", bkLabel: "Was ist {name}?", bkSave: "Speichern", bkBack: "Doch Batterie", bkConfirm: "Stimmt", bkNote: "Danach zählt der Sensor nicht mehr in Niedrigstand, Prognose und Statusrechnung. Gespeichert nur in Housekeeper.",
  bkKind_device: "Akku eines Geräts", bkKind_storage: "Speicher", bkKind_vehicle: "Fahrzeug", bkKind_other: "Sonstiges",
  bkProposed: "Vermutlich keine Wechselbatterie", bkProposedHint: "Geräte, die auch Leistung, Energie oder Ladevorgang melden. Sie zählen nicht in Niedrigstand und Prognose, bis du sie bestätigst oder zurückholst.",
  bkMine: "Keine Wechselbatterie", bkMineHint: "Von dir oder aus einem Vorschlag bestätigt.",
  bkTakeN: "Übernehmen ({n})",
  bkWhy: "Gerät meldet auch {list}", bkWhyMower: "Gerät ist ein Mähroboter", bkWhyVacuum: "Gerät ist ein Staubsauger",
  bkSig_power: "Leistung", bkSig_energy: "Energie", bkSig_energy_storage: "Speicher", bkSig_current: "Strom", bkSig_battery_charging: "Ladevorgang", bkSig_plug: "Stecker",
  bkFailed: "Das hat nicht geklappt: {detail}", bkColReason: "Grund", bkColKind: "Art",
});
Object.assign(TEXT.en, {
  bkSet: "Not a replaceable battery?", bkLabel: "What is {name}?", bkSave: "Save", bkBack: "It is a battery", bkConfirm: "Correct", bkNote: "Afterwards the sensor no longer counts in lowest level, forecast and the status. Stored only in Housekeeper.",
  bkKind_device: "A device's own pack", bkKind_storage: "Storage", bkKind_vehicle: "Vehicle", bkKind_other: "Other",
  bkProposed: "Probably not a replaceable battery", bkProposedHint: "Devices that also report power, energy or charging. They do not count in lowest level and forecast until you confirm them or bring them back.",
  bkMine: "Not a replaceable battery", bkMineHint: "Set by you or confirmed from a proposal.",
  bkTakeN: "Confirm ({n})",
  bkWhy: "Device also reports {list}", bkWhyMower: "Device is a mowing robot", bkWhyVacuum: "Device is a vacuum",
  bkSig_power: "power", bkSig_energy: "energy", bkSig_energy_storage: "storage", bkSig_current: "current", bkSig_battery_charging: "charging", bkSig_plug: "plug",
  bkFailed: "That did not work: {detail}", bkColReason: "Reason", bkColKind: "Kind",
});

class BatteryKindMixin {
  batteryExcluded(o) {
    // Battery Notes repeats the real battery sensor; only its type is used (73-battery-table.js).
    return o.platform === "battery_notes" || BATTERY_KINDS.includes(o.battery_kind) || (!o.battery_kind && !!o.battery_suggest);
  }

  // The battery sensors that are left out of the counts: confirmed ones and proposals.
  batteryKindItems() {
    const mine = [], proposed = [];
    for (const o of this.data.objects) {
      if (o.object_type !== "entity" || (o.device_class !== "battery" && !o.battery_kind) || o.status !== "active") continue;
      if (BATTERY_KINDS.includes(o.battery_kind)) mine.push(o);
      else if (!o.battery_kind && o.battery_suggest) proposed.push(o);
    }
    const byName = (a, b) => this.batteryName(a).title.localeCompare(this.batteryName(b).title);
    return { mine: mine.sort(byName), proposed: proposed.sort(byName) };
  }

  bkWhy(o) {
    const signals = o.battery_suggest?.signals || [];
    if (signals.includes("lawn_mower")) return this.t("bkWhyMower");
    if (signals.includes("vacuum")) return this.t("bkWhyVacuum");
    return this.t("bkWhy", { list: signals.map(s => this.t(`bkSig_${s}`)).join(", ") });
  }

  bkSelect(o, value, attr) {
    return `<select ${attr}="${this.esc(o.object_id)}" aria-label="${this.esc(this.t("bkLabel", { name: this.batteryName(o).title }))}">${BATTERY_KINDS.map(k => `<option value="${k}" ${k === value ? "selected" : ""}>${this.t(`bkKind_${k}`)}</option>`).join("")}</select>`;
  }

  // One small button after a row of the battery list; it opens the form below the row.
  batteryKindControl(o) {
    if (this.bkEdit !== o.object_id) return `<button class="btn quiet iconbtn" data-bk-open="${this.esc(o.object_id)}" title="${this.esc(this.t("bkSet"))}" aria-label="${this.esc(this.t("bkSet"))}"><ha-icon icon="mdi:battery-off-outline"></ha-icon></button>`;
    return "";
  }

  batteryKindForm(o) {
    if (this.bkEdit !== o.object_id) return "";
    const name = this.batteryName(o).title;
    return `<div class="bkedit"><label class="factnote">${this.esc(this.t("bkLabel", { name }))}</label>${this.bkSelect(o, "device", "data-bk-pick")}<button class="btn small primary" data-bk-save="${this.esc(o.object_id)}">${this.t("bkSave")}</button><button class="bkcancel" data-bk-cancel>${this.t("cancelRun")}</button><span class="factnote">${this.t("bkNote")}</span></div>`;
  }

  batteryKindCard() {
    const { mine, proposed } = this.batteryKindItems();
    if (!mine.length && !proposed.length) return this.bkMessage ? `<p class="factnote" role="status">${this.esc(this.bkMessage)}</p>` : "";
    const level = o => ((o.unit === "%" || !o.unit) && o.state !== null && o.state !== "" && !Number.isNaN(Number(o.state)) ? Math.round(Number(o.state)) : null);
    const sorts = [
      { key: "name", label: "btColName", dir: "asc", get: o => this.batteryName(o).title },
      { key: "level", label: "btColLevel", dir: "asc", get: o => level(o) ?? 1e3 },
    ];
    // Proposals are picked with boxes and confirmed together; "Correct" stays in the row, "It is a battery" sits in the menu.
    const sel = (this.bkSel ||= new Set());
    for (const id of [...sel]) if (!proposed.some(o => o.object_id === id)) sel.delete(id);
    const pickCol = items => ({ key: "sel", label: "selectPage", narrow: true, sortable: false,
      allBox: page => { const ids = (this._bkVisible = page.map(o => o.object_id)), n = ids.filter(id => sel.has(id)).length; return `<input type="checkbox" class="selbox" data-bk-page ${n && n === ids.length ? "checked" : ""} ${n && n < ids.length ? "data-partial" : ""} aria-label="${this.esc(this.t("selectPage"))}">`; },
      cell: o => `<input type="checkbox" class="selbox" data-bk-sel="${this.esc(o.object_id)}" ${sel.has(o.object_id) ? "checked" : ""} aria-label="${this.esc(this.batteryName(o).title)}">` });
    const menu = o => `<details class="rowmenu"><summary aria-label="${this.esc(this.t("rowMenu"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div class="menupop"><button type="button" class="menuitem" data-bk-back="${this.esc(o.object_id)}"><ha-icon icon="mdi:battery-outline"></ha-icon>${this.t("bkBack")}</button></div></details>`;
    const table = (id, items, kindOf, mineRow) => this.sysList(id, items, {
      sort: "name", sorts, tie: o => o.object_id, text: o => [this.batteryName(o).title, o.object_id, mineRow ? "" : this.bkWhy(o)].join(" "),
      rowAttrs: o => `data-object="${this.esc(this.objectKey(o))}" tabindex="0" role="button" aria-label="${this.esc(this.batteryName(o).title)}"`,
      columns: [
        ...(mineRow ? [] : [pickCol(items)]),
        { key: "name", label: "btColName", dir: "asc", cell: o => this.nameCell(this.batteryName(o).title, o.object_id) },
        ...(mineRow ? [] : [{ key: "why", label: "bkColReason", sortable: false, cell: o => this.esc(this.bkWhy(o)) }]),
        { key: "level", label: "btColLevel", dir: "asc", cell: o => (level(o) === null ? "—" : `${level(o)} %`) },
        { key: "kind", label: "bkColKind", sortable: false, cell: o => this.bkSelect(o, kindOf(o), mineRow ? "data-bk-change" : "data-bk-proposal") },
        { key: "act", label: "btColAct", sortable: false, cell: o => `<span class="remact">${mineRow ? "" : `<button class="btn small" data-bk-accept="${this.esc(o.object_id)}">${this.t("bkConfirm")}</button>`}${menu(o)}</span>` },
      ],
    });
    const n = sel.size;
    const tools = `<div class="toolbar${n ? "" : " nosel"}">${this.selTools("bk_proposed", n, "data-bk-clear")}<span class="toolgap"></span><button type="button" class="btn" data-bk-take ${n ? "" : "disabled"}><ha-icon icon="mdi:check"></ha-icon>${this.t("bkTakeN", { n: this.formatNumber(n) })}</button></div>`;
    const shown = this.selOnly?.bk_proposed ? proposed.filter(o => sel.has(o.object_id)) : proposed;
    const parts = [];
    if (proposed.length) parts.push(this.fold("bk_proposed", { tone: "warn", title: this.t("bkProposed"), sub: this.t("bkProposedHint"), pill: this.formatNumber(proposed.length) }, `${tools}${table("bk_proposed", shown, o => this.bkPick?.[o.object_id] || o.battery_suggest?.kind || "other", false)}`, true));
    if (mine.length) parts.push(this.fold("bk_mine", { tone: "mute", title: this.t("bkMine"), sub: this.t("bkMineHint"), pill: this.formatNumber(mine.length) }, table("bk_mine", mine, o => o.battery_kind, true), false));
    return `<div class="panel">${parts.join("")}${this.bkMessage ? `<p class="factnote pad" role="status">${this.esc(this.bkMessage)}</p>` : ""}</div>`;
  }

  // Confirms the picked proposals with the kind their row shows (the proposal, or what was chosen there).
  bkTakePicked() {
    const { proposed } = this.batteryKindItems(), sel = this.bkSel || new Set();
    const items = proposed.filter(o => sel.has(o.object_id)).map(o => ({ entity_id: o.object_id, kind: this.bkPick?.[o.object_id] || o.battery_suggest?.kind || "other" }));
    if (!items.length) return;
    sel.clear();
    this.batterySetKinds(items);
  }

  async batterySetKinds(items) {
    this.bkMessage = "";
    this._btEpoch = (this._btEpoch || 0) + 1;  // a forecast that is still on its way was asked for before and is dropped
    try {
      await this._hass.callWS({ type: "ha_housekeeper/battery_kind_set", items });
      this.bkEdit = "";
      this.batteryTrend = null; this._btRequested = false;
      await this.refreshData();
    } catch (err) { this.bkMessage = this.t("bkFailed", { detail: this.errText(err) }); }
    this.render();
  }

  bindBatteryKind(root) {
    root.querySelectorAll("[data-bk-open]").forEach(el => el.addEventListener("click", () => { this.bkEdit = el.dataset.bkOpen; this.render(); }));
    root.querySelector("[data-bk-cancel]")?.addEventListener("click", () => { this.bkEdit = ""; this.render(); });
    root.querySelector("[data-bk-save]")?.addEventListener("click", e => {
      const id = e.currentTarget.dataset.bkSave;
      this.batterySetKinds([{ entity_id: id, kind: root.querySelector("[data-bk-pick]")?.value || "other" }]);
    });
    root.querySelectorAll("[data-bk-accept]").forEach(el => el.addEventListener("click", () => {
      const id = el.dataset.bkAccept;
      this.batterySetKinds([{ entity_id: id, kind: [...root.querySelectorAll("[data-bk-proposal]")].find(s => s.dataset.bkProposal === id)?.value || "other" }]);
    }));
    root.querySelectorAll("[data-bk-change]").forEach(el => el.addEventListener("change", () => this.batterySetKinds([{ entity_id: el.dataset.bkChange, kind: el.value }])));
    root.querySelectorAll("[data-bk-back]").forEach(el => el.addEventListener("click", () => this.batterySetKinds([{ entity_id: el.dataset.bkBack, kind: "keep" }])));
    // The kind chosen in a row is kept, so a pick on another page is confirmed with what its row says.
    root.querySelectorAll("[data-bk-proposal]").forEach(el => el.addEventListener("change", () => { (this.bkPick ||= {})[el.dataset.bkProposal] = el.value; }));
    const sel = () => (this.bkSel ||= new Set());
    root.querySelectorAll("[data-bk-sel]").forEach(el => el.onchange = () => { this.pickRows("bk_proposed", el.dataset.bkSel, el.checked, sel(), this._bkVisible); this.render(); });
    const page = root.querySelector("[data-bk-page]");
    if (page) { page.indeterminate = page.hasAttribute("data-partial"); page.onchange = ev => { (this._bkVisible || []).forEach(id => (ev.target.checked ? sel().add(id) : sel().delete(id))); this.render(); }; }
    root.querySelector("[data-bk-clear]")?.addEventListener("click", () => { sel().clear(); this.render(); });
    root.querySelector("[data-bk-take]")?.addEventListener("click", () => this.bkTakePicked());
  }
}
