// ObjectGroupsMixin: the grouped findings list. Every finding stands below the object it belongs to (an entity with a
// device below the device, everything else below itself), from one finding on. A cause (integration, app, device that
// is down, missing target) is the head of its object, and the objects it explains hang below it:
// app › integration › device › findings. Mixed into the panel in 99-register.js.
Object.assign(TEXT.de, {
  ogNoValue: "{n} von {m} Entitäten ohne Wert", ogNoValue1: "1 von {m} Entitäten ohne Wert", ogKind: "{label} ({n})",
  ogMatch: "{n} von {m} Befunden passen zum Filter", ogMarkHides: "{mark} · {n} Ausfälle ausgeblendet", ogMarkHides1: "{mark} · 1 Ausfall ausgeblendet",
  ogFindings: "{n} Befunde", ogFindings1: "1 Befund", ogViewCount: "{n} Befunde an {m} Objekten", ogViewCount1: "{n} Befunde an 1 Objekt", ogViewCountOne: "1 Befund an 1 Objekt",
  ogNew: "jüngster: {age}", selectObjectFindings: "Alle Befunde von {name} auswählen", ogOf: "Gerät {name}", fselPart: "{n} von {m}",
});
Object.assign(TEXT.en, {
  ogNoValue: "{n} of {m} entities without a value", ogNoValue1: "1 of {m} entities without a value", ogKind: "{label} ({n})",
  ogMatch: "{n} of {m} findings match the filter", ogMarkHides: "{mark} · {n} outages hidden", ogMarkHides1: "{mark} · 1 outage hidden",
  ogFindings: "{n} findings", ogFindings1: "1 finding", ogViewCount: "{n} findings on {m} objects", ogViewCount1: "{n} findings on 1 object", ogViewCountOne: "1 finding on 1 object",
  ogNew: "latest: {age}", selectObjectFindings: "Select all findings of {name}", ogOf: "Device {name}", fselPart: "{n} of {m}",
});

const OG_NO_VALUE = ["unavailable", "unknown"];

class ObjectGroupsMixin {
  // The object a finding belongs to in the grouped list: an entity with a device belongs to the device, all else to itself.
  ownerKey(f) {
    const key = this.findingKey(f);
    if (key.startsWith("entity:")) {
      const device = this.findObject(key)?.device_id;
      if (device && this.findObject(`device:${device}`)) return `device:${device}`;
    }
    return key;
  }

  causeById(id) {
    if (!this._causeMap || this._causeMapOf !== this.data?.causes) { this._causeMapOf = this.data?.causes; this._causeMap = new Map(this.causeList().map(c => [c.id, c])); }
    return this._causeMap.get(id);
  }

  // A follow-up is explained by a cause: an outage below it, and also the own finding of a cause that hangs below
  // another one (a device that is down because its integration is). It is not counted again.
  isFollowUp(f) {
    if (!f.cause_id) return false;
    return !CAUSE_OWN_RULES.includes(f.rule_id) || Boolean(this.causeById(f.cause_id)?.parent_id);
  }

  // In the flat list a finding of an entity names the device it belongs to.
  ownerNote(f) {
    const owner = this.ownerKey(f);
    if (!this.showFollowers || owner === this.findingKey(f)) return "";
    return ` · ${this.esc(this.t("ogOf", { name: this.findObject(owner)?.name || owner.slice(7) }))}`;
  }

  // The tree of the grouped list: the visible findings below their objects, the objects below their causes.
  // `all` is the list without the filters, for "2 of 6 findings match"; `keepCauses` keeps a cause that explains
  // nothing visible (the open list without filters shows every outage).
  objectTree(list, all, keepCauses) {
    const nodes = new Map();
    const node = key => {
      let n = nodes.get(key);
      if (!n) { n = { key, findings: [], kids: [], parent: null, cause: null, total: 0 }; nodes.set(key, n); }
      return n;
    };
    const causeKey = c => (c.virtual ? `cause:${c.id}` : `${c.object_type}:${c.object_id}`);
    for (const f of list) node(this.ownerKey(f)).findings.push(f);
    for (const f of all) node(this.ownerKey(f)).total += 1;
    for (const c of this.causeList()) node(causeKey(c)).cause = c;
    for (const n of nodes.values()) {
      let above = n.cause?.parent_id && this.causeById(n.cause.parent_id);
      if (!above) {
        // An object whose findings a cause explains hangs below it; with several, below the one that explains most.
        const ids = [...new Set(n.findings.map(f => f.cause_id).filter(id => id && id !== n.cause?.id))];
        above = ids.map(id => this.causeById(id)).filter(Boolean).sort((a, b) => this.causeTotal(b) - this.causeTotal(a))[0];
      }
      if (!above) continue;
      const parent = node(causeKey(above));
      let up = parent, loop = false;
      while (up) { if (up === n) { loop = true; break; } up = up.parent; }
      if (!loop) n.parent = parent;
    }
    for (const n of nodes.values()) if (n.parent) n.parent.kids.push(n);
    const count = n => (n._count ??= n.findings.length + n.kids.reduce((s, k) => s + count(k), 0));
    const keep = n => count(n) > 0 || (keepCauses && n.cause);
    const prune = n => { n.kids = n.kids.filter(keep); n.kids.forEach(prune); return n; };
    return [...nodes.values()].filter(n => !n.parent && keep(n)).map(prune);
  }

