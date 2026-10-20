// CausesMixin: one note for the common cause behind many "not available" findings (see causes.py).
class CausesMixin {
  causeList() { return this.data?.causes || []; }

  // Follow-up findings of a cause stay out of the list until asked for; the export keeps them.
  // The finding of an outage itself stays when the list is not the grouped one (a status or a filter is set): there it is its own row.
  collapseFollowers(list, keepOwn = false) { return this.showFollowers ? list : list.filter(f => !f.cause_id || (keepOwn && CAUSE_OWN_RULES.includes(f.rule_id))); }

  // "In the HA log: 3 errors, last 2 hours ago" (see log_facts.py: numbers and times, never a text).
  logLine(log) {
    if (!log) return "";
    return this.t("logLine", { what: this.t(`logLevel_${log.level}`, { n: this.formatNumber(log.count) }), when: this.relTime(log.last) });
  }

  causeLine(c) {
    const used = ["automation", "script", "dashboard"].filter(k => c.consumers?.[k]).map(k => this.t(`causeUses_${k}`, { n: c.consumers[k] }));
    const why = c.kind === "integration_down" ? [c.state ? this.t("causeState", { state: c.state }) : "", c.error || "", this.logLine(c.log)].filter(Boolean) : [];
    return [...why, ...used, c.impact && c.impact !== "none" ? this.t(`impact_${c.impact}`) : ""].filter(Boolean).join(" · ");
  }

  // How long an integration has not been loaded and when that becomes more serious: "for 6 h · Medium in 18 h".
  outageLine(c) { return this.outageLineOf(c.finding_key && this.data.findings.find(x => x.key === c.finding_key)); }

  // A length of time in hours as "40 min", "6 h" or "9 d".
  spanText(h) { return h < 1 ? `${Math.max(1, Math.round(h * 60))} ${this.t("unitMin")}` : h < 48 ? `${Math.round(h)} ${this.t("unitHour")}` : `${Math.round(h / 24)} ${this.t("unitDay")}`; }

  // The same for the finding of an outage itself, as the detail page shows it.
  outageLineOf(f) {
    const since = f && Date.parse(f.first_detected_at);
    if (!since) return "";
    const m = this.data.meta || {};
    const hours = Math.max(0, (Date.now() - since) / 3600000);
    // The next level and when it starts, from the four thresholds (info in minutes, the others in hours).
    const steps = [[(m.outage_info_minutes ?? 15) / 60, "info"], [m.outage_low_hours ?? 1, "low"], [m.outage_medium_hours ?? 24, "medium"], [m.outage_high_hours ?? 168, "high"]];
    const span = h => this.spanText(h);
    const next = steps.find(([at]) => at > hours);
    return [this.t("outageFor", { span: span(hours) }), next ? this.t("outageNext", { level: this.t(`chip_${next[1]}`), span: span(next[0] - hours) }) : ""].filter(Boolean).join(" · ");
  }

  // The staircase of an outage by duration: each level with the hours it starts at.
  outageSteps() {
    const m = this.data.meta || {};
    return [["info", 0], ["low", m.outage_low_hours ?? 1], ["medium", m.outage_medium_hours ?? 24], ["high", m.outage_high_hours ?? 168]];
  }

