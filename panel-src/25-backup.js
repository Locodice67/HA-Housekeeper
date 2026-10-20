// BackupMixin: the backup protection card in Maintenance; mixed into the panel in 99-register.js.
class BackupMixin {
  // `call` is the attest command or nothing (just read). Every reply is the full report.
  async loadBackup(call) {
    if (call) this.bhForm = null;
    this.backupLoading = true; this.backupError = ""; this.render();
    try { this.backup = await this._hass.callWS(call || { type: "ha_housekeeper/backup_health" }); this.markLoaded("backup"); }
    catch (err) { this.backupError = this.errText(err); }
    this.backupLoading = false; this.render();
  }

  // Loads once, and again after every new scan, so the overview and Maintenance never show an old report.
  ensureBackup() {
    const key = this.data?.meta?.scanned_at || "";
    if (this.backupLoading || (this._bhKey === key && this._bhRequested)) return;
    this._bhRequested = true; this._bhKey = key;
    setTimeout(() => this.loadBackup(), 0);
  }

  // A span of hours or days. `ago` gives the form after "vor" ("vor 3 Tagen"); without it a plain span ("3 Tage").
  bhAge(hours, ago = false) { return hours >= 48 ? this.t(ago ? "bhAgeDaysAgo" : "bhAgeDays", { n: Math.round(hours / 24) }) : this.t("bhAgeHours", { n: Math.max(1, Math.round(hours)) }); }

