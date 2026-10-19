// DiagnosisMixin: methods of the panel element, mixed into the class in 99-register.js.
class DiagnosisMixin {
  relTime(value) {
    if (!value) return "";
    const diff = (Date.now() - new Date(value).getTime()) / 1000;
    if (!(diff >= 0)) return "";
    const rtf = new Intl.RelativeTimeFormat(this.lang, { numeric: "auto" });
    for (const [unit, secs] of [["day", 86400], ["hour", 3600], ["minute", 60]]) {
      if (diff >= secs) return rtf.format(-Math.floor(diff / secs), unit);
    }
    return rtf.format(0, "second");
  }

  integrationCheck(entryId) {
    const entry = this.findObject(`config_entry:${entryId}`), label = this.t("integration");
    if (!entry) return { row: this.check(label, "red", entryId, this.t("missing")), entry };
    if (entry.disabled_by) return { row: this.check(label, "mute", entry.name, this.t("disabled"), this.objectKey(entry)), entry };
    const state = entry.state || "not_loaded";
    const tone = state === "loaded" ? "ok" : ["setup_error", "migration_error", "failed_unload"].includes(state) ? "red" : "warn";
    return { row: this.check(label, tone, entry.name, this.t(`cs_${state}`), this.objectKey(entry)), entry, broken: state !== "loaded", state };
  }