  // The block "Rating" of the detail page: how serious the finding is and why, how sure the diagnosis is, and what it
  // would take to reach the next level. Only when the object has an open finding.
  ratingBlock(item, key) {
    const finding = this.data.findings.filter(f => this.findingKey(f) === key && !f.ignored).sort((a, b) => this.impactScore(b) - this.impactScore(a))[0];
    if (!finding) return "";
    const cause = this.causeList().find(c => c.object_type === item.object_type && c.object_id === item.object_id);
    const raw = cause?.impact && cause.impact !== "none" ? cause.impact : finding.impact;
    const level = raw && raw !== "none" ? raw : "info";
    const order = ["info", "low", "medium", "high"], idx = order.indexOf(level);
    const outage = OUTAGE_RULES.includes(finding.rule_id) || Boolean(cause);
    const since = Date.parse(finding.first_detected_at);
    const hours = outage && since ? Math.max(0, (Date.now() - since) / 3600000) : null;
    const reasons = [];
    if (hours !== null) reasons.push(this.t("outageFor", { span: this.spanText(hours) }));
    (finding.impact_facts || []).filter(x => x.fact !== "outage_age").forEach(x => reasons.push(this.t(`impactFact_${x.fact}`, { n: x.n ?? "", id: x.id ?? "", why: this.t(`impactWhy_${x.why}`) })));
    if (cause) {
      if (this.causeTotal(cause)) reasons.push(this.t("ratingFollowers", { n: this.formatNumber(this.causeTotal(cause)) }));
      ["automation", "script", "dashboard"].filter(k => cause.consumers?.[k]).forEach(k => reasons.push(this.t(`causeUses_${k}`, { n: cause.consumers[k] })));
    }
    if (!reasons.length) reasons.push(this.t("ratingNoReason"));
    let bar = "";
    if (hours !== null) {
      const steps = this.outageSteps();
      let stage = 0; steps.forEach(([, at], i) => { if (at <= hours) stage = i; });
      const end = steps[stage + 1]?.[1], frac = end ? Math.min(1, (hours - steps[stage][1]) / Math.max(0.001, end - steps[stage][1])) : 1;
      bar = `<div class="rbar"><span style="width:${Math.round((stage + frac) / 4 * 100)}%"></span></div><div class="rticks">${steps.map(([lv, at], i) => `<span>${this.t(`chip_${lv}`)}${i ? ` ${this.t("ratingFrom", { span: this.spanText(at) })}` : ""}</span>`).join("")}</div>`;
    }
    const why = this.t(`certWhy_${finding.classification}`), kind = why === `certWhy_${finding.classification}` ? "" : why;
    const label = lv => this.t(`chip_${lv}`);
    let next;
    if (idx >= 3) next = `<i class="ratingicon"><ha-icon icon="mdi:check"></ha-icon></i><span>${this.t("ratingTop")}</span>`;
    else {
      const target = order[idx + 1], cond = this.t(`ratingNext_${level}`);
      const steps = hours !== null ? this.outageSteps() : [], step = steps.find(([, at]) => at > hours);
      const parts = [];
      if (step && step[0] === target) parts.push(this.t("ratingNextBoth", { level: label(target), span: this.spanText(step[1] - hours), cond }));
      else {
        parts.push(this.t("ratingNextCond", { level: label(target), cond }));
        if (step) parts.push(this.t("ratingNextDur", { level: label(step[0]), span: this.spanText(step[1] - hours) }));
      }
      next = `<i class="ratingicon"><ha-icon icon="mdi:arrow-top-right"></ha-icon></i><span>${parts.map(x => this.esc(x)).join(" ")}</span>`;
    }
    return `<div class="rating"><h3 class="ratinghead">${this.t("ratingTitle")}</h3>
      <div class="rrow"><b>${this.t("sortImpact")}</b><div>${this.impactChip(level)}<div class="factnote">${reasons.map(x => this.esc(x)).join(" · ")}</div>${bar}</div></div>
      <div class="rrow"><b>${this.t("sortCertainty")}</b><div>${Math.round((finding.confidence || 0) * 100)} %${kind ? ` <span class="factnote">${this.esc(kind)}</span>` : ""}<div class="factnote">${this.t("ratingCertMeaning")}</div></div></div>
      <div class="rnext">${next}</div></div>`;
  }

  // The short line of a row: the counts and, for an integration, how long it has been down; reason and log are for the detail page.
  causeShort(c) { return c.kind === "integration_down" ? [this.causeCounts(c), this.outageLine(c)].filter(Boolean).join(" · ") : [this.causeCounts(c), this.causeLine(c)].filter(Boolean).join(" · "); }

