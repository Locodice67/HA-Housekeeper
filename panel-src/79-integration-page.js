// The page of an integration as a whole (core or custom): all config entries of one domain. It is a synthetic object
// `integration:<domain>` made in the panel from the config entries of the scan, so the page runs through the same
// detail path (header, tabs, back trail, keys) as every other object. The page of one entry stays and holds the actions.
Object.assign(TEXT.de, {
  integration: "Integration", intTabEntries: "Einträge", intTabMembers: "Entitäten & Geräte", intTabUsed: "Verwendung", intTabRel: "Zuverlässigkeit",
  intSumEntries: "Einträge", intSumDevices: "Geräte", intSumEntities: "Entitäten", intSumVersion: "Version", intSumOrigin: "Herkunft", intSumHA: "Home Assistant {v}",
  intFolder: "Ordner", intFolderSize: "Größe des Ordners", intDocs: "Dokumentation", intOpenHA: "In Home Assistant öffnen", intToIntegration: "Zur Integration",
  intEntriesTitle: "Einträge dieser Integration", intMembersTitle: "Entitäten und Geräte", intNoMembers: "Keine Entitäten oder Geräte.", intUsedTitle: "Verwendet von", intNoUsed: "Keine Automation, kein Skript und keine Szene nutzt Entitäten dieser Integration.",
  intNoRel: "Für diese Integration liegen noch keine Zuverlässigkeitswerte vor.", intColName: "Name", intColType: "Typ", intColStatus: "Status",
  intSources: "Quellen der Einträge", intFirstCreated: "Ältester Eintrag angelegt", intLastModified: "Zuletzt geändert", intIds: "Eintrags-IDs",
  intEntityCount: "{e} Entitäten · {d} Geräte",
  intHacsTitle: "HACS", intHacsInstalled: "Installierte Version", intHacsAvailable: "Neueste Version", intHacsUpdate: "Update verfügbar", intHacsCurrent: "Aktuell", intHacsArchived: "Archiviert", intHacsBlocked: "Braucht neuere HA-Version", intHacsOpen: "In HACS öffnen", intHacsGitHub: "Repository auf GitHub", intHacsNote: "Stand aus dem Speicher von HACS; es wird nichts bei GitHub abgefragt und nichts installiert.",
});
Object.assign(TEXT.en, {
  integration: "Integration", intTabEntries: "Entries", intTabMembers: "Entities & devices", intTabUsed: "Used by", intTabRel: "Reliability",
  intSumEntries: "Entries", intSumDevices: "Devices", intSumEntities: "Entities", intSumVersion: "Version", intSumOrigin: "Origin", intSumHA: "Home Assistant {v}",
  intFolder: "Folder", intFolderSize: "Size of the folder", intDocs: "Documentation", intOpenHA: "Open in Home Assistant", intToIntegration: "To the integration",
  intEntriesTitle: "Entries of this integration", intMembersTitle: "Entities and devices", intNoMembers: "No entities or devices.", intUsedTitle: "Used by", intNoUsed: "No automation, script or scene uses entities of this integration.",
  intNoRel: "There are no reliability values for this integration yet.", intColName: "Name", intColType: "Type", intColStatus: "Status",
  intSources: "Sources of the entries", intFirstCreated: "Oldest entry created", intLastModified: "Last changed", intIds: "Entry IDs",
  intEntityCount: "{e} entities · {d} devices",
  intHacsTitle: "HACS", intHacsInstalled: "Installed version", intHacsAvailable: "Latest version", intHacsUpdate: "Update available", intHacsCurrent: "Up to date", intHacsArchived: "Archived", intHacsBlocked: "Needs newer HA version", intHacsOpen: "Open in HACS", intHacsGitHub: "Repository on GitHub", intHacsNote: "Taken from the memory of HACS; nothing is asked from GitHub and nothing is installed.",
});

const INT_RANK = { problem: 3, disabled: 2, active: 1, ignored: 0 };