  // Every finding of a node and the nodes below it.
  nodeFindings(n) { return [...n.findings, ...n.kids.flatMap(k => this.nodeFindings(k))]; }
  nodeTotal(n) { return n.total + n.kids.reduce((s, k) => s + this.nodeTotal(k), 0); }
  nodeOwn(n) { return n.cause?.finding_key && this.data.findings.find(f => f.key === n.cause.finding_key); }

  // What the columns of a head show: the worst impact; certainty and since as the own value, the value of the one
  // finding, or the span. `pick` is the end of a span a sort uses: "desc" the high one, "asc" the low one.
  nodeFacts(n) {
    if (n._facts) return n._facts;
    const list = this.nodeFindings(n), own = this.nodeOwn(n), one = own || (list.length === 1 ? list[0] : null);
    const rank = Math.max(IMPACT_RANK[n.cause?.impact] ?? 0, ...list.map(f => IMPACT_RANK[f.impact] ?? 0));
    const impact = Object.keys(IMPACT_RANK).find(k => IMPACT_RANK[k] === rank) || "none";
    const conf = one ? [one.confidence, one.confidence] : [Math.min(...list.map(f => f.confidence ?? 0)), Math.max(...list.map(f => f.confidence ?? 0))];
    const times = (one ? [one.first_detected_at] : list.map(f => f.first_detected_at)).filter(Boolean).sort();
    return (n._facts = { list, own, one, impact, conf: list.length || own ? conf : [null, null], since: [times[0] || null, times[times.length - 1] || null] });
  }

  nodeName(n) { return n.cause ? n.cause.name : this.findObject(n.key)?.name || n.key.slice(n.key.indexOf(":") + 1); }

  // The line below the head: the cause and what it explains, or what the object has, by kind; a filter and a mark say so.
  nodeSub(n) {
    const f = this.nodeFacts(n), parts = [];
    if (n.cause) {
      const total = this.causeTotal(n.cause);
      if (total) parts.push(this.t("causeExplains", { n: this.formatNumber(total) }));
      parts.push(this.causeShort(n.cause));
    }
    const own = n.findings.filter(x => x !== f.own && !(n.cause && x.cause_id === n.cause.id));
    if (!n.cause && f.list.length === 1 && !n.kids.length) {
      const x = f.list[0], name = this.findObject(this.findingKey(x))?.name;
      parts.push(this.findingKey(x) !== n.key && name ? `${name}: ${this.findingTitle(x)}` : this.findingTitle(x));
    } else parts.push(...this.nodeKinds(n, own));
    const total = this.nodeTotal(n);
    if (total > f.list.length) parts.push(this.t("ogMatch", { n: this.formatNumber(f.list.length), m: this.formatNumber(total) }));
    const object = this.findObject(n.key);
    if (object?.mark) {
      const hidden = this.data.findings.filter(x => x.ignored_by === "mark" && this.ownerKey(x) === n.key).length;
      parts.push(hidden ? this.t(hidden === 1 ? "ogMarkHides1" : "ogMarkHides", { mark: this.markLine(object.mark), n: this.formatNumber(hidden) }) : this.markLine(object.mark));
    }
    return parts.filter(Boolean).join(" · ");
  }

  // "3 of 8 entities without a value · Orphaned (2) · Duplicate (1)": the outages of a device against the entities
  // that say something about it, the rest by kind.
  nodeKinds(n, list) {
    const parts = [], rest = new Map();
    let blank = list;
    if (n.key.startsWith("device:")) {
      const id = n.key.slice(7);
      blank = list.filter(x => x.rule_id.startsWith("entity.") && OG_NO_VALUE.includes(x.classification));
      if (blank.length) {
        const m = (this.data.objects || []).filter(o => o.object_type === "entity" && o.device_id === id && ["active", "unavailable", "unknown"].includes(o.status)).length;
        parts.push(this.t(blank.length === 1 ? "ogNoValue1" : "ogNoValue", { n: this.formatNumber(blank.length), m: this.formatNumber(Math.max(m, blank.length)) }));
      }
      blank = list.filter(x => !blank.includes(x));
    }
    for (const x of blank) { const label = this.reasonLabel(this.findingReason(x)); rest.set(label, (rest.get(label) || 0) + 1); }
    for (const [label, count] of rest) parts.push(this.t("ogKind", { label, n: this.formatNumber(count) }));
    return parts;
  }