  // One headline per cause with the counts of what it touches; the follow-up findings sit in a fold.
  causeCounts(c) {
    if (c.kind === "service_missing") return this.t("causeCallers", { n: this.formatNumber(c.follower_count) });
    if (c.virtual) return this.t("causeUsers", { n: this.formatNumber(c.follower_count) });
    if (c.kind === "app_down") return this.t("causeBelow", { n: this.formatNumber(c.child_ids.length) });
    if (!c.follower_count && !Object.keys(c.consumers || {}).length) return this.t("causeNone");
    const parts = [this.t("causeN_entity", { n: this.formatNumber(c.follower_count) }), ...["automation", "script", "dashboard"].filter(k => c.consumers?.[k]).map(k => this.t(`causeN_${k}`, { n: c.consumers[k] }))];
    return this.t("causeCounts", { parts: parts.join(", ") });
  }

  // "3 integrations, 1 device" for the to-do row.
  outagesHint(causes) {
    const n = kind => causes.filter(c => c.kind === kind).length;
    return [n("integration_down") ? this.t("outageIntegrations", { n: n("integration_down") }) : "", n("device_down") ? this.t("outageDevices", { n: n("device_down") }) : "", n("service_missing") ? this.t("outageServices", { n: n("service_missing") }) : "", n("app_down") ? this.t("outageApps", { n: n("app_down") }) : "", causes.filter(c => c.virtual && c.kind !== "service_missing").length ? this.t("outageTargets", { n: causes.filter(c => c.virtual && c.kind !== "service_missing").length }) : ""].filter(Boolean).join(", ");
  }

  // The causes at the top of a chain: the entries of the findings list. The ones below hang in their body.
  causeEntries() { return this.causeList().filter(c => !c.parent_id); }

  causeTotal(c) { return c.total_followers ?? c.follower_count ?? 0; }

  // One entry of the list for a cause: a row with a red counter ("12 follow-ups"); it opens into the chain below it
  // (causes and then the findings they explain), each with its own counter. A cause without any follow-up is a plain row.
  // The box that picks an outage, so it can be hidden, marked as known or snoozed with others at once.
  causeBox(c) {
    const key = c.finding_key;
    return key ? `<input type="checkbox" class="selbox" data-fsel="${this.esc(key)}" ${this.findSel.has(key) ? "checked" : ""} aria-label="${this.esc(c.name)}">` : "";
  }

  // The impact as a chip of its own at the right of a row: how much the entry matters, or how long an outage has lasted.
  impactChip(level) {
    if (!level || level === "none") return "";
    const tone = { high: "red", medium: "warn", low: "blue", info: "mute" }[level] || "mute";
    return `<span class="pill ${tone}">${this.esc(this.t(`chip_${level}`))}</span>`;
  }

  // The reason of an entry (outage, unused, broken reference): a neutral outlined chip, it only names; the colour belongs to the impact.
  kindChip(label) { return `<span class="pill kind">${this.esc(label)}</span>`; }

  // The menu at the end of a row: what can be decided about the finding, and where it applies the removal.
  // An open decision shows its form below the row.
  rowMenu(f) {
    if (!f) return "";
    if (f.ignored) return this.hiddenMenu(f);
    const key = this.esc(f.key);
    const item = (icon, label, attr, sub = "") => `<button type="button" class="menuitem" ${attr}><ha-icon icon="${icon}"></ha-icon>${sub ? `<span>${this.t(label)}<small>${this.esc(sub)}</small></span>` : this.t(label)}</button>`;
    const entity = f.rule_id.startsWith("entity.") && this.canMoreInfo(f.object_id) ? item("mdi:information-outline", "openEntity", `data-more-info="${this.esc(f.object_id)}"`) : "";
    // The row itself is one button, so the twin of a duplicate is opened from here.
    const twin = f.rule_id === "entity.possible_duplicate" && f.affected_object && this.findObject(`entity:${f.affected_object}`) ? item("mdi:open-in-new", "openTwin", `data-object="entity:${this.esc(f.affected_object)}"`) : "";
    const del = ["automation.never_triggered", "automation.stale", "automation.disabled_long"].includes(f.rule_id) ? item("mdi:delete-outline", "autoDelete", `data-auto-delete="${this.esc(f.object_id)}"`) : "";
    // The same actions in the same order as the selection bar: the status of the finding, then its object, then Home Assistant.
    const status = item(FSEL_ICONS.status, "fselStatus", `data-decide-open="${key}" data-decide-preset="keep"`);
    const objectKey = this.findingKey(f), object = this.findObject(objectKey);
    const mark = object && MARK_TYPES.includes(object.object_type) && !object.mark ? item(FSEL_ICONS.mark, "markSet", `data-watch-mark="${this.esc(objectKey)}"`, object.object_type === "device" ? this.t("markOnDeviceSub", { name: object.name || object.object_id }) : "") : "";
    const exc = object && this.excTargetOf(object) ? item(FSEL_ICONS.exc, "excCreate", `data-exc-for="${this.esc(objectKey)}"`) : "";
    const label = LABEL_TYPES.includes(object?.object_type) && f.classification !== "broken_reference" ? `<hr class="menusep">${item(FSEL_ICONS.label, "fselLabel", `data-row-label="${key}"`, this.t("changesHa"))}` : "";
    const about = mark + exc;
    return `<details class="rowmenu"><summary aria-label="${this.esc(this.t("rowMenu"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div class="menupop">${entity}${twin}${entity || twin ? '<hr class="menusep">' : ""}${status}${about ? `<hr class="menusep">${about}` : ""}${label}<hr class="menusep">${item("mdi:notebook-edit-outline", "findingNote", `data-finding-note="${key}"`)}${del}</div></details>`;
  }