class IntegrationPageMixin {
  // One synthetic object per domain that has config entries; they are not part of the inventory list.
  buildIntegrationObjects(objects) {
    const groups = new Map();
    for (const o of objects) {
      if (o.object_type !== "config_entry") continue;
      const g = groups.get(o.domain) || { object_type: "integration", object_id: o.domain, domain: o.domain, name: o.integration_name || o.domain, custom: false, integration_version: null, integration_dir: null, documentation: null, hacs: null, entries: [], entity_count: 0, device_count: 0, status: "ignored" };
      g.entries.push(o);
      g.custom ||= Boolean(o.custom);
      g.integration_version ||= o.integration_version || null;
      g.integration_dir ||= o.integration_dir || null;
      g.documentation ||= o.documentation || null;
      g.hacs ||= o.hacs || null;
      g.entity_count += o.entity_count || 0;
      g.device_count += o.device_count || 0;
      if ((INT_RANK[o.status] ?? 1) > (INT_RANK[g.status] ?? 1)) g.status = o.status;
      groups.set(o.domain, g);
    }
    return groups;
  }

  intEntries(item) { return item.entries || []; }

  // Entities and devices of all entries of the domain, from the registry objects of the scan.
  intMembers(item) {
    const ids = new Set(this.intEntries(item).map(e => e.object_id));
    return this.memo("intMembers", [this.data?.objects, item.object_id], () => (this.data?.objects || []).filter(o =>
      (o.object_type === "entity" && ids.has(o.config_entry_id)) || (o.object_type === "device" && (o.config_entry_ids || []).some(id => ids.has(id)))));
  }

  // Automations, scripts and scenes that use an entity of the integration.
  intUsedBy(item) {
    const found = new Map();
    for (const m of this.intMembers(item)) {
      if (m.object_type !== "entity") continue;
      for (const edge of this.edgesTo(`entity:${m.object_id}`)) {
        const src = this.findObject(edge.source);
        if (src && ["automation", "script", "scene"].includes(src.object_type)) found.set(edge.source, src);
      }
    }
    return [...found.values()];
  }

  intAccessTone(item) {
    const tones = this.intEntries(item).map(e => this.accessTone(e));
    return tones.includes("red") ? "red" : tones.includes("warn") ? "warn" : "";
  }

  intTabs(item) {
    const used = this.intUsedBy(item).length;
    const tabs = [["overview", "tabOverview"], ["members", "intTabMembers", this.intMembers(item).length]];
    if (used) tabs.push(["used", "intTabUsed", used]);
    if (this.intEntries(item).some(e => this.reliabilityRow(e))) tabs.push(["reliability", "intTabRel"]);
    tabs.push(["access", "accTab", null, this.intAccessTone(item)], ["technical", "tabTechnical"]);
    return tabs;
  }

  intSummary(item) {
    const n = f => this.formatNumber(f);
    return [
      [this.t("intSumOrigin"), this.esc(this.t(item.custom ? "originKindCustom" : "originKindCore"))],
      item.custom && item.integration_version ? [this.t("intSumVersion"), `${this.esc(item.integration_version)}${item.hacs?.pending_update ? ` <span class="pill warn" title="${this.esc(this.t("compUpdateHint", { v: item.hacs.available_version || "" }))}">${this.t("compUpdate")}</span>` : ""}`] : !item.custom && this.data?.meta?.ha_version ? [this.t("intSumVersion"), this.esc(this.t("intSumHA", { v: this.data.meta.ha_version }))] : null,
      [this.t("intSumEntries"), n(this.intEntries(item).length)],
      [this.t("intSumDevices"), n(item.device_count)],
      [this.t("intSumEntities"), n(item.entity_count)],
    ].filter(Boolean);
  }

  // The panel of one tab; the heading names the entry when there are several.
  intEachEntry(item, build) {
    const entries = this.intEntries(item);
    return `<div class="stack">${entries.map(e => (entries.length > 1 ? `<h3 class="intentry">${this.esc(e.name || e.object_id)}</h3>` : "") + build(e)).join("")}</div>`;
  }

