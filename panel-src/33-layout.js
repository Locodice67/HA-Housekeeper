// LayoutMixin: the pieces every long view shares (a row of key figures and tabs for its sections); mixed in by 99-register.js.
class LayoutMixin {
  // A row of key figures. tile: { label, value, sub, tone ("ok"|"warn"|"red"|"mute"), tab, filter, lf } where tab ("view|id") makes it a button; lf ([list id, filter name, value]) sets that list filter, an empty name clears them all.
  // `cls` adds a class to the grid, e.g. "even" for tiles of one size in rows of three.
  sumTiles(tiles, cls = "") {
    const cells = this.sumTileCells(tiles);
    return cells ? `<div class="sumtiles${cls ? ` ${cls}` : ""}" role="group" aria-label="${this.esc(this.t("sumLabel"))}">${cells}</div>` : "";
  }

  // The tiles alone, for a page that lays them out in a grid of its own.
  sumTileCells(tiles) {
    return tiles.filter(Boolean).map(t => {
      const inner = `<span class="sumlabel">${this.esc(t.label)}</span><b class="sumvalue">${t.value}</b>${t.sub ? `<small>${t.sub}</small>` : ""}${t.spark ? `<span class="spark-row">${t.spark}</span>` : ""}`;
      const hint = t.hint ? ` title="${this.esc(t.hint)}"` : "";
      // Three kinds, told apart by a cue in the corner: a figure only (flat), a filter of the list below (funnel, marked when on), a link to another page (arrow).
      const filter = (attr, active) => `<button class="sumtile filter ${t.tone || "mute"}"${hint} ${attr} aria-pressed="${Boolean(active)}"><ha-icon class="sumcue" icon="mdi:filter-variant"></ha-icon>${inner}</button>`;
      if (t.filter !== undefined) return filter(`data-finding-filter="${this.esc(t.filter)}"`, t.active);
      if (t.lf) {
        const [id, name, value] = t.lf, f = this.lv[id]?.f || {};
        // A tile without a filter of its own ("All") clears the filters; it is not marked itself, only a filter that is on is.
        return filter(`data-lf-set="${this.esc(t.lf.join("|"))}"`, name ? f[name] === value : false);
      }
      if (t.attr && t.attr[0] !== "data-object") return filter(`${t.attr[0]}="${this.esc(t.attr[1])}"`, t.active);
      if (t.inv !== undefined) return filter(`data-inv-filter="${this.esc(t.inv)}"`, t.active);
      const go = attr => `<button class="sumtile go ${t.tone || "mute"}"${hint} ${attr}><ha-icon class="sumcue" icon="mdi:chevron-right"></ha-icon>${inner}</button>`;
      if (t.attr) return go(`${t.attr[0]}="${this.esc(t.attr[1])}"`);
      if (t.unref) return go(`data-unref-tab="${t.unref}"`);
      return t.tab ? go(`data-view-tab="${this.esc(t.tab)}"`) : `<div class="sumtile ${t.tone || "mute"}"${hint}>${inner}</div>`;
    }).join("");
  }

  // When the data of a page was read last (for its "as of"), and a time given in seconds as ISO text.
  markLoaded(key) { (this._loadedAt ||= {})[key] = new Date().toISOString(); }
  loadedAt(key) { return this._loadedAt?.[key] || null; }
  isoOf(seconds) { return seconds ? new Date(seconds * 1000).toISOString() : null; }

  // The slim row under a page title: the page's own controls and facts on the left, "as of" and the refresh button on the
  // right. { left, at (ISO time or null), loading, error, attr (the data-… attribute of the refresh button), exportId (a page exporter) }.
  pageBar({ left = "", at = null, loading = false, attr = "", refresh = true, exportId = "", actions = "" }) {
    const stand = loading ? this.t("sysReading") : at ? this.t("sysAsOf", { time: this.formatDate(at) }) : "";
    return `<div class="pagebar"><div class="pb-left">${left}</div><div class="pb-right">${stand ? `<span class="scanago">${this.esc(stand)}</span>` : ""}${actions}${exportId ? this.exportMenu(exportId) : ""}${refresh ? `<button class="btn" ${attr} title="${this.esc(this.t("sysRefreshHint"))}" ${loading ? 'disabled aria-busy="true"' : ""}><ha-icon icon="mdi:refresh" class="${loading ? "spin" : ""}"></ha-icon>${this.t("sysRefresh")}</button>` : ""}</div></div>`;
  }