  // The menu of a hidden finding: the way back, where the reason was set.
  hiddenMenu(f) {
    const item = (icon, label, attr) => `<button type="button" class="menuitem" ${attr}><ha-icon icon="${icon}"></ha-icon>${this.t(label)}</button>`;
    const key = this.esc(f.key), owner = this.markOwner(f);
    const items = f.ignored_by === "mark" && owner ? item(FSEL_ICONS.mark, "hiddenMarkOpen", `data-object="${this.esc(owner)}"`)
      : f.ignored_by === "rule" && f.ignore_rule?.id ? item(FSEL_ICONS.exc, "hiddenRuleOpen", `data-exc-goto="${this.esc(f.ignore_rule.id)}"`)
      : f.ignored_by === "label" ? item("mdi:open-in-new", "hiddenObjectOpen", `data-object="${this.esc(this.findingKey(f))}"`)
      : `${item("mdi:eye-outline", "showFinding", `data-ignore="${key}" data-ignore-value="0"`)}${item(FSEL_ICONS.status, "fselStatus", `data-decide-open="${key}" data-decide-preset="${f.ignore_info?.kind || "ignore"}"`)}`;
    return items ? `<details class="rowmenu"><summary aria-label="${this.esc(this.t("rowMenu"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div class="menupop">${items}</div></details>` : "";
  }

  // The object a mark that hides a finding sits on: the object itself, its device or the integration above it.
  markOwner(f) {
    const m = f.mark;
    if (!m) return "";
    const owner = (this.data?.objects || []).find(o => o.mark && o.mark.at === m.at && o.mark.kind === m.kind);
    return owner ? `${owner.object_type}:${owner.object_id}` : "";
  }

  // Why a finding is hidden, as the row says it: by its own status, a mark, an exception rule or the label.
  hiddenWhy(f) {
    const by = ["mark", "rule", "label"].includes(f.ignored_by) ? f.ignored_by : "user";
    const text = by === "mark" ? this.markLine(f.mark) : by === "rule" ? this.findingRuleLine(f) : by === "label" ? "housekeeper_ignore" : this.decisionLabel(f);
    return `<span class="pill mute">${this.t(`hiddenBy_${by}`)}</span> ${this.esc(text)}`;
  }

  // The menu of a cause: that of its own finding, or that of its object when it has none. A device that is down completely
  // is the object of its own finding, so the mark lands on the device and covers all its entities.
  causeMenu(c, own) {
    const link = `${c.object_type}:${c.object_id}`;
    const canMark = c.kind === "device_down" && this.findObject(link) && !this.findObject(link).mark;
    if (own) return this.rowMenu(own);
    return canMark ? this.objectMenu(link) : "";
  }

