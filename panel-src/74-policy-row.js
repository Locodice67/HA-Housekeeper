// PolicyRowMixin: a row of the rule violations folds open to its reasons and actions: rename one entity, give
// one entity or device an area, open it, hide it. Mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  polOpenRow: "Details aufklappen", polCloseRow: "Details zuklappen", polWhy: "Warum", polActRename: "Umbenennen", polOpenObject: "Objekt öffnen", polToCleanup: "Zum Bereinigen",
  polNameFree: "frei", polNameTaken: "vergeben von {name} ({id})", polNameTakenDead: "vergeben: {id} ist nicht mehr verfügbar. Bereinigen gibt den Namen frei.", polNameSame: "unverändert",
  polSuggestHint: "Vorschläge:", polRecommended: "empfohlen", polPickHint: "Wähle einen Vorschlag oder tippe eine ID.", polNoSuggest: "Kein freier Vorschlag aus Name und Bereich. Tippe eine ID.", polSuggTaken: "{id} ist vergeben: {why}", polExpectedNote: "Die ID beginnt hier mit „{prefix}“.",
});
Object.assign(TEXT.en, {
  polOpenRow: "Show details", polCloseRow: "Hide details", polWhy: "Why", polActRename: "Rename", polOpenObject: "Open object", polToCleanup: "To the clean-up",
  polNameFree: "free", polNameTaken: "taken by {name} ({id})", polNameTakenDead: "taken: {id} is no longer available. Cleaning up frees the name.", polNameSame: "unchanged",
  polSuggestHint: "Suggestions:", polRecommended: "recommended", polPickHint: "Pick a suggestion or type an ID.", polNoSuggest: "No free suggestion from the name and the area. Type an ID.", polSuggTaken: "{id} is taken: {why}", polExpectedNote: "Here the ID starts with “{prefix}”.",
});

const POL_RENAME_RULES = ["entity_id_suffix", "entity_id_address", "naming_scheme"];
const POL_AREA_RULES = ["entity_area", "device_area"];
const POL_ID_RULE = /^[a-z0-9_]+$/;

class PolicyRowMixin {
  polIsOpen(item) { return (this.polOpen || []).includes(item.key); }

  // The one action a closed row offers besides hiding: the one that fixes what the rule found.
  polMainAction(item) {
    if (item.ignored) return "";
    if (item.object_type === "entity" && POL_RENAME_RULES.includes(item.rule)) return "polActRename";
    if (["entity", "device"].includes(item.object_type) && POL_AREA_RULES.includes(item.rule)) return "fselArea";
    return "";
  }

