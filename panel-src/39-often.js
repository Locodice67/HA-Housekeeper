// Devices and entities that fail again and again: the hint "on purpose?" next to the finding, with a mark prepared for it.
// It only reads what the reliability numbers hold already (see stabilityOf); it never starts the recorder query.
Object.assign(TEXT.de, {
  oftenChip: "Fällt regelmäßig aus", oftenChipAt: "Fällt meist zwischen {from} und {to} Uhr aus",
  oftenTitle: "Absichtlich?", oftenText: "{lines} Wenn das gewollt ist, hält ein Vermerk es fest, und Housekeeper meldet den Ausfall dann nicht mehr.",
  oftenSet: "Vermerk mit Zeitfenster setzen", oftenSetPlain: "Vermerk setzen", oftenSkip: "Nicht mehr fragen",
  oftenDevice: "Mehrere Entitäten dieses Geräts fallen zur selben Zeit aus.",
  oftenCardTitle: "Vorschläge für Vermerke", oftenCardHint: "Fallen regelmäßig aus oder haben keinen Wert, etwa im Standby. Ein Vermerk „Absichtlich offline“ blendet ihre Befunde 90 Tage aus.",
  oftenCount: "{n} Vorschläge", oftenFindings1: "1 Befund", oftenFindings: "{n} Befunde", oftenSum1: "1 Objekt · {findings}", oftenSum: "{n} Objekte · zusammen {findings}", oftenTake: "Vermerken", oftenTakeAll: "Alle vermerken",
  oftenAllTitle: "Alle Vorschläge übernehmen?", oftenAllText: "{n} Vermerke „Absichtlich offline“ werden gesetzt, mit erkanntem Zeitfenster, wo es eines gibt. Sie blenden {hides} Befunde aus und lassen sich einzeln wieder entfernen.",
  oftenReason: "Vorschlag: fällt regelmäßig aus",
});
Object.assign(TEXT.en, {
  oftenChip: "Fails regularly", oftenChipAt: "Usually fails between {from} and {to}",
  oftenTitle: "On purpose?", oftenText: "{lines} If that is intended, a mark records it and Housekeeper stops reporting the outage.",
  oftenSet: "Set a mark with a time window", oftenSetPlain: "Set a mark", oftenSkip: "Do not ask again",
  oftenDevice: "Several entities of this device fail at the same time.",
  oftenCardTitle: "Suggested marks", oftenCardHint: "They fail or lose their value regularly, in standby for instance. A mark “Offline on purpose” hides their findings for 90 days.",
  oftenCount: "{n} suggestions", oftenFindings1: "1 finding", oftenFindings: "{n} findings", oftenSum1: "1 object · {findings}", oftenSum: "{n} objects · {findings} in all", oftenTake: "Mark", oftenTakeAll: "Mark all",
  oftenAllTitle: "Mark all suggestions?", oftenAllText: "{n} marks “Offline on purpose” are set, with the detected time window where there is one. They hide {hides} findings and can be removed one by one.",
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

  // { info, days, device } for an entity or a device that falls out regularly, else null; a dismissed one stays quiet for a while.
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
    const infos = members.map(o => this.stabilityOf(o)).filter(s => s?.info && regular(s.info));
    const byHour = new Map();
    for (const s of infos) { const h = s.info.pattern_hour; if (h !== null && h !== undefined) byHour.set(h, [...(byHour.get(h) || []), s]); }
    const best = [...byHour.values()].sort((a, b) => b.length - a.length)[0];
    return best && best.length >= OFTEN_DEVICE_MIN ? { info: best[0].info, days: best[0].r.window_days, device: true } : null;
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

  // The findings a mark "offline on purpose" on the object would hide: of a device also those of its entities.
  oftenHidden(key) {
    const [type, ...rest] = key.split(":"), id = rest.join(":");
    const outage = f => !f.ignored && ["unavailable", "unknown", "stale"].includes(f.classification);
    return (this.data?.findings || []).filter(f => type === "device"
      ? (f.rule_id === "device.down" && f.object_id === id && !f.ignored) || (outage(f) && this.findObject(`entity:${f.object_id}`)?.device_id === id)
      : outage(f) && f.object_id === id).length;
  }

  // The suggestions gathered: one per device whose entities fail together, else one per entity; most findings first.
  oftenSuggestions() {
    const out = new Map();
    for (const f of this.data?.findings || []) {
      let often = this.oftenFor(f);
      if (!often) continue;
      let key = f.rule_id === "device.down" ? `device:${f.object_id}` : `entity:${f.object_id}`;
      const device = key.startsWith("entity:") && this.findObject(key)?.device_id;
      const together = device && this.findObject(`device:${device}`) && this.oftenOut("device", device);
      if (together) { key = `device:${device}`; often = together; }
      if (out.has(key) || this.findObject(key)?.mark) continue;
      out.set(key, { key, often, hides: this.oftenHidden(key) });
    }
    return [...out.values()].sort((a, b) => b.hides - a.hides || a.key.localeCompare(b.key));
  }

  // The card above the findings list: a bar with the sum and "Mark all", then every suggestion as a row with a small
  // "Mark" and a quiet cross for "Do not ask again".
  oftenCard() {
    this.ensureStability?.();
    const items = this.oftenSuggestions();
    if (!items.length) return "";
    const open = this.foldOpen("often", false), pg = this.paginate("often", items);
    const rows = pg.rows.map(({ key, often, hides }) => {
      const item = this.findObject(key), w = this.oftenWindow(often.info);
      const sub = [w ? this.t("oftenChipAt", w) : this.t("oftenChip"), this.oftenFindings(hides)].join(" · ");
      return `<div class="rowwrap oftenrow"><button class="row" data-object="${this.esc(key)}">${this.tile(item?.object_type || "entity", "warn")}<span class="row-text"><strong>${this.esc(item?.name || key)}</strong><small>${this.esc(sub)}</small></span></button><button type="button" class="btn small" data-often-take="${this.esc(key)}">${this.t("oftenTake")}</button><button type="button" class="iconbtn" data-often-skip="${this.esc(key)}" title="${this.esc(this.t("oftenSkip"))}" aria-label="${this.esc(`${this.t("oftenSkip")}: ${item?.name || key}`)}"><ha-icon icon="mdi:close"></ha-icon></button></div>`;
    }).join("");
    const findings = this.oftenFindings(items.reduce((n, s) => n + s.hides, 0));
    const sum = items.length === 1 ? this.t("oftenSum1", { findings }) : this.t("oftenSum", { n: this.formatNumber(items.length), findings });
    const all = `<div class="toolbar oftenbar"><span>${this.esc(sum)}</span>${items.length > 1 ? `<button type="button" class="btn small" data-often-all>${this.t("oftenTakeAll")}</button>` : ""}</div>`;
    const top = `<button class="row foldhead" data-fold="often" aria-expanded="${open}"><span class="tile warn"><ha-icon icon="mdi:${open ? "chevron-down" : "chevron-right"}"></ha-icon></span><span class="row-text"><strong>${this.t("oftenCardTitle")}</strong><small>${this.esc(this.t("oftenCardHint"))}</small></span><span class="pill warn">${this.esc(this.t("oftenCount", { n: this.formatNumber(items.length) }))}</span></button>`;
    return `<div class="panel"><div class="fold${open ? " open" : ""}">${top}${open ? `<div class="foldbody">${all}${rows}${pg.footer}</div>` : ""}</div></div>`;
  }

  oftenFindings(n) { return n === 1 ? this.t("oftenFindings1") : this.t("oftenFindings", { n: this.formatNumber(n) }); }

  // Set the suggested mark: offline on purpose, with the window when one was found, asked again after 90 days.
  async takeOften(keys) {
    const items = new Map(this.oftenSuggestions().map(s => [s.key, s]));
    let failed = 0, last = null;
    for (const key of keys) {
      const s = items.get(key);
      if (!s) continue;
      const [object_type, ...rest] = key.split(":"), w = this.oftenWindow(s.often.info);
      const msg = { type: "ha_housekeeper/mark_set", object_type, object_id: rest.join(":"), kind: "expected_offline", reason: this.t("oftenReason"), days: OFTEN_MARK_DAYS };
      if (w) msg.window = { mode: "time", from: w.from, to: w.to };
      try { await this._hass.callWS(msg); } catch (err) { failed += 1; last = err; }
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

  skipOften(key) {
    (this._oftenSkip ||= {})[key] = Date.now();
    const kept = this.oftenDismissed();
    try { globalThis.localStorage?.setItem("ha_housekeeper.often", JSON.stringify(kept)); } catch (_) { /* no storage */ }
    this.render();
  }

  bindOften(root) {
    root.querySelectorAll("[data-often-set]").forEach(el => el.onclick = () => this.openOftenMark(el.dataset.oftenSet));
    root.querySelectorAll("[data-often-skip]").forEach(el => el.onclick = () => this.skipOften(el.dataset.oftenSkip));
    root.querySelectorAll("[data-often-take]").forEach(el => el.onclick = () => this.takeOften([el.dataset.oftenTake]));
    root.querySelectorAll("[data-often-all]").forEach(el => el.onclick = () => {
      const items = this.oftenSuggestions(), hides = items.reduce((n, s) => n + s.hides, 0);
      this.confirmAsk(this.t("oftenAllText", { n: this.formatNumber(items.length), hides: this.formatNumber(hides) }), () => this.takeOften(items.map(s => s.key)), { title: this.t("oftenAllTitle"), yes: this.t("oftenTakeAll"), danger: false });
    });
  }
}