  // The menu of an object that is not a finding (the watch lists such objects): the same shape as the menu of a finding row, with what applies to an object.
  objectMenu(key, canMark = true) {
    const k = this.esc(key);
    const item = (icon, label, attr) => `<button type="button" class="menuitem" ${attr}><ha-icon icon="${icon}"></ha-icon>${this.t(label)}</button>`;
    const object = this.findObject(key), exc = object && this.excTargetOf(object) ? item(FSEL_ICONS.exc, "excCreate", `data-exc-for="${k}"`) : "";
    const about = (canMark ? item(FSEL_ICONS.mark, "markSet", `data-watch-mark="${k}"`) : "") + exc;
    return `<details class="rowmenu"><summary aria-label="${this.esc(this.t("rowMenu"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div class="menupop">${about ? `${about}<hr class="menusep">` : ""}${item("mdi:notebook-edit-outline", "findingNote", `data-object-note="${k}"`)}</div></details>`;
  }

  rowDecide(f) { return f && this.decide && this.decide.key === f.key ? `<div class="pad">${this.decideForm(f)}</div>` : ""; }

  causeEntry(c) {
    const total = this.causeTotal(c), link = `${c.object_type}:${c.object_id}`;
    const title = this.esc(this.t(`cause_${c.kind}`, { name: c.name })), own1 = c.finding_key && this.data.findings.find(x => x.key === c.finding_key);
    const sub = [total ? this.t("causeExplains", { n: this.formatNumber(total) }) : "", this.causeShort(c)].filter(Boolean).join(" · ");
    if (!total) return `<div class="rowwrap">${this.causeBox(c)}<button class="row rel" data-object="${this.esc(link)}">${this.tile(c.object_type, "red")}<span class="row-text"><strong>${title}</strong><small>${this.esc(sub)}</small></span>${this.kindChip(this.t("chip_outage"))}${this.impactChip(c.impact)}</button>${this.causeMenu(c, own1)}</div>${this.rowDecide(own1)}`;
    return this.fold(`cause_${c.id}`, { tone: "red", title, sub, pill: this.t("causeFollowers", { n: this.formatNumber(total) }) }, this.causeChildren(c), false);
  }

  causeChildren(c, includeOwn = true) {
    const link = `${c.object_type}:${c.object_id}`, own1 = c.finding_key && this.data.findings.find(x => x.key === c.finding_key);
    const byId = id => this.causeList().find(x => x.id === id);
    const own = !includeOwn || c.virtual ? "" : `<div class="rowwrap">${this.causeBox(c)}<button class="row" data-object="${this.esc(link)}">${this.tile(c.object_type, "red")}<span class="row-text"><strong>${this.esc(c.name)}</strong></span>${this.kindChip(this.t("chip_outage"))}${this.impactChip(own1 ? own1.impact : "")}</button>${this.causeMenu(c, own1)}</div>${this.rowDecide(own1)}`;
    const below = (c.child_ids || []).map(byId).filter(Boolean).map(x => this.causeEntry(x)).join("");
    const followers = (this.data.findings || []).filter(f => f.cause_id === c.id && !f.ignored && !CAUSE_OWN_RULES.includes(f.rule_id));
    const pg = this.paginate(`cause_${c.id}`, followers.map(f => this.findingRow(f)));
    const parts = `${below}${pg.rows.join("")}${pg.footer}`;
    return `${own}${parts ? `<div class="kids">${parts}</div>` : ""}`;
  }

  // The entries at the top of the findings list, as the overview shows them: by impact, a chain once at its top.
  findingEntries() {
    const score = e => e.cause ? (IMPACT_RANK[e.cause.impact] ?? 0) + 0.5 + Math.min(this.causeTotal(e.cause), 999) / 2000 : this.impactScore(e.finding);
    return [...this.causeEntries().map(cause => ({ cause })), ...this.sortedFindings().filter(f => !f.cause_id).map(finding => ({ finding }))].sort((a, b) => score(b) - score(a));
  }