  // Tiles that switch between the areas of one view: icon, title, number and a short hint; the open one is marked.
  // tab: { id, icon, label, hint, count, tone, pill, pillTone, disabled, status }; status keeps the place of the pill while
  // the numbers load, so the hints of a row of status tiles stay on one line.
  navTiles(view, tabs, open, label, compact = false) {
    const fixed = compact && tabs.some(t => t.facts);
    const cells = tabs.map(t => {
      const tone = t.tone || "mute", has = t.count !== undefined && t.count !== null;
      const pills = `${has ? `<span class="pill ${tone}">${this.esc(this.formatNumber(t.count))}</span>` : ""}${t.pill ? `<span class="pill ${t.pillTone || tone}">${this.esc(t.pill)}</span>` : ""}`;
      const inner = `<ha-icon icon="${t.icon}"></ha-icon><strong>${this.esc(t.label)}</strong><span class="setpill${t.status ? " slot" : ""}">${pills}</span><small title="${this.esc(t.hint || "")}">${this.esc(t.hint || "")}</small>${t.facts ? `<span class="navfacts">${t.facts.map(f => `<span class="pill ${f.tone}">${this.esc(f.text)}</span>`).join("")}</span>` : ""}`;
      if (t.disabled) return `<div class="taskcard t-mute off" aria-disabled="true">${inner}</div>`;
      return `<button class="taskcard t-${tone}${t.id === open ? " on" : ""}" aria-pressed="${t.id === open}" data-view-tab="${this.esc(`${view}|${t.id}`)}">${inner}</button>`;
    }).join("");
    return `<div class="taskgrid compactgrid setgrid navtiles${compact ? " compact" : ""}${fixed ? " fixed" : ""}${view === "cleanup" && tabs.length === 5 ? " five" : ""}"${compact ? ` style="--cols:${this.navColumns(tabs.length)}"` : ""} role="group" aria-label="${this.esc(label)}">${cells}</div>`;
  }

  // How many tiles go side by side before a row breaks: few tiles in one row, many in even rows (7 become 4 + 3).
  navColumns(n) { return n <= 4 ? Math.max(1, n) : Math.min(5, Math.ceil(n / 2)); }

  // The tab that is open in a view: the chosen one if it exists, else the first one of `tabs` or `prefer`.
  viewTabOf(view, tabs, prefer) {
    const chosen = (this.viewTab ||= {})[view];
    if (tabs.some(t => t.id === chosen)) return chosen;
    return tabs.some(t => t.id === prefer) ? prefer : tabs[0].id;
  }

  // Tabs of one view; a coloured dot marks a tab that holds something to look at. tab: { id, label, count, tone }.
  viewTabBar(view, tabs, active) {
    const list = tabs.map(t => `<button class="tab" role="tab" aria-selected="${t.id === active}" tabindex="${t.id === active ? 0 : -1}" data-view-tab="${this.esc(`${view}|${t.id}`)}">${this.esc(t.label)}${t.count !== undefined && t.count !== null ? ` <em>${this.formatNumber(t.count)}</em>` : ""}${t.tone && t.tone !== "ok" && t.tone !== "mute" ? `<i class="tabdot ${t.tone}" aria-hidden="true"></i>` : ""}</button>`).join("");
    return `<div class="tabs" role="tablist" aria-label="${this.esc(this.t("tabsLabel"))}">${list}</div>`;
  }

  pickViewTab(tab) {
    const [view, id] = String(tab || "").split("|");
    if (!view || !id) return;
    (this.viewTab ||= {})[view] = id;
    if (view === "cleanup") { this.cleanupSel = new Set(); if (this.lv?.cleanup) this.lv.cleanup.f = {}; this.pages = {}; }
    if (view === "unreferenced") { this.unrefTab = id; this.retryOrphanLast(); this.pages = {}; }
    this.render();
  }
}