  polSlug(text) {
    return String(text || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  // The draft of one row starts empty, so the person picks a suggestion or types an ID on purpose.
  polDraft(item) {
    const edits = (this.polEdits ||= {});
    return edits[item.key] ||= { value: "", area: "" };
  }

  // Whether the new ID can be used: "bad" (characters), "same" (no change), "taken" (by `other`) or "free".
  polNameCheck(item, value) {
    const domain = item.object_id.split(".")[0];
    if (!POL_ID_RULE.test(value)) return { state: "bad" };
    if (`${domain}.${value}` === item.object_id) return { state: "same" };
    const other = this.findObject(`entity:${domain}.${value}`);
    return other ? { state: "taken", other } : { state: "free" };
  }

  polCheckText(item, value) {
    if (!value) return { tone: "", text: this.t(this.polSuggestions(item).list.length ? "polPickHint" : "polNoSuggest") };
    const c = this.polNameCheck(item, value);
    if (c.state === "bad") return { tone: "bad", text: this.t("deBadId") };
    if (c.state === "same") return { tone: "", text: this.t("polNameSame") };
    if (c.state === "free") return { tone: "ok", text: this.t("polNameFree") };
    const dead = ["unavailable", "orphaned"].includes(c.other.status);
    return { tone: "bad", text: dead ? this.t("polNameTakenDead", { id: c.other.object_id }) : this.t("polNameTaken", { name: c.other.name || c.other.object_id, id: c.other.object_id }), dead };
  }

  // The names to pick from, the best first: the id without its counter or with the prefix of the scheme,
  // the name of the entity, and the name with the area. `list` holds the free ones, `taken` the best one that is not.
  polSuggestions(item) {
    const own = item.object_id.split(".").slice(1).join("."), obj = this.findObject(`${item.object_type}:${item.object_id}`);
    const area = this.polSlug(obj ? this.areaName(obj) : ""), name = this.polSlug(item.name);
    const first = item.rule === "naming_scheme" && item.expected ? `${item.expected}${own}` : item.rule === "entity_id_suffix" ? own.replace(/_\d+$/, "") : "";
    const base = item.rule === "entity_id_address" ? name : first || name;
    const all = [first, name, area ? `${base}_${area}` : ""].filter((v, i, a) => v && v !== own && a.indexOf(v) === i);
    const list = all.filter(v => this.polNameCheck(item, v).state === "free");
    return { list, taken: all.length && this.polNameCheck(item, all[0]).state === "taken" ? all[0] : "" };
  }

  polRenameBlock(item) {
    const d = this.polDraft(item), c = this.polCheckText(item, d.value), key = this.esc(item.key);
    const blocked = !["free"].includes(this.polNameCheck(item, d.value).state) || this.planBusy;
    const { list, taken } = this.polSuggestions(item);
    const hint = c.dead ? `<button type="button" class="btn small" data-jump="cleanup">${this.t("polToCleanup")}</button>` : "";
    const chips = list.map((v, i) => `<button type="button" class="btn small mono${d.value === v ? " on" : ""}" data-pol-sugg="${key}|${this.esc(v)}" aria-pressed="${d.value === v}">${this.esc(v)}${i === 0 ? ` <small>${this.t("polRecommended")}</small>` : ""}</button>`).join("");
    const why = taken ? `<small class="factnote">${this.t("polSuggTaken", { id: taken, why: this.polCheckText(item, taken).text })}</small>` : "";
    return `<div class="poledit"><label for="pol-id-${key}"><strong>${this.t("deNewId")}</strong></label><div class="inline"><span class="mono">${this.esc(item.object_id.split(".")[0])}.</span><input id="pol-id-${key}" data-pol-id="${key}" value="${this.esc(d.value)}" placeholder="${this.esc(this.t("deNewId"))}" autocomplete="off" spellcheck="false"><span class="polcheck ${c.tone}" data-pol-check="${key}" role="status">${this.esc(c.text)}</span><button type="button" class="btn primary small" data-pol-rename-go="${key}" ${blocked ? "disabled" : ""}>${this.t("deRename")}</button>${hint}</div>${chips ? `<div class="inline"><small class="factnote">${this.t("polSuggestHint")}</small>${chips}</div>` : ""}${why}<small class="factnote">${this.t("deRenameNote")}</small></div>`;
  }

  polAreaBlock(item) {
    const obj = this.findObject(`${item.object_type}:${item.object_id}`), d = this.polDraft(item), key = this.esc(item.key);
    const areas = (this.data.objects || []).filter(o => o.object_type === "area").sort((x, y) => String(x.name).localeCompare(String(y.name)));
    if (!areas.length) return `<small class="factnote">${this.t("areaNone")}</small>`;
    return `<div class="poledit"><label for="pol-area-${key}"><strong>${this.t("deArea")}</strong></label><div class="inline"><select id="pol-area-${key}" data-pol-area="${key}"><option value="">${this.t("areaSuggest")}</option>${areas.map(a => `<option value="${this.esc(a.object_id)}" ${d.area === a.object_id ? "selected" : ""}>${this.esc(a.name)}</option>`).join("")}</select><button type="button" class="btn primary small" data-pol-area-go="${key}" ${this.planBusy || !obj ? "disabled" : ""}>${this.t("deAssign")}</button></div><small class="factnote">${this.t("areaNote")}</small></div>`;
  }

  // The folded-open part of a row: why, the fix that belongs to the rule, then open and hide (or show) side by side.
  polDetail(item, hide) {
    const why = `<div><h4>${this.t("polWhy")}</h4><p>${this.t(`polDesc_${item.rule}`)}${item.expected ? ` ${this.t("polExpectedNote", { prefix: item.expected })}` : ""}</p></div>`;
    const fix = item.ignored ? "" : item.object_type === "entity" && POL_RENAME_RULES.includes(item.rule) ? this.polRenameBlock(item)
      : ["entity", "device"].includes(item.object_type) && POL_AREA_RULES.includes(item.rule) ? this.polAreaBlock(item) : "";
    const open = ["recorder", "system", "user"].includes(item.object_type) ? "" : `<button type="button" class="btn small" data-object="${this.esc(`${item.object_type}:${item.object_id}`)}">${this.t("polOpenObject")}</button>`;
    return `<div class="poldetail">${why}${fix}${open || hide ? `<div class="acts">${open}${hide}</div>` : ""}</div>`;
  }

  // The key of a row holds "|" itself, so a pick is cut at the last one.
  polSuggSplit(raw) {
    const at = raw.lastIndexOf("|");
    return { key: raw.slice(0, at), value: raw.slice(at + 1) };
  }

  bindPolicyRow(root) {
    const toggle = key => {
      const open = this.polOpen || [];
      this.polOpen = open.includes(key) ? open.filter(k => k !== key) : [...open, key];
      this.render();
    };
    root.querySelectorAll("[data-pol-open]").forEach(el => el.addEventListener("click", () => toggle(el.dataset.polOpen)));
    // A click anywhere on the row folds it too; buttons, fields and the opened part keep their own clicks.
    root.querySelectorAll("[data-pol-row]").forEach(el => el.addEventListener("click", ev => {
      if (ev.target.closest("button, a, input, select, label, textarea, .poldetail")) return;
      toggle(el.dataset.polRow);
    }));
    const find = key => (this.policies?.rules || []).flatMap(r => r.items.map(i => ({ ...i, rule: r.id }))).find(i => i.key === key);
    const refresh = (key, item) => {
      const d = this.polDraft(item), c = this.polCheckText(item, d.value);
      const span = root.querySelector(`[data-pol-check="${CSS.escape(key)}"]`), go = root.querySelector(`[data-pol-rename-go="${CSS.escape(key)}"]`);
      if (span) { span.textContent = c.text; span.className = `polcheck ${c.tone}`; }
      root.querySelectorAll(`[data-pol-sugg^="${CSS.escape(key)}|"]`).forEach(b => { const on = b.dataset.polSugg.slice(key.length + 1) === d.value; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
      if (go) go.disabled = this.polNameCheck(item, d.value).state !== "free" || !!this.planBusy;
    };
    root.querySelectorAll("[data-pol-id]").forEach(el => el.addEventListener("input", () => {
      const item = find(el.dataset.polId);
      if (!item) return;
      this.polDraft(item).value = el.value.trim().toLowerCase();
      refresh(el.dataset.polId, item);
    }));
    root.querySelectorAll("[data-pol-sugg]").forEach(el => el.addEventListener("click", () => {
      const { key, value } = this.polSuggSplit(el.dataset.polSugg), item = find(key);
      if (!item) return;
      const draft = this.polDraft(item);
      draft.value = draft.value === value ? "" : value;
      this.render();
    }));
    root.querySelectorAll("[data-pol-rename-go]").forEach(el => el.addEventListener("click", () => {
      const item = find(el.dataset.polRenameGo);
      if (!item || this.polNameCheck(item, this.polDraft(item).value).state !== "free") return;
      this.makeDetailPlan({ kind: "rename_entity", object_id: item.object_id, target: `${item.object_id.split(".")[0]}.${this.polDraft(item).value}` });
    }));
    root.querySelectorAll("[data-pol-area]").forEach(el => el.addEventListener("change", () => { const item = find(el.dataset.polArea); if (item) this.polDraft(item).area = el.value; }));
    root.querySelectorAll("[data-pol-area-go]").forEach(el => el.addEventListener("click", () => {
      const item = find(el.dataset.polAreaGo);
      if (!item) return;
      const area = this.polDraft(item).area;
      this.makeDetailPlan({ kind: "set_area", object_id: item.object_id, ...(area ? { target: area } : {}) });
    }));
  }
}