  intPanel(tab, item) {
    if (tab === "members") return this.intMembersCard(item);
    if (tab === "used") return this.intUsedCard(item);
    if (tab === "reliability") return this.intEachEntry(item, e => { const row = this.reliabilityRow(e); return row ? this.reliabilityDetailCard(row) : `<div class="panel"><div class="emptymsg">${this.t("intNoRel")}</div></div>`; });
    if (tab === "access") return this.intEachEntry(item, e => this.accessDetailCard(e));
    if (tab === "technical") return this.intTechnicalCard(item);
    return this.intOverview(item);
  }

  intOverview(item) {
    const fact = (label, value) => `<div class="fact"><span>${this.t(label)}</span><b>${value}</b></div>`;
    const size = item.custom ? (this.sysState("storage").data?.custom_integrations || []).find(x => x.domain === item.domain) : null;
    const docs = /^https:\/\//.test(item.documentation || "") ? `<a class="btn" href="${this.esc(item.documentation)}" target="_blank" rel="noopener noreferrer"><ha-icon icon="mdi:book-open-variant"></ha-icon>${this.t("intDocs")}</a>` : "";
    const folder = item.custom ? `<section class="panel"><div class="panelhead"><h2>${this.t("intFolder")}</h2></div><div class="facts">${fact("intFolder", this.esc(item.integration_dir || `custom_components/${item.domain}`))}${size ? fact("intFolderSize", this.esc(this.formatBytes(size.bytes))) : ""}</div></section>` : "";
    const hacs = item.hacs ? this.intHacsCard(item.hacs) : "";
    const rows = this.objectTable(`intentries-${item.object_id}`, this.intEntries(item).map(e => ({ key: `config_entry:${e.object_id}`, type: "config_entry", name: e.name || e.object_id, sub: "", tone: this.tone(e.status), state: e.status, stateLabel: this.statusLabel(e.status), pill: this.pill(e.status), pause: this.apCanPause(e.object_id, e.state) ? e.object_id : "", entities: e.entity_count || 0, devices: e.device_count || 0 })), {
      min: 8, sort: "status", statusFirst: true, stripe: true,
      menu: r => [["mdi:open-in-new", "polOpenObject", `data-object="${this.esc(r.key)}"`], ["mdi:home-outline", "openInHA", `data-ha-path="${this.esc(this.haPath({ object_type: "config_entry", domain: item.domain }))}"`], ...(r.pause ? [null, ["mdi:pause-circle-outline", "apSend", `data-ap-send="${this.esc(r.pause)}"`]] : [])],
      extras: [
        { key: "entities", label: "objColEntities", dir: "desc", get: r => r.entities, cell: r => this.formatNumber(r.entities) },
        { key: "devices", label: "objColDevices", dir: "desc", get: r => r.devices, cell: r => this.formatNumber(r.devices) },
      ],
    });
    return `<div class="stack"><section class="panel"><div class="panelhead"><h2>${this.t("intEntriesTitle")}</h2>${docs ? `<div class="actions">${docs}</div>` : ""}</div>${rows}</section>${hacs}${folder}</div>`;
  }

  // What HACS says about the integration, for custom integrations that HACS installed.
  intHacsCard(h) {
    const fact = (label, value) => `<div class="fact"><span>${this.t(label)}</span><b>${value}</b></div>`;
    const status = `<span class="pill ${h.pending_update ? "warn" : "ok"}">${this.t(h.pending_update ? "intHacsUpdate" : "intHacsCurrent")}</span>${h.blocked ? ` <span class="pill warn">${this.t("intHacsBlocked")}</span>` : ""}${h.archived ? ` <span class="pill warn">${this.t("intHacsArchived")}</span>` : ""}${h.removed ? ` <span class="pill ${h.removed.ignored ? "mute" : "warn"}">${this.t("hacsStateRemoved")}</span>` : ""}`;
    const gone = h.removed ? `<p class="factnote">${this.t("hacsRemovedNote", { reason: this.esc(h.removed.reason || "–") })}</p>` : "";
    const open = h.id ? `<button class="btn" data-ha-path="${this.esc(`/hacs/repository/${encodeURIComponent(h.id)}`)}"><ha-icon icon="mdi:open-in-new"></ha-icon>${this.t("intHacsOpen")}</button>` : "";
    const github = h.full_name ? `<a class="btn" href="${this.esc(`https://github.com/${h.full_name}`)}" target="_blank" rel="noopener noreferrer"><ha-icon icon="mdi:github"></ha-icon>${this.t("intHacsGitHub")}</a>` : "";
    return `<section class="panel"><div class="panelhead"><h2>${this.t("intHacsTitle")}</h2>${open || github ? `<div class="actions">${open}${github}</div>` : ""}</div><div class="facts">${fact("intHacsInstalled", this.esc(h.installed_version || "–"))}${fact("intHacsAvailable", this.esc(h.available_version || "–"))}${fact("sysColState", status)}</div><p class="factnote">${this.t("intHacsNote")}</p>${gone}</section>`;
  }

