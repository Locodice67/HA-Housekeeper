// Devices and entities that fail again and again: the hint "on purpose?" next to the finding, with a mark prepared for it.
// It only reads what the reliability numbers hold already (see stabilityOf); it never starts the recorder query.
Object.assign(TEXT.de, {
  oftenChip: "Fällt regelmäßig aus", oftenChipAt: "Fällt meist zwischen {from} und {to} Uhr aus",
  oftenTitle: "Absichtlich?", oftenText: "{lines} Wenn das gewollt ist, hält ein Vermerk es fest, und Housekeeper meldet den Ausfall dann nicht mehr.",
  oftenSet: "Vermerk mit Zeitfenster setzen", oftenSetPlain: "Vermerk setzen", oftenSkip: "Nicht mehr fragen",
  oftenDevice: "Mehrere Entitäten dieses Geräts fallen zur selben Zeit aus.", oftenGroup: "{device}: {n} Entitäten", oftenRest: "die übrigen {n} Entitäten bleiben überwacht", oftenRest1: "die übrige Entität bleibt überwacht",
  oftenCardTitle: "Vorschläge für Vermerke", oftenCardHint: "Fallen regelmäßig aus oder haben keinen Wert, etwa im Standby. Ein Vermerk „Absichtlich offline“ blendet ihre Befunde 90 Tage aus.",
  oftenCount: "{n} Vorschläge", oftenFindings1: "1 Befund", oftenFindings: "{n} Befunde", oftenTake: "Vermerken", oftenTakeN: "Vermerken ({n})", oftenColObject: "Objekt", oftenColPattern: "Muster", oftenColFindings: "Befunde", oftenNone: "Nichts ausgewählt.",
  oftenAllTitle: "Ausgewählte Vorschläge übernehmen?", oftenAllText: "{n} Vermerke „Absichtlich offline“ werden gesetzt, mit erkanntem Zeitfenster, wo es eines gibt. Sie blenden {hides} Befunde aus und lassen sich einzeln wieder entfernen.",
  oftenReason: "Vorschlag: fällt regelmäßig aus",
});
Object.assign(TEXT.en, {
  oftenChip: "Fails regularly", oftenChipAt: "Usually fails between {from} and {to}",
  oftenTitle: "On purpose?", oftenText: "{lines} If that is intended, a mark records it and Housekeeper stops reporting the outage.",
  oftenSet: "Set a mark with a time window", oftenSetPlain: "Set a mark", oftenSkip: "Do not ask again",
  oftenDevice: "Several entities of this device fail at the same time.", oftenGroup: "{device}: {n} entities", oftenRest: "the other {n} entities stay watched", oftenRest1: "the other entity stays watched",
  oftenCardTitle: "Suggested marks", oftenCardHint: "They fail or lose their value regularly, in standby for instance. A mark “Offline on purpose” hides their findings for 90 days.",
  oftenCount: "{n} suggestions", oftenFindings1: "1 finding", oftenFindings: "{n} findings", oftenTake: "Mark", oftenTakeN: "Mark ({n})", oftenColObject: "Object", oftenColPattern: "Pattern", oftenColFindings: "Findings", oftenNone: "Nothing picked.",
  oftenAllTitle: "Mark the picked suggestions?", oftenAllText: "{n} marks “Offline on purpose” are set, with the detected time window where there is one. They hide {hides} findings and can be removed one by one.",
  oftenReason: "Suggested: fails regularly",
});

const OFTEN_RULES = ["entity.state_unavailable", "entity.state_unknown", "device.down"];
const OFTEN_QUIET_DAYS = 180;
const OFTEN_MARK_DAYS = 90;
const OFTEN_DEVICE_MIN = 3;

class OftenMixin {
  oftenDismissed() {
    let stored = {};
    try { stored = JSON.parse(globalThis.localStorage?.getItem("ha_housekeeper.often") || "{}") || {}; } catch (_) { stored = {}; }
    return { ...stored, ...(this._oftenSkip || {}) };
  }

  // { info, days, device, members } for an entity or a device that falls out regularly, else null; a dismissed one stays quiet
  // for a while. For a device, members are the entities that fail together at the same hour.
  oftenOut(type, id) {
    const key = `${type}:${id}`, skipped = this.oftenDismissed()[key];
    if (skipped && Date.now() - skipped < OFTEN_QUIET_DAYS * 86400000) return null;
    const regular = info => info && (info.pattern_hour !== null && info.pattern_hour !== undefined || ["flapping", "unstable"].includes(info.level));
    if (type === "entity") {
      const s = this.stabilityOf({ object_id: id });
      return s?.info && regular(s.info) ? { info: s.info, days: s.r.window_days, device: false } : null;
    }
    if (type !== "device") return null;
    const members = (this.data?.objects || []).filter(o => o.object_type === "entity" && o.device_id === id);
    const byHour = new Map();
    for (const o of members) {
      const s = this.oftenOut("entity", o.object_id), h = s?.info.pattern_hour;
      if (h !== null && h !== undefined) byHour.set(h, [...(byHour.get(h) || []), { ...s, id: o.object_id }]);
    }
    const best = [...byHour.values()].sort((a, b) => b.length - a.length)[0];
    return best && best.length >= OFTEN_DEVICE_MIN ? { info: best[0].info, days: best[0].days, device: true, members: best.map(s => s.id) } : null;
  }