  // Sort the nodes of one level by the column the list is sorted by; a span gives the end that fits the direction.
  sortNodes(nodes) {
    const st = this.lv.findings, desc = st.dir === "desc", sign = desc ? -1 : 1, { natural, ids } = this.collators();
    const value = n => {
      const f = this.nodeFacts(n);
      switch (st.sort) {
        case "name": return this.nodeName(n);
        case "id": return n.key;
        case "since": return f.since[desc ? 1 : 0];
        case "certainty": return f.conf[desc ? 1 : 0];
        case "rule": return f.own?.rule_id || f.list[0]?.rule_id || n.cause?.kind;
        default: return (IMPACT_RANK[f.impact] ?? 0) + (f.conf[1] || 0) / 2;
      }
    };
    return nodes.map(n => ({ n, v: value(n) })).sort((a, b) => {
      const emptyA = a.v == null || a.v === "", emptyB = b.v == null || b.v === "";
      if (emptyA !== emptyB) return emptyA ? 1 : -1;
      const order = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : natural.compare(String(a.v ?? ""), String(b.v ?? ""));
      return order * sign || ids.compare(a.n.key, b.n.key);
    }).map(x => x.n);
  }

  // Every fold id of the tree, for "Open all": also those below a closed head.
  nodeFoldIds(nodes) { return nodes.flatMap(n => [`og:${n.key}`, ...this.nodeFoldIds(n.kids)]); }

  // The rows of a node in the findings table: its head, and while open the nodes and findings below it, indented.
  nodeRows(n, depth = 0) {
    // An object with a single finding of its own is that finding's row: no head that says the same again.
    if (!n.cause && !n.kids.length && n.findings.length === 1 && this.findingKey(n.findings[0]) === n.key && !n.key.startsWith("dashboard:")) return this.findingTableRow(n.findings[0], depth);
    const f = this.nodeFacts(n), id = `og:${n.key}`, open = this.foldOpen(id, Boolean(this._autoOpen)), object = this.findObject(n.key);
    const keys = f.list.map(x => x.key);
    (this._findGroups ||= {})[id] = keys;
    const title = n.cause ? this.t(`cause_${n.cause.kind}`, { name: n.cause.name }) : this.nodeName(n);
    const tone = n.cause ? "red" : this.tone(f.list[0]?.classification);
    const type = n.cause ? n.cause.object_type : n.key.split(":")[0];
    // The head of an outage selects only its own finding, never the follow-ups below it. The head of an object
    // selects all findings of the object, those of its entities too, and is ticked while all of them are.
    const pick = n.cause ? this.causeBox(n.cause) : keys.length ? `<input type="checkbox" class="selbox" data-fsel-group="${this.esc(id)}" ${keys.every(k => this.findSel.has(k)) ? "checked" : ""} aria-label="${this.esc(this.t("selectObjectFindings", { name: this.nodeName(n) }))}">` : "";
    const fold = `<button type="button" class="finding-fold" data-fold="${this.esc(id)}" aria-expanded="${open}" aria-label="${this.esc(this.t(open ? "foldGroupClose" : "foldGroupOpen", { name: this.nodeName(n) }))}"><ha-icon class="foldarrow" icon="mdi:chevron-${open ? "down" : "right"}"></ha-icon></button>`;
    const total = n.cause ? this.causeTotal(n.cause) : 0;
    const label = `${this.tile(type, tone)}<span class="finding-name"><strong>${this.esc(title)}</strong><small>${this.esc(this.nodeSub(n))}</small></span>${total ? `<span class="pill red">${this.esc(this.t("causeFollowers", { n: this.formatNumber(total) }))}</span>` : ""}`;
    const link = object ? `<button type="button" class="finding-link" data-object="${this.esc(n.key)}">${label}</button>` : `<button type="button" class="finding-link" data-fold="${this.esc(id)}">${label}</button>`;
    const conf = f.conf[0] == null ? "–" : f.conf[0] === f.conf[1] ? `${Math.round(f.conf[0] * 100)} %` : `${Math.round(f.conf[0] * 100)}–${Math.round(f.conf[1] * 100)} %`;
    const since = f.since[0] && f.since[1] && f.since[0] !== f.since[1] ? `${this.ageCell(f.since[0])}<small class="ognew">${this.esc(this.t("ogNew", { age: this.relTime(f.since[1]) }))}</small>` : this.ageCell(f.since[0]);
    // What a person reads first: the reason in words, or how many findings the object has; the rule ID small below.
    const rule = f.own ? `<span class="finding-label">${this.t("chip_outage")}</span><small class="finding-rule">${this.esc(f.own.rule_id)}</small>` : `<span class="finding-label">${this.esc(this.t(f.list.length === 1 ? "ogFindings1" : "ogFindings", { n: this.formatNumber(f.list.length) }))}</span>`;
    const menu = n.cause ? this.causeMenu(n.cause, f.own) : f.list.length === 1 ? this.rowMenu(f.list[0]) : object && MARK_TYPES.includes(type) ? this.objectMenu(n.key) : "";
    const head = `<tr class="finding-data finding-cause og lvl${Math.min(depth, 3)}"><td class="selcol">${pick}</td><td><div class="finding-link-group">${fold}${link}</div></td><td data-label="${this.t("sortImpact")}">${this.impactChip(f.impact) || `<span class="muted">–</span>`}</td><td data-label="${this.t("sortCertainty")}">${conf}</td><td data-label="${this.t("sortSince")}">${since}</td><td data-label="${this.t("sortRuleGrouped")}">${rule}</td><td class="finding-action">${menu}</td></tr>`;
    const decision = n.cause && f.own ? this.rowDecide(f.own) : "";
    const decide = decision ? `<tr class="finding-detail"><td colspan="7">${decision}</td></tr>` : "";
    if (!open) return head + decide;
    const own = n.findings.filter(x => x !== f.own);
    const cards = n.key.startsWith("dashboard:") ? this.groupBroken(own) : own;
    const below = cards.map(x => (x.members ? this.cardRows(x, depth + 1) : this.findingTableRow(x, depth + 1))).join("");
    return head + decide + this.sortNodes(n.kids).map(k => this.nodeRows(k, depth + 1)).join("") + below;
  }