  // A cause as a compact row of the overview: the counter says how many findings it explains.
  overviewCause(c) {
    const total = this.causeTotal(c), sub = [this.causeCounts(c), this.causeLine(c)].filter(Boolean).join(" · ");
    // A missing target has no page of its own: its row opens the findings filtered to it and what it explains.
    const target = c.virtual ? `data-jump="findingsNav" data-jump-cause="${this.esc(c.id)}"` : `data-object="${this.esc(`${c.object_type}:${c.object_id}`)}"`;
    return `<button class="row rel" ${target}>${this.tile(c.object_type, "red")}<span class="row-text"><strong>${this.esc(this.t(`cause_${c.kind}`, { name: c.name }))}</strong><small>${this.esc(sub)}</small></span>${total ? `<span class="pill red">${this.esc(this.t("causeFollowers", { n: this.formatNumber(total) }))}</span>` : ""}</button>`;
  }

  // A single finding as a plain row of the overview: it opens the object; deciding and selecting happen on the Findings page.
  overviewFinding(finding) {
    const { key, object, title, subtitle } = this.findingRowContent(finding);
    return `<button class="row" data-object="${this.esc(key)}">${this.tile(object?.object_type || "entity", this.tone(finding.classification))}<span class="row-text"><strong>${this.esc(title)}</strong><small>${subtitle}</small></span>${this.impactChip(finding.impact)}</button>`;
  }

  // Only in the flat view: "Follow-up of Integration Cloud" next to a finding that a cause explains.
  followOf(f) {
    if (!this.showFollowers) return "";
    const own = this.causeById(f.cause_id), c = this.isFollowUp(f) ? (CAUSE_OWN_RULES.includes(f.rule_id) ? this.causeById(own?.parent_id) : own) : null;
    return this.showFollowers && c ? ` · ${this.esc(this.t("causeFollowOf", { name: c.name }))}` : "";
  }

  // The number the findings are counted by: every chain of outages once, at its top, and every finding without an outage behind it; the follow-up findings of an outage are not counted again.
  // A quiet outage (info, low) is on the findings page only: not in the overview counts, not in what is new.
  isQuiet(f) { return OUTAGE_RULES.includes(f.rule_id) && ["info", "low"].includes(f.impact); }

  quietCause(c) { return !c.virtual && ["info", "low"].includes(c.impact); }

  // The open findings that stay off the overview counts: a quiet outage, or a follow-up of a chain whose top cause is quiet.
  quietCount() {
    const top = id => { let c = this.causeById(id); while (c?.parent_id) c = this.causeById(c.parent_id); return c; };
    return this.data.findings.filter(f => !f.ignored && (this.isQuiet(f) || (f.cause_id && top(f.cause_id) && this.quietCause(top(f.cause_id))))).length;
  }

  // Every open finding, the follow-ups of an outage too: the unit of the tiles, the list head, "Open" and the menu.
  findingTotal() { return this.data.findings.filter(f => !f.ignored).length; }