  bhDay(iso) {
    if (!iso) return "—";
    try { return new Intl.DateTimeFormat(this.lang, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso)); } catch (_) { return iso; }
  }

  bhList(items) { return items?.length ? items.map(i => this.esc(i)).join(", ") : this.t("bhNone"); }

  // A backup target as a person calls it: "hassio.local" is the device, "hassio.<name>" a network
  // storage they named themselves, anything else an integration (the account part is left out).
  bhAgent(id) {
    const [domain, ...rest] = String(id).split("."), name = rest.join(".");
    const brands = { google_drive: "Google Drive", onedrive: "OneDrive", onedrive_for_business: "OneDrive for Business", dropbox: "Dropbox", cloud: "Nabu Casa", synology_dsm: "Synology", webdav: "WebDAV", backblaze_b2: "Backblaze B2", idrive_e2: "IDrive e2", cloudflare_r2: "Cloudflare R2", azure_storage: "Azure Storage" };
    if (String(id).endsWith(".local")) return { label: this.t("bhAgentLocal"), local: true };
    if (domain === "hassio" && name) return { label: this.t("bhAgentNetwork", { name }), local: false };
    const plain = domain.replace(/_/g, " ");
    return { label: brands[domain] || plain.charAt(0).toUpperCase() + plain.slice(1), local: false };
  }

  bhAgents(items) { return items?.length ? items.map(i => this.esc(this.bhAgent(i).label)).join(", ") : this.t("bhNone"); }

  bhAgentPills(items) {
    return items?.length ? `<span style="display:inline-flex;gap:4px;flex-wrap:wrap">${items.map(i => { const a = this.bhAgent(i); return `<span class="pill ${a.local ? "mute" : "ok"}" title="${this.esc(i)}">${this.esc(a.label)}</span>`; }).join("")}</span>` : this.t("bhNone");
  }

  // The sentence for one check; the backend sends numbers and ids only.
  bhText(c) {
    const v = c.values || {}, t = (k, vars) => this.t(k, vars);
    switch (c.id) {
      case "setup":
        if (c.level === "problem") return t("bhSetupProblem");
        if (c.level === "note") return t("bhSetupNote");
        return t("bhSetupOk", { agents: this.bhAgents(v.agents), recurrence: t(`bhRec_${v.recurrence}`) });
      case "newest":
        return v.age_hours === null || v.age_hours === undefined ? t("bhNewestNone") : t("bhNewestText", { age: this.bhAge(v.age_hours, true), limit: this.bhAge(v.limit_hours) });
      case "last_run": {
        if (c.level === "unknown") return t("bhRunUnknown");
        const parts = [];
        if (v.failed_attempt) parts.push(t("bhRunFailed", { attempted: this.formatDate(v.attempted), completed: v.completed ? this.formatDate(v.completed) : t("bhNever") }));
        if (v.failed_agents?.length) parts.push(t("bhRunAgents", { agents: this.bhAgents(v.failed_agents) }));
        return parts.length ? parts.join(" ") : t("bhRunOk", { completed: this.formatDate(v.completed) });
      }
      case "targets":
        if (v.at && !v.remote?.length) return t("bhTargetsConfirmed", { local: this.bhAgents(v.local), date: this.bhDay(v.at) });
        if (v.at) return t("bhTargetsOkConfirmed", { local: this.bhAgents(v.local), remote: this.bhAgents(v.remote), date: this.bhDay(v.at) });
        if (c.level === "note") {
          // A remote target is set up, but the newest backup did not reach it: say so instead of "local only".
          const set = (this.backup?.checks || []).find(x => x.id === "setup")?.values?.agents || [];
          const missed = set.filter(a => !this.bhAgent(a).local);
          return missed.length ? t("bhTargetsMissed", { remote: this.bhAgents(missed), local: this.bhAgents(v.local) }) : t("bhTargetsNote", { local: this.bhAgents(v.local) });
        }
        return c.level === "ok" ? t("bhTargetsOk", { local: this.bhAgents(v.local), remote: this.bhAgents(v.remote) }) : "";
      case "size":
        if (c.level === "unknown") return t("bhSizeUnknown");
        return t(c.level === "ok" ? "bhSizeOk" : "bhSizeNote", { size: this.formatBytes(v.size), expected: this.formatBytes(v.expected), percent: Math.round(v.ratio * 100) });
      case "retention": {
        if (c.level === "note") return t("bhRetentionNote", { count: v.count });
        const limit = [v.copies !== null && v.copies !== undefined ? t("bhRetCopies", { n: v.copies }) : "", v.days !== null && v.days !== undefined ? t("bhRetDays", { n: v.days }) : ""].filter(Boolean).join(" · ");
        return t("bhRetentionOk", { limit, count: v.count, oldest: v.oldest_days === null ? "—" : Math.round(v.oldest_days) });
      }
      case "encryption":
        if (v.at) return t("bhEncConfirmed", { date: this.bhDay(v.at) });
        if (c.level === "ok") return t("bhEncOk");
        return t(v.configured ? "bhEncNotProtected" : "bhEncNoPassword");
      case "emergency_kit":
        return v.at ? t("bhKitOk", { date: this.bhDay(v.at) }) : t("bhKitNone");
      case "restore_test":
        if (!v.at) return t("bhRestoreNone");
        return t(c.level === "ok" ? "bhRestoreOk" : "bhRestoreOld", { date: this.bhDay(v.at), days: v.age_days, limit: 180 });
      case "content":
        if (c.level === "unknown") return t("bhContentUnknown");
        if (c.level === "problem") return t("bhContentFailed", { items: this.bhList(v.failed) });
        if (c.level === "note") return t(v.scheduled === false ? "bhContentNoDbSet" : "bhContentNoDb");
        return t("bhContentOk", { apps: this.formatNumber(v.apps ?? 0), folders: this.formatNumber(v.folders ?? 0) });
      case "remote_age": {
        const row = a => `${this.esc(this.bhAgent(a.agent).label)}: ${this.esc(this.t("backupAgo", { age: this.bhAge(a.age_hours, true) }))}`;
        return c.level === "note"
          ? t("bhRemoteStale", { items: (v.agents || []).filter(a => (v.stale || []).includes(a.agent)).map(row).join(", "), limit: this.bhAge(v.limit_hours) })
          : t("bhRemoteOk", { items: (v.agents || []).map(row).join(", ") });
      }
      case "space":
        if (c.level === "unknown") return t("bhSpaceUnknown");
        return t({ ok: "bhSpaceOk", note: "bhSpaceNote", problem: "bhSpaceProblem" }[c.level], { free: this.formatBytes(v.free), size: this.formatBytes(v.size), need: this.formatBytes(v.need) });
      case "own_backups":
        return t("bhOwnNote", { count: v.count, size: this.formatBytes(v.size) });
      case "plan_backups":
        return c.level === "ok" ? t("bhPlansOk", v) : t("bhPlansNote", v);
      default:
        return "";
    }
  }

  bhRow(c) {
    const tone = { ok: "ok", note: "warn", problem: "red", unknown: "mute" }[c.level] || "mute";
    const icon = { ok: "mdi:check", note: "mdi:alert-outline", problem: "mdi:close-octagon-outline", unknown: "mdi:help-circle-outline" }[c.level] || "mdi:help-circle-outline";
    const attest = c.id === "targets" || c.id === "emergency_kit" || c.id === "restore_test" || c.id === "encryption";
    const tidy = c.id === "own_backups" ? `<button class="bhopen" data-bkc-open>${this.t("bhOwnOpen")}</button>` : "";
    const open = attest && c.level !== "unknown" && this.bhForm === c.id;
    const opener = attest && c.level !== "unknown" ? `<button class="bhopen" data-bh-open="${c.id}" aria-expanded="${open}">${this.t(c.values?.at ? "bhAttestAgain" : c.id === "targets" ? "bhAttestTargets" : c.id === "encryption" ? "bhAttestEnc" : "bhAttestMark")}</button>` : "";
    const row = `<div class="row rel bh${open ? " open" : ""}"><span class="tile ${tone}"><ha-icon icon="${icon}"></ha-icon></span><span class="row-text"><strong>${this.t(`bh_${c.id}`)}</strong><small>${this.bhText(c)}</small></span><span class="bhactions">${opener}${tidy}<span class="pill ${tone}">${this.t(`bhLevel_${c.level}`)}</span></span></div>`;
    if (!open) return row;
    const today = new Date().toISOString().slice(0, 10);
    const clear = c.values?.at ? `<button class="bhtake" data-bh-clear="${c.id}">${this.t("bhAttestClear")}</button>` : "";
    return `${row}<div class="bhattest"><label>${this.t("bhAttestDate")} <input type="date" data-bh-date="${c.id}" value="${today}" max="${today}"></label><button class="btn small primary" data-bh-save="${c.id}">${this.t("bhAttestSave")}</button><button class="bhcancel" data-bh-cancel>${this.t("bhAttestCancel")}</button>${clear}</div>`;
  }

  // What a backup is: Housekeeper's own safety copy, one HA made on its schedule, a manual one, or one
  // from another tool (HA has no flag for it, so it cannot tell scheduled from manual).
  bhKind(b) { return b.own ? "own" : b.automatic === true ? "auto" : b.automatic === false ? "manual" : "other"; }

  bhKey(b) { return b.id || b.date || ""; }

  bhContent(b) { return b.partial ? "config" : b.ha_included === false ? "apps" : "full"; }

  bhFailed(b) { return [...(b.failed_agents || []), ...(b.failed_apps || []), ...(b.failed_folders || [])]; }

  // The row under an open backup: name, version, what it holds, size per target, failures.
  bhDetail(b) {
    if (!(this.bhOpen || []).includes(this.bhKey(b))) return "";
    const t = (k, v) => this.t(k, v), field = (label, value, cls = "") => `<div${cls ? ` class="${cls}"` : ""}><small>${t(label)}</small>${value}</div>`;
    const dash = "–", list = items => (items?.length ? items.map(i => this.esc(i)).join(", ") : dash);
    const sizes = Object.entries(b.agent_sizes || {}).map(([agent, size]) => `${this.esc(agent)} ${this.esc(this.formatBytes(size))}`).join(" · ") || dash;
    const db = b.database === null || b.database === undefined ? dash : t(b.database ? "bhYes" : "bhNo");
    return `<tr class="static remhist"><td colspan="6"><div class="bhgrid">${field("bhName", this.esc(b.name || dash))}${field("bhVersion", this.esc(b.version || dash))}${field("bhDatabase", db)}${field("bhApps", list(b.apps), "wide")}${field("bhFolders", list(b.folders))}${field("bhSizes", sizes)}${field("bhFailed", list(this.bhFailed(b)))}${field("bhId", this.esc(b.id || dash))}</div></td></tr>`;
  }

  bhBackups(list) {
    if (!list?.length) return "";
    const id = "bhbackups";
    this.lvState(id, "date", "desc");
    const sorts = [
      { key: "date", label: "bhColDate", dir: "desc", get: b => b.date },
      { key: "size", label: "bhColSize", dir: "desc", get: b => b.size },
      { key: "protected", label: "bhColProtected", dir: "desc", get: b => (b.protected ? 1 : 0) },
    ];
    const bar = this.listBar(id, { table: true, dense: true, sorts, filters: [
      { name: "kind", all: this.t("bhAllKinds"), options: ["auto", "manual", "other", "own"].map(k => [k, this.t(`bhKind_${k}`)]) },
      { name: "protected", all: this.t("bhAllProtected"), options: [["yes", this.t("bhYes")], ["no", this.t("bhNo")]] },
    ] });
    const rows = this.refine(id, list, { text: b => [this.formatDate(b.date), b.name, ...(b.agents || [])].join(" "), filters: { kind: (b, v) => this.bhKind(b) === v, protected: (b, v) => Boolean(b.protected) === (v === "yes") }, sorts, tie: b => b.date });
    const pg = this.paginate(id, rows, [10, 20]);
    const open = b => (this.bhOpen || []).includes(this.bhKey(b));
    const columns = [
      { key: "date", label: "bhColDate", dir: "desc", cell: b => `<div class="statcell">${this.expandBtn("data-bh-more", this.bhKey(b), open(b), this.t(open(b) ? "bhClose" : "bhOpen"))}<div>${this.esc(this.formatDate(b.date))}</div></div>` },
      { key: "kind", label: "bhColKind", sortable: false, cell: b => `<span class="pill ${b.own ? "warn" : "mute"}">${this.t(`bhKind_${this.bhKind(b)}`)}</span>` },
      { key: "content", label: "bhColContent", sortable: false, cell: b => `<span class="pill ${this.bhContent(b) === "full" ? "ok" : "mute"}">${this.t(`bhContent_${this.bhContent(b)}`)}</span>${this.bhFailed(b).length ? `<span class="pill red bhfail">${this.t("bhFailedPill")}</span>` : ""}` },
      { key: "size", label: "bhColSize", dir: "desc", cell: b => this.esc(this.formatBytes(b.size)) },
      { key: "targets", label: "bhColTargets", sortable: false, cell: b => this.bhAgentPills(b.agents) },
      { key: "protected", label: "bhColProtected", dir: "desc", cell: b => this.t(b.protected ? "bhYes" : "bhNo") },
    ];
    const table = rows.length ? this.listTable(id, columns, pg.rows, { cls: "bh", rowAttrs: b => `data-bh-row="${this.esc(this.bhKey(b))}" tabindex="0" role="button" aria-expanded="${open(b)}"`, after: b => this.bhDetail(b) }) : `<div class="emptymsg">${this.noMatches(id)}</div>`;
    return `<div class="panel"><div class="sectionlabel">${this.t("bhListTitle")}</div>${bar}${table}${pg.footer}</div>`;
  }

  backupCard() {
    const head = this.pageBar({ at: this.loadedAt("backup"), loading: this.backupLoading, attr: "data-bh-refresh" });
    if (this.backupError) return `<div class="stack">${head}<div class="panel">${this.notice("err", this.backupError)}</div></div>`;
    const b = this.backup;
    if (!b) return `<div class="stack">${head}<div class="panel">${this.skeleton("backupLoading")}</div></div>`;
    if (!b.available) return `<div class="stack">${head}<div class="panel"><div class="emptymsg">${this.t("backupUnavailable")}</div></div></div>`;
    const guide = `<details class="bhguide"><summary>${this.t("bhGuideTitle")}</summary><p class="factnote">${this.t("bhGuideSteps")}</p></details>`;
    return `<div class="stack">${head}${this.bhTiles(b)}<div class="panel">${this.bhVerdict(b)}${this.bhGroups(b.checks)}${guide}</div>${this.bhSizes(b)}${this.bhBackups(b.backups)}${this.bkcFold()}</div>`;
  }

  // The sizes of the last backups as bars: growth shows long before the one that is "unusual".
  bhSizes(b) {
    const rows = (b.backups || []).filter(x => !x.own && !x.partial && x.size && x.date).slice(0, 14).reverse();
    if (rows.length < 3) return "";
    const max = Math.max(...rows.map(x => x.size)), last = rows[rows.length - 1], first = rows[0];
    const tone = b.checks.find(c => c.id === "size")?.level === "note" ? " warn" : "";
    // Columns from zero, one per backup, each with its date, size and change to the one before as a tooltip.
    const tip = (x, i) => { const d = i ? x.size - rows[i - 1].size : 0; return [this.formatDate(x.date), this.formatBytes(x.size), i ? `${d >= 0 ? "+" : "−"}${this.formatBytes(Math.abs(d))}` : ""].filter(Boolean).join(" · "); };
    const bars = rows.map((x, i) => `<i class="${i === rows.length - 1 ? `last${tone}` : ""}" style="height:${Math.max(3, Math.round((x.size / max) * 100))}%" title="${this.esc(tip(x, i))}"><span class="sr-only">${this.esc(tip(x, i))}</span></i>`).join("");
    const label = this.t("bhSizesLabel", { n: rows.length, from: this.formatBytes(first.size), to: this.formatBytes(last.size) });
    return `<div class="panel"><div class="sectionlabel">${this.t("bhSizesTitle")}</div><div class="bhchart"><span class="bhaxis"><b>${this.esc(this.formatBytes(max))}</b><b>0</b></span><div class="bhsizes" role="img" aria-label="${this.esc(label)}">${bars}</div><span class="bhdates"><b>${this.esc(this.bhDay(first.date))}</b><b>${this.esc(this.bhDay(last.date))}</b></span></div><p class="factnote pad">${this.t("bhSizesNote", { n: rows.length, from: this.formatBytes(first.size), to: this.formatBytes(last.size) })}</p></div>`;
  }


  // The checks in the order a person thinks in: does it run, where is it kept and what is in it, can it be restored, what Housekeeper adds.
  bhGroups(checks) {
    const groups = [
      ["running", ["setup", "newest", "last_run"]],
      ["storage", ["targets", "remote_age", "content", "size", "retention", "space"]],
      ["restore", ["encryption", "emergency_kit", "restore_test"]],
      ["house", ["plan_backups", "own_backups"]],
    ];
    const known = new Set(groups.flatMap(([, ids]) => ids));
    return groups.map(([name, ids], i) => {
      const rows = checks.filter(c => ids.includes(c.id) || (i === groups.length - 1 && !known.has(c.id)));
      rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      return rows.length ? `<div class="sectionlabel">${this.t(`bhGroup_${name}`)}</div>${rows.map(c => this.bhRow(c)).join("")}` : "";
    }).join("");
  }

  // One line on top: reliable, look first or a problem, and what to look at.
  bhVerdict(b) {
    const tone = { ok: "ok", note: "warn", problem: "red" }[b.overall] || "mute";
    const icon = { ok: "mdi:check-circle-outline", note: "mdi:alert-outline", problem: "mdi:close-octagon-outline" }[b.overall] || "mdi:help-circle-outline";
    const open = b.checks.filter(c => c.level === "note" || c.level === "problem").map(c => this.t(`bh_${c.id}`));
    const sub = open.length ? this.t("bhCheckFirst", { items: `${open.slice(0, 4).join(", ")}${open.length > 4 ? ", …" : ""}` }) : "";
    return `<div class="row rel"><span class="tile ${tone}"><ha-icon icon="${icon}"></ha-icon></span><span class="row-text"><strong>${this.t(`bhVerdict_${b.overall}`)}</strong>${sub ? `<small>${this.esc(sub)}</small>` : ""}</span></div>`;
  }

  // Four figures above the checks. The size is not among them: the list holds only the newest backups.
  bhTiles(b) {
    const by = Object.fromEntries(b.checks.map(c => [c.id, c.values || {}]));
    const age = by.newest?.age_hours, remote = by.targets?.remote?.length || by.targets?.at;
    const open = (b.counts?.note || 0) + (b.counts?.problem || 0);
    return this.sumTiles([
      { label: this.t("bhTileLast"), value: age === null || age === undefined ? "–" : this.esc(this.t("backupAgo", { age: this.bhAge(age, true) })), tone: "mute" },
      { label: this.t("bhTileCount"), value: this.formatNumber(b.backup_count ?? 0), tone: "mute" },
      { label: this.t("bhTileRemote"), value: this.t(remote ? "bhYes" : "bhNo"), tone: remote ? "ok" : "warn" },
      // The number counts problems and hints together; below it, how many of each, so it matches "2 problems" above.
      { label: this.t("bhTileOpen"), value: this.formatNumber(open), sub: open ? this.esc([b.counts?.problem ? this.t(b.counts.problem === 1 ? "bhTileProblems1" : "bhTileProblems", { n: this.formatNumber(b.counts.problem) }) : "", b.counts?.note ? this.t(b.counts.note === 1 ? "bhTileNotes1" : "bhTileNotes", { n: this.formatNumber(b.counts.note) }) : ""].filter(Boolean).join(", ")) : "", tone: b.counts?.problem ? "red" : open ? "warn" : "ok" },
    ]);
  }
}
