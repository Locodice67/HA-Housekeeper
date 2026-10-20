// CleanupMixin: methods of the panel element, mixed into the class in 99-register.js.
const OPEN_DETAIL_KINDS = ["replace_references", "rename_entity", "migrate_meter"]; // their preview is the point of the row, so it stays open

class CleanupMixin {
  // Days since an ISO timestamp, never negative.
  daysSince(value) {
    const ms = Date.now() - new Date(value).getTime();
    return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 864e5)) : 0;
  }

  quarantineOf(objectId) { return (this.data?.quarantine || []).find(q => q.object_id === objectId) || null; }

  // Takes one disabled object out of quarantine again: the journal's undo for just that object, after a question.
  // The box in the table head: all rows of the page that can be picked.
  cleanupHeadBox() {
    const ids = this._cleanupVisible || [];
    if (!ids.length) return "";
    const n = ids.filter(id => this.cleanupSel.has(id)).length;
    return `<input type="checkbox" class="selbox" data-sel-page ${n === ids.length ? "checked" : ""} ${n && n < ids.length ? "data-partial" : ""} aria-label="${this.esc(this.t("selectPage"))}">`;
  }

  releaseControl(q) {
    const key = `${q.object_type || "entity"}:${q.object_id}`;
    if (this.releaseConfirm === key) {
      return `<span class="qconfirm" role="group" aria-label="${this.esc(this.t("releaseQuestion"))}"><span>${this.t("releaseQuestion")}</span><button class="btn" data-release-yes="${this.esc(key)}">${this.t("yes")}</button><button class="btn" data-release-no>${this.t("cancelRun")}</button></span>`;
    }
    return `<button class="btn" data-release="${this.esc(key)}" ${this.cleanupRunning() ? 'disabled aria-busy="true"' : ""}>${this.t("releaseAction")}</button>`;
  }

  async releaseQuarantine(key) {
    const q = (this.data?.quarantine || []).find(e => `${e.object_type || "entity"}:${e.object_id}` === key);
    this.releaseConfirm = null;
    if (!q) return this.render();
    try {
      const res = await this._hass.callWS({ type: "ha_housekeeper/plan_undo", plan_id: q.plan_id, object_ids: [q.object_id] });
      this.releaseMessage = res.results.length
        ? res.results.map(r => `${q.object_id}: ${this.t(`undo_${r.outcome}`)}`).join(" · ")
        : `${q.object_id}: ${this.t("releaseNothing")}`;
      this.journal = null;
      if (this.data) await this.load(false);
    } catch (err) { this.releaseMessage = this.errText(err); }
    this.render();
  }

  // The tiles of the Cleanup view: one job each, with the number of things to do; the chosen one is marked.
  cleanupTiles(tabs, open) {
    return this.navTiles("cleanup", tabs, open, this.t("cleanup"), true);
  }

  // Devices without a working entity: nothing there to lose by quarantining them. Marked, labelled or excepted ones stay out.
  deviceCandidates() {
    const members = new Map();
    for (const o of this.data.objects) if (o.object_type === "entity" && o.device_id) (members.get(o.device_id) || members.set(o.device_id, []).get(o.device_id)).push(o);
    const kept = o => o.marked_keep || o.excepted || (o.labels || []).includes("housekeeper_ignore");
    return this.data.objects.filter(o => o.object_type === "device" && o.status !== "disabled" && !kept(o) && !(members.get(o.object_id) || []).some(kept) && (members.get(o.object_id) || []).every(e => ["orphaned", "unavailable", "unknown", "disabled"].includes(e.status)))
      .map(item => ({ item, finding: null, quarantine: null, count: (members.get(item.object_id) || []).length }));
  }

  quarantineRows(type) {
    return (this.data.quarantine || []).filter(q => (q.object_type || "entity") === type).map(q => ({ item: this.findObject(`${type}:${q.object_id}`), finding: null, quarantine: q })).filter(r => r.item);
  }

  // Entities a loaded integration no longer provides: removed without quarantine, so they stand
  // with the quarantined ones and not among those to disable.
  notProvidedRows() {
    const held = new Set((this.data.quarantine || []).map(q => q.object_id));
    return this.data.findings.filter(f => !f.ignored && f.rule_id === "entity.not_provided" && !held.has(f.object_id))
      .map(f => ({ item: this.findObject(`entity:${f.object_id}`), finding: f })).filter(r => r.item?.reason === "not_provided");
  }

  cleanupCandidates(kind = this.cleanupKind) {
    if (kind === "remove_entity") return [...this.quarantineRows("entity"), ...this.notProvidedRows()];
    if (kind === "remove_device" || kind === "forget_device") return this.quarantineRows("device");
    if (kind === "disable_device") return this.deviceCandidates();
    const seen = new Set(), rows = [];
    for (const f of this.data.findings) {
      if (f.ignored || !f.rule_id.startsWith("entity.") || !["orphaned", "unavailable"].includes(f.classification) || seen.has(f.object_id)) continue;
      const item = this.findObject(`entity:${f.object_id}`);
      if (!item || item.reason === "not_provided") continue;
      seen.add(f.object_id);
      rows.push({ item, finding: f });
    }
    return rows;
  }

  // The word that has to be typed before a plan runs: the strongest action in it decides.
  planWord(plan) {
    const executable = (plan?.actions || []).filter(a => a.executable);
    if (executable.some(a => PURGE_KINDS.includes(a.kind))) return this.t("purgeWord");
    if (executable.some(a => REMOVAL_KINDS.includes(a.kind) || a.kind === "delete_automation")) return this.t("confirmWordRemove");
    if (executable.some(a => a.kind === "migrate_meter")) return this.t("confirmWordMeter");
    if (executable.some(a => REPAIR_KINDS.includes(a.kind))) return this.t("confirmWordRepair");
    if (executable.some(a => a.kind === "replace_references" || a.kind === "refactor_automation")) return this.t("confirmWordReplace");
    if (executable.some(a => a.kind === "rename_entity")) return this.t("confirmWordRename");
    return this.t("confirmWord");
  }

  // The removals that would run, against everything of that kind: null while it stays below the limit.
  largeRemoval(plan, run) {
    const totals = plan.summary?.totals || {};
    const found = [["entity", ["remove_entity"], "largeShareEntity"], ["device", ["remove_device", "forget_device"], "largeShareDevice"]].map(([key, kinds, text]) => {
      const count = run.filter(a => kinds.includes(a.kind)).length, total = totals[key] || 0;
      return { count, total, text, share: total ? count / total : 0 };
    }).filter(item => item.count && item.share >= LARGE_REMOVAL_SHARE);
    return found.sort((a, b) => b.share - a.share)[0] || null;
  }

  // What the plan would run now: executable, and "to review" only when explicitly confirmed.
  runActions(plan) {
    return plan.actions.filter(a => a.executable);
  }

  // The steps the protection mode would refuse; the server checks again, this only warns before the click.
  modeBlocked(plan) {
    const rules = this.data?.meta?.protection_rules, rank = rules?.modes?.indexOf(this.data?.meta?.protection);
    if (!rules || rank === undefined || rank < 0) return [];
    const need = a => rules.quarantine.includes(a.kind) ? 1 : rules.full_only.includes(a.kind) || a.recorder ? 3 : 2;
    return this.runActions(plan).filter(a => rank < need(a));
  }

  modeName() { return this.t(`mode_${this.data.meta.protection}`).replace(/^\d · /, ""); }

  modeHint(blocked) {
    return `<div class="factnote"><strong>${this.t("modeBlockTitle", { mode: this.modeName() })}</strong><small>${this.t("modeBlockText", { count: blocked.length })}</small><button class="linkbtn" data-goto-protection>${this.t("modeBlockLink")}</button></div>`;
  }

  largeRemovalWarning(plan) {
    const large = this.largeRemoval(plan, this.runActions(plan));
    return large ? { title: this.t(large.text, { count: large.count, total: large.total, percent: Math.round(large.share * 100) }), hint: this.t("largeShareHint") } : null;
  }

  largeRemovalNote(plan) {
    const warn = this.largeRemovalWarning(plan);
    return warn ? `<div class="outcome warn" role="status"><ha-icon icon="mdi:alert-outline"></ha-icon><span><strong>${this.esc(warn.title)}</strong><small>${this.esc(warn.hint)}</small></span></div>` : "";
  }

  confirmSummary(plan, count) {
    const executable = plan.actions.filter(a => a.executable);
    const devices = executable.some(a => DEVICE_KINDS.includes(a.kind));
    const key = executable.some(a => a.kind === "delete_backup") ? "confirmedSummaryBackups" : executable.some(a => a.kind === "delete_automation") ? "confirmedSummaryAutoDelete" : executable.some(a => a.kind === "trim_history") ? "confirmedSummaryTrim" : executable.some(a => a.kind === "purge_statistics") ? "confirmedSummaryPurge" : executable.some(a => REMOVAL_KINDS.includes(a.kind)) ? (devices ? "confirmedSummaryDeviceRemove" : "confirmedSummaryRemove")
      : executable.some(a => a.kind === "migrate_meter") ? "confirmedSummaryMeter"
      : executable.some(a => REPAIR_KINDS.includes(a.kind)) ? "confirmedSummaryRepair"
      : executable.some(a => a.kind === "add_label") ? "confirmedSummaryLabel"
      : executable.some(a => a.kind === "set_area") ? "confirmedSummaryArea"
      : executable.some(a => a.kind === "set_entity_state") ? "confirmedSummaryState"
      : executable.some(a => a.kind === "rename_entity") ? "confirmedSummaryRename"
      : executable.some(a => a.kind === "replace_references") ? "confirmedSummaryReplace" : executable.some(a => a.kind === "refactor_automation") ? "confirmedSummaryRefactor" : devices ? "confirmedSummaryDeviceDisable" : "confirmedSummary";
    const changes = executable.filter(a => a.kind === "replace_references").flatMap(a => a.sources || []).reduce((n, src) => n + (src.change_count || 0), 0);
    return this.t(key, { count: key === "confirmedSummaryReplace" ? changes : count });
  }

  // "trigger/0/entity_id" reads as "Trigger 1 · entity_id"; a path in another shape stays as it is.
  sourceSpot(location) {
    const m = /^(triggers?|conditions?|actions?|sequence)(?:\[(\d+)\]|\/(\d+))(?:[./](.*))?$/.exec(location || "");
    if (!m) return location || "";
    const word = { trigger: "srcTrigger", condition: "srcCondition", action: "srcAction", sequence: "srcAction" }[m[1].replace(/s$/, "")];
    return `${this.t(word)} ${Number(m[2] ?? m[3]) + 1}${m[4] ? ` · ${m[4]}` : ""}`;
  }

  // What a replacement will touch: every source with what changes in it (old and new line), and what stays by hand.
  sourceList(action) {
    const sources = action.sources || [];
    if (!sources.length) return `<small>${this.t("replaceNoSources")}</small>`;
    const open = sources.filter(src => src.writable && src.change_count);
    const hand = sources.flatMap(src => (src.writable ? [] : [`${src.name} (${this.t(src.type)}): ${this.t(`source_${src.reason}`)}`]).concat((src.manual || []).map(path => `${src.name} (${this.t(src.type)}): ${path}`)));
    const total = open.reduce((n, src) => n + src.change_count, 0);
    const block = src => {
      const lines = (src.changes || []).slice(0, 5).map(c => `<span class="srcspot">${this.esc(this.sourceSpot(c.location))}</span><span class="srcln del"><i>−</i><span>${this.esc(c.from)}</span></span><span class="srcln add"><i>+</i><span>${this.esc(c.to)}</span></span>`).join("");
      const more = src.change_count > Math.min(5, (src.changes || []).length) ? `<small class="u-dim u-block">${this.t("replaceMoreChanges", { count: src.change_count - Math.min(5, (src.changes || []).length) })}</small>` : "";
      return `<div class="srcblock"><div class="srchead"><ha-icon icon="${src.type === "energy" ? "mdi:lightning-bolt-outline" : "mdi:file-edit-outline"}"></ha-icon><span><strong>${this.esc(src.name)}</strong><small>${this.esc(this.t(src.type === "energy" ? "energyDashboard" : src.type))} · ${this.esc(this.t("replaceChanges", { count: src.change_count }))}</small></span></div>${src.undo_per_item ? `<small class="u-amber u-block"><ha-icon icon="mdi:alert-outline" class="u-ic14"></ha-icon> ${this.esc(this.t("sourceUndoPerItem"))}</small>` : ""}${lines ? `<div class="srcdiff">${lines}</div>` : ""}${more}</div>`;
    };
    const shown = open.slice(0, 3), folded = open.slice(3);
    const foldedHtml = folded.length ? `<details class="rowdetails"><summary>${this.t("replaceMoreSources", { count: folded.length })}</summary>${folded.map(block).join("")}</details>` : "";
    const byHand = hand.length ? `<div class="srchand"><strong>${this.t("replaceByHand", { count: hand.length })}</strong><ul>${hand.map(h => `<li>${this.esc(h)}</li>`).join("")}</ul></div>` : "";
    return `<div class="srclist"><small class="u-block">${this.t("replaceSummary", { count: total, sources: open.length })}</small>${shown.map(block).join("")}${foldedHtml}${byHand}</div>`;
  }

  // What a meter change will do: the timeline of the two series, the facts behind it, the ID move and the transition.
  meterDetail(action) {
    const s = action.statistics || {}, lines = [];
    const day = ts => this.formatDate(ts * 1000).split(",")[0];
    const join = action.mode !== "id" && s.import_count;
    let timeline = "", facts = "";
    if (join) {
      const gap = s.gap_hours > 0;
      timeline = `<div class="mtl"><div class="mtlbar"><div class="a">${this.t("meterTlOld")}</div>${gap ? `<div class="gap">${this.t("meterTlGap", { hours: s.gap_hours })}</div>` : ""}<div class="b">${this.t("meterTlNew")}</div></div><div class="mtlaxis"><span>${this.esc(day(s.old_first))}</span><span>${s.switch ? this.esc(day(s.switch)) : ""}</span><span>${this.t("meterTlNow")}</span></div></div>`;
      const fact = (head, text) => `<div class="mfact"><b>${head}</b><small>${this.esc(text)}</small></div>`;
      const list = [fact(this.t("meterFactCopy", { count: this.formatNumber(s.import_count) }), this.t("meterFactCopyText", { from: day(s.old_first), to: day(s.old_last) }))];
      if (s.offset !== null && s.offset !== undefined) list.push(fact(`+${this.formatNumber(Math.round(s.offset * 1000) / 1000)} ${this.esc(s.unit || "")}`, this.t("meterFactOffset")));
      if (s.dropped_overlap) list.push(fact(this.t("meterFactOverlap", { count: s.dropped_overlap }), this.t("meterFactOverlapText")));
      if (s.gap_hours > 0) list.push(fact(this.t("meterFactGap", { hours: s.gap_hours }), this.t("meterFactGapText")));
      facts = `<div class="mfacts">${list.join("")}</div>`;
    }
    if (action.mode !== "statistics" && action.alt_id) lines.push(this.t("meterIdMove", { old: action.object_id, alt: action.alt_id, new: action.target }));
    const before = (s.preview?.before || []), after = (s.preview?.after || []);
    const cell = row => `${this.esc(day(row.start))}: ${this.esc(this.formatNumber(Math.round((row.sum_after ?? row.sum ?? 0) * 1000) / 1000))}`;
    const rows = before.length || after.length ? `<details class="rowdetails"><summary>${this.t("meterPreviewRows")}</summary><small class="u-dim u-block">${[...before, ...after].map(cell).join(" · ")}</small></details>` : "";
    const kept = action.result?.statistics_kept ? `<small class="u-block">${this.t("meterStatsKept")}</small>` : "";
    return `<span class="u-pt6 u-block">${timeline}${facts}${lines.map(l => `<small class="u-block">${this.esc(l)}</small>`).join("")}${rows}${kept}</span>`;
  }

  // Recorder purges are no plans and cannot be undone; the journal only notes them.
  purgeJournalCard() {
    const purges = this.purges || [];
    if (!purges.length) return "";
    const me = this._hass?.user?.id;
    const cells = p => {
      const what = this.t("purgeEntry", { removed: this.formatNumber(p.removed.length), skipped: this.formatNumber(p.skipped.length) });
      const who = p.by && p.by === me ? this.t("purgeByYou") : p.by ? this.t("purgeByOther") : "";
      const details = [what, p.states ? this.t("purgeWithStates") : "", p.backup ? this.t("purgeBackup", { job: p.backup.job_id || "—" }) : this.t("purgeNoBackup"), who, p.error ? this.t("purgeError", { error: p.error }) : ""].filter(Boolean).join(" · ");
      return { names: p.removed.slice(0, 3).join(", ") + (p.removed.length > 3 ? ` +${p.removed.length - 3}` : "") || this.t("purgeNothing"), details };
    };
    const table = this.sysList("purgejournal", purges, {
      sort: "when", dir: "desc",
      sorts: [{ key: "when", label: "purgeColWhen", dir: "desc", get: p => p.at }, { key: "what", label: "purgeColWhat", dir: "asc", get: p => p.removed.length }],
      text: p => `${cells(p).names} ${cells(p).details} ${this.formatDate(p.at)}`, tie: p => p.at, empty: "purgeNothing",
      columns: [
        { key: "when", label: "purgeColWhen", dir: "desc", cell: p => this.esc(this.formatDate(p.at)) },
        { key: "what", label: "purgeColWhat", dir: "asc", cell: p => `${p.error ? '<span class="pill warn">!</span> ' : ""}${this.esc(cells(p).names)}` },
        { key: "details", label: "purgeColDetails", sortable: false, cell: p => this.esc(cells(p).details) },
      ],
    });
    return `<div class="panel"><div class="panelhead"><div><h2>${this.t("purgeJournal")} (${purges.length})</h2><p>${this.t("purgeJournalHint")}</p></div></div>${table}</div>`;
  }

  async loadJournal() {
    try {
      const reply = await this._hass.callWS({ type: "ha_housekeeper/plan_list" });
      this.journal = reply.plans || []; this.purges = reply.purges || []; this.removed = reply.removed || []; this.journalError = "";
      this.markLoaded("journal");
    } catch (err) { this.journal = []; this.journalError = this.errText(err); }
    this.render();
  }

  // The journal list holds short entries only; the plan itself is fetched when it is opened.
  async openPlan(planId) {
    this.reopenedPlanId = planId; this.planChanges = null;
    try { this.plan = await this._hass.callWS({ type: "ha_housekeeper/plan_detail", plan_id: planId }); this.cleanupError = ""; this.showPlanView(); } catch (err) { this.cleanupError = this.errText(err); }
    this.render();
  }

  // Removing an entity can also delete its recorder data: a default for the whole plan, and for each entity its own
  // choice (a removal of devices keeps the one choice). The Energy dashboard's entities keep their data.
  recorderChoice(removal) {
    if (!removal || !this.data?.meta?.recorder_available) return "";
    const value = this.cleanupRecorder || "keep";
    const perEntity = this.cleanupKind === "remove_entity";
    const label = this.t(perEntity ? "recChoiceDefault" : "recChoiceLabel");
    const anyDelete = value !== "keep" || (perEntity && [...this.cleanupSel].some(id => (this.cleanupRecorderOwn || {})[id] && this.cleanupRecorderOwn[id] !== "keep"));
    return `<label class="recchoice"><span>${label}</span><select data-recorder-choice aria-label="${this.esc(label)}">${["keep", "statistics", "states"].map(k => `<option value="${k}" ${value === k ? "selected" : ""}>${this.t(`recChoice_${k}`)}</option>`).join("")}</select></label>${anyDelete ? `<small class="recwarn">${this.t(perEntity ? "recChoiceWarnOwn" : "recChoiceWarn")}</small>` : ""}`;
  }

  energyLocked(id) { return this.edgesTo(`entity:${id}`).some(e => e.source === "dashboard:energy" && USAGE_RELATIONS.includes(e.relation)); }

  // What happens to the recorder data of one removed entity: its own choice, else the default; never for the Energy dashboard.
  recorderFor(id) {
    if (this.energyLocked(id)) return "keep";
    return (this.cleanupRecorderOwn || {})[id] || this.cleanupRecorder || "keep";
  }

  // The choice of one row of the removal list; only entities that have a say: statistics, or at least a history to delete.
  recorderOwn(item) {
    if (this.cleanupKind !== "remove_entity" || item.object_type !== "entity" || !this.data?.meta?.recorder_available) return "";
    if (this.energyLocked(item.object_id)) return `<span class="recown lock">${this.t("recOwnLock")}</span>`;
    const value = this.recorderFor(item.object_id), id = this.esc(item.object_id);
    const options = item.has_statistics ? [["keep", "recOwnKeep"], ["statistics", "recOwnStats"], ["states", "recOwnStates"]] : [["keep", "recOwnKeep"], ["states", "recOwnStatesOnly"]];
    return `<span class="recown"><span class="trimseg" role="radiogroup" aria-label="${this.esc(this.t("recChoiceLabel"))}">${options.map(([v, k]) => `<button type="button" class="${value === v ? "on" : ""}" role="radio" aria-checked="${value === v}" data-rec-own="${id}|${v}">${this.t(k)}</button>`).join("")}</span><small>${item.has_statistics ? this.t("recOwnHasStats") : this.t("recOwnNoStats")}</small></span>`;
  }

  // The plan: how many removals delete what (statistics, statistics and history), keep their data, or are locked by the Energy dashboard.
  recorderSummary(plan) {
    const removals = (plan.actions || []).filter(a => REMOVAL_KINDS.includes(a.kind));
    if (!removals.length || !this.data?.meta?.recorder_available) return "";
    const count = f => removals.filter(f).length;
    const energy = a => (a.used_by || []).some(u => u.source === "dashboard:energy");
    const tags = [[count(a => a.recorder === "statistics"), "recSumStats", true], [count(a => a.recorder === "states"), "recSumStates", true], [count(a => !a.recorder && !energy(a)), "recSumKeep", false], [count(a => !a.recorder && energy(a)), "recSumEnergy", false]]
      .filter(([n]) => n).map(([n, k, red]) => `<span class="pill ${red ? "warn" : "mute"}">${this.t(k, { n })}</span>`);
    return tags.length ? `<p class="factnote recsum">${tags.join(" ")}</p>` : "";
  }

  async createPlan() {
    if (this.cleanupKind === "exchange_device") return this.createExchangePlan();
    const pair = this.cleanupKind === "replace_references" ? [this.replOld, this.replNew] : this.cleanupKind === "migrate_meter" ? [this.meterOld, this.meterNew] : this.cleanupKind === "repair_counter" ? [this.counterSel, "-"] : null;
    if (pair ? !(pair[0] && pair[1]) : !this.cleanupSel.size) return;
    this.cleanupBusy = true; this.cleanupError = ""; this.render();
    try {
      const actions = this.cleanupKind === "replace_references" ? [{ kind: "replace_references", object_id: this.replOld, target: this.replNew }]
        : this.cleanupKind === "migrate_meter" ? [{ kind: "migrate_meter", object_id: this.meterOld, target: this.meterNew, mode: this.meterMode }]
        : this.cleanupKind === "repair_counter" ? [this.counterRangeReq ? { kind: "repair_range", object_id: this.counterSel, mode: this.counterRangeReq.mode, range: this.counterRangeReq.range } : { kind: "repair_counter", object_id: this.counterSel, mode: this.counterMode || "hold" }]
        : [...this.cleanupSel].map(object_id => ({ kind: this.cleanupKind, object_id, ...(REMOVAL_KINDS.includes(this.cleanupKind) && this.recorderFor(object_id) !== "keep" ? { recorder: this.recorderFor(object_id) } : {}) }));
      const plan = await this._hass.callWS({ type: "ha_housekeeper/plan_create", actions });
      this.openNewPlan(plan, null); this.toast(this.t("previewReady"));
    } catch (err) { this.cleanupError = this.errText(err); }
    this.cleanupBusy = false; this.render();
  }

  // Creates a fresh preview with the same objects as an earlier plan, for example one that was aborted.
  // `full`: the small backup failed and the person chose the full one (as the backup settings say).
  async repeatPlan(plan, full = false) {
    this.cleanupBusy = true; this.cleanupError = ""; this.render();
    try {
      const actions = plan.actions.map(a => {
        const r = { kind: a.kind, object_id: a.object_id };
        for (const key of ["target", "mode", "range", "recorder", "fix", "values", "tables"]) if (a[key]) r[key] = a[key];
        if (a.kind === "purge_statistics") r.states = Boolean(a.states);
        if (a.kind === "trim_history") r.keep_days = a.keep_days;
        return r;
      });
      const fresh = await this._hass.callWS({ type: "ha_housekeeper/plan_create", actions, ...(full ? { full_backup: true } : {}) });
      this.openNewPlan(fresh, null);
    } catch (err) { this.cleanupError = this.errText(err); }
    this.cleanupBusy = false; this.render();
  }

  // What the backend refused, in the language of the panel: its sentence, then its code, else the sentence as sent.
  errText(err) {
    const raw = err?.message || String(err), has = key => TEXT[this.lang]?.[key] || TEXT.en[key];
    const key = [ERR_MESSAGE_KEYS[raw], `err_${err?.code}`].find(has);
    if (key) return this.t(key);
    if (/_failed$/.test(err?.code || "")) return this.t("err_failed", { detail: raw.replace(/^\w+: /, "") });
    const refused = /^Not accepted: (.+)$/.exec(raw);
    return refused ? this.t("err_not_accepted", { detail: refused[1] }) : raw;
  }

  // An open preview is a plan that was neither confirmed nor run; it can only be confirmed for 24 hours.
  isOpenPreview(plan) { return (plan.status || "dry_run") === "dry_run" && !plan.executed && !plan.run; }
  planStale(plan) { return this.isOpenPreview(plan) && Date.now() - new Date(plan.created_at).getTime() > 24 * 3600 * 1000; }

  // A preview that was opened again from a list, or is older than 5 minutes, is checked against the current
  // state before it is confirmed. Only one just made in this view and confirmed at once is taken as it is.
  planNeedsCheck(plan) { return this.reopenedPlanId === plan.plan_id || Date.now() - new Date(plan.created_at).getTime() > 5 * 60 * 1000; }

  // The same requests judged again as a new preview; the old preview is dropped.
  async renewPlan(planId) {
    if (this.cleanupBusy) return;
    this.cleanupBusy = true; this.cleanupError = ""; this.planChanges = null; this.render();
    try {
      const plan = await this._hass.callWS({ type: "ha_housekeeper/plan_renew", plan_id: planId });
      this.plan = plan; this.reopenedPlanId = null; this.confirmation = null; this.ack = new Set(); this.confirmWord = "";
      this.journal = [plan, ...(this.journal || []).filter(p => p.plan_id !== planId)];
      this.showPlanView();
      this.toast(this.t("toastRenewed"));
    } catch (err) { this.failPlan(err, "renew"); }
    this.cleanupBusy = false; this.render();
  }

  // Which step failed is said in the error line; the mark only counts while that error is still the one shown.
  failPlan(err, from) { this.cleanupError = this.errText(err); this.cleanupErrorFrom = from; this.cleanupErrorStamp = this.cleanupError; this.cleanupErrorCode = err?.code; }

  async confirmPlan() {
    try {
      this.confirmation = await this._hass.callWS({ type: "ha_housekeeper/plan_confirm", plan_id: this.plan.plan_id, acknowledged: this.plan.actions.filter(a => a.verdict === "review" && a.executable).map(a => a.object_id) });
      this.confirmWord = ""; this.cleanupError = "";
    } catch (err) { this.failPlan(err, "confirm"); }
    this.render();
  }

  async confirmAndRun() {
    if (this.planNeedsCheck(this.plan)) {
      this.cleanupBusy = true; this.render();
      let check = null;
      try { check = await this._hass.callWS({ type: "ha_housekeeper/plan_check", plan_id: this.plan.plan_id }); } catch (err) { this.failPlan(err, "check"); }
      this.cleanupBusy = false;
      if (!check || !check.current) { this.planChanges = check ? check.changed : null; this.render(); return; }
      this.planChanges = null;
    }
    await this.confirmPlan();
    if (this.confirmation) await this.executePlan();
  }

  async executePlan() {
    const { plan_id, token } = this.confirmation;
    try {
      await this._hass.callWS({ type: "ha_housekeeper/plan_execute", plan_id, token });
      this.confirmation = null; this.cleanupError = ""; this._scrollPlan = true;
      this.pollPlan(plan_id);
    } catch (err) { this.cleanupError = this.errText(err); this.confirmation = null; }
    this.render();
  }

  async cancelPlan() {
    try { await this._hass.callWS({ type: "ha_housekeeper/plan_cancel" }); }
    catch (_) { this.toast(this.t("planCancelFailed"), true); }
  }

  // Follow a running plan until it stops; the plan object is replaced everywhere it is shown.
  async pollPlan(planId) {
    this._polling = planId;
    let tries = 0, failed = 0;
    while (this._polling === planId) {
      try {
        const res = await this._hass.callWS({ type: "ha_housekeeper/plan_status", plan_id: planId });
        failed = 0;
        this.adoptPlan(res.plan); this.planProgress = res.progress; this.render();
        const verifying = res.plan.status === "executed" && !res.plan.verification && (tries += 1) < 60;
        if (!res.progress.running && res.plan.status !== "running" && !verifying) break;
      } catch (_) {
        // A single failed poll must not end the follow-up: the plan keeps running on the server.
        failed += 1;
        if (failed === 1) this.toast(this.t("planStatusLost"), true);
        if (failed >= 15) break;
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * (failed + 1), 5000)));
    }
    this._polling = null; this.planProgress = null;
    if (this.plan?.plan_id === planId && ["verified", "executed", "partial", "aborted"].includes(this.plan.status)) this.toast(this.t(`toast_${this.plan.status}`));
    if (this.data) this.load(false);
    this.render();
  }

  // True while a plan is executed: the backend refuses scans then, so the button is disabled.
  cleanupRunning() { return ["backup", "running"].includes(this.plan?.status); }

  adoptPlan(plan) {
    if (this.plan?.plan_id === plan.plan_id) this.plan = plan;
    this.journal = (this.journal || []).map(p => (p.plan_id === plan.plan_id ? plan : p));
  }

  async undoPlan(objectIds) {
    this.undoAsk = null;
    try {
      const res = await this._hass.callWS({ type: "ha_housekeeper/plan_undo", plan_id: this.plan.plan_id, ...(objectIds ? { object_ids: objectIds } : {}) });
      const kindOf = id => this.plan?.actions.find(a => a.object_id === id)?.kind;
      this.undoMessage = res.results.map(r => `${r.object_id}: ${this.t(r.outcome === "undone" && REMOVAL_KINDS.includes(kindOf(r.object_id)) ? "undo_restored" : r.outcome === "undone" && kindOf(r.object_id) === "add_label" ? "undo_unlabelled" : `undo_${r.outcome}`)}`).join(" · ");
      const status = await this._hass.callWS({ type: "ha_housekeeper/plan_status", plan_id: this.plan.plan_id });
      this.adoptPlan(status.plan);
      if (this.data) this.load(false);
    } catch (err) { this.cleanupError = this.errText(err); }
    this.render();
  }

  // Open previews can be merged into one plan: the backend rebuilds it from the requests and reports conflicts.
  mergeable(plan) { return !plan.executed && !plan.run; }

  // The box in the table head: every plan of the page that can be merged.
  journalHeadBox(rows) {
    const ids = (rows || []).filter(p => this.mergeable(p)).map(p => p.plan_id);
    if (!ids.length) return "";
    const n = ids.filter(id => this.mergeSel?.has(id)).length;
    return `<input type="checkbox" class="selbox" data-merge-page="${this.esc(ids.join(","))}" ${n === ids.length ? "checked" : ""} ${n && n < ids.length ? "data-partial" : ""} aria-label="${this.esc(this.t("selectPage"))}">`;
  }

  async mergePlans() {
    const ids = [...(this.mergeSel || [])].filter(id => (this.journal || []).some(p => p.plan_id === id && this.mergeable(p)));
    if (ids.length < 2 || ids.length > 10 || this.cleanupBusy) return;
    this.cleanupBusy = true; this.cleanupError = ""; this.mergeNote = ""; this.render();
    try {
      const result = await this._hass.callWS({ type: "ha_housekeeper/plan_merge", plan_ids: ids });
      this.plan = result.plan; this.confirmation = null; this.ack = new Set(); this.confirmWord = ""; this.mergeSel = new Set();
      this.showPlanView();
      this.journal = [result.plan, ...(this.journal || []).filter(p => !result.merged.includes(p.plan_id))];
      this.mergeNote = result.conflicts.length ? this.t("mergeConflicts", { count: result.conflicts.length, list: result.conflicts.slice(0, 5).map(c => `${c.object_id} (${c.kinds.join(" / ")})`).join(", ") }) : this.t("mergeDone", { count: result.merged.length });
    } catch (err) { this.cleanupError = this.errText(err); }
    this.cleanupBusy = false; this.render();
  }

  // Deletes the picked previews; a plan that ran is never in the picks (it is not mergeable) and the server refuses it anyway.
  async deletePlans() {
    const ids = [...(this.mergeSel || [])].filter(id => (this.journal || []).some(p => p.plan_id === id && this.mergeable(p)));
    if (!ids.length) return;
    for (const id of ids) { try { await this._hass.callWS({ type: "ha_housekeeper/plan_delete", plan_id: id }); } catch (_) { /* already gone */ } }
    this.journal = (this.journal || []).filter(p => !ids.includes(p.plan_id));
    this.mergeSel = new Set();
    if (this.plan && ids.includes(this.plan.plan_id)) { this.leavePlan(); return; }
    this.render();
  }

  async deletePlan(id) {
    try { await this._hass.callWS({ type: "ha_housekeeper/plan_delete", plan_id: id }); } catch (_) { /* already gone */ }
    this.journal = (this.journal || []).filter(p => p.plan_id !== id);
    if (this.plan?.plan_id === id) { this.leavePlan(); return; }
    this.render();
  }

  // The stages of a plan in the order the backend runs them: the typed confirmation comes first, the backup
  // is made when the run starts. Each step is "done", "current", "todo", "skipped" or "failed".
  planSteps(plan, confirming) {
    const status = plan.status, open = status === "dry_run";
    const executable = plan.actions.filter(a => a.executable);
    const needsBackup = executable.some(a => BACKUP_KINDS.includes(a.kind));
    const backupFailure = plan.actions.map(a => a.result?.reason).find(r => BACKUP_FAILURES.includes(r));
    const steps = [{ id: "stepSelect", state: "done" }];
    steps.push(open && !confirming ? (executable.length ? { id: "stepAnalysis", state: "current" } : { id: "stepAnalysis", state: "failed", note: this.t("stepAnalysisBlocked") }) : { id: "stepAnalysis", state: "done" });
    steps.push({ id: "stepConfirm", state: open ? (confirming ? "current" : "todo") : "done" });
    if (!needsBackup) steps.push({ id: "stepBackup", state: "skipped", note: this.t("stepBackupSkipped") });
    else if (backupFailure) steps.push({ id: "stepBackup", state: "failed", note: [this.t(`abort_${backupFailure}`), ...(plan.events || []).filter(e => e.error).slice(-2).map(e => e.error), this.t("backupFailHint")].join(" · ") });
    else if (status === "backup") steps.push({ id: "stepBackup", state: "current", note: this.t("backupRunning") });
    else if (open) steps.push({ id: "stepBackup", state: "todo", note: [plan.full_backup ? this.t("backupFullPlanned") : "", plan.backup_local ? this.t("backupLocalPlanned") : ""].filter(Boolean).join(" · ") || null });
    else {
      const job = plan.backup?.job_id ? this.t("stepBackupJob", { id: plan.backup.job_id }) : "";
      const name = plan.backup?.name ? this.t("stepBackupName", { name: plan.backup.name }) : "";
      steps.push({ id: "stepBackup", state: "done", note: plan.backup?.at ? [this.t("stepBackupDone", { date: this.formatDate(plan.backup.at), name, job }), plan.backup.local_only ? this.t("backupLocalDone") : ""].filter(Boolean).join(" · ") : null });
    }
    const ranStates = ["executed", "verified", "undone", "partially_undone"];
    steps.push(status === "running" ? { id: "stepRun", state: "current" }
      : ranStates.includes(status) ? { id: "stepRun", state: "done" }
      : status === "partial" ? { id: "stepRun", state: "failed", note: this.t("stepRunPartial") }
      : status === "aborted" && !backupFailure ? { id: "stepRun", state: "failed" } : { id: "stepRun", state: "todo" });
    const verification = plan.verification;
    steps.push(verification ? (verification.ok ? { id: "stepVerify", state: "done" } : { id: "stepVerify", state: "failed", note: this.t("stepVerifyFailed") })
      : status === "executed" ? { id: "stepVerify", state: "current" } : { id: "stepVerify", state: "todo" });
    return steps;
  }

  // Housekeeper can take every action back except merged statistics, which only a backup restores.
  undoBadge(action) {
    if (action.kind === "delete_backup") return `<span class="pill mute"><ha-icon icon="mdi:delete-forever-outline" class="u-ic14"></ha-icon>${this.t("undoFinal")}</span>`;
    const backupOnly = action.kind === "migrate_meter" || PURGE_KINDS.includes(action.kind);
    return `<span class="pill ${backupOnly ? "warn" : "mute"}"><ha-icon icon="${backupOnly ? "mdi:backup-restore" : "mdi:undo-variant"}" class="u-ic14"></ha-icon>${this.t(backupOnly ? "undoBackupOnly" : "undoHousekeeper")}</span>`;
  }

  // One clear line with the end of a run: green when it all worked, amber when something is left, red when nothing was done.
  planOutcome(plan) {
    const status = plan.status, total = plan.actions.length;
    const done = plan.actions.filter(a => a.result?.state === "done").length;
    const failedCheck = plan.verification && !plan.verification.ok;
    let tone, icon, text, reason = "";
    if (status === "verified") { tone = "ok"; icon = "mdi:check-circle"; text = this.t("outcomeDone", { done, total }); }
    else if (status === "executed" && !plan.verification) { tone = "mute"; icon = "mdi:progress-clock"; text = this.t("outcomeVerifying", { done, total }); }
    else if (status === "executed" && failedCheck) { tone = "warn"; icon = "mdi:alert-circle"; text = this.t("outcomeCheckFailed", { done, total }); }
    else if (status === "partial") { tone = "warn"; icon = "mdi:alert-circle"; text = this.t("outcomePartial", { done, total }); }
    else if (status === "aborted") {
      tone = "red"; icon = "mdi:close-circle"; text = this.t("outcomeAborted");
      // The reason belongs in the band itself: the person should not have to look for it further down.
      const why = plan.actions.map(a => a.result?.reason).find(Boolean);
      if (why) reason = this.t(`abort_${why}`);
    }
    else return "";
    const doneActions = plan.actions.filter(a => a.result?.state === "done" && a.kind !== "delete_backup");
    const backupOnly = a => ["migrate_meter", ...PURGE_KINDS].includes(a.kind);
    const undo = !doneActions.length ? "" : doneActions.every(backupOnly) ? this.t("outcomeUndoBackup") : doneActions.some(backupOnly) ? this.t("outcomeUndoMixed") : this.t("outcomeUndoYes");
    return `<div class="outcome ${tone}" role="status"><ha-icon icon="${icon}"></ha-icon><span><strong>${this.esc(text)}</strong>${reason ? `<small>${this.esc(reason)}</small>` : ""}${undo ? `<small>${this.esc(undo)}</small>` : ""}</span></div>`;
  }

  planCard(plan) {
    const sm = plan.summary || {};
    const open = plan.status === "dry_run";
    const rowList = plan.actions.map(a => {
      const settled = a.result?.state === "done";
      const keepOpen = OPEN_DETAIL_KINDS.includes(a.kind) && plan.actions.length === 1; // a plan with many rows folds each one
      const idle = a.verdict === "blocked" && (a.reasons || []).length > 0 && a.reasons.every(r => NOTHING_REASONS.includes(r));
      const tone = settled ? "ok" : idle ? "mute" : { ok: "ok", review: "warn", blocked: "red" }[a.verdict] || "mute";
      const uses = (a.used_by || []).slice(0, 4).map(u => {
        const obj = this.findObject(u.source);
        return `<button class="chip" data-object="${this.esc(u.source)}">${this.esc(obj?.name || u.source.split(":").slice(1).join(":"))}</button>`;
      }).join("");
      const more = (a.used_by || []).length > 4 ? `<small>+${a.used_by.length - 4}</small>` : "";
      const reasons = (a.reasons || []).filter(r => !(a.kind === "purge_statistics" && ["irreversible", "with_states"].includes(r))).map(r => (r === "quarantine_too_short" && a.quarantine_days_left ? `${this.t("reason_quarantine_too_short")} (${this.t("daysLeftShort", { days: a.quarantine_days_left })})` : this.t(`reason_${r}`))).join(" ");
      const type = a.object_type || "entity", obj = this.findObject(`${type}:${a.object_id}`);
      const result = a.result;
      const resultPill = result ? `<span class="pill ${{ done: "ok", undone: "mute" }[result.state] || "warn"}">${this.t(`result_${result.state === "done" ? DONE_RESULTS[a.kind] || "done" : result.state}`)}</span>` : "";
      const sub0 = a.kind === "set_entity_state" ? `${a.object_id} · ${this.t(`stateTarget_${a.target}`)}` : a.kind === "set_area" ? `${a.object_id} → ${a.area_name || "?"}${a.suggested && a.area_name ? ` (${this.t("areaSuggested")})` : ""}` : a.kind === "add_label" ? `${a.object_id} + ${a.label_name || a.target || "?"}` : a.kind === "replace_references" || a.kind === "migrate_meter" || a.kind === "rename_entity" ? `${a.object_id} → ${a.target || "?"}` : type === "device" ? `${this.t("deviceEntities", { count: (a.entities || []).length })}` : a.object_id;
      const sub = [sub0 === a.name ? "" : sub0, a.recorder ? this.t(`recChoice_${a.recorder}`) : "", a.kind === "delete_backup" ? [a.backup?.date ? this.formatDate(a.backup.date).split(",")[0] : "", this.formatBytes(a.backup?.size)].filter(Boolean).join(" · ") : "", a.kind === "trim_history" ? this.trimPlanSub(a) : ""].filter(Boolean).join(" · ");
      const sources = a.kind === "delete_automation" ? this.deleteDiff(a) : a.kind === "replace_references" || a.kind === "rename_entity" ? this.sourceList(a) : a.kind === "refactor_automation" ? this.refactorDiff(a) : a.kind === "migrate_meter" ? this.meterDetail(a) : REPAIR_KINDS.includes(a.kind) ? this.counterDetail(a) : "";
      const abort = result?.state === "not_run" ? ` · ${this.t(`abort_${result.reason}`)}` : result?.stopped ? ` · ${this.t(`abort_${result.stopped}`)}` : "" + (result?.purge?.state === "failed" ? ` · ${this.t("result_purge_failed")}` : "");
      const ack = "";
      const undo = result?.state !== "done" || PURGE_KINDS.includes(a.kind) ? "" : this.undoAsk === a.object_id
        ? `<span class="askrow"><span>${this.t("undoAskOne")}</span><button class="btn danger" data-undo-one-yes="${this.esc(a.object_id)}">${this.t("undoYes")}</button><button class="btn accent" data-undo-no>${this.t("cancelRun")}</button></span>`
        : `<button class="btn accent" data-undo-one="${this.esc(a.object_id)}"><ha-icon icon="mdi:undo-variant"></ha-icon>${this.t("undoOne")}</button>`;
      return `<div class="row planrow ${a.verdict === "blocked" ? "dim" : ""}"><span class="tile ${tone}"><ha-icon icon="${settled || idle || a.verdict === "ok" ? "mdi:check" : a.verdict === "review" ? "mdi:alert-outline" : "mdi:close-octagon-outline"}"></ha-icon></span>
        <span class="row-text"><strong>${obj ? `<button class="link" data-object="${this.esc(`${type}:${a.object_id}`)}">${this.esc(a.name)}</button>` : this.esc(a.name)}</strong><small>${this.esc([sub, reasons, abort.replace(/^ · /, "")].filter(Boolean).join(" · "))}</small>${ack}${keepOpen ? sources : ""}${(keepOpen ? "" : sources) || uses ? `<details class="rowdetails"><summary>${this.t("planDetails")}</summary>${keepOpen ? "" : sources}${uses ? `<span class="chips planchips">${uses}${more}</span>` : ""}</details>` : ""}</span>
        <span class="planresult">${resultPill}${undo}${a.executable && (result || !(a.reasons || []).includes("irreversible")) ? this.undoBadge(a) : ""}${result ? "" : `<span class="pill ${tone}">${this.t(idle ? "verdictNothing" : a.verdict === "review" && (a.reasons || []).includes("irreversible") ? "verdictIrreversible" : `verdict_${a.verdict}`)}</span>`}</span></div>`;
    });
    const extra = [sm.uses ? this.t("planUses", { count: sm.uses }) : "", sm.statistics ? this.t("planStats", { count: sm.statistics }) : ""].filter(Boolean).join(" · ");
    const executable = plan.actions.some(a => a.executable);
    const word = this.planWord(plan), conf = this.confirmation?.plan_id === plan.plan_id ? this.confirmation : null;
    let control = "";
    if (open && this.planStale(plan)) control = `<div class="setrow planfoot"><small class="u-m0">${this.t("planStaleHint")}</small><span class="planfootbtns"><button class="btn" data-plan-close>${this.t("confirmCancel")}</button><button class="btn primary" data-plan-renew="${this.esc(plan.plan_id)}" ${this.cleanupBusy ? 'disabled aria-busy="true"' : ""}><ha-icon icon="mdi:refresh"></ha-icon>${this.t("renewPlan")}</button></span></div>`;
    else if (open && !executable) control = `<p class="factnote">${this.t("nothingExecutable")}</p>`;
    else if (open && !conf) {
      const run = this.runActions(plan);
      const blocked = this.modeBlocked(plan);
      const risky = run.some(a => REMOVAL_KINDS.includes(a.kind) || PURGE_KINDS.includes(a.kind));
      control = `<div class="setrow planfoot planfootcol"><div>${run.length ? `<strong class="plansum">${this.confirmSummary(plan, run.length)}</strong>` : ""}${this.largeRemovalNote(plan)}<small>${this.t("cleanupDryRun")}</small>${this.purgeStatesSwitch(plan)}${blocked.length ? this.modeHint(blocked) : ""}${run.length ? "" : `<small class="dim7">${this.t("nothingToRun")}</small>`}</div><span class="planfootbtns"><button class="btn" data-plan-close>${this.t("planClose")}</button><button class="btn" data-plan-discard>${this.t("confirmCancel")}</button><button class="btn ${risky ? "danger" : "primary"}" data-plan-confirm data-risky="${risky}" data-count="${run.length}" ${blocked.length || !run.length ? `disabled title="${this.esc(blocked.length ? this.t("modeBlockTitle", { mode: this.modeName() }) : this.t("nothingToRun"))}"` : ""}>${this.t("confirmPlan")}</button></span></div>`;
    }
    else if (plan.status === "aborted") {
      const small = plan.actions.some(a => a.result?.reason === "backup_small_failed");
      const full = small ? `<button class="btn" data-plan-repeat-full="${this.esc(plan.plan_id)}" ${this.cleanupBusy ? 'disabled aria-busy="true"' : ""}><ha-icon icon="mdi:backup-restore"></ha-icon>${this.t("repeatFull")}</button>` : "";
      control = `<div class="setrow planfoot"><small class="u-m0">${this.t(small ? "repeatFullHint" : "repeatHint")}</small>${full}<button class="btn primary" data-plan-repeat="${this.esc(plan.plan_id)}" ${this.cleanupBusy ? 'disabled aria-busy="true"' : ""}><ha-icon icon="mdi:reload"></ha-icon>${this.t("repeatPlan")}</button></div>`;
    }
    else if (plan.status === "running" || plan.status === "backup") control = `<div class="setrow planfoot"><small class="u-m0">${plan.status === "backup" || this.planProgress?.phase === "backup" ? this.t("backupRunning") : `${this.t("running")} ${this.planProgress ? this.t("progressOf", { done: this.planProgress.done, total: this.planProgress.total }) : ""}`}</small><button class="btn" data-plan-cancel>${this.t("cancelRun")}</button></div>`;
    else if (plan.actions.some(a => a.result?.state === "done" && !PURGE_KINDS.includes(a.kind))) control = this.undoAsk === "all"
      ? `<div class="setrow planfoot askbox"><div><strong>${this.t("undoAskAll")}</strong><small>${this.t("undoAskAllHint")}</small></div><span class="askrow"><button class="btn danger" data-undo-all-yes><ha-icon icon="mdi:undo-variant"></ha-icon>${this.t("undoYes")}</button><button class="btn accent" data-undo-no>${this.t("cancelRun")}</button></span></div>`
      : `<div class="setrow planfoot"><small class="u-m0">${this.esc(this.undoMessage || this.t("undoAllHint"))}</small><button class="btn accent" data-undo-all><ha-icon icon="mdi:undo-variant"></ha-icon>${this.t("undoAll")}</button></div>`;
    const checks = plan.verification ? `<details class="checkdet"><summary><b>${this.t("verification")}</b></summary><div class="checkrow">${plan.verification.checks.map(c => `<span class="pill ${c.ok ? "ok" : "red"}">${c.ok ? "✓" : "✗"} ${this.t(`check_${c.check}`)}${c.object_id ? ` (${this.esc(c.object_id)})` : ""}</span>`).join("")}</div></details>` : "";
    const stage = this.planStage(plan, Boolean(conf));
    const footClose = open && !conf && executable && !this.planStale(plan); // the preview has its buttons in the foot
    // Nothing can run: no steps and no confirmation, one clear band and the reasons.
    if (open && !executable) {
      const blocked = plan.actions.filter(a => a.verdict === "blocked").length;
      const nothing = plan.actions.length > 0 && plan.actions.every(a => a.verdict === "blocked" && (a.reasons || []).length > 0 && a.reasons.every(r => NOTHING_REASONS.includes(r)));
      const why = nothing ? this.t("wzIdleNothing") : blocked && blocked === plan.actions.length ? this.t(blocked === 1 ? "wzIdleBlockedOne" : "wzIdleBlocked", { n: blocked }) : this.t("wzIdleNone");
      return `<section class="panel" data-plan-card data-plan-idle><div class="panelhead"><div><h2>${this.t("plan_status_dry_run")}</h2><p>${this.esc(this.formatDate(plan.created_at))}</p></div></div>
        <div class="outcome ${nothing ? "ok" : "warn"}" role="status"><ha-icon icon="${nothing ? "mdi:check-circle-outline" : "mdi:information-outline"}"></ha-icon><span><strong>${this.t(nothing ? "wzIdleNothingTitle" : "wzIdleTitle")}</strong><small>${this.esc(why)}</small></span></div>${rowList.join("")}${this.reportBlock(plan, `<button class="btn primary" data-plan-close>${this.t("planClose")}</button>`)}</section>`;
    }
    const rowTexts = plan.actions.map(a => [a.name, a.object_id, a.target, a.label_name, a.area_name, ...(a.reasons || []).map(r => this.t(`reason_${r}`))].filter(Boolean).join(" "));
    const rows = this.fold("planrows", { title: this.t("planObjects", { n: this.formatNumber(plan.actions.length) }) }, this.planRowsShown(plan, rowList, rowTexts), true);
    const summary = this.exchangeSummary(plan) + `<p class="factnote">${this.t("planSummary", { total: sm.total ?? 0, ok: sm.ok ?? 0, review: sm.review ?? 0, blocked: sm.blocked ?? 0 })}${extra ? ` ${this.esc(extra)}` : ""}</p>${this.recorderSummary(plan)}`;
    const body = stage === 0 ? `${summary}${rows}${this.simulationBlock(plan)}${control}`
      : stage === 1 ? `${summary}${rows}${this.simulationBlock(plan)}${control}`
      : stage === 2 ? `${this.planOutcome(plan)}${control}`
      : `${this.planOutcome(plan)}${this.logSuggestCard(plan)}${summary}${rows}${this.simulationBlock(plan)}${checks}${this.followupLine(plan)}${control}`;
    return `<section class="panel" data-plan-card><div class="panelhead"><div><h2>${this.t(plan.status === "dry_run" ? "planResult" : "planResultDone")} · <span class="pill ${plan.status === "verified" ? "ok" : plan.status === "dry_run" ? "mute" : "warn"}">${this.t(`plan_status_${plan.status}`)}</span>${this.planStale(plan) ? ` <span class="pill warn">${this.t("planStale")}</span>` : ""}</h2><p>${this.esc(this.formatDate(plan.created_at))}</p></div>${footClose ? "" : `<button class="btn" data-plan-close>${this.t("planClose")}</button>`}</div>
      ${this.planTrack(plan, stage, Boolean(conf))}${body}${this.reportBlock(plan)}</section>`;
  }

  kindSelect() {
    if (this.view !== "cleanup" || (this._cleanupKinds || CLEANUP_KINDS).length < 2) return "";
    const labels = { disable_entity: "kindDisable", remove_entity: "kindRemove", disable_device: "kindDisableDevice", remove_device: "kindRemoveDevice", forget_device: "kindForgetDevice" };
    return `<select data-cleanup-kind aria-label="${this.t("actionKind")}">${(this._cleanupKinds || CLEANUP_KINDS).map(value => `<option value="${value}" ${this.cleanupKind === value ? "selected" : ""}>${this.t(labels[value])}</option>`).join("")}</select>`;
  }


  // Replace one entity by another in every configuration that names it exactly.
  entityUnit(id) { return this.findObject(`entity:${id}`)?.unit; }

  // Candidates for the new entity, shown as buttons below the field. They only fill the field; the person decides.
  successorHints(id, unit, attr) {
    if (!id) return "";
    const found = this.successorsOf(id, unit);
    if (!found.length) return "";
    return `<div class="setrow planfoot"><small class="u-m0">${this.t("successorHint")}</small><span class="chips">${found.map(o => `<button class="chip" ${attr}="${this.esc(o.object_id)}" title="${this.esc(o.name)}">${this.esc(o.object_id)}</button>`).join("")}</span></div>`;
  }

  // Where an entity is used, from the relation graph: "Automation × 3". The Energy dashboard has its own tag.
  usageTags(entityId) {
    const counts = new Map();
    for (const e of this.edgesTo(`entity:${entityId}`)) {
      if (!USAGE_RELATIONS.includes(e.relation)) continue;
      const label = e.source === "dashboard:energy" ? this.t("energyDashboard") : this.t(String(e.source).split(":")[0]);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts].map(([label, n]) => (n > 1 ? `${label} × ${n}` : label));
  }

  // What can be said before any preview: where the old entity is used, and whether the new one fits and works.
  // `used` sits under the old field, `fit` under the new one; `bad` is true when the plan would be blocked anyway, so the button stays off.
  replaceChecks(oldId, newId) {
    const old = oldId && this.findObject(`entity:${oldId}`), nu = newId && this.findObject(`entity:${newId}`);
    const rows = [], mark = (tone, text) => `<div class="mcheck"><span class="${tone}-t">${{ ok: "✓", warn: "!", bad: "✕" }[tone]}</span><span>${text}</span></div>`;
    let bad = false;
    let used = "";
    if (oldId) {
      const tags = this.usageTags(oldId);
      used = `<div class="mcheck"><span></span><span><strong>${this.t(tags.length ? "replUsedHere" : "replUsedNowhere")}</strong>${tags.length ? `<span class="exptags">${tags.map(x => `<span class="tag">${this.esc(x)}</span>`).join("")}</span>` : ""}</span></div>`;
    }
    if (old && nu) {
      const same = (a, b) => (a ?? "") === (b ?? "");
      if (nu.object_id === old.object_id) { bad = true; rows.push(mark("bad", this.t("replSameEntity"))); }
      else if (nu.object_id.split(".")[0] !== old.object_id.split(".")[0]) { bad = true; rows.push(mark("bad", this.t("replOtherDomain"))); }
      else {
        if (nu.status !== "active") { bad = true; rows.push(mark("bad", this.t("replNotWorking"))); }
        else rows.push(mark("ok", this.t("replWorking")));
        rows.push(same(old.unit, nu.unit) && same(old.device_class, nu.device_class) ? mark("ok", this.t(old.unit ? "replFits" : "replFitsNoUnit", { unit: this.esc(old.unit || "") })) : mark("warn", this.t("replDiffers")));
      }
      if (!bad && old.has_statistics) rows.push(`<div class="mcheck"><span class="warn-t">!</span><span>${this.t("replStats")} <button class="link" data-repl-meter>${this.t("replStatsGo")}</button></span></div>`);
    }
    return { used, fit: rows.join(""), bad };
  }

  replaceCard() {
    const checks = this.replaceChecks(this.replOld, this.replNew);
    const ready = this.replOld && this.replNew && !this.cleanupBusy && !checks.bad;
    const hints = this.successorHints(this.replOld, this.entityUnit(this.replOld), "data-repl-pick");
    return `<div class="panel ovvis"><div class="panelhead"><div><h2>${this.t("replaceTitle")}</h2><p>${this.t("replaceHint")}</p></div><div class="actions">${this.kindSelect()}</div></div>
      <div class="setrow"><div><label>${this.t("replaceOld")}</label></div><div>${this.pickerBox("replOld", "sensor.old_entity")}${checks.used}</div></div>
      <div class="setrow"><div><label>${this.t("replaceNew")}</label></div><div>${this.pickerBox("replNew", "sensor.new_entity")}${checks.fit}</div></div>
      ${hints}<div class="setrow planfoot"><small class="u-m0">${this.t("repairDryRun")}</small><button class="btn primary" data-plan-create ${ready ? "" : "disabled"}>${this.cleanupBusy ? this.t("planCreating") : this.t("replacePreview")}</button></div></div>`;
  }

  // The checks that the panel can make before any preview: unit, classes and statistics of the two meters.
  meterChecks(old, nu) {
    if (!old || !nu) return "";
    const line = (tone, text) => `<div class="mcheck"><span class="${tone}-t">${tone === "ok" ? "✓" : "!"}</span><span>${text}</span></div>`;
    const lines = [];
    const same = (a, b) => (a ?? "") === (b ?? "");
    lines.push(same(old.unit, nu.unit) && same(old.device_class, nu.device_class) && same(old.state_class, nu.state_class)
      ? line("ok", this.t("meterCheckSame", { unit: this.esc(old.unit || "–"), cls: this.esc(old.state_class || "–") }))
      : line("warn", this.t("meterCheckDiffer")));
    lines.push(old.has_statistics ? line("ok", this.t("meterCheckStats")) : line("warn", this.t("meterCheckNoStats")));
    lines.push(`<div class="mcheck"><span class="warn-t">!</span><span>${this.t("meterCheckRefs")} <button class="link" data-meter-refs>${this.t("meterCheckRefsGo")}</button></span></div>`);
    return lines.join("");
  }

  // Join a replaced meter's history to its successor and/or let the successor take over the ID.
  meterCard() {
    const entities = this.data.objects.filter(o => o.object_type === "entity");
    const byId = new Map(entities.map(o => [o.object_id, o]));
    const modes = ["both", "statistics", "id"];
    const ready = this.meterOld && this.meterNew && !this.cleanupBusy;
    const cards = `<div class="modecards" role="radiogroup" aria-label="${this.esc(this.t("meterMode"))}">${modes.map(m => `<button class="modecard${this.meterMode === m ? " on" : ""}" role="radio" aria-checked="${this.meterMode === m}" data-meter-mode="${m}"><strong>${this.t(`meterCard_${m}`)}${m === "both" ? ` <span class="pill ok">${this.t("meterUsual")}</span>` : ""}</strong><small>${this.t(`meterCardHint_${m}`)}</small><small class="modefollow">${this.t(`meterCardFollow_${m}`)}</small></button>`).join("")}</div>`;
    return `<div class="panel ovvis"><div class="panelhead"><div><h2>${this.t("meterTitle")}</h2><p>${this.t("meterHint")}</p></div><div class="actions">${this.kindSelect()}</div></div>
      <div class="setrow"><div><label>${this.t("meterOld")}</label></div>${this.pickerBox("meterOld", "sensor.old_meter")}</div>
      <div class="setrow"><div><label>${this.t("meterNew")}</label></div>${this.pickerBox("meterNew", "sensor.new_meter")}</div>
      ${this.meterChecks(byId.get(this.meterOld), byId.get(this.meterNew))}
      <div class="setrow"><div><label>${this.t("meterMode")}</label></div></div>${cards}
      ${this.successorHints(this.meterOld, byId.get(this.meterOld)?.unit, "data-meter-pick")}<div class="setrow planfoot"><small class="u-m0">${this.t("repairDryRun")}</small><button class="btn primary" data-plan-create ${ready ? "" : "disabled"}>${this.cleanupBusy ? this.t("planCreating") : this.t("replacePreview")}</button></div></div>`;
  }

  // Devices that an integration created again after they were forgotten.
  recurringCard() {
    const entries = this.data.recurring_devices || [];
    if (!entries.length) return "";
    const rows = entries.map(r => ({ key: `device:${r.device_id}`, type: "device", name: r.name, sub: r.device_id, tone: "warn", state: "recurring", stateLabel: this.t("recurringPill"), pill: `<span class="pill warn">${this.t("recurringPill")}</span>`, since: r.forgotten_at, domains: (r.domains || []).join(", ") }));
    const extras = [
      { key: "since", label: "recurringColSince", dir: "desc", get: r => r.since, cell: r => this.esc(this.formatDate(r.since)) },
      { key: "domains", label: "recurringColDomains", dir: "asc", get: r => r.domains, cell: r => this.esc(r.domains || "–") },
    ];
    return `<div class="panel"><div class="panelhead"><div><h2>${this.t("recurringTitle")} (${entries.length})</h2><p>${this.t("recurringHint")}</p></div></div>${this.objectTable("recurring", rows, { extras })}</div>`;
  }

  cleanupView() {
    this.ensureJournal();
    const purges = this.purges || [];
    const limit = this.data.meta.quarantine_days ?? 14;
    const held = this.data.quarantine || [], heldReady = held.filter(q => this.daysSince(q.since) >= limit).length;
    const unusedCount = this.unreferencedRows().length, statsCount = (this.data.orphaned_statistics || []).length;
    const count = kind => this.cleanupCandidates(kind).length;
    const unusedRows = this.unreferencedRows();
    const topDomain = (() => { const counts = new Map(); unusedRows.forEach(o => { const d = o.object_id.split(".")[0]; counts.set(d, (counts.get(d) || 0) + 1); }); return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]; })();
    const unusedFacts = [
      this.data.meta.recorder_available && unusedRows.length ? { text: this.t("unrefFactStats", { n: this.formatNumber(unusedRows.filter(o => o.has_statistics).length) }), tone: "mute" } : null,
      topDomain ? { text: this.t("unrefFactDomain", { name: topDomain[0] }), tone: "mute" } : null,
    ].filter(Boolean);
    // One status pill per tile, as on Maintenance: how many with their noun, or "Nothing to do" in green.
    const status = (n, unit, tone) => (n ? { pill: this.tCount(unit, n), tone } : { pill: this.t("cleanupNothing"), tone: "ok" });
    // The tiles are the navigation: each one is one job, with how much there is to do.
    const tabs = [
      { id: "entities", icon: "mdi:shape-outline", label: this.t("cleanupTabEntities"), hint: this.t("cleanupTileEntitiesHint"), ...status(count("disable_entity"), "cuEntities", "warn") },
      { id: "devices", icon: "mdi:devices", label: this.t("cleanupTabDevices"), hint: this.t("cleanupTileDevicesHint"), ...status(count("disable_device"), "cuDevices", "warn") },
      { id: "quarantine", icon: "mdi:archive-clock-outline", label: this.t("cleanupTabQuarantine"), hint: this.t("cleanupTileQuarantineHint", { days: limit }), ...(held.length ? { pill: heldReady ? this.t("cuHeldReady", { n: this.formatNumber(held.length), ready: this.formatNumber(heldReady) }) : this.tCount("cuHeld", held.length), tone: heldReady ? "ok" : "mute" } : status(0)) },
      { id: "stats", icon: "mdi:database-remove-outline", label: this.t("orphanStats"), hint: this.t("cleanupTileStatsHint"), ...status(statsCount, "cuStats", "mute") },
      { id: "unused", icon: "mdi:link-variant-off", label: this.t("unreferenced"), hint: this.t("cleanupTileUnusedHint"), ...status(unusedCount, "cuUnused", "mute"), facts: unusedFacts },
    ];
    const open = this.viewTabOf("cleanup", tabs, "entities");
    const tiles = this.cleanupTiles(tabs, open);
    if (["unused", "stats"].includes(open)) {
      this.unrefTab = open === "stats" ? "statistics" : "entities";
      this._embedUnref = true;
      const body = this.unreferencedView();
      this._embedUnref = false;
      // What was deleted from the recorder is noted in the Journal.
      const pointer = open === "stats" && purges.length ? `<p class="factnote pad">${this.t("purgesInJournal", { n: purges.length })} <button class="link" data-jump="journal" data-jump-tab="purges">${this.t("purgesInJournalLink")}</button></p>` : "";
      return `<div class="stack">${this.planHeader()}${tiles}${pointer}${body}</div>`;
    }
    const quarantineType = this.quarantineType === "device" ? "device" : "entity";
    this._cleanupKinds = open === "devices" ? ["disable_device"] : open === "quarantine" ? (quarantineType === "device" ? ["remove_device", "forget_device"] : ["remove_entity"]) : ["disable_entity"];
    if (!this._cleanupKinds.includes(this.cleanupKind)) this.cleanupKind = this._cleanupKinds[0];
    this.lvState("cleanup", "name", "asc");
    const all = this.cleanupCandidates();
    const sorts = [
      { key: "name", label: "sortName", dir: "asc", get: r => r.item.name },
      { key: "id", label: "sortId", dir: "asc", get: r => r.item.object_id },
      { key: "since", label: "sortSince", dir: "desc", get: r => (r.quarantine ? r.quarantine.since : r.finding?.first_detected_at) },
      { key: "certainty", label: "sortCertainty", dir: "desc", get: r => (r.finding ? r.finding.confidence : null) },
      { key: "status", label: "sortStatus", dir: "asc", get: r => (r.finding ? r.finding.classification : r.quarantine ? limit - this.daysSince(r.quarantine.since) : r.count) },
    ];
    const ready = r => !r.quarantine || this.daysSince(r.quarantine.since) >= limit;
    const classes = [...new Set(all.filter(r => r.finding).map(r => r.finding.classification))];
    const removal = ["remove_entity", "remove_device", "forget_device"].includes(this.cleanupKind);
    const device = DEVICE_KINDS.includes(this.cleanupKind);
    const filterOptions = removal ? [["ready", this.t("removalReady")], ["waiting", this.t("waitingShort")]] : classes.map(c => [c, this.t(c)]);
    const bar = this.listBar("cleanup", { table: true, dense: true, sorts, filters: [{ name: removal ? "readiness" : "classification", all: this.t(removal ? "cleanupAllReadiness" : "cleanupAllClasses"), options: filterOptions }] });
    const list = this.refine("cleanup", all, {
      text: r => [r.item.name, r.item.object_id, r.item.platform, r.item.manufacturer, r.item.model].join(" "),
      filters: { classification: (r, v) => r.finding && r.finding.classification === v, readiness: (r, v) => (v === "ready") === ready(r) }, sorts, tie: r => r.item.object_id,
    });
    const shownList = this.selOnly?.cleanup ? list.filter(r => this.cleanupSel.has(r.item.object_id)) : list;
    const pg = this.paginate("cleanup", shownList);
    this._cleanupVisible = pg.rows.filter(ready).map(r => r.item.object_id);
    const badge = r => {
      const left = r.quarantine ? limit - this.daysSince(r.quarantine.since) : 0;
      return r.finding ? this.pill(r.finding.classification) : r.quarantine ? `<span class="pill ${left > 0 ? "mute" : "ok"}">${left > 0 ? this.t("daysLeftShort", { days: left }) : this.t("removalReady")}</span>` : `<span class="pill mute">${this.t(r.count ? "deviceEntities" : "deviceNoEntities", { count: r.count })}</span>`;
    };
    const recorderCol = this.cleanupKind === "remove_entity" && this.data?.meta?.recorder_available;
    const columns = [
      { key: "sel", label: "selectPage", narrow: true, sortable: false, allBox: () => this.cleanupHeadBox(),
        cell: r => `<input type="checkbox" class="selbox" data-sel="${this.esc(r.item.object_id)}" ${this.cleanupSel.has(r.item.object_id) ? "checked" : ""} ${r.quarantine && limit - this.daysSince(r.quarantine.since) > 0 ? "disabled" : ""} aria-label="${this.esc(r.item.name)}">` },
      { key: "name", label: "sortName", dir: "asc", sortKeys: ["id"],
        headSuffix: () => `<button type="button" class="thbtn th-alt" data-lsort="cleanup|id|asc">${this.t("sortId")}${this.lv.cleanup.sort === "id" ? ` <span aria-hidden="true">${this.lv.cleanup.dir === "desc" ? "↓" : "↑"}</span>` : ""}</button>`,
        cell: r => `<div class="statcell">${this.tile(r.item.object_type, "")}<div>${this.nameCell(r.item.name, r.item.object_type === "device" ? [r.item.manufacturer, r.item.model].filter(Boolean).join(" ") || r.item.object_id : r.item.object_id)}</div></div>` },
      // Entities and devices show the reason of their finding, as the findings page names it; the quarantine its state.
      { key: "status", label: open === "quarantine" ? "sortStatus" : "cleanupColReason", dir: "asc", cell: badge },
      // Since when, as on the findings page: how long ago, the date below. In the quarantine it is the day it went in.
      { key: "since", label: open === "quarantine" ? "cleanupColHeld" : "sortSince", dir: "desc", cell: r => { const v = r.quarantine ? r.quarantine.since : r.finding?.first_detected_at; return v ? this.ageCell(v) : "–"; } },
      ...(all.some(r => r.finding) ? [{ key: "certainty", label: "sortCertainty", dir: "desc", cell: r => (r.finding?.confidence == null ? "–" : `${Math.round(r.finding.confidence * 100)} %`) }] : []),
      ...(recorderCol ? [{ key: "recorder", label: "cleanupColRecorder", sortable: false, cell: r => this.recorderOwn(r.item) || "–" }] : []),
      ...(open === "quarantine" ? [{ key: "release", label: "cleanupColAction", sortable: false, cell: r => (r.quarantine ? this.releaseControl(r.quarantine) : "") }] : []),
    ];
    const table = shownList.length ? this.listTable("cleanup", columns, pg.rows, { cls: "objs", rowAttrs: r => `data-object="${this.esc(`${r.item.object_type}:${r.item.object_id}`)}" tabindex="0" role="button" aria-label="${this.esc(r.item.name)}"` }) : `<div class="emptymsg"><ha-icon icon="mdi:check-circle-outline"></ha-icon>${all.length ? this.noMatches("cleanup") : this.t("cleanupNone")}</div>`;
    const n = this.cleanupSel.size;
    const candidates = `<div class="panel"><div class="panelhead"><div><h2>${this.t("cleanupCandidates")} (${all.length})</h2><p>${device ? this.t(removal ? "removalDeviceHint" : "deviceCandidatesHint", { days: limit }) : removal ? this.t("removalCandidatesHint", { days: limit }) : this.t("cleanupCandidatesHint")}</p></div></div>
      <div class="toolbar${n ? "" : " nosel"}">${this.selTools("cleanup", n, "data-sel-clear")}<span class="toolgap"></span>${this.kindSelect()}${this.recorderChoice(removal)}
      <button class="btn ${REMOVAL_KINDS.includes(this.cleanupKind) ? "dangersoft" : "primary"}" data-plan-create ${n && !this.cleanupBusy ? "" : "disabled"}>${this.cleanupBusy ? this.t("planCreating") : this.t(REMOVAL_KINDS.includes(this.cleanupKind) ? "prepareDelete" : "createPlan", { count: n })}</button>${this.viewCount(shownList.length)}</div>
      ${bar}${table}${pg.footer}</div>`;
    const typeSwitch = open === "quarantine" ? `<div class="seg qtype" role="group" aria-label="${this.esc(this.t("cleanupTabQuarantine"))}"><button class="chip ${quarantineType === "entity" ? "active" : ""}" data-qtype="entity">${this.t("qTypeEntities", { count: this.quarantineRows("entity").length })}</button><button class="chip ${quarantineType === "device" ? "active" : ""}" data-qtype="device">${this.t("qTypeDevices", { count: this.quarantineRows("device").length })}</button></div>` : "";
    const message = open === "quarantine" && this.releaseMessage ? `<p class="factnote" role="status">${this.esc(this.releaseMessage)}</p>` : "";
    return `<div class="stack">${this.planHeader()}${tiles}${typeSwitch}${open === "devices" ? this.recurringCard() : ""}${candidates}${message}</div>`;
  }

  ensureJournal() {
    if (this.journal === null && !this._journalRequested) { this._journalRequested = true; this.loadJournal(); }
  }

  // "Refresh" on the Journal: asks again; the lists show their loading state meanwhile.
  refreshJournal() {
    this.journal = null; this._journalRequested = false; this.journalError = "";
    this.ensureJournal(); this.render();
  }

  // Every new plan opens the same way: it becomes the open plan, goes on top of the journal and the
  // plan page shows it. The page it came from stays one step back. (`view` is kept for the callers' sake.)
  openNewPlan(plan, _view) {
    this.plan = plan; this.confirmation = null; this.ack = new Set(); this.confirmWord = "";
    this.journal = [plan, ...(this.journal || [])];
    this.showPlanView();
  }

  // The plan page is a page of its own without a menu entry; "back" returns to where the plan was started.
  showPlanView() {
    this._scrollPlan = true;
    if (this.view !== "plan") { this.noteJump?.("plan"); this.view = "plan"; this.pages = {}; this.selected = null; }
  }

  // "Cancel" on a preview: the plan is dropped for good, nothing stays in the journal.
  async discardPlan() {
    const id = this.plan?.plan_id;
    if (id) {
      try { await this._hass.callWS({ type: "ha_housekeeper/plan_delete", plan_id: id }); } catch (_) { /* already gone */ }
      this.journal = (this.journal || []).filter(p => p.plan_id !== id);
    }
    this.leavePlan();
  }

  // Whether a deletion of statistics also deletes the stored states: the preview is made again with that choice.
  async setPurgeStates(on) {
    const old = this.plan;
    if (!old || this.cleanupBusy) return;
    this.cleanupBusy = true; this.cleanupError = ""; this.render();
    try {
      const actions = old.actions.map(a => ({ kind: a.kind, object_id: a.object_id, ...(a.kind === "purge_statistics" ? { states: on } : {}) }));
      const fresh = await this._hass.callWS({ type: "ha_housekeeper/plan_create", actions });
      this.openNewPlan(fresh, null);
      try { await this._hass.callWS({ type: "ha_housekeeper/plan_delete", plan_id: old.plan_id }); } catch (_) { /* already gone */ }
      this.journal = (this.journal || []).filter(p => p.plan_id !== old.plan_id);
    } catch (err) { this.failPlan(err, "renew"); }
    this.cleanupBusy = false; this.render();
  }

  // The choice sits at the foot of the preview, only for plans that delete statistics.
  purgeStatesSwitch(plan) {
    const purges = plan.actions.filter(a => a.kind === "purge_statistics" && a.executable);
    if (!purges.length) return "";
    const on = purges.every(a => a.states), n = plan.simulation?.purge_states_rows;
    return `<label class="optswitch"><input class="policyswitch" type="checkbox" role="switch" data-purge-states-switch ${on ? "checked" : ""} ${this.cleanupBusy ? "disabled" : ""}><span><strong>${this.t("purgeStates")}</strong><small>${this.t(on ? "purgeStatesOn" : "purgeStatesOff", { n: this.formatNumber(n || 0) })}</small></span></label>`;
  }

  // Closing the plan page: back to the page it came from, else the journal.
  leavePlan() {
    this.plan = null; this.planChanges = null; this.cleanupError = "";
    if (this.view === "plan") {
      if (this.viewTrail.length) { this.viewBack(); return; }
      this.view = "journal"; this.pages = {};
    }
    this.render();
  }

  planView() {
    if (this.plan) return `<div class="stack">${this.planHeader(true)}</div>`;
    return `<div class="stack">${this.planHeader()}<p class="factnote pad">${this.t("planNone")}</p><div class="pad"><button class="btn" data-plan-close>${this.t("planClose")}</button></div></div>`;
  }

  // For the paths without a busy flag of their own: one request at a time, and their buttons are off
  // meanwhile. Returns null when a request is still running; an error goes to the caller.
  async newPlan(actions, view = "cleanup") {
    if (this.planBusy) return null;
    this.planBusy = true; this.render();
    try {
      const plan = await this._hass.callWS({ type: "ha_housekeeper/plan_create", actions });
      this.openNewPlan(plan, view);
      return plan;
    } finally { this.planBusy = false; }
  }

  // An error from the last request and the plan that is open, on top of every view that can finish one.
  // The dry-run sentence sits behind the coloured (i) in the page title (Cleanup, Journal); Repair says it in its subtitle.
  planHeader(withCard = false) {
    const from = this.cleanupErrorStamp === this.cleanupError ? this.cleanupErrorFrom : "";
    const lead = this.t({ confirm: "confirmError", check: "checkError", renew: "renewError" }[from] || "planError");
    const open = this.plan && this.isOpenPreview(this.plan);
    const renew = open && (this.planStale(this.plan) || this.planChanges || (from === "confirm" && this.cleanupErrorCode === "plan_too_old")) ? `<button class="btn primary" data-plan-renew="${this.esc(this.plan.plan_id)}" ${this.cleanupBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>${this.t("renewPlan")}</button>` : "";
    const modeLink = this.cleanupError && this.cleanupError === this.t("err_protection_mode") ? ` <button class="linkbtn" data-goto-protection>${this.t("modeBlockLink")}</button>` : "";
    const error = this.cleanupError ? `<div class="error">${lead}: ${this.esc(this.cleanupError)}${modeLink}${renew && !this.planChanges ? ` ${renew}` : ""}</div>` : "";
    const changes = this.planChanges?.length ? `<div class="panel"><div class="error"><strong>${this.t("planChangedTitle")}</strong><small class="dim7">${this.t("planChangedHint")}</small><ul class="evlist">${this.planChanges.slice(0, 10).map(c => `<li>${this.esc(c.object_id)}</li>`).join("")}</ul>${this.planChanges.length > 10 ? `<small>${this.t("planChangedMore", { count: this.planChanges.length - 10 })}</small>` : ""}${renew}</div></div>` : "";
    return `${error ? `<div class="panel">${error}</div>` : ""}${changes}${withCard && this.plan ? this.planCard(this.plan) : ""}`;
  }

  // Every plan from Cleanup and Repair: what changed, what was checked, and what can be undone.
  journalView() {
    this.ensureJournal();
    const plans = this.journal || [];
    const fuState = plan => plan.followup?.state ?? plan.followup ?? "";
    const statusOf = plan => plan.status || "dry_run";
    const statuses = [...new Set(plans.map(statusOf))], follows = [...new Set(plans.map(fuState).filter(Boolean))];
    const summary = plan => `${this.t("planSummary", { total: plan.summary?.total ?? 0, ok: plan.summary?.ok ?? 0, review: plan.summary?.review ?? 0, blocked: plan.summary?.blocked ?? 0 })}${plan.file_snapshot_dropped ? ` · ${this.t("snapshotDropped")}` : ""}${plan.followup === "watching" && plan.followup_until ? ` · ${this.t("fuWatching", { date: this.formatDate(plan.followup_until) })}` : ""}`;
    const columns = [
      { key: "sel", label: "mergeSelect", narrow: true, sortable: false, allBox: rows => this.journalHeadBox(rows), cell: plan => (this.mergeable(plan) ? `<input type="checkbox" class="selbox" data-merge-sel="${this.esc(plan.plan_id)}" ${this.mergeSel?.has(plan.plan_id) ? "checked" : ""} aria-label="${this.esc(this.t("mergeSelect"))}">` : "") },
      { key: "date", label: "journalColDate", dir: "desc", cell: plan => `<span class="statcell"><span class="tile mute"><ha-icon icon="mdi:clipboard-text-clock-outline"></ha-icon></span><strong>${this.esc(this.formatDate(plan.created_at))}</strong></span>` },
      { key: "status", label: "sortStatus", dir: "asc", cell: plan => `<span class="pill ${plan.status === "verified" ? "ok" : plan.status === "dry_run" ? "mute" : "warn"}">${this.t(`plan_status_${statusOf(plan)}`)}</span>${this.planStale(plan) ? ` <span class="pill warn">${this.t("planStale")}</span>` : ""}` },
      ...(this.isDenseList("journal") ? [] : [{ key: "total", label: "journalColActions", dir: "desc", cell: plan => `<span class="jsum">${this.esc(summary(plan))}</span>` }]),
      { key: "follow", label: "journalColFollow", sortable: false, cell: plan => (fuState(plan) ? `<span class="pill ${this.followupTone(fuState(plan))}">${this.t(`fu_${fuState(plan)}`)}</span>` : "–") },
      { key: "act", label: "journalColAct", sortable: false, cell: plan => `<span class="jbtns">${this.planStale(plan) ? `<button type="button" class="btn small" data-plan-renew="${this.esc(plan.plan_id)}" ${this.cleanupBusy ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon>${this.t("renewPlan")}</button>` : ""}${plan.executed || plan.run ? "" : this.deleteButton(`data-plan-delete="${this.esc(plan.plan_id)}"`, this.t("deletePlan"))}</span>` },
    ];
    const table = plans.length ? this.sysList("journal", plans, {
      sort: "date", dir: "desc", columns, cls: "journal", empty: "journalEmpty",
      rowAttrs: plan => `data-plan-open="${this.esc(plan.plan_id)}" tabindex="0" role="button" aria-label="${this.esc(`${this.t("openPlan")}: ${this.formatDate(plan.created_at)}`)}"`,
      sorts: [
        { key: "date", label: "journalColDate", dir: "desc", get: p => p.created_at },
        { key: "status", label: "sortStatus", dir: "asc", get: p => this.t(`plan_status_${statusOf(p)}`) },
        { key: "total", label: "journalColActions", dir: "desc", get: p => p.summary?.total ?? 0 },
      ],
      filters: [
        { name: "status", all: this.t("journalAllStatus"), options: statuses.map(x => [x, this.t(`plan_status_${x}`)]) },
        ...(follows.length ? [{ name: "follow", all: this.t("journalAllFollow"), options: follows.map(x => [x, this.t(`fu_${x}`)]) }] : []),
      ],
      filterFns: { status: (p, v) => statusOf(p) === v, follow: (p, v) => fuState(p) === v },
      text: p => `${this.formatDate(p.created_at)} ${this.t(`plan_status_${statusOf(p)}`)}`, tie: p => p.created_at,
    }) : `<div class="emptymsg mute"><ha-icon icon="mdi:clipboard-text-outline"></ha-icon><strong>${this.t("journalEmpty")}</strong>${this.t("journalEmptyNext")}<button class="btn" data-jump="repair">${this.t("repair")}</button></div>`;
    const picked = this.mergeSel?.size || 0;
    const tools = plans.some(p => this.mergeable(p)) ? `<div class="toolbar${picked ? "" : " nosel"}"><button class="btn" data-merge ${picked >= 2 && picked <= 10 && !this.cleanupBusy ? "" : "disabled"}${picked > 10 ? ` title="${this.esc(this.t("mergeTooMany"))}"` : ""}>${this.t("mergeButton", { count: picked })}</button><button class="btn dangersoft" data-merge-delete ${picked && !this.cleanupBusy ? "" : "disabled"}>${this.t("deleteSelectedPlans", { count: picked })}</button><span class="selcount" aria-live="polite">${this.t("selectedCount", { count: picked })}</span>${this.viewCount(this.lv.journal?.shown ?? plans.length)}</div>` : "";
    const journalCard = `<div class="panel"><div class="panelhead"><div><h2>${this.t("journalPlans")}</h2><p>${this.t("journalHint")}</p></div></div>${this.mergeNote ? `<div class="pad"><small role="status">${this.esc(this.mergeNote)}</small></div>` : ""}${tools}${table}</div>`;
    const removed = this.removed || [], purges = this.purges || [];
    const tabs = [
      { id: "plans", icon: "mdi:clipboard-text-clock-outline", label: this.t("journalPlans"), hint: this.t("journalTabPlansHint"), count: plans.length, tone: "mute" },
      { id: "devices", icon: "mdi:delete-outline", label: this.t("lifeRemovedTab"), hint: this.t("journalTabDevicesHint"), count: removed.length, tone: "mute" },
      // Only older installations have these: deletions of recorder leftovers from before there were plans.
      ...(purges.length ? [{ id: "purges", icon: "mdi:database-remove-outline", label: this.t("cleanupTabPurges"), hint: this.t("journalTabPurgesHint"), count: purges.length, tone: "mute" }] : []),
    ];
    const open = this.viewTabOf("journal", tabs, "plans");
    const head = this.pageBar({ at: this.loadedAt("journal"), loading: this.journal === null, attr: "data-journal-refresh" });
    const failed = this.journalError ? `<div class="panel">${this.notice("err", this.journalError)}</div>` : "";
    const body = this.journalError ? "" : open === "devices" ? this.removedCard() : open === "purges" ? this.purgeJournalCard() : journalCard;
    return `<div class="stack">${this.planHeader()}${head}${this.navTiles("journal", tabs, open, this.t("journal"), true)}${failed}${body}</div>`;
  }

  // Where the person is in an assistant: choose, set up, look at the preview.
  stepsBar(current) {
    const names = ["stepChoose", "stepSetup", "stepPreview"];
    return `<div class="stepsbar" role="list">${names.map((name, i) => `${i ? `<span class="line${i < current ? " done" : ""}"></span>` : ""}<span class="step${i + 1 === current ? " on" : i + 1 < current ? " done" : ""}" role="listitem"${i + 1 === current ? ' aria-current="step"' : ""}><i>${i + 1 < current ? "✓" : i + 1}</i><b class="stepname">${this.t(name)}</b></span>`).join("")}</div>`;
  }

  // Tasks that fix something that stays. A tile opens the assistant for one task; the plan is finished in the same view.
  repairView() {
    this.ensureJournal();
    const task = REPAIR_TASKS.some(([kind]) => kind === this.repairTask) ? this.repairTask : null;
    const scan = this.counterScan, found = scan?.items?.length || 0;
    // Without a scan there is nothing to count: the tile says so instead of showing nothing (no scan runs by itself).
    const state = kind => kind !== "repair_counter" ? "" : !scan?.available ? `<span class="pill mute">${this.t("repairNotChecked")}</span>` : found ? `<span class="pill warn">${this.t("repairFound", { count: found })}</span>` : `<span class="pill ok">${this.t("repairNoneFound")}</span>`;
    const tone = kind => (kind !== "repair_counter" ? "ac" : !scan?.available ? "mute" : found ? "warn" : "ok");
    const tiles = REPAIR_TASKS.map(([kind, icon, label, hint]) => `<button class="taskcard t-${tone(kind)}${kind === task ? " on" : ""}" aria-pressed="${kind === task}" data-repair-task="${kind}"><ha-icon icon="${icon}"></ha-icon><strong>${this.t(label)}</strong><span class="setpill">${state(kind)}</span><small>${this.t(hint)}</small></button>`).join("");
    const nav = `<div class="taskgrid compactgrid setgrid navtiles compact" style="--cols:${this.navColumns(REPAIR_TASKS.length)}" role="group" aria-label="${this.esc(this.t("repairTitle"))}">${tiles}</div>`;
    let body;
    if (task) {
      const card = { exchange_device: () => this.exchangeCard(), replace_references: () => this.replaceCard(), migrate_meter: () => this.meterCard(), repair_counter: () => this.counterCard() }[task]();
      const chosen = { repair_counter: (this.counterId || "").trim(), migrate_meter: this.meterOld, replace_references: this.replOld, exchange_device: this.exchangeState().oldDev }[task];
      body = `${this.stepsBar(chosen ? 2 : 1)}${card}`;
    } else {
      body = `<p class="factnote pad">${this.t("repairHint")}</p>`;
    }
    return `<div class="stack">${this.planHeader()}${nav}${body}</div>`;
  }
}