  followerCount() { return this.data.findings.filter(f => !f.ignored && this.isFollowUp(f)).length; }
}
Object.assign(TEXT.de, {
  causesTitle: "Ausfälle",
  cause_device_novalue: "Alle {n} Entitäten des Geräts haben seit {span} keinen Wert mehr. Meist ist das Gerät im Standby oder ausgeschaltet.", hint_device_novalue: "Ist das gewollt, hält ein Vermerk „Absichtlich offline“ am Gerät es fest; dann meldet Housekeeper weder das Gerät noch seine Entitäten.", devAllNoValue: "alle {n} ohne Wert", noValue: "Ohne Wert", sumRiskOutage: "Beim Entfernen (nicht der Ausfall)", cause_device_unavailable: "Alle {n} Entitäten des Geräts sind seit {span} nicht verfügbar. Das Gerät ist registriert, liefert aber keine Werte.", hint_device_unavailable: "Prüfen, ob das Gerät erreichbar ist (Strom, Netzwerk, Cloud-Verbindung), und die Integration neu laden.", devAllDown: "alle {n} nicht verfügbar", causeNone: "keine Entität betroffen", outageIntegrations: "{n} Integrationen", outageDevices: "{n} Geräte",
  logTitle: "Im HA-Log", logLine: "Im HA-Log: {what}, zuletzt {when}", logLevel_warning: "{n}× Warnung", logLevel_error: "{n}× Fehler", logLevel_critical: "{n}× kritischer Fehler",
  cause_integration_down: "Integration {name} ist nicht geladen", cause_device_down: "Gerät {name} ist ganz ausgefallen",
  causeFollowers: "{n} Folgen", causeExplains: "erklärt {n} weitere Befunde", causeFollowOf: "Folge von {name}", withFollowers: "Nur Ursachen mit Folgen", viewLabel: "Ansicht", viewGrouped: "Gruppiert", viewFlat: "Einzeln", viewLocked: "Mit einem Filter ist die Liste immer einzeln.", cause_app_down: "App {name} ist gestoppt", cause_entity_missing: "Entität {name} existiert nicht", cause_device_missing: "Gerät {name} existiert nicht", cause_area_missing: "Bereich {name} existiert nicht", causeUsers: "{n} Automationen, Skripte oder Dashboards verweisen darauf", causeBelow: "{n} Integrationen hängen vermutlich daran", outageApps: "{n} Apps", outageTargets: "{n} fehlende Ziele", cause_service_missing: "Dienst {name} existiert nicht", cause_blueprint_missing: "Blueprint {name} existiert nicht", causeCallers: "{n} Automationen und Skripte rufen ihn auf", outageServices: "{n} fehlende Dienste", causeState: "Zustand: {state}", causeUses_automation: "{n} Automationen betroffen", causeUses_script: "{n} Skripte betroffen", causeUses_dashboard: "{n} Dashboards betroffen",
  findingsOfFollow: "davon {n} Folgen von Ausfällen", ogViewCountOf: "{n} von {total} Befunden an {m} Objekten", viewCountOf: "{n} von {total} Befunden", actOutages: "Ausfälle",
});
Object.assign(TEXT.en, {
  causesTitle: "Outages",
  cause_device_novalue: "All {n} entities of the device have had no value for {span}. Usually the device is in standby or switched off.", hint_device_novalue: "If that is intended, a mark “Offline on purpose” on the device records it; then Housekeeper reports neither the device nor its entities.", devAllNoValue: "all {n} without a value", noValue: "No value", sumRiskOutage: "When removed (not the outage)", cause_device_unavailable: "All {n} entities of the device have been unavailable for {span}. The device is registered but delivers no values.", hint_device_unavailable: "Check that the device is reachable (power, network, cloud connection) and reload the integration.", devAllDown: "all {n} unavailable", causeNone: "no entity affected", outageIntegrations: "{n} integrations", outageDevices: "{n} devices",
  logTitle: "In the HA log", logLine: "In the HA log: {what}, last {when}", logLevel_warning: "{n}× warning", logLevel_error: "{n}× error", logLevel_critical: "{n}× critical error",
  cause_integration_down: "Integration {name} is not loaded", cause_device_down: "Device {name} is down completely",
  causeFollowers: "{n} follow-ups", causeExplains: "explains {n} more findings", causeFollowOf: "Follow-up of {name}", withFollowers: "Only causes with follow-ups", viewLabel: "View", viewGrouped: "Grouped", viewFlat: "One by one", viewLocked: "With a filter the list is always one by one.", cause_app_down: "App {name} is stopped", cause_entity_missing: "Entity {name} does not exist", cause_device_missing: "Device {name} does not exist", cause_area_missing: "Area {name} does not exist", causeUsers: "{n} automations, scripts or dashboards point to it", causeBelow: "{n} integrations probably depend on it", outageApps: "{n} apps", outageTargets: "{n} missing targets", cause_service_missing: "Service {name} does not exist", cause_blueprint_missing: "Blueprint {name} does not exist", causeCallers: "{n} automations and scripts call it", outageServices: "{n} missing services", causeState: "State: {state}", causeUses_automation: "{n} automations affected", causeUses_script: "{n} scripts affected", causeUses_dashboard: "{n} dashboards affected",
  findingsOfFollow: "{n} of them follow-ups of outages", ogViewCountOf: "{n} of {total} findings on {m} objects", viewCountOf: "{n} of {total} findings", actOutages: "Outages",
});
