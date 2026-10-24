// SettingsMixin: methods of the panel element, mixed into the class in 99-register.js.
class SettingsMixin {
  infoText() {
    const m = this.data?.meta || {};
    return [`HA Housekeeper ${m.version || "?"}`, `Home Assistant ${m.ha_version || "?"}`, `${this.t("lastScan")}: ${m.scanned_at || "-"}`,
      `${this.t("objects")}: ${m.object_count ?? "-"}`, `${this.t("findings")}: ${this.data ? this.data.findings.filter(f => !f.ignored).length : "-"}`].join("\n");
  }

  segment(pref, options) {
    return `<div class="seg">${options.map(([value, label, dot]) => `<button class="chip ${String(this.prefs[pref]) === String(value) ? "active" : ""}" data-pref="${pref}|${value}">${dot ? `<span class="swatch" style="background:${dot}"></span>` : ""}${label}</button>`).join("")}</div>`;
  }

  // The tab ids of the settings page, in display order.
  // Each group has a tile with its state; the tile opens only that group's settings.
  settingsTabs() {
    const m = this.data?.meta || {}, hidden = (this.data?.findings || []).filter(f => f.ignored).length;
    const mcp = m.mcp || {};
    return [
      ["protection", "mdi:shield-lock-outline", "setTabProtection", "setHintProtection", this.t(`modeBadge_${m.protection || "full"}`), (m.protection || "full") === "full" ? "ok" : "warn"],
      ["exceptions", "mdi:eye-off-outline", "setTabExceptions", "setHintExceptions", this.exceptionPills(m, hidden), "mute"],
      ["scan", "mdi:radar", "setTabScan", "setHintScan", m.scan_interval_hours ? this.t("setEveryHours", { n: m.scan_interval_hours }) : this.t("setManual"), "mute"],
      ["mcp", "mdi:robot-outline", "setTabMcp", "setHintMcp", !mcp.enabled ? this.t("setOff") : this.t(mcp.write ? "mcpFilterWrite" : "mcpFilterRead"), !mcp.enabled ? "mute" : mcp.write ? "warn" : "ok"],
      ["look", "mdi:palette-outline", "setTabLook", "setHintLook", this.t(`scheme${(this.prefs.scheme || "standard").replace(/^./, c => c.toUpperCase())}`), "mute"],
      ["info", "mdi:information-outline", "setTabInfo", "setHintInfo", m.version ? `v${m.version}` : "–", "mute"],
    ];
  }

  // The exceptions tile: rules and hidden findings, and whether the vacation mode is on.
  exceptionPills(m, hidden) {
    const v = m.vacation, rules = this.exc?.rules ? this.exc.rules.length : m.exception_rules || 0;
    const pills = [{ text: this.t(rules === 1 ? "setRuleOne" : "setRulesCount", { n: rules }) }, { text: hidden ? this.t("setHiddenCount", { n: hidden }) : this.t("setNoneHidden") }];
    pills.push(v ? { text: this.t(v.active ? "setVacationOn" : "setVacationOff"), tone: v.active ? "warn" : "mute" } : { text: this.t("setVacationNone"), tone: "warn" });
    // What wants a look again: marks whose review date passed, findings whose status ran out.
    const marksDue = (this.data?.objects || []).filter(o => o.mark_due).length, statusDue = (this.data?.findings || []).filter(f => f.resurfaced && !f.ignored).length;
    if (marksDue) pills.unshift({ text: this.t("decReviewDue", { n: marksDue }), tone: "warn" });
    if (statusDue) pills.unshift({ text: this.t("decDue", { n: statusDue }), tone: "warn" });
    return pills.slice(0, 3); // more do not fit the tile; what is due comes first
  }

  // One line with what runs and how fresh the data is, plus the one button for support questions.
  settingsBand() {
    const m = this.data?.meta || {};
    const bit = (label, value) => `<span class="bandbit"><small>${label}</small><b>${value}</b></span>`;
    return `<div class="panel setband">${bit("Housekeeper", this.esc(m.version || "–"))}${bit("Home Assistant", this.esc(m.ha_version || "–"))}${bit(this.t("objects"), this.formatNumber(m.object_count ?? 0))}
      <span class="grow"></span><button class="btn" data-copy-info><ha-icon icon="mdi:content-copy"></ha-icon>${this.t(this.copied ? "copied" : "copyInfo")}</button></div>`;
  }