  oftenFor(finding) {
    if (!finding || finding.ignored || !OFTEN_RULES.includes(finding.rule_id)) return null;
    return this.oftenOut(finding.rule_id === "device.down" ? "device" : "entity", finding.object_id);
  }

  oftenWindow(info) {
    if (info.pattern_hour === null || info.pattern_hour === undefined) return null;
    const pad = n => String(n % 24).padStart(2, "0");
    return { from: `${pad(info.pattern_hour)}:00`, to: `${pad(info.pattern_hour + 2)}:00` };
  }

  // A small chip in the row of the finding.
  oftenChip(finding) {
    const often = this.oftenFor(finding);
    if (!often) return "";
    const w = this.oftenWindow(often.info);
    return ` · <span class="nw">${this.esc(w ? this.t("oftenChipAt", w) : this.t("oftenChip"))}</span>`;
  }

  // The entities a suggestion "group:<device>" stands for: those that fail together and carry no mark yet.
  oftenMembers(key) {
    const id = key.slice("group:".length);
    return (this.oftenOut("device", id)?.members || []).filter(e => !this.findObject(`entity:${e}`)?.mark);
  }

  // The findings a mark "offline on purpose" on the object would hide: of a device also those of its entities.
  oftenHidden(key) {
    if (key.startsWith("group:")) return this.oftenMembers(key).reduce((n, e) => n + this.oftenHidden(`entity:${e}`), 0);
    const [type, ...rest] = key.split(":"), id = rest.join(":");
    const outage = f => !f.ignored && ["unavailable", "unknown", "stale"].includes(f.classification);
    return (this.data?.findings || []).filter(f => type === "device"
      ? (f.rule_id === "device.down" && f.object_id === id && !f.ignored) || (outage(f) && this.findObject(`entity:${f.object_id}`)?.device_id === id)
      : outage(f) && f.object_id === id).length;
  }

  // The suggestions gathered, most findings first: a device only when it is down completely, the entities of a device that
  // fail together as one group (the mark goes on each of them, the others stay watched), else one per entity.
  oftenSuggestions() {
    const out = new Map();
    for (const f of this.data?.findings || []) {
      let often = this.oftenFor(f);
      if (!often) continue;
      let key = f.rule_id === "device.down" ? `device:${f.object_id}` : `entity:${f.object_id}`;
      const device = key.startsWith("entity:") && this.findObject(key)?.device_id;
      const together = device && this.findObject(`device:${device}`) && this.oftenOut("device", device);
      if (together?.members.includes(f.object_id) && this.oftenMembers(`group:${device}`).length > 1) { key = `group:${device}`; often = together; }
      if (out.has(key) || this.findObject(key)?.mark) continue;
      out.set(key, { key, often, hides: this.oftenHidden(key) });
    }
    return [...out.values()].sort((a, b) => b.hides - a.hides || a.key.localeCompare(b.key));
  }