  intMembersCard(item) {
    const members = this.intMembers(item);
    return `<div class="stack"><section class="panel"><div class="panelhead"><h2>${this.t("intMembersTitle")}</h2></div>${this.sysList("intmembers", members, {
      sort: "name", dir: "asc",
      sorts: [{ key: "name", label: "intColName", dir: "asc", get: o => o.name || o.object_id }, { key: "type", label: "intColType", dir: "asc", get: o => o.object_type }, { key: "status", label: "intColStatus", dir: "asc", get: o => o.status }],
      text: o => `${o.name} ${o.object_id}`, tie: o => this.objectKey(o), empty: "intNoMembers",
      rowAttrs: o => `data-object="${this.esc(this.objectKey(o))}" tabindex="0" role="button" aria-label="${this.esc(o.name || o.object_id)}"`,
      columns: [
        { key: "name", label: "intColName", cell: o => this.nameCell(o.name || o.object_id, o.object_id) },
        { key: "type", label: "intColType", cell: o => this.esc(this.t(o.object_type)) },
        { key: "status", label: "intColStatus", cell: o => this.pill(o.status) },
      ],
    })}</section></div>`;
  }

  intUsedCard(item) {
    const used = this.intUsedBy(item);
    const rows = this.objectTable(`intused-${item.object_id}`, used.map(o => ({ key: this.objectKey(o), type: o.object_type, name: o.name || o.object_id, sub: o.object_id, tone: this.tone(o.status), state: o.status, stateLabel: this.statusLabel(o.status), pill: this.pill(o.status) })), { empty: this.t("intNoUsed"), menu: true, stripe: true, sort: "status" });
    return `<div class="stack"><section class="panel"><div class="panelhead"><h2>${this.t("intUsedTitle")}</h2></div>${rows}</section></div>`;
  }

  intTechnicalCard(item) {
    const entries = this.intEntries(item);
    const dates = key => entries.map(e => e[key]).filter(Boolean).sort();
    const row = (k, v) => (v ? `<dt>${this.esc(k)}</dt><dd>${this.esc(v)}</dd>` : "");
    return `<div class="stack"><section class="panel"><div class="panelhead"><h2>${this.t("registry")}</h2></div><div class="pad"><dl class="kv">${[
      row("domain", item.domain), row(this.t("integrationName"), item.name), row(this.t("intSumOrigin"), this.t(item.custom ? "originKindCustom" : "originKindCore")),
      row(this.t("intSumVersion"), item.integration_version), row(this.t("intFolder"), item.integration_dir), row(this.t("intDocs"), item.documentation),
      row(this.t("intSources"), [...new Set(entries.map(e => e.source).filter(Boolean))].join(", ")),
      row(this.t("intFirstCreated"), dates("created_at")[0] ? this.formatDate(dates("created_at")[0]) : ""), row(this.t("intLastModified"), dates("modified_at").slice(-1)[0] ? this.formatDate(dates("modified_at").slice(-1)[0]) : ""),
      row(this.t("intIds"), entries.map(e => e.object_id).join(", ")),
    ].join("")}</dl></div></section></div>`;
  }
}