  // Scheme and mode as tiles: the scheme tile shows its own colors in the mode that is on screen.
  lookCard() {
    const p = this.prefs, dark = this.isDark();
    const tile = (pref, value, label, inner) => `<button class="tilebtn" data-pref="${pref}|${value}" aria-pressed="${String(p[pref]) === String(value)}">${inner}<span>${label}</span></button>`;
    const mini = scheme => {
      const c = SCHEMES[scheme][dark ? "dark" : "light"], bar = (w, col) => `<i style="width:${w}%;background:${col}"></i>`;
      return `<span class="schemeprev" aria-hidden="true" style="background:${c.bg};border-color:${c.border}"><span class="sp-card" style="background:${c.surface};border-color:${c.border}"><b style="background:${c.accent}"></b>${bar(60, c.text)}${bar(35, c.muted)}</span><span class="sp-row"><em style="background:${c.positive}"></em><em style="background:${c.warning}"></em><em style="background:${c.danger}"></em><u style="background:${c.accent}"></u></span></span>`;
    };
    const schemes = [["standard", "schemeStandard"], ["housekeeper", "schemeHousekeeper"], ["modern", "schemeModern"], ["aurora", "schemeAurora"], ["honey", "schemeHoney"], ["lagoon", "schemeLagoon"], ["emerald", "schemeEmerald"], ["frost", "schemeFrost"], ["midnight", "schemeMidnight"], ["olive", "schemeOlive"]].map(([id, key]) => tile("scheme", id, this.t(key), mini(id))).join("");
    const modes = [["auto", "modeAuto", "mdi:theme-light-dark"], ["light", "modeLight", "mdi:white-balance-sunny"], ["dark", "modeDark", "mdi:weather-night"]].map(([id, key, icon]) => tile("mode", id, this.t(key), `<ha-icon icon="${icon}"></ha-icon>`)).join("");
    const row = (label, hint, control) => `<div class="setrow"><div>${label}${hint ? `<small>${hint}</small>` : ""}</div>${control}</div>`;
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("setLanguage")}</h2><p>${this.t("setLanguageHint")}</p></div></div>
      ${row(this.t("setLanguage"), "", this.segment("language", [["auto", this.t("langAuto")], ["de", "Deutsch"], ["en", "English"]]))}
      <div class="panelhead"><h2>${this.t("colorScheme")}</h2></div><div class="tiles schemetiles">${schemes}</div>
      <div class="panelhead"><div><h2>${this.t("colorMode")}</h2><p>${this.t("modeHint")}</p></div></div><div class="tiles">${modes}</div></section>`;
  }

  // Font size, density and motion; sits in the right column of the look tab, above the behavior card.
  readabilityCard() {
    const row = (label, hint, control) => `<div class="setrow stackrow"><div>${label}${hint ? `<small>${hint}</small>` : ""}</div>${control}</div>`;
    return `<section class="panel"><div class="panelhead"><h2>${this.t("setReadability")}</h2></div>
      ${row(this.t("fontSize"), "", this.segment("size", [["small", this.t("fontSmall")], ["normal", this.t("fontNormal")], ["large", this.t("fontLarge")]]))}
      ${row(this.t("density"), "", this.segment("density", [["normal", this.t("densityNormal")], ["compact", this.t("densityCompact")]]))}
      ${row(this.t("motion"), this.t("motionHint"), this.segment("motion", [["auto", this.t("motionAuto")], ["reduced", this.t("motionReduced")]]))}</section>`;
  }

  behaviorCard() {
    const p = this.prefs;
    const row = (label, control) => `<div class="setrow"><div>${label}</div>${control}</div>`;
    const select = (key, options) => `<select data-pref-select="${key}" aria-label="${this.esc(this.t(key === "startView" ? "startView" : "pageSizeSetting"))}">${options.map(([v, l]) => `<option value="${v}" ${String(p[key]) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    return `<section class="panel"><div class="panelhead"><h2>${this.t("behavior")}</h2></div>
      ${row(this.t("startView"), select("startView", START_VIEWS.map(v => [v, this.t(v)])))}
      ${row(this.t("pageSizeSetting"), select("pageSize", PAGE_SIZES.map(n => [n, n])))}
      <div class="setrow quietreset"><small>${this.t("prefsNote")}</small><button class="btn quiet" data-pref-reset>${this.t("resetPrefs")}</button></div></section>`;
  }

  // The five thresholds as cards with their unit and default; saving stays off until a value differs.
  scanCard() {
    const m = this.data?.meta || {};
    if (!this.data) return `${this.skeleton("loading")}`;
    const card = ([key, title, hint, unit, standard]) => {
      const [min, max] = OPTION_LIMITS[key];
      return `<div class="optcard"><label for="opt-${key}"><strong>${this.t(title)}</strong></label><p>${this.t(hint)}</p>
        <div class="unitrow"><input id="opt-${key}" type="number" data-opt="${key}" data-saved="${this.esc(m[key] ?? "")}" min="${min}" max="${max}" step="1" value="${this.esc(m[key] ?? "")}"><span>${this.t(unit)}</span><em data-conv="${key}">${this.optConversion(unit, m[key])}</em></div>
        <div class="optfoot"><span>${this.t("optDefault", { n: standard, min, max })}</span><button class="optreset" data-opt-reset="${key}" ${String(m[key]) === String(standard) ? "hidden" : ""}>${this.t("optToDefault")}</button></div></div>`;
    };
    const outage = OPTION_FIELDS.filter(f => OUTAGE_OPTION_KEYS.includes(f[0])).map(card).join("");
    const other = OPTION_FIELDS.filter(f => !OUTAGE_OPTION_KEYS.includes(f[0])).map(card).join("");
    const cards = `<div class="optgroup"><h3>${this.t("optGroupOutage")}</h3><p>${this.t("optGroupOutageHint")}</p></div><div class="optgrid optgrid4">${outage}</div><div class="optgroup"><h3>${this.t("optGroupOther")}</h3></div><div class="optgrid">${other}</div>`;
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("scanSettings")}</h2><p>${this.t("scanSettingsHint")}</p></div></div>${cards}
      <div class="toolbar savebar"><span class="date" role="status">${this.esc(this.optionsMessage || "")}</span><span class="toolgap"></span><button class="btn quiet" data-ha-path="/config/integrations/integration/ha_housekeeper"><ha-icon icon="mdi:cog-outline"></ha-icon>${this.t("openOptions")}</button><button class="btn primary" data-opts-save disabled>${this.t("saveOptions")}</button></div></section>`;
  }

  // The numbers of the tab, one per card: findings with a status, marks, rules and labelled objects; each jumps to its card.
  decisionsBar() {
    const findings = this.data?.findings || [], objects = this.data?.objects || [];
    const status = [...findings.filter(f => (f.ignored && f.ignored_by === "user") || (f.resurfaced && !f.ignored)), ...this.restingDecisions()], statusDue = status.filter(f => !f.ignored).length;
    const marks = objects.filter(o => o.mark), marksDue = marks.filter(o => o.mark_due).length;
    const rules = this.exc?.rules?.length ?? this.data?.meta?.exception_rules ?? 0, byRule = findings.filter(f => f.ignored_by === "rule").length;
    const labelled = this.invObjects().filter(o => (o.labels || []).some(l => HK_LABELS.includes(l))).length;
    const kpi = (sec, label, n, extra, warn) => `<button type="button" class="kpi" data-sec-go="${sec}"><small>${this.t(label)}</small><strong>${this.formatNumber(n)}</strong>${extra ? `<small class="${warn ? "warntext" : ""}">${this.esc(extra)}</small>` : ""}</button>`;
    return `<div class="kpis decbar">${kpi("status", "decStatusKpi", status.length, statusDue ? this.t("decDue", { n: this.formatNumber(statusDue) }) : "", true)}${kpi("marks", "decMarksKpi", marks.length, marksDue ? this.t("decReviewDue", { n: this.formatNumber(marksDue) }) : "", true)}${kpi("rules", "decRulesKpi", rules, byRule ? this.t("decRuleHides", { n: this.formatNumber(byRule) }) : "")}${kpi("labels", "decLabelsKpi", labelled, "housekeeper_*")}</div>`;
  }

  // The decisions about findings that are away right now: they rest and hold again when the finding comes back. Each one
  // in the shape of a finding, from its key (rule|object|affected), with what was decided and when it was last seen.
  restingDecisions() {
    return (this.data?.resting_decisions || []).map(d => {
      const [rule_id, object_id = "", affected_object = ""] = d.key.split("|");
      return { key: d.key, rule_id, object_id, affected_object, ignored: true, ignored_by: "user", resting: true, seen: d.seen, ignore_info: { kind: d.kind, reason: d.reason, until: d.until } };
    });
  }

  // What a decision does right now: hides its finding, is due again, rests (finding away), has rested a month (still
  // needed?) or belongs to an object that is gone.
  decisionNow(f) {
    if (!f.resting) return f.ignored ? "hides" : "due";
    if (!this.findObject(this.findingKey(f))) return "gone";
    const days = f.seen ? Math.floor((Date.now() - Date.parse(f.seen)) / 864e5) : null;
    return days !== null && days >= MARK_QUIET_DAYS ? "quiet" : "rests";
  }

  // The findings with a status of their own, as a list: the ones whose time ran out (due) first, then the ones that hide
  // their finding, then the resting ones under a head of their own. Marks, rules and labels have their own cards.
  statusCard() {
    const resting = this.restingDecisions();
    const list = [...(this.data?.findings || []).filter(f => (f.ignored && f.ignored_by === "user") || (f.resurfaced && !f.ignored)), ...resting];
    const sel = (this.decSel ||= new Set());
    for (const key of [...sel]) if (!list.some(f => f.key === key)) sel.delete(key);
    const state = f => (f.ignored ? this.decidedState(f) : "due"), now = f => this.decisionNow(f);
    const objectName = f => this.findObject(this.findingKey(f))?.name || f.object_id;
    const until = f => (f.ignore_info?.until ? this.t("decideUntil", { date: this.formatDate(f.ignore_info.until) }) : f.ignored ? this.t("decideForever") : "");
    const quietDays = f => Math.floor((Date.now() - Date.parse(f.seen)) / 864e5);
    const nowText = f => ({ hides: this.t("decNowHides"), due: this.t("decNowDue"), rests: this.t("decNowRests"), quiet: this.t("decNowQuiet", { n: this.formatNumber(quietDays(f)) }), gone: this.t("decNowGone") })[now(f)];
    const nowTone = { hides: "mute", due: "warn", rests: "mute", quiet: "warn", gone: "warn" };
    const sorts = [{ key: "name", label: "hidColObject", dir: "asc", get: objectName }, { key: "finding", label: "hidColFinding", dir: "asc", get: f => this.findingTitle(f) }, { key: "until", label: "decColUntil", dir: "asc", get: f => f.ignore_info?.until || "9999" }];
    const filters = [
      { name: "state", all: this.t("decAllStates"), options: ["known", "snoozed", "hidden", "due"].map(s => [s, this.t(s === "due" ? "dueLabel" : `state_${s}`)]) },
      { name: "now", all: this.t("decNowAll"), options: ["hides", "due", "rests", "quiet", "gone"].filter(n => list.some(f => now(f) === n)).map(n => [n, this.t(`decNowFilter_${n}`)]) },
    ];
    const st = this.lvState("decided", "name", "asc");
    this.setExporter("decided", "finding-status", [this.t("hidColObject"), "ID", this.t("hidColFinding"), this.t("decColStatus"), this.t("decideReason"), this.t("decColUntil"), this.t("decColNow")], () => refined.map(f => [objectName(f), f.object_id, this.findingTitle(f), this.t(state(f) === "due" ? "dueLabel" : `state_${state(f)}`), f.ignore_info?.reason || "", until(f), nowText(f)]));
    const bar = list.length >= 6 || st.q || Object.values(st.f).some(Boolean) ? this.listBar("decided", { sorts, filters }) : "";
    const sorted = this.refine("decided", this.selOnly?.decided ? list.filter(f => sel.has(f.key)) : list, { text: f => [objectName(f), f.object_id, this.findingTitle(f), f.ignore_info?.reason].join(" "), filters: { state: (f, v) => state(f) === v, now: (f, v) => now(f) === v }, sorts, tie: f => f.key });
    const refined = [...sorted.filter(f => !f.ignored), ...sorted.filter(f => f.ignored && !f.resting), ...sorted.filter(f => f.resting)];
    const pg = this.paginate("decided", refined);
    st.shown = refined.length;
    const tone = { known: "ok", snoozed: "warn", hidden: "mute", due: "warn" };
    const item = (icon, label, attr) => `<button type="button" class="menuitem" ${attr}><ha-icon icon="${icon}"></ha-icon>${this.t(label)}</button>`;
    const menu = f => {
      const key = this.findingKey(f), object = this.findObject(key);
      const open = object ? item("mdi:open-in-new", "decOpenObject", `data-object="${this.esc(key)}"`) : "";
      const change = item(FSEL_ICONS.status, f.ignored ? "fselStatusChange" : "fselStatus", `data-decide-open="${this.esc(f.key)}" data-decide-preset="${f.ignore_info?.kind || "keep"}"`);
      const back = f.ignored && !f.resting ? item("mdi:eye-outline", "showFinding", `data-ignore="${this.esc(f.key)}" data-ignore-value="0"`) : item("mdi:delete-outline", "decRemove", `data-ignore="${this.esc(f.key)}" data-ignore-value="0"`);
      return `<details class="rowmenu"><summary aria-label="${this.esc(this.t("rowMenu"))}"><ha-icon icon="mdi:dots-vertical"></ha-icon></summary><div class="menupop">${open}${change}<hr class="menusep">${back}</div></details>`;
    };
    const visible = pg.rows.map(f => f.key);
    const columns = [
      { key: "sel", label: "selectPage", narrow: true, sortable: false,
        allBox: () => { const n = visible.filter(k => sel.has(k)).length; return `<input type="checkbox" class="selbox" data-dec-page ${n && n === visible.length ? "checked" : ""} ${n && n < visible.length ? "data-partial" : ""} aria-label="${this.esc(this.t("selectPage"))}">`; },
        cell: f => `<input type="checkbox" class="selbox" data-dec-sel="${this.esc(f.key)}" ${sel.has(f.key) ? "checked" : ""} aria-label="${this.esc(objectName(f))}">` },
      { key: "name", label: "hidColObject", sortKeys: ["finding"], cell: f => { const key = this.findingKey(f), object = this.findObject(key); return `<div class="statcell">${this.tile(object?.object_type || key.split(":")[0], f.resting ? "mute" : this.tone(f.classification))}<div>${object ? `<button type="button" class="link strong" data-object="${this.esc(key)}">${this.esc(objectName(f))}</button>` : `<code>${this.esc(f.object_id)}</code>`}<small class="muted u-block">${this.esc(this.findingTitle(f))}</small></div></div>`; } },
      { key: "until", label: "decColStatus", cell: f => `<span class="pill ${tone[state(f)]}">${this.t(state(f) === "due" ? "dueLabel" : `state_${state(f)}`)}</span>${until(f) ? `<small class="muted u-block">${this.esc(until(f))}</small>` : ""}` },
      { key: "reason", label: "decideReason", sortable: false, cell: f => (f.ignore_info?.reason ? this.esc(f.ignore_info.reason) : "–") },
      { key: "now", label: "decColNow", sortable: false, cell: f => `<span class="pill ${nowTone[now(f)]}">${this.esc(nowText(f))}</span>${f.resting && f.seen && now(f) !== "gone" ? `<small class="muted u-block">${this.esc(this.t("decLastSeen", { when: this.formatDate(f.seen) }))}</small>` : ""}` },
      { key: "menu", label: "rowMenu", menu: true, narrow: true, sortable: false, cell: menu },
    ];
    const restN = refined.filter(f => f.resting).length;
    let table = refined.length ? this.listTable("decided", columns, pg.rows, { cls: "objs", rowAttrs: f => `class="static${f.resting ? " restrow" : ""}${now(f) === "due" ? " duerow" : ""}"${f.resting ? ' data-rest="1"' : ""}`, after: f => (this.decide?.key === f.key ? `<tr class="static"><td colspan="${columns.length}"><div class="pad">${this.decideForm(f)}</div></td></tr>` : "") }) : "";
    // The resting ones stand under a head of their own: they do nothing right now.
    table = table.replace(/<tr class="static restrow/, `<tr class="static grprow"><td colspan="${columns.length}">${this.t("decRestHead", { n: this.formatNumber(restN) })}</td></tr>$&`);
    const n = sel.size;
    const tools = list.length ? `<div class="toolbar${n ? "" : " nosel"}">${this.selTools("decided", n, "data-dec-clear")}<span class="toolgap"></span><button type="button" class="btn" data-dec-remove ${n ? "" : "disabled"}><ha-icon icon="mdi:delete-outline"></ha-icon>${this.t("decRemoveN", { n: this.formatNumber(n) })}</button></div>` : "";
    const body = refined.length ? table : `<div class="emptymsg">${list.length ? this.noMatches("decided") : `<ha-icon icon="mdi:check-circle-outline"></ha-icon>${this.t("decStatusNone")}`}</div>`;
    return `<section class="panel" id="hk-sec-status"><div class="panelhead"><div><h2>${this.t("decStatusTitle")} (${this.formatNumber(list.length)})</h2><p>${this.t("decStatusHint")}</p></div></div>${bar}${tools}${body}${pg.footer}</section>`;
  }

  // Every mark, also one that hides nothing right now: what it says, when it applies and what it does at the moment.
  marksCard() {
    const list = (this.data?.objects || []).filter(o => o.mark);
    const hides = new Map();
    for (const f of this.data?.findings || []) if (f.ignored_by === "mark") { const owner = this.markOwner(f); if (owner) hides.set(owner, (hides.get(owner) || 0) + 1); }
    const keyOf = o => `${o.object_type}:${o.object_id}`;
    // A mark on an object that has run without a gap for a long time asks whether it is still needed.
    const quiet = o => (!o.mark_due && !hides.get(keyOf(o)) ? this.markQuietDays(o) : null), isQuiet = o => quiet(o) !== null;
    const effect = o => (o.mark_due ? this.t("markEffDue") : o.mark.kind === "keep" ? this.t("markEffKeep") : hides.get(keyOf(o)) ? this.t("markEffHides", { n: this.formatNumber(hides.get(keyOf(o))) }) : isQuiet(o) ? this.t("markEffQuiet", { n: this.formatNumber(quiet(o)) }) : this.t("markEffNone"));
    const sorts = [{ key: "name", label: "hidColObject", dir: "asc", get: o => o.name || o.object_id }, { key: "kind", label: "markKind", dir: "asc", get: o => this.t(`mark_${o.mark.kind}`) }, { key: "review", label: "markReview", dir: "asc", get: o => o.mark.until || "9999" }];
    const filters = [{ name: "kind", all: this.t("decAllMarks"), options: [["due", this.t("decReviewDueShort")], ...(list.some(isQuiet) ? [["quiet", this.t("markQuietFilter")]] : []), ...["expected_offline", "seasonal", "spare", "keep", "replaced"].filter(k => list.some(o => o.mark.kind === k)).map(k => [k, this.t(`mark_${k}`)])] }];
    const st = this.lvState("marks", "name", "asc");
    this.setExporter("marks", "marks", [this.t("hidColObject"), "ID", this.t("type"), this.t("markKind"), this.t("markReason"), this.t("markReview"), this.t("decColEffect")], () => refined.map(o => [o.name || o.object_id, o.object_id, this.t(o.object_type), this.t(`mark_${o.mark.kind}`), o.mark.reason || "", o.mark.until ? this.formatDate(o.mark.until) : "", effect(o)]));
    const bar = list.length >= 6 || st.q || Object.values(st.f).some(Boolean) ? this.listBar("marks", { sorts, filters }) : "";
    const sorted = this.refine("marks", list, { text: o => [o.name, o.object_id, o.mark.reason, this.t(`mark_${o.mark.kind}`)].join(" "), filters: { kind: (o, v) => (v === "due" ? Boolean(o.mark_due) : v === "quiet" ? isQuiet(o) : o.mark.kind === v) }, sorts, tie: o => keyOf(o) });
    const refined = [...sorted.filter(o => o.mark_due), ...sorted.filter(o => !o.mark_due && isQuiet(o)), ...sorted.filter(o => !o.mark_due && !isQuiet(o))];
    const pg = this.paginate("marks", refined);
    st.shown = refined.length;
    const row = o => {
      const key = keyOf(o);
      return `<div class="row${o.mark_due ? " duerow" : ""}">${this.tile(o.object_type, o.mark_due ? "warn" : "mute")}<span class="row-text"><button type="button" class="link strong" data-object="${this.esc(key)}">${this.esc(o.name || o.object_id)}</button><small>${this.esc(this.t(o.object_type))} · ${this.esc(this.markLine(o.mark))}</small></span><span class="pill ${o.mark_due || isQuiet(o) ? "warn" : "mute"}">${this.esc(effect(o))}</span><span class="rowacts"><button class="btn quiet" data-watch-mark="${this.esc(key)}"><ha-icon icon="${FSEL_ICONS.mark}"></ha-icon>${this.t("markChange")}</button><button class="btn quiet" data-mark-clear="${this.esc(key)}"><ha-icon icon="mdi:bookmark-remove-outline"></ha-icon>${this.t("markClear")}</button></span></div>`;
    };
    const body = refined.length ? pg.rows.map(row).join("") : `<div class="emptymsg">${list.length ? this.noMatches("marks") : `<ha-icon icon="mdi:bookmark-outline"></ha-icon>${this.t("decMarksNone")}`}</div>`;
    return `<section class="panel" id="hk-sec-marks"><div class="panelhead"><div><h2>${this.t("decMarksTitle")} (${this.formatNumber(list.length)})</h2><p>${this.t("decMarksHint")}</p></div></div>${bar}${body}${pg.footer}</section>`;
  }

  // Numbers only, no names, ids or attributes: safe to attach to an issue on GitHub.
  diagnosticsData() {
    const m = this.data?.meta || {}, count = (list, pick) => list.reduce((acc, x) => { const k = pick(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const { storage, database } = m;
    return {
      housekeeper: m.version, home_assistant: m.ha_version, scanned_at: m.scanned_at, preliminary: Boolean(m.preliminary),
      scan_interval_hours: m.scan_interval_hours, history_days: m.history_days, watch_hours: m.watch_hours, recorder_available: m.recorder_available,
      object_count: m.object_count, type_counts: m.type_counts, status_counts: m.status_counts, edge_count: (this.data?.edges || []).length,
      findings_by_rule: count(this.data?.findings || [], f => f.rule_id), findings_by_classification: count(this.data?.findings || [], f => f.classification),
      policies_on: this.policies ? this.policies.rules.filter(r => r.enabled).map(r => r.id) : null,
      storage: storage || null, database: database || null,
      hacs_housekeeper: m.hacs_housekeeper || null,
      panel: { language: this.lang, size: this.prefs?.size, mode: this.prefs?.mode, scheme: this.prefs?.scheme, page_size: this.pageSize },
      ai_access: { enabled: Boolean(m.mcp?.enabled), write: Boolean(m.mcp?.write), auto_off_hours: m.mcp?.auto_off_hours || 0 },
      browser: globalThis.navigator?.userAgent || null, recent_errors: this._recentErrors || [],
    };
  }

  // The few lines an issue needs, ready to paste: versions, browser or app, language and the last errors.
  issueText(ai = null) {
    const d = this.diagnosticsData();
    const mode = !d.ai_access.enabled ? "off" : d.ai_access.write ? "on, with changes" : "on, read-only";
    const aiLine = `**AI access:** ${mode}${ai ? `, ${ai.calls_24h} calls and ${ai.changes_24h} changes in 24 hours` : ""}\n`;
    const errors = d.recent_errors.length ? d.recent_errors.map(e => `- ${e.at} ${e.where}: ${e.message}`).join("\n") : "- none";
    return `**HA-Housekeeper:** ${d.housekeeper || "?"}\n**Home Assistant:** ${d.home_assistant || "?"}\n**Browser / app:** ${d.browser || "?"}\n**Language:** ${d.panel.language}\n${aiLine}**Recent panel errors:**\n${errors}\n`;
  }

  async copyIssueText() {
    let ai = null;
    try { ai = await this._hass.callWS({ type: "ha_housekeeper/mcp_audit", limit: 1 }); } catch (_) { /* the line is shorter without counts */ }
    try { await this.copyText(this.issueText(ai)); this.toast(this.t("diagCopied")); } catch (err) { this.failed(err); }
  }

  storedFiles(m) {
    const files = m.storage || {};
    const known = new Set(STORE_GROUPS.flatMap(([, names]) => names));
    const groups = STORE_GROUPS.map(([group, names]) => [group, names.filter(name => files[name])]);
    const other = Object.keys(files).filter(name => !known.has(name)).sort();
    if (other.length) groups.push(["other", other]);
    const all = Object.values(files);
    if (!all.length) return `<p class="factnote">${this.t("storeNone")}</p>`;
    const total = all.reduce((sum, item) => sum + (item.bytes || 0), 0);
    const items = groups.flatMap(([group, names]) => names.map(name => ({ name, group, ...files[name] })));
    const title = f => (this.t(`store_${f.name}`) === `store_${f.name}` ? f.name : this.t(`store_${f.name}`));
    const text = f => (this.t(`storeText_${f.name}`) === `storeText_${f.name}` ? "" : this.t(`storeText_${f.name}`, { days: m.history_days ?? 30 }));
    const groupName = f => this.t(`storeGroup_${f.group}`);
    const facts = `<div class="facts"><div class="fact"><span>${this.t("storeTotal")}</span><b>${this.formatBytes(total)}</b></div><div class="fact"><span>${this.t("storeCount")}</span><b>${this.formatNumber(all.length)}</b></div></div>`;
    const table = this.sysList("storedfiles", items, {
      sort: "group", dir: "asc", cls: "sto", tie: f => f.name, exportName: "stored-files",
      sorts: [{ key: "group", label: "stoColGroup", dir: "asc", get: f => groups.findIndex(([g]) => g === f.group) }, { key: "name", label: "stoColFile", dir: "asc", get: title }, { key: "size", label: "stoColSize", dir: "desc", get: f => f.bytes || 0 }, { key: "changed", label: "stoColChanged", dir: "desc", get: f => f.changed || 0 }],
      text: f => [title(f), f.name, text(f), groupName(f)].join(" "),
      filters: [{ name: "group", all: this.t("stoAllGroups"), options: groups.filter(([, n]) => n.length).map(([g]) => [g, this.t(`storeGroup_${g}`)]) }],
      filterFns: { group: (f, v) => f.group === v },
      columns: [
        { key: "name", label: "stoColFile", dir: "asc", cell: f => `<strong>${this.esc(title(f))}</strong>${text(f) ? `<small>${text(f)}</small>` : ""}` },
        { key: "group", label: "stoColGroup", dir: "asc", cell: f => this.esc(groupName(f)) },
        { key: "size", label: "stoColSize", dir: "desc", cell: f => this.formatBytes(f.bytes || 0) },
        { key: "changed", label: "stoColChanged", dir: "desc", cell: f => (f.changed ? this.esc(this.formatDate(new Date(f.changed * 1000).toISOString())) : "–") },
      ],
      header: [this.t("stoColFile"), "ID", this.t("stoColGroup"), this.t("stoColSize"), this.t("stoColChanged")], rows: f => [title(f), f.name, groupName(f), f.bytes || 0, f.changed ? new Date(f.changed * 1000).toISOString() : ""],
    });
    return facts + table;
  }

  housekeeperUpdateCard() {
    const m = this.data?.meta || {}, h = m.hacs_housekeeper;
    const fact = (label, value) => `<div class="fact"><span>${this.t(label)}</span><b>${this.esc(value || "–")}</b></div>`;
    const sameVersion = (left, right) => Boolean(left && right && String(left).replace(/^v/i, "") === String(right).replace(/^v/i, ""));
    const newerVersion = (candidate, current) => {
      const parts = value => /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i.exec(String(value || ""))?.slice(1, 4).map(Number);
      const a = parts(candidate), b = parts(current);
      if (!a || !b) return false;
      return a.some((value, index) => value !== b[index] && a.slice(0, index).every((before, at) => before === b[at]) && value > b[index]);
    };
    let tone = "mute", title = "hkUpdateUnknown", hint = "hkUpdateUnknownHint";
    if (!m.hacs_available) [title, hint] = ["hkUpdateNoHacs", "hkUpdateNoHacsHint"];
    else if (!h) [title, hint] = ["hkUpdateUntracked", "hkUpdateUntrackedHint"];
    else if (h.installed_kind === "commit" && h.available_version) [tone, title, hint] = ["warn", "hkUpdateCommit", "hkUpdateCommitHint"];
    else if (h.blocked) [tone, title, hint] = ["warn", "hkUpdateBlocked", "hkUpdateBlockedHint"];
    else if (h.pending_update || newerVersion(h.available_version, m.version)) [tone, title, hint] = ["warn", "hkUpdateAvailable", "hkUpdateAvailableHint"];
    else if (m.version && h.installed_version && !sameVersion(m.version, h.installed_version)) [tone, title, hint] = ["warn", "hkUpdateMismatch", "hkUpdateMismatchHint"];
    else if (sameVersion(m.version, h.available_version)) [tone, title, hint] = ["ok", "hkUpdateCurrent", "hkUpdateCurrentHint"];
    const facts = [fact("hkUpdateLoaded", m.version), h ? fact("hkUpdateHacsInstalled", h.installed_version) : "", h ? fact("hkUpdateLatest", h.available_version) : "", h?.last_fetched ? fact("hkUpdateChecked", this.formatDate(h.last_fetched)) : ""].join("");
    const open = h?.id ? `<button class="btn" data-ha-path="${this.esc(`/hacs/repository/${encodeURIComponent(h.id)}`)}"><ha-icon icon="mdi:open-in-new"></ha-icon>${this.t("intHacsOpen")}</button>` : "";
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("hkUpdateTitle")}</h2><p>${this.t("hkUpdateHint")}</p></div>${open}</div><div class="facts">${facts}</div><div class="row"><span class="tile ${tone}"><ha-icon icon="${tone === "ok" ? "mdi:check-circle-outline" : tone === "warn" ? "mdi:alert-outline" : "mdi:information-outline"}"></ha-icon></span><span class="row-text"><strong>${this.t(title)}</strong><small>${this.t(hint)}</small></span></div></section>`;
  }

  infoCard() {
    const m = this.data?.meta || {};
    const fact = (k, v) => `<div class="fact"><span>${k}</span><b>${v}</b></div>`;
    const facts = [fact(this.t("version"), this.esc(m.version || "–")), fact(this.t("haVersion"), this.esc(m.ha_version || "–")),
      fact(this.t("lastScan"), m.scanned_at ? this.formatDate(m.scanned_at) : "–"), fact(this.t("objects"), this.formatNumber(m.object_count ?? 0))].join("");
    const link = (icon, href, label, hint) => `<a class="row" href="${href}" target="_blank" rel="noopener noreferrer"><span class="tile mute"><ha-icon icon="${icon}"></ha-icon></span><span class="row-text"><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ""}</span><ha-icon icon="mdi:open-in-new"></ha-icon></a>`;
    const kept = this.storedFiles(m);
    return `<div class="stack"><section class="panel"><div class="panelhead"><h2>${this.t("about")}</h2></div><div class="aboutintro"><p>${this.t("aboutIntro")}</p><p><strong>${this.t("aboutIntroSafe")}</strong> ${this.t("aboutIntroPlan")}</p></div><div class="facts">${facts}</div></section>${this.housekeeperUpdateCard()}
      ${this.scanCoverageCard()}${this.scanTimingCard()}
      <section class="panel"><div class="panelhead"><div><h2>${this.t("setKeptTitle")}</h2><p>${this.t("setKeptHint")} ${this.t("storeHintBytes")}</p></div></div>${kept}<p class="factnote">${this.t("setPrivacy")}</p></section>
      <section class="panel"><div class="panelhead"><h2>${this.t("setLinks")}</h2></div>${link("mdi:github", REPO_URL, this.t("repository"), "")}${link("mdi:bug-outline", `${REPO_URL}/issues`, this.t("reportIssue"), "")}${link("mdi:history", `${REPO_URL}/blob/main/CHANGELOG.md`, this.t("changelog"), "")}
        <button class="row" data-diagnostics><span class="tile mute"><ha-icon icon="mdi:stethoscope"></ha-icon></span><span class="row-text"><strong>${this.t("diagDownload")}</strong><small>${this.t("diagHint")}</small></span><ha-icon icon="mdi:download"></ha-icon></button>
        <button class="row" data-diag-copy><span class="tile mute"><ha-icon icon="mdi:content-copy"></ha-icon></span><span class="row-text"><strong>${this.t("diagCopy")}</strong><small>${this.t("diagCopyHint")}</small></span></button></section></div>`;
  }

  // The one thing Housekeeper does on its own: tell about a new broken reference. Off until switched on.
  notifyCard() {
    const on = Boolean(this.data?.meta?.notify);
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("notifyTitle")}</h2><p>${this.t("notifyHint")}</p></div></div><div class="row"><span class="tile ${on ? "ok" : "mute"}"><ha-icon icon="mdi:bell-outline"></ha-icon></span><span class="row-text"><strong>${this.t("notifyLabel")}</strong><small>${this.t("notifyDetail")}</small></span><input class="policyswitch" type="checkbox" role="switch" aria-label="${this.esc(this.t("notifyLabel"))}" data-notify ${on ? "checked" : ""}></div></section>`;
  }

  settingsView() {
    const tabs = this.settingsTabs();
    const tab = tabs.some(([id]) => id === this.settingsTab) ? this.settingsTab : "protection";
    const tiles = tabs.map(([id, icon, label, hint, pill, tone]) => `<button class="taskcard t-${[].concat(pill || []).length ? tone || "mute" : "ac"}${id === tab ? " on" : ""}" id="hk-set-${id}" aria-pressed="${id === tab}" aria-controls="hk-setpanel" data-set-tab="${id}"><ha-icon icon="${icon}"></ha-icon><strong>${this.t(label)}</strong><span class="setpill">${[].concat(pill || []).map(p => `<span class="pill ${p.tone || tone || "mute"}">${this.esc(p.text ?? p)}</span>`).join("")}</span><small>${this.t(hint)}</small></button>`).join("");
    const body = { look: () => `<div class="grid2">${this.lookCard()}<div class="stack">${this.readabilityCard()}${this.behaviorCard()}</div></div>`, protection: () => this.protectionCard(), exceptions: () => this.excCard(), scan: () => `${this.scanCard()}${this.notifyCard()}${this.eventsCard()}`, mcp: () => this.mcpCard(), info: () => this.infoCard() }[tab]();
    return `${this.settingsBand()}<div class="taskgrid compactgrid setgrid setgrid3" role="group" aria-label="${this.esc(this.t("settings"))}">${tiles}</div><div id="hk-setpanel">${body}</div>`;
  }

  // "168 h" read as "= 7 days": only where the unit is minutes or hours and the number is large enough to say more.
  optConversion(unit, value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const round = x => this.formatNumber(Math.round(x * 10) / 10);
    if (unit === "unitMinutes" && n >= 60) return this.t("optConvHours", { n: round(n / 60) });
    if (unit === "unitHours" && n >= 24) return n === 24 ? this.t("optConvDay") : this.t("optConvDays", { n: round(n / 24) });
    return "";
  }

  async saveOptions() {
    const changes = {};
    for (const input of this.shadowRoot.querySelectorAll("[data-opt]")) {
      const [min, max] = OPTION_LIMITS[input.dataset.opt], value = Number(input.value);
      if (input.value === "" || !Number.isInteger(value) || value < min || value > max) { this.optionsMessage = this.t("optionsInvalid"); this.render(); return; }
      changes[input.dataset.opt] = value;
    }
    const steps = [changes.outage_info_minutes / 60, changes.outage_low_hours, changes.outage_medium_hours, changes.outage_high_hours];
    if (steps.every(Number.isFinite) && !steps.every((x, i) => i === 0 || steps[i - 1] < x)) { this.optionsMessage = this.t("optionsOrder"); this.render(); return; }
    try {
      await this._hass.callWS({ type: "ha_housekeeper/set_options", ...changes });
      this.optionsMessage = this.t("optionsSaved");
      this.data = null; // the integration reloads; fetch again once it is back
      this.render();
      setTimeout(() => { this.optionsMessage = ""; this.busy = false; this.load(false); }, 4000);
    } catch (err) { this.optionsMessage = err?.code === "busy" ? this.t("optionsBusy") : err?.code === "thresholds_order" ? this.t("optionsOrder") : this.errText(err); this.render(); }
  }
}