  // Builds the check list and the plain-language cause for one object. Returns null when nothing is worth explaining.
  diagnose(item) {
    const t = (k, v) => this.t(k, v);
    const rows = [];
    let cause = "", hint = "", tone = this.tone(item.status);
    if (tone === "blue") tone = "ok";

    if (item.object_type === "entity") {
      const integ = item.config_entry_id ? this.integrationCheck(item.config_entry_id) : null;
      if (integ) rows.push(integ.row);
      const device = item.device_id ? this.findObject(`device:${item.device_id}`) : null;
      if (item.device_id) {
        rows.push(!device ? this.check(t("device"), "red", item.device_id, t("missing"))
          : device.status === "disabled" ? this.check(t("device"), "mute", device.name, t("disabled"), this.objectKey(device))
          : this.check(t("device"), "ok", device.name, t("active"), this.objectKey(device)));
      }
      if (item.disabled_by) rows.push(this.check(t("entity"), "mute", t("entity_disabled"), t("disabled")));
      const state = item.state;
      if (state === null || state === undefined) {
        rows.push(this.check(t("runtimeState"), item.disabled_by ? "mute" : "red", t("noState"), item.disabled_by ? t("notExpected") : t("missing")));
      } else if (state === "unavailable") rows.push(this.check(t("runtimeState"), "red", state, t("unavailable")));
      else if (state === "unknown") rows.push(this.check(t("runtimeState"), "violet", state, t("unknown")));
      else rows.push(this.check(t("runtimeState"), "ok", item.unit ? `${state} ${item.unit}` : state, t("available")));

      const stable = this.stabilityOf(item);
      if (stable?.info) {
        const flap = stable.info.level === "flapping";
        rows.push(this.check(t("stability"), flap ? "red" : "warn", this.unstableLines(stable.info, stable.r.window_days)[0], t(flap ? "relFlapping" : "relUnstable")));
      }
      const broken = integ?.broken ? { state: t(`cs_${integ.state}`) } : null;
      const logged = ["unavailable", null, undefined].includes(item.state) && !item.disabled_by ? this.data.objects.find(o => o.object_type === "config_entry" && o.object_id === item.config_entry_id)?.log : null;
      if (logged) rows.push(this.check(t("logTitle"), logged.level === "warning" ? "warn" : "red", this.logLine(logged), ""));
      switch (item.reason) {
        case "state_available": cause = t("cause_ok"); break;
        case "entity_disabled": case "device_disabled": case "integration_disabled": case "device_missing": case "config_entry_missing": case "not_provided":
          cause = t(`cause_${item.reason}`); break;
        case "state_missing": cause = broken ? t("cause_state_missing_integration", broken) : t("cause_state_missing"); break;
        case "state_unavailable": cause = broken ? t("cause_state_unavailable_integration", broken) : t("cause_state_unavailable"); break;
        case "state_unknown": cause = t("cause_state_unknown"); break;
        default: cause = item.reason ? t(item.reason) : "";
      }
      const brokenMembers = this.data.findings.filter(f => f.rule_id === "entity.missing_member" && f.object_id === item.object_id);
      brokenMembers.forEach(f => rows.push(this.check(t("missing_member"), "red", f.affected_object, t("missing"))));
      if (item.duplicate_of) {
        rows.push(this.check(t("duplicateTwin"), "violet", item.duplicate_of, t("possible_duplicate"), `entity:${item.duplicate_of}`));
        cause = `${t("cause_duplicate", { twin: item.duplicate_of })} ${cause}`;
      }
      if (item.reason === "state_unavailable") hint = broken ? t("hint_integration") : t("hint_state_unavailable");
      else if (item.reason === "state_unknown") hint = t("hint_state_unknown");
      else if (item.reason === "state_missing" && broken) hint = t("hint_integration");
      else if (["state_missing", "not_provided", "device_missing", "config_entry_missing"].includes(item.reason)) hint = t("hint_orphan");
      if (item.duplicate_of) hint = t("hint_duplicate");
      if (stable?.info) {
        cause = `${t("cause_unstable", { level: t(stable.info.level === "flapping" ? "relFlapping" : "relUnstable") })} ${cause}`;
        if (tone === "ok") tone = stable.info.level === "flapping" ? "red" : "warn";
        if (!hint) hint = t("hint_unstable");
      }
      if (brokenMembers.length) {
        cause = `${t("cause_group_broken", { count: brokenMembers.length })} ${cause}`;
        hint = t("hint_group_broken");
        tone = "red";
      }
    } else if (item.object_type === "device") {
      const ids = item.config_entry_ids || [];
      ids.forEach(id => rows.push(this.integrationCheck(id).row));
      const downFinding = this.data.findings.find(f => f.rule_id === "device.down" && f.object_id === item.object_id && !f.ignored), down = !!downFinding;
      // A device in standby: its entities lost their values (unknown) rather than being unavailable.
      const standby = downFinding?.evidence?.[0]?.kind === "all_entities_without_value";
      rows.push(down ? this.check(t("entities"), "red", t(standby ? "devAllNoValue" : "devAllDown", { n: this.formatNumber(item.entity_count) }), t(standby ? "noValue" : "unavailable"))
        : this.check(t("entities"), item.entity_count ? "ok" : "warn", this.formatNumber(item.entity_count), item.entity_count ? t("present") : t("empty")));
      const downSince = down ? this.data.findings.find(f => f.rule_id === "device.down" && f.object_id === item.object_id)?.first_detected_at : null;
      if (down) {
        cause = t(standby ? "cause_device_novalue" : "cause_device_unavailable", { n: this.formatNumber(item.entity_count), span: downSince ? this.spanText(Math.max(0, (Date.now() - Date.parse(downSince)) / 3600000)) : "?" });
        hint = t(standby ? "hint_device_novalue" : "hint_device_unavailable");
        tone = "red";
      } else cause = item.status === "disabled" ? t("cause_device_off") : item.status === "empty" ? t("cause_device_empty") : t("cause_device_active");
    } else if (item.object_type === "config_entry") {
      const state = item.state || "not_loaded";
      if (item.disabled_by) { rows.push(this.check(t("status"), "mute", item.name, t("disabled"))); cause = t("cause_entry_off"); }
      else if (item.source === "ignore") { rows.push(this.check(t("status"), "mute", item.name, t("ignored"))); cause = t("cause_entry_ignored"); hint = t("hint_entry_ignored"); tone = "ok"; }
      else if (item.reauth) { rows.push(this.check(t("status"), "red", item.name, t("entryReauth"))); cause = t("cause_entry_reauth"); hint = t("hint_entry_reauth"); }
      else if (state === "loaded") { rows.push(this.check(t("status"), "ok", item.name, t("cs_loaded"))); cause = t("cause_entry_ok"); }
      else {
        rows.push(this.check(t("status"), tone, item.name, t(`cs_${state}`)));
        if (item.error) rows.push(this.check(t("entryError"), tone, item.error, ""));
        cause = t(item.error ? "cause_entry_problem_error" : "cause_entry_problem", { state: t(`cs_${state}`), error: item.error || "" }); hint = t("hint_integration");
      }
      const helperBroken = this.data.findings.filter(f => f.rule_id === "config_entry.missing_entity" && f.object_id === item.object_id);
      helperBroken.forEach(f => rows.push(this.check(t("missing_entity"), "red", [f.affected_object, this.placeText(f)].filter(Boolean).join(" · "), t("missing"), null, this.suggestHtml(f))));
      if (helperBroken.length) { cause = t("cause_helper_broken", { count: helperBroken.length }); hint = t("hint_helper_broken"); tone = "red"; }
    } else if (["automation", "script", "scene", "dashboard"].includes(item.object_type)) {
      const key = this.objectKey(item);
      const broken = this.data.findings.filter(f => this.findingKey(f) === key && f.rule_id.includes(".missing_"));
      const grouped = this.groupBroken(broken);
      grouped.forEach(g => rows.push(g.members ? this.brokenGroupRow(g) : this.check(t(g.rule_id.split(".")[1]), "red", [g.affected_object, this.placeText(g)].filter(Boolean).join(" · "), t("missing"), null, this.suggestHtml(g))));
      if (item.object_type === "automation" && item.status === "disabled") rows.push(this.check(t("status"), "mute", t("automationOff"), t("disabled")));
      if (!broken.length) rows.push(this.check(t("dependencies"), "ok", t("refsResolved"), t("present")));
      const unused = item.object_type === "automation" ? this.data.findings.find(f => this.findingKey(f) === key && f.classification === "unused") : null;
      if (item.object_type === "automation") {
        rows.push(this.check(t("lastTriggered"), unused ? "warn" : "ok", item.last_triggered ? this.formatDate(item.last_triggered) : t("never"), unused ? t("unused") : t("available")));
      }
      const runRow = this.runsRow(item), runWarn = (runRow?.findings || []).filter(f => f.level !== "info");
      runWarn.forEach(f => rows.push(this.check(t("knownRuns"), f.level, this.runFindingText(f).replace(/<[^>]+>/g, ""), t((RUN_FINDINGS[f.kind] || ["rfLabelFailing"])[0]))));
      const gone = [...new Set(broken.map(f => f.affected_object).filter(Boolean))];
      cause = broken.length ? (gone.length === 1 ? t("cause_broken_one", { name: item.name || item.object_id, target: gone[0] }) : t("cause_automation_broken", { count: broken.length })) : unused ? t(`cause_${unused.rule_id.split(".")[1]}`, { days: unused.evidence?.[0]?.days ?? "" }) : runWarn.length ? this.runFindingText(runWarn[0]).replace(/<[^>]+>/g, "") : t("cause_automation_ok");
      if (runWarn.length && !broken.length && !unused) { hint = t(`rfHint_${runWarn[0].kind}`); tone = "warn"; }
      if (unused && !broken.length) { hint = t("hint_unused"); tone = "warn"; }
      if (broken.length) { hint = t("hint_automation_broken"); tone = "red"; }
      const orphan = grouped.find(g => g.members && this.isOrphan(g.members[0].evidence[0].place));
      if (orphan) { const p = orphan.members[0].evidence[0].place; hint = t("brokenOrphanHint", { card: p.card, view: p.view ?? "", missing: p.card_missing, total: p.card_refs }); }
    } else return null;
    return { rows, cause, hint, tone };
  }