  // The card above the findings list: a fold with the count in its head, inside a list like every other one. Picked
  // rows are marked or left out from the selection bar; one row alone through its menu. A click on a row opens the object.
  oftenCard() {
    this.ensureStability?.();
    const items = this.oftenSuggestions();
    if (!items.length) return "";
    const open = this.foldOpen("often", false), sel = (this.oftenSel ||= new Set());
    for (const key of [...sel]) if (!items.some(s => s.key === key)) sel.delete(key);
    const rows = items.map(({ key, often, hides }) => {
      const group = key.startsWith("group:"), link = group ? `device:${key.slice(6)}` : key, item = this.findObject(link), w = this.oftenWindow(often.info);
      const members = group ? this.oftenMembers(key) : [];
      const names = members.slice(0, 3).map(e => this.findObject(`entity:${e}`)?.name || e).join(", ") + (members.length > 3 ? " …" : "");
      // The other entities of the device that say something about it: they stay watched.
      const rest = group ? (this.data?.objects || []).filter(o => o.object_type === "entity" && o.device_id === item?.object_id && ["active", "unavailable", "unknown"].includes(o.status) && !members.includes(o.object_id)).length : 0;
      const restText = rest ? (rest === 1 ? this.t("oftenRest1") : this.t("oftenRest", { n: this.formatNumber(rest) })) : "";
      const title = group ? this.t("oftenGroup", { device: item?.name || link, n: this.formatNumber(members.length) }) : item?.name || key;
      return { key, link, type: item?.object_type || "entity", title, id: group ? names : link.split(":").slice(1).join(":"), note: restText, pattern: w ? this.t("oftenChipAt", w) : this.t("oftenChip"), hides };
    });
    const menu = r => `<details class="rowmenu"><summary aria-label="${this.esc(this.t("rowMenu"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div class="menupop"><button type="button" class="menuitem" data-often-take="${this.esc(r.key)}"><ha-icon icon="mdi:bookmark-plus-outline"></ha-icon>${this.t("oftenTake")}</button><button type="button" class="menuitem" data-often-skip="${this.esc(r.key)}"><ha-icon icon="mdi:close"></ha-icon>${this.t("oftenSkip")}</button></div></details>`;
    const shown = this.selOnly?.often ? rows.filter(r => sel.has(r.key)) : rows;
    const list = this.sysList("often", shown, {
      sort: "hides", dir: "desc", tie: r => r.key, empty: "oftenNone", text: r => `${r.title} ${r.id} ${r.pattern}`,
      sorts: [{ key: "name", label: "sortName", dir: "asc", get: r => r.title }, { key: "pattern", label: "oftenColPattern", dir: "asc", get: r => r.pattern }, { key: "hides", label: "oftenColFindings", dir: "desc", get: r => r.hides }],
      rowAttrs: r => `data-object="${this.esc(r.link)}" tabindex="0" role="button" aria-label="${this.esc(r.title)}"`,
      columns: [
        { key: "sel", label: "selectPage", narrow: true, sortable: false,
          allBox: page => { const ids = (this._oftenVisible = page.map(r => r.key)), n = ids.filter(k => sel.has(k)).length; return `<input type="checkbox" class="selbox" data-often-page ${n && n === ids.length ? "checked" : ""} ${n && n < ids.length ? "data-partial" : ""} aria-label="${this.esc(this.t("selectPage"))}">`; },
          cell: r => `<input type="checkbox" class="selbox" data-often-sel="${this.esc(r.key)}" ${sel.has(r.key) ? "checked" : ""} aria-label="${this.esc(r.title)}">` },
        { key: "name", label: "oftenColObject", dir: "asc", cell: r => `<div class="statcell">${this.tile(r.type, "warn")}<div>${this.nameCell(r.title, r.id)}${r.note ? `<small class="muted">${this.esc(r.note)}</small>` : ""}</div></div>` },
        { key: "pattern", label: "oftenColPattern", dir: "asc", cell: r => this.esc(r.pattern) },
        { key: "hides", label: "oftenColFindings", dir: "desc", cell: r => this.formatNumber(r.hides) },
        { key: "menu", label: "rowMenu", menu: true, narrow: true, sortable: false, cell: menu },
      ],
    });
    const n = [...sel].length;
    const bar = `<div class="toolbar${n ? "" : " nosel"}">${this.selTools("often", n, "data-often-clear")}<span class="toolgap"></span><button type="button" class="btn quiet" data-often-skip-picked ${n ? "" : "disabled"}>${this.t("oftenSkip")}</button><button type="button" class="btn primary" data-often-picked ${n ? "" : "disabled"}>${this.t("oftenTakeN", { n: this.formatNumber(n) })}</button></div>`;
    const top = `<button class="row foldhead" data-fold="often" aria-expanded="${open}"><span class="tile warn"><ha-icon icon="mdi:${open ? "chevron-down" : "chevron-right"}"></ha-icon></span><span class="row-text"><strong>${this.t("oftenCardTitle")}</strong><small>${this.esc(this.t("oftenCardHint"))}</small></span><span class="pill warn">${this.esc(this.t("oftenCount", { n: this.formatNumber(items.length) }))}</span></button>`;
    return `<div class="panel"><div class="fold${open ? " open" : ""}">${top}${open ? `<div class="foldbody">${bar}${list}</div>` : ""}</div></div>`;
  }

  oftenFindings(n) { return n === 1 ? this.t("oftenFindings1") : this.t("oftenFindings", { n: this.formatNumber(n) }); }