  // A card of a dashboard with several broken references: a head of its own, the references below it.
  cardRows(g, depth) {
    const f = g.members[0], p = f.evidence[0].place, keys = g.members.map(m => m.key), id = `bg:${g.group}`, open = this.foldOpen(id, Boolean(this._autoOpen));
    (this._findGroups ||= {})[id] = keys;
    const title = [...this.placeParts(p)].join(" › ") || f.object_id;
    const sub = [this.t("brokenCount", { n: keys.length }), this.isOrphan(p) ? this.t("brokenOrphanShort") : ""].filter(Boolean).join(" · ");
    const fold = `<button type="button" class="finding-fold" data-fold="${this.esc(id)}" aria-expanded="${open}" aria-label="${this.esc(this.t(open ? "foldGroupClose" : "foldGroupOpen", { name: title }))}"><ha-icon class="foldarrow" icon="mdi:chevron-${open ? "down" : "right"}"></ha-icon></button>`;
    const head = `<tr class="finding-data finding-cause og lvl${Math.min(depth, 3)}"><td class="selcol"><input type="checkbox" class="selbox" data-fsel-group="${this.esc(id)}" ${keys.every(k => this.findSel.has(k)) ? "checked" : ""} aria-label="${this.esc(title)}"></td><td><div class="finding-link-group">${fold}<button type="button" class="finding-link" data-fold="${this.esc(id)}">${this.tile("dashboard", "red")}<span class="finding-name"><strong>${this.esc(title)}</strong><small>${this.esc(sub)}</small></span></button></div></td><td data-label="${this.t("sortImpact")}">${this.impactChip(f.impact) || "–"}</td><td data-label="${this.t("sortCertainty")}">${f.confidence == null ? "–" : `${Math.round(f.confidence * 100)} %`}</td><td data-label="${this.t("sortSince")}">${this.ageCell(f.first_detected_at)}</td><td data-label="${this.t("sortRuleGrouped")}"><span class="finding-label">${this.esc(this.reasonLabel(this.findingReason(f)))}</span><small class="finding-rule">${this.esc(f.rule_id)}</small></td><td class="finding-action"></td></tr>`;
    const hint = open && this.isOrphan(p) ? `<tr class="finding-detail"><td colspan="7"><div class="hintbox"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon><div><p>${this.esc(this.t("brokenOrphan", { missing: p.card_missing, total: p.card_refs }))}</p></div></div></td></tr>` : "";
    return head + hint + (open ? g.members.map(m => this.findingTableRow(m, depth + 1, true)).join("") : "");
  }
}
