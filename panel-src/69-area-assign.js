// Giving findings "without an area" one: the bulk form under the selection bar and the plan. Mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  fselArea: "Bereich zuweisen", state_area: "Bereich zuweisen", areaChoose: "Bereich", areaSuggest: "Je Eintrag nach Vorschlag", areaNone: "Es gibt noch keinen Bereich. Lege einen in Home Assistant an.",
  areaNoItems: "Wähle Entitäten oder Geräte aus.", areaSuggested: "vorgeschlagen", areaNote: "Der Vorschlag kommt vom Gerät oder von der Integration, nie vom Namen.",
  reason_no_suggestion: "Kein sicherer Vorschlag. Wähle einen Bereich aus.", reason_area_missing: "Den Bereich gibt es nicht.", reason_has_area: "Hat inzwischen einen Bereich.",
  check_area_set: "Bereich ist gesetzt", confirmedSummaryArea: "{count} Einträge bekommen einen Bereich. Das lässt sich vollständig rückgängig machen.", result_area: "Bereich gesetzt",
  abort_area_not_allowed: "Home Assistant erlaubt diesen Bereich nicht. Setze ihn am Gerät.",
});
Object.assign(TEXT.en, {
  fselArea: "Assign area", state_area: "Assign area", areaChoose: "Area", areaSuggest: "Per entry, as suggested", areaNone: "There is no area yet. Create one in Home Assistant.",
  areaNoItems: "Select entities or devices.", areaSuggested: "suggested", areaNote: "The suggestion comes from the device or the integration, never from the name.",
  reason_no_suggestion: "No safe suggestion. Choose an area.", reason_area_missing: "That area does not exist.", reason_has_area: "Has an area now.",
  check_area_set: "Area is set", confirmedSummaryArea: "{count} entries get an area. This can be fully undone.", result_area: "Area set",
  abort_area_not_allowed: "Home Assistant does not allow this area here. Set it on the device.",
});

class AreaAssignMixin {
  // What the bulk forms act on: the ticked rows of the policy list. Each is { id, type }.
  bulkTargets() {
    const items = (this.policies?.rules || []).flatMap(rule => rule.items.map(item => ({ ...item, rule: rule.id })));
    return [...(this.polSel || [])].map(key => items.find(i => i.key === key)).filter(Boolean).map(i => ({ id: i.object_id, type: i.object_type }));
  }

  // The bar over the policy list: how many are ticked and what can be done with them, both from the first tick on.
  polSelBar(total = 0) {
    const n = this.polSel?.size || 0;
    return `<div class="toolbar${n ? "" : " nosel"}">${n ? `<button class="btn quiet" data-pol-sel-clear>${this.t("clearSelection")}</button><span class="selcount" role="status">${this.t("selectedCount", { count: n })}</span>` : ""}<span class="toolgap"></span>${n ? `<div class="fbtns"><button class="btn" data-pol-bulk="area">${this.t("fselArea")}</button></div>` : ""}${this.viewCount(total)}</div>${this.bulk && this.bulk.kind === "area" ? this.bulkForm() : ""}`;
  }

  // Only entities and devices can be ticked: the action for several at once assigns an area. A greyed box says why.
  polSelBox(item) {
    if (item.ignored || !["entity", "device"].includes(item.object_type)) {
      const why = this.t(item.ignored ? "polSelHidden" : "polSelOnlyArea");
      return `<input type="checkbox" class="selbox" disabled title="${this.esc(why)}" aria-label="${this.esc(`${item.name}: ${why}`)}">`;
    }
    return `<input type="checkbox" class="selbox" data-pol-sel="${this.esc(item.key)}" ${this.polSel?.has(item.key) ? "checked" : ""} aria-label="${this.esc(item.name)}">`;
  }

  bindPolSel(root) {
    root.querySelectorAll("[data-pol-sel]").forEach(el => el.onchange = () => { (this.polSel ||= new Set())[el.checked ? "add" : "delete"](el.dataset.polSel); this.render(); });
    root.querySelector("[data-pol-page]")?.addEventListener("change", ev => { this.polSel = new Set(this.polSel || []); (this._polPage || []).forEach(id => (ev.target.checked ? this.polSel.add(id) : this.polSel.delete(id))); this.render(); });
    const pageBox = root.querySelector("[data-pol-page]"); if (pageBox) pageBox.indeterminate = pageBox.hasAttribute("data-partial");
    root.querySelector("[data-pol-sel-clear]")?.addEventListener("click", () => { this.polSel = new Set(); this.bulk = null; this.render(); });
    root.querySelectorAll("[data-pol-bulk]").forEach(el => el.addEventListener("click", () => { this.bulk = { kind: el.dataset.polBulk, mode: "strip", find: "", with: "", area: "", error: "" }; this.render(); }));
  }

  areaForm() {
    const b = this.bulk;
    const areas = (this.data.objects || []).filter(o => o.object_type === "area").sort((x, y) => String(x.name).localeCompare(String(y.name)));
    if (!areas.length) return `<div class="polform bulkform"><small>${this.t("areaNone")}</small><button type="button" class="btn quiet" data-bulk-cancel>${this.t("cancelRun")}</button></div>`;
    return `<form class="polform bulkform" data-bulk-form><strong>${this.t("state_area")}</strong>
      <select data-bulk-area aria-label="${this.esc(this.t("areaChoose"))}"><option value="">${this.t("areaSuggest")}</option>${areas.map(a => `<option value="${this.esc(a.object_id)}" ${b.area === a.object_id ? "selected" : ""}>${this.esc(a.name)}</option>`).join("")}</select>
      <button type="submit" class="btn primary" ${this.planBusy ? 'disabled aria-busy="true"' : ""}>${this.t("refactorPlan")}</button><button type="button" class="btn quiet" data-bulk-cancel>${this.t("cancelRun")}</button>
      <small class="factnote">${this.t("areaNote")}</small>
      ${b.error ? `${this.notice("err", this.t(b.error))}` : ""}</form>`;
  }

  async makeAreaPlan() {
    const b = this.bulk;
    const ids = [...new Set(this.bulkTargets().filter(t => ["entity", "device"].includes(t.type)).map(t => t.id))];
    if (!ids.length) { b.error = "areaNoItems"; this.render(); return; }
    try {
      if (!await this.newPlan(ids.map(object_id => ({ kind: "set_area", object_id, ...(b.area ? { target: b.area } : {}) })))) return;
      this.bulk = null; this.polSel = new Set();
    } catch (err) { b.error = ""; this.failed(err); }
    this.render();
  }
}