  // Set the suggested mark: offline on purpose, with the window when one was found, asked again after 90 days.
  async takeOften(keys) {
    const items = new Map(this.oftenSuggestions().map(s => [s.key, s]));
    let failed = 0, last = null;
    for (const key of keys) {
      const s = items.get(key);
      if (!s) continue;
      const w = this.oftenWindow(s.often.info);
      // A group is marked entity by entity: the entities of the device that keep working stay watched.
      for (const target of key.startsWith("group:") ? this.oftenMembers(key).map(e => `entity:${e}`) : [key]) {
        const [object_type, ...rest] = target.split(":");
        const msg = { type: "ha_housekeeper/mark_set", object_type, object_id: rest.join(":"), kind: "expected_offline", reason: this.t("oftenReason"), days: OFTEN_MARK_DAYS };
        if (w) msg.window = { mode: "time", from: w.from, to: w.to };
        try { await this._hass.callWS(msg); } catch (err) { failed += 1; last = err; }
      }
    }
    if (failed) this.failed(last);
    try { await this.refreshData(); } catch (err) { this.failed(err); }
    this.render();
  }

  // The card of the tab "Actions": what the numbers say, and the mark prepared for it.
  oftenRows(item) {
    if (item.mark || !["entity", "device"].includes(item.object_type)) return [];
    const finding = (this.data?.findings || []).find(f => !f.ignored && OFTEN_RULES.includes(f.rule_id) && f.object_id === item.object_id);
    const often = finding && this.oftenFor(finding);
    if (!often) return [];
    const key = this.objectKey(item), w = this.oftenWindow(often.info);
    const lines = [...this.unstableLines(often.info, often.days), often.device ? this.t("oftenDevice") : ""].filter(Boolean).join(" ");
    const buttons = `<button class="btn" data-often-set="${this.esc(key)}"><ha-icon icon="mdi:bookmark-plus-outline"></ha-icon>${this.t(w ? "oftenSet" : "oftenSetPlain")}</button><button class="btn quiet" data-often-skip="${this.esc(key)}">${this.t("oftenSkip")}</button>`;
    return [this.actRow(this.t("oftenTitle"), this.t("oftenText", { lines }), buttons)];
  }

  openOftenMark(key) {
    const [type, ...rest] = key.split(":"), often = this.oftenOut(type, rest.join(":"));
    this.openMark(key);
    if (!this.markForm) return;
    const w = often && this.oftenWindow(often.info);
    Object.assign(this.markForm, { kind: "expected_offline", days: OFTEN_MARK_DAYS, ...(w ? { wmode: "time", from: w.from, to: w.to } : {}) });
    this.render();
  }

  // "Do not ask again" holds for the entities of a group, not for the device: another entity that fails later is asked about.
  skipOften(key) {
    for (const k of key.startsWith("group:") ? this.oftenMembers(key).map(e => `entity:${e}`) : [key]) (this._oftenSkip ||= {})[k] = Date.now();
    const kept = this.oftenDismissed();
    try { globalThis.localStorage?.setItem("ha_housekeeper.often", JSON.stringify(kept)); } catch (_) { /* no storage */ }
    this.render();
  }

  bindOften(root) {
    root.querySelectorAll("[data-often-set]").forEach(el => el.onclick = () => this.openOftenMark(el.dataset.oftenSet));
    root.querySelectorAll("[data-often-skip]").forEach(el => el.onclick = () => this.skipOften(el.dataset.oftenSkip));
    root.querySelectorAll("[data-often-take]").forEach(el => el.onclick = () => this.takeOften([el.dataset.oftenTake]));
    // The picked suggestions: one is marked at once, several after a question that names the marks and findings.
    const sel = () => (this.oftenSel ||= new Set());
    root.querySelectorAll("[data-often-sel]").forEach(el => el.onchange = () => { this.pickRows("often", el.dataset.oftenSel, el.checked, sel(), this._oftenVisible); this.render(); });
    const pageBox = root.querySelector("[data-often-page]");
    if (pageBox) { pageBox.indeterminate = pageBox.hasAttribute("data-partial"); pageBox.onchange = ev => { (this._oftenVisible || []).forEach(k => (ev.target.checked ? sel().add(k) : sel().delete(k))); this.render(); }; }
    root.querySelector("[data-often-clear]")?.addEventListener("click", () => { sel().clear(); this.render(); });
    root.querySelector("[data-often-skip-picked]")?.addEventListener("click", () => { const keys = [...sel()]; sel().clear(); keys.forEach(k => this.skipOften(k)); });
    root.querySelector("[data-often-picked]")?.addEventListener("click", () => {
      const items = this.oftenSuggestions().filter(s => sel().has(s.key)), keys = items.map(s => s.key);
      if (!keys.length) return;
      const take = () => { sel().clear(); this.takeOften(keys); };
      if (keys.length === 1) return take();
      const hides = items.reduce((n, s) => n + s.hides, 0), marks = items.reduce((n, s) => n + (s.key.startsWith("group:") ? this.oftenMembers(s.key).length : 1), 0);
      this.confirmAsk(this.t("oftenAllText", { n: this.formatNumber(marks), hides: this.formatNumber(hides) }), take, { title: this.t("oftenAllTitle"), yes: this.t("oftenTake"), danger: false });
    });
  }
}