  diagnosisCard(item) {
    const d = this.diagnose(item);
    if (!d) return "";
    const icon = { ok: "mdi:check-circle", warn: "mdi:alert-circle", red: "mdi:close-circle", mute: "mdi:minus-circle", violet: "mdi:help-circle" };
    const rows = d.rows.map(r => `<div class="check ${r.tone}"><ha-icon icon="${icon[r.tone] || icon.ok}"></ha-icon><b>${this.esc(r.label)}</b>${r.link && this.findObject(r.link) ? `<button type="button" class="linkbtn val" data-object="${this.esc(r.link)}">${this.esc(r.value)}</button>` : `<span class="val">${this.esc(r.value)}${r.extra ? ` · ${r.extra}` : ""}</span>`}<i class="pill ${r.tone}">${this.esc(r.badge)}</i></div>`).join("");
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("diagnosis")}</h2></div></div>
      <div class="diagcard">${this.ratingBlock(item, this.objectKey(item))}<div class="checks">${rows}</div>
      ${d.cause ? `<div class="cause ${d.tone}"><ha-icon icon="mdi:text-search"></ha-icon><div><strong>${this.t("causeLabel")}</strong><p>${this.esc(d.cause)}</p></div></div>` : ""}
      ${d.hint ? `<div class="hintbox"><ha-icon icon="mdi:lightbulb-on-outline"></ha-icon><div><strong>${this.t("hintLabel")}</strong><p>${this.esc(d.hint)}</p></div></div>` : ""}</div></section>`;
  }

  // Read-only what-if: which automations would lose a reference if this object (and what it owns) were removed.
  impact(item, key) {
    if (["automation", "script", "scene", "dashboard"].includes(item.object_type)) return null;
    const OWNED = ["PROVIDES", "OWNS"], USAGE = USAGE_RELATIONS;
    const scope = new Set([key]);
    for (const member of scope) { // grows while iterating: what the object owns, and what that owns
      for (const e of this.edgesFrom(member)) if (OWNED.includes(e.relation)) scope.add(e.target);
    }
    const { order } = this.edgeIndex();
    const byAutomation = new Map();
    const used = [];
    for (const member of scope) used.push(...this.edgesTo(member));
    used.sort((a, b) => order.get(a) - order.get(b)); // the order of the edges as scanned
    for (const e of used) {
      if (!USAGE.includes(e.relation) || !scope.has(e.target) || scope.has(e.source) || !(/^(automation|script|scene|dashboard|config_entry):/.test(e.source) || e.relation === "INCLUDES")) continue;
      const hit = byAutomation.get(e.source) || { key: e.source, certain: false, places: [] };
      if (e.confidence === "certain") hit.certain = true;
      if (e.location && e.location !== "runtime_extraction") hit.places.push(e.location);
      byAutomation.set(e.source, hit);
    }
    const hits = [...byAutomation.values()].sort((a, b) => Number(b.certain) - Number(a.certain));
    const certain = hits.filter(h => h.certain).length;
    const tone = certain ? "red" : hits.length ? "warn" : "ok";
    return { hits, certain, probable: hits.length - certain, tone, related: scope.size - 1 };
  }

  impactCard(item, key) {
    const m = this.impact(item, key);
    if (!m) return "";
    const title = m.certain ? "impactCertain" : m.hits.length ? "impactProbable" : "impactNone";
    const text = m.certain ? this.t("impactCertainText", { count: m.certain }) : m.hits.length ? this.t("impactProbableText", { count: m.probable }) : this.t("impactNoneText");
    const icon = { ok: "mdi:check-circle", warn: "mdi:alert-circle", red: "mdi:alert-octagon" }[m.tone];
    const hitRows = m.hits.map(h => {
      const obj = this.findObject(h.key);
      const note = `${this.t(h.certain ? "certain" : "probable")}${h.places.length ? ` · ${h.places.slice(0, 2).join(", ")}` : ""}`;
      return `<button class="row rel" data-object="${this.esc(h.key)}">${this.tile(h.key.split(":")[0], h.certain ? "red" : "warn")}<span class="row-text"><strong>${this.esc(obj?.name || h.key.split(":").slice(1).join(":"))}</strong><small>${this.esc(note)}</small></span>${obj ? this.pill(obj.status) : ""}</button>`;
    });
    const hitPage = this.paginate(`impact-${key}`, hitRows), rows = hitPage.rows.join("") + hitPage.footer;
    return `<section class="panel"><div class="panelhead"><div><h2>${this.t("impactTitle")}</h2><p>${this.t("impactSubtitle")}</p></div></div>
      <div class="diagcard"><div class="cause ${m.tone}"><ha-icon icon="${icon}"></ha-icon><div><strong>${this.t(title)}</strong><p>${this.esc(text)}</p></div></div></div>${rows}
      ${item.object_type === "entity" && item.has_statistics ? `<p class="factnote">${this.t("statsNote")}</p>` : ""}
      <p class="factnote">${m.related ? this.t("impactScope", { count: m.related }) : this.t("impactScopeOne")} ${this.t("impactLimits")}</p></section>`;
  }

  // The newest long-term row of an entity, asked once per entity when its details open.
  ensureStatLast(id) {
    const asked = (this._statLastAsked ||= new Set());
    if (asked.has(id)) return;
    asked.add(id);
    setTimeout(async () => {
      try {
        const r = await this._hass.callWS({ type: "ha_housekeeper/statistics_last", ids: [id] });
        if (r?.busy) { asked.delete(id); return; }
        (this.statLast ||= {})[id] = r?.last?.[id] ?? 0; (this.statSpan ||= {})[id] = { first: r?.first?.[id] ?? 0, rows: r?.rows?.[id] ?? 0 };
      } catch (_) { return; }
      if (this.selected?.object_id === id) this.render();
    }, 0);
  }

  factsCard(item, key) {
    const finding = this.data.findings.find(f => this.findingKey(f) === key);
    const info = this.data.meta.outage_info_minutes || 0;
    const facts = [];
    if (item.status_since) facts.push([this.t("since"), `${this.formatDate(item.status_since)}<small>${this.esc(this.relTime(item.status_since))} · ${this.t("firstSeenNote")}</small>`]);
    if (["entity", "automation", "script", "scene", "dashboard"].includes(item.object_type)) {
      facts.push([this.t("finding"), finding ? `${this.pill(finding.classification)}<small>${this.t("certainty")}: ${Math.round(finding.confidence * 100)} %</small>` : this.t("noFinding")]);
    }
    const quarantined = ["entity", "device"].includes(item.object_type) ? this.quarantineOf(item.object_id) : null;
    if (quarantined) facts.push([this.t("quarantine"), `${this.t("quarantineFact", { date: this.formatDate(quarantined.since), days: this.daysSince(quarantined.since) })}<span class="factaction">${this.releaseControl(quarantined)}</span>`]);
    const outage = finding && OUTAGE_RULES.includes(finding.rule_id) ? this.outageLineOf(finding) : "";
    if (outage) facts.push([this.t("chip_outage"), this.esc(outage)]);
    const note = item.status === "unavailable" && !finding && info > 0 ? `<p class="factnote">${this.t("belowThreshold", { span: `${info} ${this.t("unitMin")}` })}</p>` : "";
    return `<section class="panel"><div class="panelhead"><h2>${this.t("facts")}</h2></div><div class="facts">${facts.map(([k, v]) => `<div class="fact"><span>${k}</span><b>${v}</b></div>`).join("")}</div>${note}</section>`;
  }

  // One row per object and kind of relation: a blueprint automation names the same entity at many
  // places, and a list with a row for each of them reads like that many different dependencies.
  mergePlaces(list) {
    const rows = new Map();
    for (const x of list) {
      const place = x.edge.location && x.edge.location !== "runtime_extraction" ? x.edge.location : "";
      const known = rows.get(`${x.other}|${x.label}`);
      if (known) known.places.push(place); else rows.set(`${x.other}|${x.label}`, { ...x, places: [place] });
    }
    return [...rows.values()];
  }

  relationsCard(key) {
    const USAGE = USAGE_RELATIONS;
    const incoming = this.edgesTo(key), outgoing = this.edgesFrom(key);
    const groups = [
      [this.t("origin"), incoming.filter(e => !USAGE.includes(e.relation)).map(e => ({ other: e.source, label: this.t(e.relation), edge: e }))],
      [this.t("usage"), [
        ...incoming.filter(e => USAGE.includes(e.relation)).map(e => ({ other: e.source, label: `${this.t("usedBy")} · ${this.t(e.relation)}`, edge: e })),
        ...outgoing.map(e => ({ other: e.target, label: this.t(e.relation), edge: e })),
      ]],
    ].map(([title, list]) => [title, this.mergePlaces(list)]).filter(([, list]) => list.length);
    // A target without an inventory object is missing only where a finding says so; helpers and
    // built-in entities such as sun.sun exist without a registry entry.
    const gone = new Set((this.data.findings || []).filter(f => f.classification === "broken_reference").map(f => f.affected_object));
    const items = groups.flatMap(([title, list], i) => list.map(x => ({ ...x, group: i ? "usage" : "origin", groupName: title })));
    const nameOf = x => this.findObject(x.other)?.name || x.other.split(":").slice(1).join(":");
    const typeOf = x => this.findObject(x.other)?.object_type || x.other.split(":")[0];
    const note = x => (x.places.length > 1 ? `${x.label} · ${this.t("relPlaces", { n: x.places.length })}` : `${x.label}${x.places[0] ? ` · ${x.places[0]}` : ""}`);
    const goneLabel = x => (gone.has(x.other.split(":").slice(1).join(":")) ? this.t("missing") : this.t("notInInventory"));
    const table = items.length ? this.sysList("relations", items, {
      sort: "name", dir: "asc", cls: "rel", tie: x => `${x.other}|${x.label}`, exportName: "relations",
      sorts: [{ key: "name", label: "relColObject", dir: "asc", get: nameOf }, { key: "type", label: "relColType", dir: "asc", get: typeOf }, { key: "relation", label: "relColRelation", dir: "asc", get: x => x.label }],
      text: x => `${nameOf(x)} ${x.other} ${x.label}`,
      filters: [{ name: "group", all: this.t("relAllGroups"), options: [["origin", this.t("origin")], ["usage", this.t("usage")]] }],
      filterFns: { group: (x, v) => x.group === v },
      rowAttrs: x => (this.findObject(x.other) ? `data-object="${this.esc(x.other)}" tabindex="0" role="button" aria-label="${this.esc(nameOf(x))}"${x.places.length > 1 ? ` title="${this.esc(x.places.filter(Boolean).join("\n"))}"` : ""}` : 'class="static"'),
      columns: [
        { key: "name", label: "relColObject", dir: "asc", cell: x => { const obj = this.findObject(x.other); return `<div class="statcell">${this.tile(typeOf(x), obj ? (this.tone(obj.status) === "ok" ? "" : this.tone(obj.status)) : gone.has(x.other.split(":").slice(1).join(":")) ? "red" : "")}<div>${this.nameCell(nameOf(x), x.other)}</div></div>`; } },
        { key: "type", label: "relColType", dir: "asc", cell: x => this.esc(this.t(typeOf(x))) },
        { key: "relation", label: "relColRelation", dir: "asc", cell: x => this.esc(note(x)) },
        { key: "group", label: "relColKind", sortable: false, cell: x => this.esc(x.groupName) },
        { key: "status", label: "relColStatus", sortable: false, cell: x => { const obj = this.findObject(x.other); return obj ? this.pill(obj.status) : `<span class="pill ${gone.has(x.other.split(":").slice(1).join(":")) ? "red" : ""}">${this.esc(goneLabel(x))}</span>`; } },
      ],
      header: [this.t("relColObject"), "ID", this.t("relColType"), this.t("relColRelation"), this.t("relColKind")], rows: x => [nameOf(x), x.other, this.t(typeOf(x)), note(x), x.groupName],
    }) : "";
    return `<section class="panel"><div class="panelhead"><h2>${this.t("relations")} (${incoming.length + outgoing.length})</h2></div>${table || `<p class="factnote">${this.t("noRelations")}</p>`}</section>`;
  }

  entrySourceLabel(source) {
    const known = ["user", "import", "ignore", "system", "reauth", "reconfigure"];
    return known.includes(source) ? this.t(`src_${source}`) : this.t("src_discovery", { source });
  }

  // Everything that says which integration an entry belongs to and where it comes from.
  integrationCard(item) {
    if (item.object_type !== "config_entry") return "";
    const state = item.state || "not_loaded";
    const path = this.haPath(item);
    const origin = item.custom ? this.t("originCustom", { path: item.integration_dir || item.domain, version: item.integration_version ? ` · v${item.integration_version}` : "" }) : this.t("originBuiltIn");
    const link = (href, text) => `<a href="${this.esc(href)}" target="_blank" rel="noopener noreferrer">${this.esc(text)}</a>`;
    const rows = [
      [this.t("integrationName"), `${this.esc(item.integration_name || item.domain)} <small>(${this.esc(item.domain)})</small>`],
      [this.t("origin"), this.esc(origin)],
      [this.t("entrySource"), `${this.esc(this.entrySourceLabel(item.source))} <small>(${this.esc(item.source)})</small>`],
      [this.t("status"), `${this.esc(item.disabled_by ? this.t("disabled") : this.t(`cs_${state}`))}${item.disabled_by ? ` <small>(${this.esc(item.disabled_by)})</small>` : ""}`],
      item.error ? [this.t("entryError"), this.esc(item.error)] : null,
      [this.t("entryEntities"), this.formatNumber(item.entity_count ?? 0)],
      [this.t("entryDevices"), this.formatNumber(item.device_count ?? 0)],
      [this.t("entryId"), `<code>${this.esc(item.object_id)}</code>`],
      item.unique_id ? [this.t("entryUniqueId"), `<code>${this.esc(item.unique_id)}</code>`] : null,
      item.created_at ? [this.t("entryCreated"), this.esc(this.formatDate(item.created_at))] : null,
      item.modified_at ? [this.t("entryModified"), this.esc(this.formatDate(item.modified_at))] : null,
      path ? [this.t("entryHaPath"), `<code>${this.esc(path)}</code>`] : null,
      item.documentation ? [this.t("entryDocs"), link(item.documentation, item.documentation)] : null,
    ].filter(Boolean);
    return `<section class="panel"><div class="panelhead"><h2>${this.t("integrationCard")}</h2></div><div class="pad"><dl class="kv">${rows.map(([k, v]) => `<dt>${this.esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></div></section>`;
  }

  // The always-visible summary under the title: status, cause, since when, integration, device, area, risk.
  detailSummary(item, key) {
    if (item.object_type === "integration") return this.intSummary(item);
    const device = item.device_id ? this.findObject(`device:${item.device_id}`) : null;
    const areaId = item.area_id || device?.area_id, area = areaId ? this.findObject(`area:${areaId}`) : null;
    const integration = item.object_type === "entity" ? item.platform : item.object_type === "config_entry" ? (item.integration_name || item.domain) : null;
    const impact = this.impact(item, key);
    // An entity names its config entry (the integration page needs one), else the integration itself.
    const entryKey = item.object_type !== "entity" ? null : item.config_entry_id && this.findObject(`config_entry:${item.config_entry_id}`) ? `config_entry:${item.config_entry_id}` : `integration:${item.platform}`;
    const linkTo = (k, text) => k && this.findObject(k) ? `<button class="link" data-object="${this.esc(k)}">${this.esc(text)}</button>` : this.esc(text);
    const risk = impact ? { tone: impact.tone, text: impact.hits.length ? this.t("riskHits", { n: impact.hits.length, c: impact.certain }) : this.t("riskNone") } : null;
    return [
      item.reason ? [this.t("sumCause"), this.esc(this.t(item.reason))] : null,
      item.status_since ? [this.t("since"), this.esc(this.formatDate(item.status_since))] : null,
      integration ? [this.t("sumIntegration"), item.object_type === "config_entry" && this.findObject(`integration:${item.domain}`) ? `<button class="link" data-object="${this.esc(`integration:${item.domain}`)}" title="${this.esc(this.t("intToIntegration"))}">${this.esc(integration)}</button>` : linkTo(entryKey, integration)] : null,
      device ? [this.t("sumDevice"), linkTo(this.objectKey(device), device.name)] : null,
      area ? [this.t("sumArea"), linkTo(this.objectKey(area), area.name)] : null,
      // An automation, script or scene and its entity are one row in the inventory; each page links the other.
      TWIN_TYPES.includes(item.object_type) && this.findObject(`entity:${item.object_id}`) ? [this.t("sumEntity"), linkTo(`entity:${item.object_id}`, item.object_id)] : null,
      item.object_type === "entity" ? TWIN_TYPES.map(type => this.findObject(`${type}:${item.object_id}`)).filter(Boolean).map(twin => [this.t("sumBelongsTo"), linkTo(this.objectKey(twin), this.t(twin.object_type))])[0] || null : null,
      risk ? [this.t(this.data.findings.some(f => this.findingKey(f) === key && !f.ignored && OUTAGE_RULES.includes(f.rule_id)) ? "sumRiskOutage" : "sumRisk"), `<span class="pill ${risk.tone}">${this.esc(risk.text)}</span>`] : null,
    ].filter(Boolean);
  }

  // Tabs offered for one object; "attributes" only when it has some, so an empty tab never shows.
  detailTabs(item, key) {
    if (item.object_type === "integration") return this.intTabs(item);
    // An app has only the mark as an action; its rights and its load come from the two system reports, its relations are the integrations that seem to use it.
    if (item.object_type === "app") return [["overview", "tabOverview"], ...(this.hasActionsTab(item, key) ? [["actions", "tabActions", 0]] : []), ...(this.edgesTo(key).length ? [["relations", "tabRelations", this.edgesTo(key).length]] : []), ["access", "accAppTab", null, this.appAccessTone(item)], ["storage", "accAppLoad"], ["technical", "tabTechnical"]];
    const tabs = [["overview", "tabOverview"], ["relations", "tabRelations", this.edgesTo(key).length + this.edgesFrom(key).length], ["technical", "tabTechnical"]];
    if (this.hasActionsTab(item, key)) tabs.splice(1, 0, ["actions", "tabActions", this.fixItems(item, key).items.length]);
    if (item.attributes && Object.keys(item.attributes).length) tabs.push(["attributes", "tabAttributes"]);
    if (["automation", "script"].includes(item.object_type) && (item.actions?.length || item.triggers?.length)) tabs.push(["flow", "flowTab"]);
    if (NOTE_TYPES.includes(item.object_type)) tabs.push(["history", "tabHistory", this.historyCount(item)]);
    if (this.runsRow(item)) tabs.push(["runs", "runsTab"]);
    if (this.reliabilityRow(item)) tabs.push(["reliability", "relTab"]);
    if (this.diagRow(item)) tabs.splice(tabs.findIndex(([id]) => id === "technical"), 0, ["diagnosis", "diagTab"]);
    if (item.object_type === "config_entry") tabs.push(["access", "accTab", null, this.accessTone(item)]);
    return tabs;
  }

  detail() {
    const base = this.selected;
    const item = { ...base, ...(this.details.get(this.objectKey(base)) || {}) };
    const key = this.objectKey(item);
    if (["automation", "script"].includes(item.object_type)) { this.ensureRuns(); this.ensureQuality(); }
    if (item.object_type === "config_entry" || item.object_type === "integration") this.ensureReliability();
    if (item.object_type === "integration" && item.custom && this.detailTab === "overview") this.sysEnsure("storage"); // the folder size
    if (item.object_type === "integration" && this.detailTab === "access") { this.sysEnsure("dataflow"); this.sysEnsure("secrets"); }
    // The reports of Access & data flow and Credentials are read when their tab is opened, not with the page.
    if (item.object_type === "config_entry" && this.detailTab === "access") { this.sysEnsure("dataflow"); this.sysEnsure("secrets"); }
    if (item.object_type === "app" && this.detailTab === "access") this.sysEnsure("dataflow");
    if (item.object_type === "app" && this.detailTab === "storage") this.sysEnsure("storage");
    if (item.object_type === "entity") this.ensureStability();
    if (item.object_type === "device") this.ensureLifecycle(item.object_id);
    if (NOTE_TYPES.includes(item.object_type)) this.ensureJournal();
    this.ensureCorrelations();
    const tabs = this.detailTabs(item, key);
    const tab = tabs.some(([id]) => id === this.detailTab) ? this.detailTab : "overview";
    const path = this.haPath(item), tone = this.tone(item.status) === "ok" ? "" : this.tone(item.status);
    const back = this.trail.length ? this.trail[this.trail.length - 1].name : this.t(this.view);
    const summary = this.detailSummary(item, key).map(([label, value]) => `<span><small>${label}</small><b>${value}</b></span>`).join("");
    const tablist = tabs.map(([id, label, count, tone]) => `<button class="tab" role="tab" id="hk-tab-${id}" aria-selected="${id === tab}" aria-controls="hk-tabpanel" tabindex="${id === tab ? 0 : -1}" data-detail-tab="${id}">${this.t(label)}${count ? ` <em>${this.formatNumber(count)}</em>` : ""}${tone ? `<i class="tabdot ${tone}" aria-hidden="true"></i>` : ""}</button>`).join("");
    return `<div class="crumbs"><button class="btn" data-action="back"><ha-icon icon="mdi:arrow-left"></ha-icon>${this.t("backTo")} ${this.esc(back)}</button><span class="trail">${this.t(this.view)} › ${this.t(item.object_type)}</span></div>
      <div class="panel detailhead">${this.tile(item.object_type, tone)}<div><div class="headpills">${this.pill(item.status)}<span class="pill mute">${this.t(item.object_type)}</span></div><h1>${this.esc(item.name)}</h1><span class="id">${this.esc(item.object_id)}</span></div>
      <div class="actions">${(item.object_type === "entity" || item.object_type === "scene") && this.canMoreInfo(item.object_id) ? `<button class="btn primary" data-more-info="${this.esc(item.object_id)}"><ha-icon icon="mdi:information-outline"></ha-icon>${this.t("openEntity")}</button>` : ""}${path ? `<button class="btn" data-ha-path="${this.esc(path)}"><ha-icon icon="mdi:open-in-new"></ha-icon>${this.t("openInHA")}</button>` : ""}<button class="btn" data-graph-open="${this.esc(item.object_type === "integration" ? this.objectKey(item.entries[0]) : key)}"><ha-icon icon="mdi:source-fork"></ha-icon>${this.t("showInGraph")}</button>${["entity", "device", "area", "automation", "script", "scene", "dashboard"].includes(item.object_type) ? `<button class="btn" data-xp-from="${this.esc(key)}"><ha-icon icon="mdi:export-variant"></ha-icon>${this.t("xpButton")}</button>` : ""}</div></div>
      <div class="panel sumline">${summary}</div>
      ${this.statusBand(item, key)}
      <div class="tabs" role="tablist" aria-label="${this.esc(this.t("tabsLabel"))}">${tablist}</div>
      <div role="tabpanel" id="hk-tabpanel" aria-labelledby="hk-tab-${tab}" tabindex="0">${tab === "overview" ? this.accessAlert(item) : ""}${this.detailPanel(tab, item, key)}</div>`;
  }

  // Only the open tab is built, so large attributes and relations cost nothing until they are asked for.
  detailPanel(tab, item, key) {
    if (item.object_type === "integration") return this.intPanel(tab, item);
    if (tab === "actions") return this.actionsTab(item, key);
    if (tab === "relations") return `<div class="stack">${this.relationsCard(key)}</div>`;
    if (tab === "flow") return this.flowCard(item, key);
    if (tab === "history") return this.historyTab(item);
    if (tab === "diagnosis") return this.diagTab(item);
    if (tab === "runs") return this.runsDetailCard(this.runsRow(item));
    if (tab === "reliability") return this.reliabilityDetailCard(this.reliabilityRow(item));
    if (tab === "access") return item.object_type === "app" ? this.appAccessCard(item) : this.accessDetailCard(item);
    if (tab === "storage") return this.appLoadCard(item);
    if (tab === "overview" && item.object_type === "app") return this.appOverview(item);
    if (tab === "attributes") {
      return `<section class="panel"><div class="panelhead"><h2>${this.t("state")}</h2></div><div class="pad"><div class="code">${this.esc(JSON.stringify(item.attributes, null, 2))}</div></div></section>`;
    }
    if (tab === "technical") {
      const skip = new Set(["attributes", "references", "name", "object_id", "object_type", "status", "reason", "state", "status_since", "status_since_source", "triggers", "conditions", "actions"]);
      if (item.object_type === "config_entry") ["domain", "integration_name", "custom", "integration_dir", "integration_version", "documentation", "source", "error", "unique_id", "entity_count", "device_count", "created_at", "modified_at", "disabled_by"].forEach(k => skip.add(k));
      const fields = Object.entries(item).filter(([k, v]) => !skip.has(k) && v !== null && v !== undefined && (typeof v !== "object" || Array.isArray(v)));
      const automation = ["automation", "script"].includes(item.object_type) && !this.detailLoading
        ? `<section class="panel"><div class="panelhead"><h2>${this.t("automationStructure")}</h2></div><div class="pad">${(item.object_type === "script" ? ["actions"] : ["triggers", "conditions", "actions"]).map(part => `<h4>${this.t(part)} (${item[part]?.length || 0})</h4><div class="code">${this.esc(JSON.stringify(item[part] || [], null, 2))}</div>`).join("")}</div></section>` : "";
      const cards = this.propertyCards(item);
      const labelOnly = ["automation", "script", "scene", "area"].includes(item.object_type);
      return `<div class="stack">${cards ? `<div class="propgrid">${cards}</div>` : ""}${cards && !labelOnly ? "" : `<section class="panel"><div class="panelhead"><h2>${this.t("registry")}</h2></div><div class="pad"><dl class="kv"><dt>${this.t("type")}</dt><dd>${this.t(item.object_type)}</dd>${fields.map(([k, v]) => `<dt>${this.esc(k)}</dt><dd>${this.esc(Array.isArray(v) ? v.join(", ") : v)}</dd>`).join("")}</dl></div></section>`}${automation}${this.detailLoading ? `<p class="sub">${this.t("loading")}</p>` : ""}</div>`;
    }
    if (ACTION_TYPES.includes(item.object_type)) return `<div class="detailgrid"><div class="stack">${this.diagnosisCard(item)}${this.polObjectCard(item)}${this.nextStepBand(item, key)}${this.impactCard(item, key)}</div><div class="stack">${KNOWN_TYPES.includes(item.object_type) ? this.knownCard(item, key) : this.factsCard(item, key)}${this.entityRecorderCard(item)}</div></div>`;
    return `<div class="detailgrid"><div class="stack">${this.diagnosisCard(item)}${this.polObjectCard(item)}${this.actionsCard(item, key)}${this.detailEditCard(item)}${this.impactCard(item, key)}</div><div class="stack">${this.factsCard(item, key)}${this.entityRecorderCard(item)}${this.entityTrimCard(item)}${this.staleCard(item)}</div></div>`;
  }
}
