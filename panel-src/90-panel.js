class HAHousekeeperPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this.data = null;
    this.view = "overview";
    this.findingFilter = ""; this.findingAfter = false; this.findingDue = false; this.showFollowers = false; this.goals = null; this.goalsLoading = false; this.goalForm = null; this.decide = null; this.markForm = null;
    this.findingStatus = ""; this.bulk = null;
    this.batteryFilter = "all";
    this.monitorFilter = ""; this.monitorSelected = null; this.monitorForm = null; this.monitorQuery = ""; this.monitorError = "";

    this._urlApplied = false;
    this.selected = null;
    this.detailTab = "overview";
    this.settingsTab = "protection";
    this.trail = [];
    this.compare = null;
    this.compareBaseline = "previous";
    this.compareLoading = false;
    this.graphSelected = null;
    this.graphTrail = []; this.graphOrigin = null; this.viewTrail = []; this._tabOf = new Map(); this.viewTab = {};
    this.details = new Map();
    this.detailLoading = false;
    this.graphQuery = "";
    this.graphDepth = 1; this.graphRel = ""; this.graphConf = "all"; this.graphImpact = false; this.graphLimit = GRAPH_NODE_STEP; this.graphOpen = new Set();
    this.pages = {};
    this.lv = {};
    this.unrefTab = "entities";
    this.cleanupSel = new Set();
    this.findSel = new Set();
    this.excludeSel = new Set(); this.purgeSel = new Set(); this.purgeBusy = false; this.purgeResult = null;
    this.cleanupKind = "disable_entity";
    this.replOld = ""; this.replNew = "";
    this.meterOld = ""; this.meterNew = ""; this.meterMode = "both";
    this.ex = null; this.report = null; this.reportClear = true; this.reportMessage = "";
    this.runs = null; this.runsLoading = false; this.runsError = ""; this.exposure = null; this.exposureLoading = false; this.exposureError = ""; this._exposureRequested = false; this.policies = null; this.policiesLoading = false; this.policiesError = ""; this._policiesRequested = false; this.policyShowHidden = false; this.orphanLast = null; this.orphanLastLoading = false; this._orphanLastRequested = false; this.dbHealth = null; this.dbLoading = false; this.dbError = ""; this._dbRequested = false; this.storms = null; this.stormsLoading = false; this.stormsError = ""; this.stormsWindow = 1; this._stormsRequested = null; this.reliability = null; this.relLoading = false; this.relError = ""; this.relWindow = 7; this.relCompare = false; this.quickQuery = ""; this.quickOpen = false; this.quickIndex = 0; this.backup = null; this.backupLoading = false; this.backupError = ""; this.preflight = null; this.costs = null; this.costsLoading = false; this.preflightLoading = false;
    this.ack = new Set();
    this.confirmation = null;
    this.confirmWord = "";
    this.plan = null;
    this.journal = null;
    this.prefs = this.loadPrefs();
    this.pageSize = this.prefs.pageSize;
    this.pages = {};
    this.busy = false;
    this.scanStatus = null;
    this.error = null;
    this.trend = null;
    this._rev = 0; // bumped when data is changed in place (ignore flags), so cached lists are rebuilt
    this._debug = this.debugEnabled();
  }

  set hass(value) {
    const first = !this._hass, wasDark = this._hass?.themes?.darkMode, wasDocked = this._hass?.dockedSidebar;
    this._hass = value;
    if (first) { this.load(false); this.loadUserPrefs(); }
    else if ((this.prefs.mode === "auto" && wasDark !== value?.themes?.darkMode) || wasDocked !== value?.dockedSidebar) this.render();
  }

  get hass() { return this._hass; }

  // Home Assistant sets `narrow` on a custom panel when its own sidebar turns into a drawer.
  set narrow(value) {
    const next = Boolean(value), changed = next !== Boolean(this._narrow);
    this._narrow = next;
    if (changed && this._hass) this.render();
  }

  get narrow() { return Boolean(this._narrow); }

  // Without a visible Home Assistant sidebar (phone, tablet, or "always hidden" in the profile) a
  // full-screen panel has no way back: the menu button opens the sidebar like on HA's own pages.
  haSidebarHidden() {
    return Boolean(this._narrow) || this._hass?.dockedSidebar === "always_hidden";
  }

  haMenuButton() {
    if (!this.haSidebarHidden()) return "";
    return `<button type="button" class="hamenu" data-ha-menu title="${this.esc(this.t("haMenu"))}" aria-label="${this.esc(this.t("haMenu"))}"><ha-icon icon="mdi:menu"></ha-icon></button>`;
  }

  toggleHaSidebar() {
    this.dispatchEvent?.(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
  }

  connectedCallback() {
    this._gone = false;
    this._basePath = typeof window === "undefined" ? null : window.location.pathname;
    this._onPop = () => this.onPopState();
    window.addEventListener?.("popstate", this._onPop);
    this._onResize = () => { globalThis.cancelAnimationFrame?.(this._fitFrame); this._fitFrame = globalThis.requestAnimationFrame?.(() => this.fitNav(this.shadowRoot)); };
    window.addEventListener?.("resize", this._onResize);
    this.installFonts();
    this.startScanWatch();
    this.render();
  }

  // Scans also run in the background (every few hours); an open panel would keep showing the old one.
  // Once a minute, and when the tab is shown again, the time of the last scan is asked for; a newer one reloads like after a scan of its own.
  startScanWatch() {
    this._onVisible = () => { if (!globalThis.document?.hidden) this.checkNewScan(); };
    globalThis.document?.addEventListener?.("visibilitychange", this._onVisible);
    this._scanWatch = globalThis.setInterval?.(() => this.checkNewScan(), SCAN_WATCH_MS);
  }

  stopScanWatch() {
    globalThis.document?.removeEventListener?.("visibilitychange", this._onVisible);
    if (this._scanWatch) globalThis.clearInterval?.(this._scanWatch);
    this._scanWatch = null;
  }

  async checkNewScan() {
    const shown = this.data?.meta?.scanned_at;
    if (this._gone || this.busy || this._scanChecking || !this._hass?.callWS || !shown || this.data.meta.preliminary) return;
    this._scanChecking = true;
    try {
      const s = await this._hass.callWS({ type: "ha_housekeeper/status" });
      if (!s?.running && s?.scanned_at && s.scanned_at !== shown && !this.busy && !this._gone) await this.load(false);
    } catch (_) { /* the next check asks again */ } finally { this._scanChecking = false; }
  }

  // Timers and late answers must not touch a panel that HA has taken out of the page.
  disconnectedCallback() {
    this._gone = true;
    this.stopWarmupTicker?.();
    this.stopScanWatch();
    window.removeEventListener?.("popstate", this._onPop);
    window.removeEventListener?.("resize", this._onResize);
    for (const name of ["_warmupTimer", "_searchTimer", "_tipTimer", "_monitorTimer", "_monitorPreviewTimer"]) {
      if (this[name]) globalThis.clearTimeout?.(this[name]);
      this[name] = null;
    }
  }

  // The browser's back button steps back inside the panel. One history entry is kept in front of
  // the panel's own back steps while there is somewhere to go back to.
  canGoBack() {
    return Boolean(this.view === "graph" ? this.graphTrail?.length || this.graphOrigin : this.selected || this.bpOpen || this.viewTrail?.length);
  }

  onPopState() {
    if (this._ignorePop) { this._ignorePop = false; return; }
    if (this._dialogPop) { this._dialogPop = false; return; }
    this._guard = false;
    if (this._gone || window.location.pathname !== this._basePath || !this.canGoBack()) return;
    if (this.view === "graph") this.graphBack();
    else if (this.selected) this.goBack();
    else if (this.bpOpen) { this.bpOpen = ""; this.render(); }
    else this.viewBack();
  }

  syncGuard() {
    if (typeof window === "undefined" || !window.history || window.location.pathname !== this._basePath) return;
    try {
      if (this.canGoBack() && !this._guard) { window.history.pushState(window.history.state, "", window.location.href); this._guard = true; }
      else if (!this.canGoBack() && this._guard) { this._guard = false; this._ignorePop = true; window.history.back(); }
    } catch (_) { /* no history access: the panel's own back buttons still work */ }
  }

  installFonts() {
    const head = globalThis.document?.head;
    if (!head || globalThis.document.getElementById("hk-fonts")) return;
    const style = globalThis.document.createElement("style");
    style.id = "hk-fonts"; style.textContent = FONT_CSS;
    head.appendChild(style);
  }

  get lang() {
    const chosen = this.prefs?.language;
    if (chosen === "de" || chosen === "en") return chosen;
    return String(this._hass?.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
  }

  t(key, vars) {
    const text = TEXT[this.lang][key] || TEXT.en[key] || key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "") : text;
  }

  esc(value) {
    return String(value ?? "—").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  }

  formatDate(value) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat(this.lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
    catch (_) { return value; }
  }

  formatNumber(value) { return new Intl.NumberFormat(this.lang).format(value ?? 0); }

  async load(fresh = false) {
    if (!this._hass || this.busy) return;
    if (this._warmupTimer) window.clearTimeout(this._warmupTimer);
    this.busy = true; this.error = null; this.render();
    let progressTimer = null;
    if (fresh) progressTimer = window.setInterval(() => this.updateScanStatus(), 250);
    try {
      const scannedBefore = this.data?.meta?.scanned_at;
      this.data = await this._hass.callWS({ type: fresh ? "ha_housekeeper/scan" : "ha_housekeeper/inventory" });
      if (this.data?.meta?.scanned_at !== scannedBefore) this.forgetScanViews();
      this.details = new Map();
      this.compare = null;
      this.applyUrl();
    } catch (err) {
      this.error = this.errText(err);
      // The counts on screen stay from the last good scan: say that this scan failed.
      try { const s = await this._hass.callWS({ type: "ha_housekeeper/status" }); if (this.data?.meta && s.health) this.data.meta.scan_health = s.health; } catch (_) { /* the banner shows with the next load */ }
      // A plan that is running or a Home Assistant that is still starting only delays the first picture: ask again.
      if (["cleanup_busy", "warming_up"].includes(err?.code)) this.retryWarmup(10000);
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      this.scanStatus = null;
      if (!this.data?.meta?.preliminary) this.stopWarmupTicker?.();
      this.busy = false; this.render();
    }
    if (this.view === "changes" && this.data) this.loadCompare();
    if (this.data) this.ensureSafetyData();
    // Preliminary data: fetch the final scan once the backend's warm-up is over.
    if (this.data?.meta?.preliminary) {
      this.startWarmupTicker(this.data.meta);
      const wait = ((Number(this.data.meta.warmup_seconds_left) || 0) + 20) * 1000;
      this.retryWarmup(wait);
    }
  }

  // What these views computed from the last scan is out of date after a new one: the next time a view is drawn it asks again (the old rows stay until the answer is there).
  forgetScanViews() {
    this._policiesRequested = false; this._exposureRequested = false; this._qualityRequested = false; this._blueprintsRequested = false;
  }

  // Asks again until the final scan has replaced the preliminary one; a busy panel or a failed request tries again later.
  retryWarmup(wait) {
    if (this._warmupTimer) window.clearTimeout(this._warmupTimer);
    this._warmupTimer = window.setTimeout(() => {
      if (!this._hass || this.busy) { this.retryWarmup(15000); return; }
      this.load().then(() => { if (this.data?.meta?.preliminary || this.error) this.retryWarmup(20000); });
    }, wait);
  }

  async updateScanStatus() {
    try {
      this.scanStatus = await this._hass.callWS({ type: "ha_housekeeper/status" });
      this.renderProgress();
    } catch (_) { /* The main scan request reports actionable errors. */ }
  }

  // The scrolling element: HA's page scrolls the document or one of the panel's ancestors.
  scroller() {
    for (let node = this; node; node = node.parentNode || node.host) {
      if (node.scrollTop > 0) return node;
    }
    return globalThis.document?.scrollingElement || null;
  }

  // Where the page was scrolled when it is left, so "back" can land at the same spot.
  rememberScroll() { return this.scroller?.()?.scrollTop || 0; }

  restoreScroll(top) {
    if (!top) return;
    const run = () => { const el = this.scroller?.() || globalThis.document?.scrollingElement; if (el) el.scrollTop = top; };
    if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(run); else run();
  }

  async openObject(obj) {
    if (this.selected && this.selected !== obj) { this.trail.push(this.selected); this._tabOf.set(this.objectKey(this.selected), this.detailTab); }
    else if (!this.selected) this._listScroll = this.rememberScroll();
    if (this.selected !== obj) { this.detailTab = this._pendingTab || "overview"; this._pendingTab = null; }
    this.selected = obj;
    const key = this.objectKey(obj);
    if (obj.object_type === "integration" && !this.details.has(key)) this.details.set(key, {}); // made in the panel, nothing to ask the backend
    if (this.details.has(key)) { this.render(); this.scrollIntoView?.({ block: "start" }); return; }
    this.detailLoading = true;
    this.render();
    this.scrollIntoView?.({ block: "start" });
    try {
      this.details.set(key, await this._hass.callWS({
        type: "ha_housekeeper/detail", object_type: obj.object_type, object_id: obj.object_id,
      }));
    } catch (_) { this.details.set(key, {}); }
    this.detailLoading = false;
    if (this.selected === obj) this.render();
  }

  goBack() {
    this.selected = this.trail.pop() || null;
    this.detailTab = (this.selected && this._tabOf.get(this.objectKey(this.selected))) || "overview";
    this.render();
    if (!this.selected) this.restoreScroll(this._listScroll);
  }

  // The graph opened from a detail page or a list: it remembers where, so "back" returns there.
  openGraph(obj) {
    if (!obj) return;
    if (this.selected) this._tabOf.set(this.objectKey(this.selected), this.detailTab);
    this.graphOrigin = { view: this.view, selected: this.selected, trail: this.trail, tab: this.detailTab, scroll: this.rememberScroll() };
    this.graphTrail = [];
    this.graphSelected = obj; this.graphQuery = ""; this.graphLimit = GRAPH_NODE_STEP;
    this.view = "graph"; this.selected = null; this.trail = [];
    this.render();
  }

  // Going to another node of the graph keeps the one left behind for "back".
  noteGraphStep(obj) {
    if (this.graphSelected && this.graphSelected !== obj) this.graphTrail.push(this.graphSelected);
  }

  // Leaving a page through a link (not the menu) keeps it for "back".
  noteJump(view) {
    if (view !== this.view) this.viewTrail.push({ view: this.view, scroll: this.rememberScroll() });
  }

  // Back from the graph: one node at a time, then to where the graph was opened from.
  graphBack() {
    const previous = this.graphTrail.pop();
    if (previous) { this.graphSelected = previous; this.graphLimit = GRAPH_NODE_STEP; this.render(); return; }
    const from = this.graphOrigin;
    this.graphOrigin = null;
    if (!from) return;
    this.view = from.view; this.selected = from.selected; this.trail = from.trail;
    this.detailTab = from.tab || "overview";
    this.render();
    this.restoreScroll(from.scroll);
  }

  // What the graph's back button names: the node before, or the page the graph was opened from.
  graphBackLabel() {
    const node = this.graphTrail[this.graphTrail.length - 1];
    if (node) return node.name;
    const from = this.graphOrigin;
    return from ? (from.selected ? from.selected.name : this.t(from.view)) : "";
  }

  // Back after a jump from one page to another (overview card to a list and the like).
  viewBack() {
    const from = this.viewTrail.pop();
    if (!from) return;
    this.view = from.view; this.pages = {};
    this.render();
    this.restoreScroll(from.scroll);
  }

  statusLabel(status) { return this.t(status); }

  objectKey(item) { return `${item.object_type}:${item.object_id}`; }

  findObject(key) {
    if (!this.data) return undefined;
    if (!this._index || this._indexSource !== this.data) {
      this._index = new Map(this.data.objects.map(item => [this.objectKey(item), item]));
      for (const g of this.buildIntegrationObjects(this.data.objects).values()) this._index.set(this.objectKey(g), g); // pages of whole integrations, not inventory rows
      this._indexSource = this.data;
    }
    return this._index.get(key);
  }

  findingKey(finding) { return `${finding.rule_id.split(".")[0]}:${finding.object_id}`; }

  haPath(item) {
    switch (item.object_type) {
      // HA ignores ?search=, so an entity with a device opens the device page that lists it
      case "entity": return item.device_id ? `/config/devices/device/${encodeURIComponent(item.device_id)}` : `/config/entities?search=${encodeURIComponent(item.object_id)}`;
      case "device": return `/config/devices/device/${encodeURIComponent(item.object_id)}`;
      case "area": return `/config/areas/area/${encodeURIComponent(item.object_id)}`;
      case "automation": return item.automation_id
        ? `/config/automation/edit/${encodeURIComponent(item.automation_id)}`
        : `/config/entities?search=${encodeURIComponent(item.object_id)}`;
      case "script": return `/config/script/edit/${encodeURIComponent(item.object_id.replace(/^script\./, ""))}`;
      case "scene": return item.scene_id
        ? `/config/scene/edit/${encodeURIComponent(item.scene_id)}`
        : item.device_id ? `/config/devices/device/${encodeURIComponent(item.device_id)}` : `/config/entities?search=${encodeURIComponent(item.object_id)}`;
      case "dashboard": return `/${encodeURIComponent(item.url_path || "lovelace")}`;
      case "app": return `/hassio/addon/${encodeURIComponent(item.slug || item.object_id)}/info`;
      case "config_entry": case "integration": return `/config/integrations/integration/${encodeURIComponent(item.domain)}`;
      case "floor": return "/config/areas/dashboard";
      case "label": return "/config/labels";
      default: return null;
    }
  }

  // Home Assistant's own "More info" dialog of an entity, over the panel; only where the entity has a state.
  canMoreInfo(entityId) { return !!this._hass?.states?.[entityId]; }

  // HA's dialog puts its own entry into the history and removes it on close; that pop must not step the panel back.
  moreInfo(entityId) {
    // The dialog may load lazily, so watch for its entry (its marker in the history state, or a longer history) for a few seconds.
    const before = window.history?.length;
    globalThis.clearInterval?.(this._dialogWatch);
    let waited = 0;
    this._dialogWatch = globalThis.setInterval?.(() => {
      waited += 100;
      if (window.history?.state?.dialog || window.history?.length > before) { this._dialogPop = true; globalThis.clearInterval(this._dialogWatch); }
      else if (waited >= 5000) globalThis.clearInterval(this._dialogWatch);
    }, 100);
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  // The clipboard API needs HTTPS; over plain http or in some app web views it is missing, so fall back to a hidden textarea. Throws when neither works.
  async copyText(text) {
    try { if (globalThis.navigator?.clipboard?.writeText) { await globalThis.navigator.clipboard.writeText(text); return; } } catch (_) { /* fall through */ }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(area);
    try {
      area.select();
      if (!document.execCommand("copy")) throw new Error("copy not available");
    } finally { area.remove(); }
  }

  navigateHA(path) {
    window.open(new URL(path, window.location.origin).href, "_blank", "noopener");
  }

  // What a screen reader announces: scan, backup and plan progress, nothing while idle.
  liveStatus() {
    if (this.busy) return `${this.t("scanning")}${this.scanStatus?.running ? ` ${this.scanStatus.progress}%` : ""}`;
    const plan = this.plan;
    if (plan && (plan.status === "backup" || plan.status === "running")) {
      if (plan.status === "backup" || this.planProgress?.phase === "backup") return this.t("backupRunning");
      return `${this.t("running")} ${this.planProgress ? this.t("progressOf", { done: this.planProgress.done, total: this.planProgress.total }) : ""}`.trim();
    }
    return "";
  }

  // The sidebar is rebuilt with the page: keep its scroll position, and bring the current entry into
  // view when the view changed (on a small screen the navigation scrolls sideways).
  scanButtonInner() {
    const progress = this.scanStatus?.running ? ` ${this.scanStatus.progress}%` : "";
    return `<ha-icon icon="mdi:refresh"></ha-icon>${this.busy ? this.t("scanning") + progress : this.t("scan")}`;
  }

  // The scan status arrives every few hundred milliseconds: only the scan button and the status
  // line for screen readers change, so the page is not rebuilt for it.
  renderProgress() {
    const root = this.shadowRoot, button = root?.querySelector?.("[data-action='scan']");
    const live = root?.querySelector?.("[role='status']");
    if (!button || !live) { this.render(); return; }
    button.innerHTML = this.scanButtonInner();
    button.disabled = Boolean(this.busy || this.cleanupRunning());
    button.ariaBusy = this.busy ? "true" : null;
    live.textContent = this.liveStatus();
  }

  // Search fields change their state at once but re-render after a short pause.
  scheduleRender() {
    if (this._searchTimer) globalThis.clearTimeout?.(this._searchTimer);
    this._searchTimer = this.defer(() => { this._searchTimer = null; this.render(); }, SEARCH_DEBOUNCE_MS);
  }

  defer(fn, ms) { return setTimeout(fn, ms); }

  debugEnabled() {
    try { return globalThis.localStorage?.getItem("hk_debug") === "1"; } catch (_) { return false; }
  }

  // A re-render replaces the page, so the focused control is found again by id or data attribute.
  captureFocus() {
    const el = this.shadowRoot?.activeElement;
    if (!el?.getAttribute) return null;
    let selector = null;
    if (el.id) selector = `#${el.id}`;
    else {
      for (const attr of el.attributes || []) {
        if (attr.name.startsWith("data-")) { selector = `${el.localName}[${attr.name}="${String(attr.value).replace(/["\\]/g, "\\$&")}"]`; break; }
      }
    }
    return selector ? { selector, start: el.selectionStart ?? null, end: el.selectionEnd ?? null } : null;
  }

  restoreFocus(saved) {
    if (!saved) return;
    let next = null;
    try { next = this.shadowRoot.querySelector(saved.selector); } catch (_) { return; }
    if (!next || next.disabled) return;
    next.focus({ preventScroll: true });
    if (saved.start !== null && next.setSelectionRange) {
      try { next.setSelectionRange(saved.start, saved.end); } catch (_) { /* not a text field */ }
    }
  }

  activeModal(root = this.shadowRoot) {
    return [...(root?.querySelectorAll?.(".hkmodal") || [])].at(-1) || null;
  }

  modalKey(modal) {
    return modal ? Object.keys(modal.dataset || {}).find(key => key.endsWith("Modal")) || null : null;
  }

  // Keep the background out of the tab order and wrap Tab within the topmost dialog.
  bindModalFocus(root) {
    const modals = [...root.querySelectorAll(".hkmodal")], top = modals.at(-1);
    for (const selector of [".stickyhead", ".main"]) {
      const background = root.querySelector(selector);
      if (background) background.inert = !!top;
    }
    modals.slice(0, -1).forEach(modal => { modal.inert = true; });
    if (!top) return;
    const dialog = top.querySelector(".hkdialog");
    top.addEventListener("keydown", ev => {
      if (ev.key !== "Tab") return;
      const controls = [...top.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.closest("[inert]") && el.getClientRects().length);
      if (!controls.length) { ev.preventDefault(); dialog?.focus(); return; }
      const first = controls[0], last = controls.at(-1), current = root.activeElement;
      if (ev.shiftKey && (current === first || !top.contains(current))) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && (current === last || !top.contains(current))) { ev.preventDefault(); first.focus(); }
    });
    if (!top.contains(root.activeElement)) {
      dialog?.setAttribute("tabindex", "-1");
      dialog?.focus();
    }
  }

  // After paging, return to the beginning of the affected list and announce the new page.
  focusListPage(id) {
    const footer = [...(this.shadowRoot?.querySelectorAll("[data-lpage-footer]") || [])].find(el => el.dataset.lpageFooter === id);
    const region = footer?.closest(".foldbody, .panel") || footer?.parentElement;
    if (!region) return;
    region.setAttribute("tabindex", "-1");
    region.setAttribute("aria-label", `${this.t("page")} ${this.pages[id]} ${this.t("of")} ${footer.dataset.pageCount}`);
    region.scrollIntoView?.({ block: "start" });
    region.focus?.({ preventScroll: true });
  }

  // Derived data is kept per data set; it is rebuilt when the data, a change in place or one of the
  // given values changes.
  memo(name, deps, build) {
    const cache = this._memo ||= new Map(), hit = cache.get(name);
    if (hit && hit.data === this.data && hit.rev === this._rev && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.value;
    const value = build();
    cache.set(name, { data: this.data, rev: this._rev, deps, value });
    return value;
  }

  // Collators are created once per language; creating one per comparison is slow.
  collators() {
    if (this._collators?.lang !== this.lang) {
      this._collators = { lang: this.lang, natural: new Intl.Collator(this.lang, { numeric: true, sensitivity: "base" }), ids: new Intl.Collator(this.lang, { numeric: true }), plain: new Intl.Collator() };
    }
    return this._collators;
  }

  // Edges by source and by target, plus every target that something uses (in edge order).
  edgeIndex() {
    return this.memo("edges", [], () => {
      const bySource = new Map(), byTarget = new Map(), used = new Set(), order = new Map();
      (this.data.edges || []).forEach((edge, i) => {
        order.set(edge, i);
        (bySource.get(edge.source) || bySource.set(edge.source, []).get(edge.source)).push(edge);
        (byTarget.get(edge.target) || byTarget.set(edge.target, []).get(edge.target)).push(edge);
        if (USAGE_RELATIONS.includes(edge.relation)) used.add(edge.target);
      });
      return { bySource, byTarget, used, order };
    });
  }

  edgesFrom(key) { return this.edgeIndex().bySource.get(key) || []; }

  edgesTo(key) { return this.edgeIndex().byTarget.get(key) || []; }

  // One tooltip for name and id: the name in bold, the id below. The browser's own tooltip cannot style the two lines.
  showTip(el) {
    const root = this.shadowRoot;
    let tip = this._tip;
    if (!tip || tip.parentNode !== root) { tip = this._tip = document.createElement("div"); tip.className = "tip"; tip.setAttribute("role", "tooltip"); root.appendChild(tip); }
    tip.innerHTML = el.dataset.tipPlain ? `<em>${this.esc(el.dataset.tip)}</em>` : `<strong>${this.esc(el.dataset.tip)}</strong><span>${this.esc(el.dataset.tipSub || "")}</span>`;
    const box = el.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(box.left, globalThis.innerWidth - 320))}px`;
    tip.style.top = `${box.bottom + 6}px`;
    tip.hidden = false;
  }

  hideTip() { if (this._tip) this._tip.hidden = true; }

  render() {
    if (!this.shadowRoot) return;
    if (this._searchTimer) { globalThis.clearTimeout?.(this._searchTimer); this._searchTimer = null; }
    const started = this._debug ? globalThis.performance?.now?.() : null;
    const focus = this.captureFocus();
    const previousModal = this.modalKey(this.activeModal());
    // A view that throws shows a message under the top bar instead of freezing the panel on the last page.
    let page;
    if (this.view !== "maintenance") this.bpOpen = "";
    try { page = this.selected && this.data ? this.detail() : this.bpOpen ? this.blueprintPage() : `${this.heading()}${this.content()}`; } catch (err) { page = this.renderFailed(err); }
    const shell = `<div class="shell"><div class="stickyhead">${this.topbar()}${this.safetyBar()}${this.vacationBar()}</div><main class="main">${page}</main>${this.confirmDialog()}<div class="sr-only" role="status" aria-live="polite">${this.esc(this.liveStatus())}</div></div>`;
    // The style sheet is only parsed again when the theme changed; otherwise just the page is replaced.
    const root = this.shadowRoot, css = this.themeCss(), current = root.querySelector?.(".shell");
    let swapped = false;
    if (current && this._styleKey === css && root.querySelector("style[data-hk]")) {
      // WebKit refuses outerHTML on a child of the shadow root, so the new page goes in through a template.
      // Should a browser refuse that too, the whole root is rebuilt below rather than keeping the old page.
      try { const tpl = document.createElement("template"); tpl.innerHTML = shell; current.replaceWith(tpl.content); swapped = true; } catch (err) { this.logRenderError(err); }
    }
    if (!swapped) { root.innerHTML = `${this.styles()}${shell}`; this._styleKey = css; }
    const currentModal = this.modalKey(this.activeModal(root));
    if (currentModal && currentModal !== previousModal) (this._modalReturnFocus ||= new Map()).set(currentModal, focus);
    this.restoreFocus(focus);
    this.bind();
    if (previousModal && previousModal !== currentModal) {
      this.restoreFocus(this._modalReturnFocus?.get(previousModal));
      this._modalReturnFocus?.delete(previousModal);
    }
    this.bindModalFocus(root);
    this.fitNav(root);
    if (this._scrollPlan) { this._scrollPlan = false; setTimeout(() => root.querySelector("[data-plan-card]")?.scrollIntoView?.({ block: "start", behavior: "smooth" }), 30); }
    if (started !== null) console.debug(`[ha_housekeeper] render ${this.selected ? "detail" : this.view}: ${(globalThis.performance.now() - started).toFixed(1)} ms`);
    if (this.data) { this.syncGuard(); this.syncUrl(); }
  }

  renderFailed(err) {
    this.logRenderError(err);
    return `<div class="error" role="alert"><strong>${this.t("renderError")}</strong><br>${this.esc(err?.message || String(err))}<br><button class="btn" data-view="overview">${this.t("overview")}</button></div>`;
  }

  // Once per message, so a view that fails on every render does not flood the log.
  logRenderError(err) {
    const text = err?.message || String(err);
    if ((this._renderErrors ||= new Set()).has(text)) return;
    this._renderErrors.add(text);
    this.noteError?.("render", err);
    console.error("[ha_housekeeper] render failed:", err);
  }

  // Deep links: /ha-housekeeper?view=findingsNav&filter=orphaned or ?object=entity:sensor.x
  applyUrl() {
    if (this._urlApplied || typeof window === "undefined" || !this.data) return;
    this._urlApplied = true;
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view") === "storms" ? "recorder" : params.get("view"); // the load view moved into "Recorder"
    if (view && (view === "unreferenced" || NAV.some(([name]) => name === view))) this.view = view;
    else if (!params.get("object") && this.prefs.startView !== "overview") this.view = this.prefs.startView;
    if (params.get("filter")) { if (this.view === "monitor") this.monitorFilter = params.get("filter"); else this.findingFilter = params.get("filter"); }
    if (this.view === "monitor" && this.monitorFunctions().some(item => item.id === params.get("function"))) this.monitorSelected = params.get("function");
    this._pendingTab = params.get("tab");
    if (view && params.get("tab") && !params.get("object")) (this.viewTab ||= {})[this.view] = params.get("tab");
    const obj = this.findObject(params.get("object") || "");
    if (obj) this.openObject(obj);
    else if (this.view === "changes" && !this.compare) this.loadCompare();
  }

  syncUrl() {
    if (typeof window === "undefined" || !this.isConnected || !window.history?.replaceState) return;
    if (window.location.pathname !== this._basePath) return; // HA already navigated elsewhere
    const params = new URLSearchParams();
    if (this.selected) {
      params.set("object", this.objectKey(this.selected));
      if (this.detailTab !== "overview") params.set("tab", this.detailTab);
    }
    else {
      if (this.view !== "overview") params.set("view", this.view);
      if (this.viewTab?.[this.view]) params.set("tab", this.viewTab[this.view]);
      if (this.view === "findingsNav" && this.findingFilter) params.set("filter", this.findingFilter);
      if (this.view === "monitor") { if (this.monitorSelected) params.set("function", this.monitorSelected); else if (this.monitorFilter) params.set("filter", this.monitorFilter); }
    }
    const query = params.toString();
    try { window.history.replaceState(window.history.state, "", window.location.pathname + (query ? `?${query}` : "")); } catch (_) { /* ignore */ }
  }

  // What the scan counted for the views that cost nothing to read; a view without a number is not counted.
  viewCounts() {
    const found = this.data?.meta?.view_counts || {};
    return Object.fromEntries(["exposure", "dataflow", "secrets", "runs"].map(v => [v, found[v] || undefined]));
  }

  topbar() {
    const missedGoals = (this.goals?.goals || []).filter(g => g.state === "missed").length;
    const violations = (this.policies?.rules || []).filter(r => r.enabled).reduce((n, r) => n + (r.count || 0), 0);
    const counts = this.data ? { findingsNav: this.findingTotal(), batteries: this.lowBatteries().length || undefined, reminders: (this.data.reminders || []).filter(r => r.state === "due").length || undefined, cleanup: this.readyQuarantine() || undefined, repair: this.counterScan?.items?.length || undefined, maintenance: missedGoals || undefined, policies: violations || undefined, ...this.viewCounts() } : {};
    // Settings is the gear alone in the bar (its name is the tooltip and the label for screen readers); in the list of the narrow bar it shows its name.
    const item = view => `<button class="nav${view === "settings" ? " iconly" : ""} ${this.view === view ? "active" : ""}" data-view="${view}" ${this.view === view ? 'aria-current="page"' : ""}${view === "settings" ? ` aria-label="${this.esc(this.t(view))}" title="${this.esc(this.t(view))}"` : ""}><ha-icon icon="${NAV_ICONS[view]}"></ha-icon><span>${this.t(view)}</span>${counts[view] !== undefined ? `<em>${counts[view]}</em>` : ""}</button>`;
    const [direct, ...menus] = NAV_GROUPS;
    const menu = ([label, views]) => {
      const open = this.menuOpen === label;
      const sum = views.reduce((n, v) => n + (typeof counts[v] === "number" ? counts[v] : 0), 0);
      return `<div class="navmenu${open ? " open" : ""}"><button class="nav menubtn ${views.includes(this.view) ? "group-active" : ""}" data-menu="${label}" aria-expanded="${open}" aria-controls="menu-${label}"><span>${this.t(label)}</span>${sum ? `<em aria-label="${this.esc(this.t("groupOpen", { count: sum }))}">${sum}</em>` : ""}<ha-icon class="caret" icon="mdi:chevron-down"></ha-icon></button><div class="navpop" id="menu-${label}" role="group" aria-label="${this.esc(this.t(label))}"><p class="navhead" aria-hidden="true">${this.t(label)}</p>${views.map(item).join("")}</div></div>`;
    };
    return `<header class="top${this.navCompact ? " compact" : ""}${this.navOpen ? " open" : ""}">${this.haMenuButton()}<button class="brand${this.view === "overview" ? " active" : ""}" data-view="overview" ${this.view === "overview" ? 'aria-current="page"' : ""}><span class="brandmark"><img src="/ha_housekeeper/logo.png" alt="" onerror="this.parentNode.classList.add('nologo');this.remove()"><ha-icon icon="mdi:broom"></ha-icon></span><span class="brandtext"><strong>${this.t("title")}</strong><small>${this.t("overview")}</small></span></button>
      <button class="navtoggle" data-navtoggle aria-expanded="${Boolean(this.navOpen)}" aria-controls="topnav"><ha-icon icon="mdi:menu"></ha-icon><span>${this.t("navMenu")}</span></button>
      <nav class="topnav" id="topnav" aria-label="${this.esc(this.t("navMain"))}">${direct[1].filter(view => view !== "overview").map(item).join("")}${menus.map(menu).join("")}<div class="navend">${this.quickSearchBox()}${item("settings")}</div></nav></header>`;
  }

  // A top bar that does not fit its width changes into the menu button with a list, as on a phone, instead of being cut off.
  // The bar is measured in its full form: if its last item sticks out, the class "compact" turns it into the button.
  fitNav(root) {
    const top = root?.querySelector?.(".top"), nav = top?.querySelector?.(".topnav"), end = nav?.querySelector?.(".navend");
    if (!top || !end || typeof end.getBoundingClientRect !== "function") return;
    top.classList.remove("compact");
    const over = end.getBoundingClientRect().right > nav.getBoundingClientRect().right + 1 || nav.scrollWidth > nav.clientWidth + 1;
    if (over) top.classList.add("compact");
    this.navCompact = over;
  }

  // The small line above the title names the menu group the view belongs to.
  // Placeholder lines while a card loads; the text stays for screen readers.
  skeleton(key) {
    return `<div class="skeleton" role="status" aria-live="polite"><span class="sr-only">${this.t(key)}</span><i></i><i></i><i></i></div>`;
  }

  // "Not counted: 2 hidden, 1 disabled": what a view left out, so a short list is not mistaken for a clean bill.
  excludedText(excluded) {
    const e = excluded || {}, parts = [];
    if (e.ignored) parts.push(this.t("exclIgnored", { n: this.formatNumber(e.ignored) }));
    if (e.disabled) parts.push(this.t("exclDisabled", { n: this.formatNumber(e.disabled) }));
    if (e.permanent) parts.push(this.t("exclPermanent", { n: this.formatNumber(e.permanent) }));
    return parts.length ? this.t("exclLine", { list: parts.join(", ") }) : "";
  }

  // One line that says how complete the numbers are, so a precise figure does not pretend more.
  coverageNote(text) {
    return `<p class="factnote coverage"><ha-icon icon="mdi:information-outline"></ha-icon><span>${text}</span></p>`;
  }

  eyebrowFor(view) {
    if (view === "settings") return this.t("title");
    if (view === "overview") return this.t("navGroupOverview");
    const group = NAV_GROUPS.find(([, views]) => views.includes(view));
    // The first group holds the entries that stand alone in the bar; it is no heading.
    return group ? (group === NAV_GROUPS[0] ? "" : this.t(group[0])) : this.t("navGroupOverview");
  }

  // "just now", "3 min ago", "5 h ago", "2 days ago" for the scan time shown next to the scan button.
  agoText(iso) {
    const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!Number.isFinite(seconds)) return "";
    if (seconds < 90) return this.t("agoNow");
    if (seconds < 5400) return this.t("agoMinutes", { n: Math.round(seconds / 60) });
    if (seconds < 129600) return this.t("agoHours", { n: Math.round(seconds / 3600) });
    return this.t("agoDays", { n: Math.round(seconds / 86400) });
  }

  heading() {
    const titles = {
      overview: [this.t("health"), this.t("subtitle")],
      inventory: [this.t("inventory"), this.t("inventorySubtitle")],
      findingsNav: [this.t("findings"), this.t("findingsSubtitle")],
      changes: [this.t("changes"), this.t("changesSubtitle")],
      components: [this.t("components"), this.t("componentsSubtitle")],
      batteries: [this.t("batteries"), this.t("batteriesSubtitle")],
      reminders: [this.t("reminders"), this.t("remindersSubtitle")],
      unreferenced: [this.t("unreferenced"), this.t("unreferencedSubtitle")],
      graph: [this.t("pathTitle"), this.t("pathSubtitle")],
      settings: [this.t("settings"), this.t("settingsSubtitle")],
      cleanup: [this.t("cleanup"), this.t("cleanupSubtitle")],
      repair: [this.t("repair"), this.t("repairSubtitle")],
      journal: [this.t("journal"), this.t("journalSubtitle")],
      plan: [this.t("plan"), this.t("planPageSubtitle")],
      maintenance: [this.t("maintenance"), this.t("maintenanceSubtitle")],
      reliability: [this.t("reliability"), this.t("reliabilitySubtitle")],
      monitor: [this.t("monitor"), this.t("monitorSubtitle")],
      runs: [this.t("runsHeading"), this.t("runsSubtitle")],
      recorder: [this.t("recorder"), this.t("recorderSubtitle")],
      exposure: [this.t("exposure"), this.t("exposureSubtitle")],
      policies: [this.t("policies"), this.t("policiesSubtitle")],
      storage: [this.t("storage"), this.t("storageSubtitle")],
      dataflow: [this.t("dataflow"), this.t("dataflowSubtitle")],
      secrets: [this.t("secrets"), this.t("secretsSubtitle")],
    };
    const [title, sub] = titles[this.view] || titles.overview;
    const writes = ["cleanup", "repair", "plan", "maintenance", "policies", "monitor"].includes(this.view);
    const modePill = this.view === "overview" || this.view === "settings" ? "" : `<span class="pill ${writes ? "warn" : "mute"} modepill" title="${this.esc(this.t(writes ? "canChangeHint" : "readOnlyHint"))}"><ha-icon icon="${writes ? "mdi:pencil-outline" : "mdi:eye-outline"}"></ha-icon>${this.t(writes ? "canChange" : "readOnly")}</span>`;
    const scanned = this.data?.meta?.scanned_at;
    const ago = scanned ? `<span class="scanago" title="${this.esc(this.formatDate(scanned))}">${this.t("lastScan")}: ${this.agoText(scanned)}</span>` : "";
    const from = this.viewTrail[this.viewTrail.length - 1];
    // Every back button sits in this row at the top of the page, like the one of the detail page.
    const graphBack = this.view === "graph" && this.graphSelected && this.graphBackLabel() ? `<button class="btn" data-action="graph-back"><ha-icon icon="mdi:arrow-left"></ha-icon>${this.t("backTo")} ${this.esc(this.graphBackLabel())}</button>` : "";
    const viewBack = from ? `<button class="btn" data-action="view-back"><ha-icon icon="mdi:arrow-left"></ha-icon>${this.t("backTo")} ${this.t(from.view)}</button>` : "";
    const back = graphBack || viewBack ? `<div class="crumbs">${viewBack}${graphBack}</div>` : "";
    return `${back}<div class="heading"><div>${this.eyebrowFor(this.view) ? `<p class="eyebrow">${this.eyebrowFor(this.view)}</p>` : ""}<h1>${title}${this.view === "findingsNav" ? `<button type="button" class="infotip${this.foldOpen("findings_help", false) ? " on" : ""}" data-fold="findings_help" aria-expanded="${this.foldOpen("findings_help", false)}" aria-label="${this.esc(this.t("helpOpen"))}" title="${this.esc(this.t("helpOpen"))}"><ha-icon icon="mdi:information-outline"></ha-icon></button>` : ""}${INFO_SUB_VIEWS.includes(this.view) ? this.infoTip(sub) : ""}${["cleanup", "repair", "journal"].includes(this.view) ? this.infoTip(this.t("cleanupDryRun"), true) : ""}</h1>${VIEW_HINT[this.view] ? `<span class="sub">${this.t(VIEW_HINT[this.view])}</span>` : INFO_SUB_VIEWS.includes(this.view) ? "" : `<span class="sub">${sub}</span>`}</div>
      <div class="head-actions">${modePill}${ago}<button class="btn primary" data-action="scan" ${this.busy || this.cleanupRunning() ? 'disabled aria-busy="true"' : ""} title="${this.esc(this.t("scanHint"))}">${this.scanButtonInner()}</button></div></div>${this.warmupBanner()}${this.healthBanner()}`;
  }

  content() {
    if (this.view === "settings") return this.settingsView();
    if (this.error) return `<div class="error"><strong>${this.t("loadError")}</strong><br>${this.esc(this.error)}</div>`;
    if (!this.data) { const pct = this.scanStatus?.running ? Math.max(0, Math.min(100, Number(this.scanStatus.progress) || 0)) : null; return `${this.skeleton("loading")}${pct === null ? "" : `<div class="panel"><p class="factnote">${this.t("firstScan", { percent: pct })}</p><div class="bar"><i style="width:${pct}%"></i></div></div>`}`; }
    if (this.view === "inventory") return this.inventory();
    if (this.view === "monitor") return this.monitorView();
    if (this.view === "findingsNav") return this.findingsView();
    if (this.view === "changes") return this.changesView();
    if (this.view === "components") return this.componentsView();
    if (this.view === "batteries") return this.batteriesView();
    if (this.view === "reminders") return this.remindersView();
    if (this.view === "unreferenced") return this.unreferencedView();
    if (this.view === "cleanup") return this.cleanupView();
    if (this.view === "repair") return this.repairView();
    if (this.view === "plan") return this.planView();
    if (this.view === "journal") return this.journalView();
    if (this.view === "maintenance") return this.maintenanceView();
    if (this.view === "reliability") return this.reliabilityView();
    if (this.view === "recorder") return this.recorderView();
    if (this.view === "exposure") return this.exposureView();
    if (this.view === "policies") return this.policiesView();
    if (this.view === "runs") return this.runsView();
    if (this.view === "storage") return this.storageView();
    if (this.view === "dataflow") return this.dataflowView();
    if (this.view === "secrets") return this.secretsView();
    if (this.view === "graph") return this.graph();
    return this.overview();
  }

  tone(status) { return STATUS_TONE[status] || "blue"; }

  pill(status) { return `<span class="pill ${this.tone(status)}">${this.esc(this.statusLabel(status))}</span>`; }

  tile(type, tone = "") { return `<span class="tile ${tone}"><ha-icon icon="${ICONS[type] || "mdi:help-circle-outline"}"></ha-icon></span>`; }

  findingType(f) { return this.findObject(this.findingKey(f))?.object_type || f.rule_id.split(".")[0]; }

  // ``link`` is the key of the object the value names; the diagnosis shows it as a link to that object.
  // ``extra`` is ready HTML after the value, such as clickable suggestions.
  check(label, tone, value, badge, link = null, extra = "") { return { label, tone, value, badge, link, extra }; }

  bind() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-view]").forEach(el => el.onclick = () => { this.menuOpen = null; this.navOpen = false; this.view = el.dataset.view; this.pages = {}; this.selected = null; this.trail = []; this.viewTrail = []; this.graphTrail = []; this.graphOrigin = null; this.render(); if (this.view === "changes" && !this.compare) this.loadCompare(); });
    root.querySelectorAll("[data-menu]").forEach(el => el.onclick = () => { this.menuOpen = this.menuOpen === el.dataset.menu ? null : el.dataset.menu; this.render(); });
    this.bindQuick(root);
    root.querySelector("[data-navtoggle]")?.addEventListener("click", () => { this.navOpen = !this.navOpen; this.render(); });
    if (!this._menuBound && root.addEventListener) {
      this._menuBound = true;
      root.addEventListener("click", ev => {
        if (!this.menuOpen || (ev.composedPath?.() || []).some(node => node.classList?.contains?.("navmenu"))) return;
        this.menuOpen = null; this.render();
      });
      root.addEventListener("click", ev => { this._shift = ev.shiftKey; }, true);
      // The column and export pop-ups close on a click elsewhere and on Escape.
      root.addEventListener("click", ev => {
        if (!this._colOpen && !this._expOpen) return;
        if ((ev.composedPath?.() || []).some(node => node.classList?.contains?.("colwrap"))) return;
        this._colOpen = ""; this._expOpen = ""; this.render();
      });
      root.addEventListener("keydown", ev => {
        if (ev.key !== "Escape" || (!this._colOpen && !this._expOpen)) return;
        const id = this._colOpen ? `[data-col-open="${this._colOpen}"]` : `[data-exp-menu="${this._expOpen}"]`;
        this._colOpen = ""; this._expOpen = ""; this.render();
        root.querySelector(id)?.focus?.();
      });
      // Arrow keys move between the rows of a list: to the first control of the next or previous row.
      root.addEventListener("keydown", ev => {
        if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
        const from = ev.composedPath?.()[0];
        if (!from?.closest || from.matches("input[type=search],input[type=text],select,textarea")) return;
        const row = from.closest("tr, .row");
        if (!row || row.classList.contains("foldhead")) return;
        let next = ev.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling;
        while (next && !next.matches("tr, .row")) next = ev.key === "ArrowDown" ? next.nextElementSibling : next.previousElementSibling;
        const target = next?.matches("tr[tabindex]") ? next : next?.querySelector("input[type=checkbox], button, [tabindex]");
        if (target) { ev.preventDefault(); target.focus(); }
      });
      root.addEventListener("keydown", ev => {
        const typing = (ev.composedPath?.()[0]?.matches?.("input,select,textarea")) || ev.metaKey || ev.ctrlKey || ev.altKey;
        if (ev.key === "/" && !typing) {
          const box = root.querySelector("[data-lq]") || root.querySelector("[data-quick]");
          if (box) { ev.preventDefault(); box.focus(); box.select?.(); }
        } else if (ev.key === "Escape" && !this.menuOpen && !this.navOpen && !(ev.composedPath?.()[0]?.matches?.("input,select,textarea"))) {
          if (this.selected) { ev.preventDefault(); this.goBack(); }
          else if (this.plan && this.plan.status === "dry_run") { ev.preventDefault(); root.querySelector("[data-plan-close]")?.click(); }
        }
      });
      root.addEventListener("keydown", ev => {
        if (ev.key !== "Escape" || !(this.menuOpen || this.navOpen)) return;
        const label = this.menuOpen;
        this.menuOpen = null; this.navOpen = false; this.render();
        root.querySelector(label ? `[data-menu="${label}"]` : "[data-navtoggle]")?.focus?.();
      });
    }
    root.querySelectorAll("[data-scan-point]").forEach(el => el.addEventListener("click", () => this.load(true)));
    root.querySelectorAll("[data-action='scan']").forEach(el => el.addEventListener("click", () => this.load(true)));
    root.querySelector("[data-action='back']")?.addEventListener("click", () => this.goBack());
    root.querySelectorAll("[data-view-tab]").forEach(el => {
      el.onclick = () => this.pickViewTab(el.dataset.viewTab);
      el.onkeydown = ev => {
        const tabs = [...el.parentElement.querySelectorAll("[data-view-tab]")].map(b => b.dataset.viewTab), at = tabs.indexOf(el.dataset.viewTab);
        const next = { ArrowRight: tabs[(at + 1) % tabs.length], ArrowLeft: tabs[(at - 1 + tabs.length) % tabs.length], Home: tabs[0], End: tabs[tabs.length - 1] }[ev.key];
        if (!next) return;
        ev.preventDefault();
        this.pickViewTab(next);
        const target = this.shadowRoot.querySelector(`[data-view-tab="${next}"]`);
        target?.focus();
        target?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      };
    });
    root.querySelector("[data-action='graph-back']")?.addEventListener("click", () => this.graphBack());
    root.querySelector("[data-action='view-back']")?.addEventListener("click", () => this.viewBack());
    root.querySelectorAll("[data-detail-tab]").forEach(el => {
      el.onclick = () => { this.detailTab = el.dataset.detailTab; this.render(); };
      el.onkeydown = ev => {
        const ids = [...root.querySelectorAll("[data-detail-tab]")].map(b => b.dataset.detailTab), at = ids.indexOf(el.dataset.detailTab);
        const next = { ArrowRight: ids[(at + 1) % ids.length], ArrowLeft: ids[(at - 1 + ids.length) % ids.length], Home: ids[0], End: ids[ids.length - 1] }[ev.key];
        if (!next) return;
        ev.preventDefault();
        this.detailTab = next;
        this.render();
        this.shadowRoot.querySelector(`[data-detail-tab="${next}"]`)?.focus();
      };
    });
    root.querySelectorAll("[data-goto-tab]").forEach(el => el.onclick = () => { this.detailTab = el.dataset.gotoTab; this.render(); });
    root.querySelectorAll("[data-graph-open]").forEach(el => el.onclick = () => this.openGraph(this.findObject(el.dataset.graphOpen)));
    root.querySelectorAll("[data-goto-protection]").forEach(el => el.onclick = () => { this.settingsTab = "protection"; this.noteJump?.("settings"); this.view = "settings"; this.pages = {}; this.selected = null; this.render(); });
    root.querySelectorAll("[data-safe]").forEach(el => el.onclick = () => {
      if (el.dataset.safeKey === "mode") this.settingsTab = "protection";
      if (el.dataset.safeKey === "coverage") this.settingsTab = "info";
      if (el.dataset.safeKey === "ai") this.settingsTab = "mcp";
      this.noteJump(el.dataset.safe); this.view = el.dataset.safe; this.pages = {}; this.selected = null;
      this.render();
    });
    root.querySelectorAll("[data-cov-details]").forEach(el => el.onclick = () => { this.settingsTab = "info"; this.noteJump?.("settings"); this.view = "settings"; this.pages = {}; this.render(); });
    root.querySelectorAll("[data-jump]").forEach(el => el.onclick = ev => {
      ev?.stopPropagation(); // a jump inside a row that opens something else leaves that row alone
      this.noteJump(el.dataset.jump);
      this.view = el.dataset.jump; this.pages = {};
      if (el.dataset.jumpTab) (this.viewTab ||= {})[this.view] = el.dataset.jumpTab;
      if (el.dataset.jumpFresh !== undefined) { this.findingStatus = ""; this.findingAfter = false; this.findingDue = false; }
      if (el.dataset.jumpLf) { const [id, name, value] = el.dataset.jumpLf.split("|"); this.setListFilter(id, name, value); }
      if (el.dataset.jumpBattery) this.batteryFilter = el.dataset.jumpBattery;
      if (el.dataset.filter !== undefined) { if (el.dataset.jump === "monitor") this.monitorFilter = el.dataset.filter; else this.findingFilter = el.dataset.filter; }
      if (el.dataset.jump === "inventory") { this.statusFilter = el.dataset.status || ""; this.typeFilter = el.dataset.type || ""; this.originFilter = ""; if (!el.dataset.jumpLf) this.labelFilter = ""; this.pages = {}; }
      this.render();
      if (this.view === "changes" && !this.compare) this.loadCompare();
    });
    root.querySelectorAll("[data-tip]").forEach(el => { el.onmouseenter = () => this.showTip(el); el.onmouseleave = () => this.hideTip();
      const holder = el.closest?.("tr") || (el.hasAttribute?.("tabindex") || el.matches?.("button") ? el : null);
      if (holder) { holder.onfocus = () => this.showTip(el); holder.onblur = () => this.hideTip(); }
      // Touch: a long press shows the tooltip for a few seconds and does not open the object.
      el.ontouchstart = () => { globalThis.clearTimeout?.(this._tipTimer); this._tipTimer = globalThis.setTimeout?.(() => { this._tipShownAt = Date.now(); this.showTip(el); globalThis.clearTimeout?.(this._tipHide); this._tipHide = globalThis.setTimeout?.(() => this.hideTip(), 4000); }, 500); };
      el.ontouchend = el.ontouchmove = el.ontouchcancel = () => globalThis.clearTimeout?.(this._tipTimer);
      el.oncontextmenu = ev => { if (Date.now() - (this._tipShownAt || 0) < 1500) ev.preventDefault(); };
      el.addEventListener?.("click", ev => { if (Date.now() - (this._tipShownAt || 0) < 800) { ev.stopImmediatePropagation(); ev.preventDefault(); } });
    });
    root.querySelectorAll("[data-col-open]").forEach(el => el.onclick = () => { this._colOpen = this._colOpen === el.dataset.colOpen ? "" : el.dataset.colOpen; this.render(); });
    root.querySelectorAll("[data-col]").forEach(el => el.onchange = () => { const [id, key] = el.dataset.col.split("|"); this.toggleCol(id, key); });
    root.querySelectorAll("[data-exp-menu]").forEach(el => el.onclick = () => { this._expOpen = this._expOpen === el.dataset.expMenu ? "" : el.dataset.expMenu; this._colOpen = ""; this.render(); });
    root.querySelectorAll("[data-exp-fmt]").forEach(el => el.onclick = () => { const [id, fmt] = el.dataset.expFmt.split("|"); this._expOpen = ""; this.exportList(id, fmt); this.render(); });
    root.querySelectorAll("[data-exp-guided]").forEach(el => el.onclick = () => { this._expOpen = ""; this.xpOpen(); });
    root.querySelectorAll("[data-inv-filter]").forEach(el => el.onclick = () => { const [type, status, origin = ""] = el.dataset.invFilter.split("|"), same = (type || status) && this.typeFilter === type && this.statusFilter === status && this.originFilter === origin; this.typeFilter = same ? "" : type; this.statusFilter = same ? "" : status; this.originFilter = same ? "" : origin; this.pages = {}; (this.folds ||= {}).inv_types = !(this.typeFilter || this.statusFilter); this.render(); this.showList(); });
    root.querySelectorAll("[data-inv-more]").forEach(el => el.onclick = () => { this.invAllTypes = !this.invAllTypes; this.render(); });
    root.querySelectorAll("[data-type-jump]").forEach(el => el.onclick = () => { this.noteJump("inventory"); this.typeFilter = el.dataset.typeJump; this.statusFilter = ""; this.originFilter = ""; this.pages = {}; this.view = "inventory"; this.render(); });
    root.querySelectorAll("[data-export]").forEach(el => el.onclick = () => this.exportFindings(el.dataset.export));
    this.bindFindingStatus(root);
    this.bindDetailActions(root);
    root.querySelectorAll("[data-battery-filter]").forEach(el => el.onclick = () => { const v = el.dataset.batteryFilter; this.batteryFilter = v !== "all" && this.batteryFilter === v ? "all" : v; this.pages = {}; this.render(); this.showList(); });
    root.querySelectorAll("[data-ignore]").forEach(el => el.onclick = async () => {
      const key = el.dataset.ignore, ignored = el.dataset.ignoreValue === "1";
      try {
        await this._hass.callWS({ type: "ha_housekeeper/ignore", finding_key: key, ignored });
        const finding = this.data.findings.find(f => f.key === key);
        if (finding) { finding.ignored = ignored; finding.ignored_by = ignored ? "user" : null; this._rev++; }
      } catch (err) { this.failed(err); }
      this.render();
    });
    root.querySelectorAll("[data-toggle-followers]").forEach(el => el.onclick = () => { this.showFollowers = el.dataset.toggleFollowers === "flat"; this.pages = {}; this.render(); });
    root.querySelector("[data-done-days]")?.addEventListener("change", e => { this.doneDaysSel = Number(e.target.value); this.pages = {}; this.render(); });
    root.querySelector("[data-finding-due]")?.addEventListener("click", () => { this.findingDue = !this.findingDue; this.pages = {}; this.render(); });
    this.bindMarks(root);
    this.bindExceptions(root);
    this.bindMcp(root);
    this.bindStale(root);
    this.bindNotes(root);
    this.bindConfirm(root);
    root.querySelectorAll("[data-health-why]").forEach(el => el.onclick = () => { this.healthWhy = !this.healthWhy; this.render(); });
    root.querySelector("[data-todo-jump]")?.addEventListener("click", () => { const card = root.querySelector("#hk-todo-card"); card?.scrollIntoView?.({ block: "start", behavior: "smooth" }); card?.focus?.({ preventScroll: true }); });
    this.bindExport(root);
    this.bindPlanWizard(root);
    this.bindExclude(root);
    this.bindEntityRecorder(root);
    this.bindEntityTrim(root);
    this.bindScanPoints(root);
    this.bindKnown(root);
    this.bindGoals(root);
    this.bindExchange(root);
    this.bindDiagnostics(root);
    this.bindTraceDiag(root);
    this.bindRefactor(root);
    this.bindBatteryCare(root);
    this.bindCriteriaHistory(root);
    this.bindBackupCleanup(root);
    this.bindDetailEdit(root);
    this.bindPolSel(root);
    this.bindInvSel(root);
    this.bindPolicyRow(root);
    this.bindCounter(root);
    this.bindPicker(root);
    this.bindSystem(root);
    this.bindMonitor(root);
    root.querySelectorAll("[data-decide-open]").forEach(el => el.onclick = () => this.openDecide(el.dataset.decideOpen, el.dataset.decidePreset));
    root.querySelectorAll("[data-decide-form]").forEach(form => {
      form.onsubmit = ev => { ev.preventDefault(); this.commitDecide(); };
      form.querySelector("[data-decide-kind]").onchange = ev => { this.decide.kind = ev.target.value; this.decide.error = ""; if (this.decide.kind === "snooze" && !Number(this.decide.days)) this.decide.days = 30; this.render(); };
      form.querySelector("[data-decide-reason]").oninput = ev => { this.decide.reason = ev.target.value; };
      form.querySelector("[data-decide-days]").onchange = ev => { this.decide.days = Number(ev.target.value); };
      form.onkeydown = ev => { if (ev.key === "Escape") { ev.preventDefault(); this.decide = null; this.render(); } };
    });
    root.querySelectorAll("[data-decide-cancel]").forEach(el => el.onclick = () => { this.decide = null; this.render(); });
    root.querySelectorAll("[data-fold-all]").forEach(el => el.onclick = () => this.foldAllFindings(el.dataset.foldAll === "open"));
    root.querySelectorAll("[data-finding-after]").forEach(el => el.onclick = () => { this.findingAfter = !this.findingAfter; this.pages = {}; this.render(); this.showList(); });
    root.querySelectorAll("[data-lf-set]").forEach(el => el.onclick = () => {
      const [id, name, value] = el.dataset.lfSet.split("|"), st = this.lv[id];
      if (!st) return;
      if (!name) st.f = {}; else if (st.f[name] === value) delete st.f[name]; else st.f[name] = value;
      this.pages = {}; this.persistLv(id); this.render(); this.showList();
    });
    root.querySelectorAll("[data-changes-cat]").forEach(el => el.onclick = () => { const v = el.dataset.changesCat; this.changesCat = this.changesCat === v ? "" : v; this.render(); this.showList(); });
    root.querySelectorAll("[data-finding-reset]").forEach(el => el.onclick = () => { this.findingFilter = ""; this.findingAfter = false; this.pages = {}; this.render(); });
    root.querySelectorAll("[data-finding-filter]").forEach(el => el.onclick = () => { const v = el.dataset.findingFilter; this.findingFilter = v && this.findingFilter === v ? "" : v; this.pages = {}; this.render(); this.showList(); });
    const searchField = (selector, setter) => {
      const input = root.querySelector(selector);
      if (input) input.oninput = () => { setter(input.value); this.scheduleRender(); };
    };
    root.querySelectorAll("[data-baseline]").forEach(b => b.addEventListener("click", () => { this.compareBaseline = b.dataset.baseline; this.pages = {}; this.loadCompare(); }));
    root.querySelector("[data-history-all]")?.addEventListener("click", () => { this.historyAll = !this.historyAll; this.pages = {}; this.render(); });
    const bl = root.querySelector("#baseline"); if (bl) bl.onchange = () => { this.compareBaseline = bl.value; this.pages = {}; this.loadCompare(); };
    root.querySelectorAll("[data-object]").forEach(el => el.onclick = ev => { const inner = ev?.target?.closest?.("button, select, input, a, label, summary, .menupop"); if (inner && inner !== el && el.contains(inner)) return; const obj = this.findObject(el.dataset.object); if (obj) this.openObject(obj); });
    // Table rows and graph nodes are not native buttons: Enter and Space open them like a click.
    const openByKey = el => el.onkeydown = ev => {
      if (ev.target !== el || (ev.key !== "Enter" && ev.key !== " ")) return;
      ev.preventDefault();
      if (el.click) el.click(); else el.onclick?.();
    };
    root.querySelectorAll("tr[data-object], g[data-graph]").forEach(openByKey);
    root.querySelectorAll("tr[data-plan-open], tr[data-rem-row], tr[data-note-edit]").forEach(openByKey);
    root.querySelectorAll("g[data-graph-group]").forEach(openByKey);
    root.querySelectorAll("[data-graph-depth]").forEach(el => el.onclick = () => { this.graphDepth = Number(el.dataset.graphDepth); this.graphLimit = GRAPH_NODE_STEP; this.render(); });
    root.querySelector("[data-graph-impact]")?.addEventListener("click", () => { this.graphImpact = !this.graphImpact; this.render(); });
    root.querySelector("[data-graph-more]")?.addEventListener("click", () => { this.graphLimit += GRAPH_NODE_STEP; this.render(); });
    const gr = root.querySelector("#graphRel"); if (gr) gr.onchange = () => { this.graphRel = gr.value; this.render(); };
    const gc = root.querySelector("#graphConf"); if (gc) gc.onchange = () => { this.graphConf = gc.value; this.render(); };
    root.querySelectorAll("[data-graph-group]").forEach(el => el.onclick = () => { this.graphOpen.add(el.dataset.graphGroup); this.render(); });
    root.querySelector("[data-graph-regroup]")?.addEventListener("click", () => { this.graphOpen = new Set(); this.render(); });
    root.querySelectorAll("[data-graph]").forEach(el => el.onclick = () => { const obj = this.findObject(el.dataset.graph); if (obj) { this.noteGraphStep(obj); this.graphSelected = obj; this.graphQuery = ""; this.graphLimit = GRAPH_NODE_STEP; this.render(); } });
    root.querySelectorAll("[data-more-info]").forEach(el => el.onclick = () => this.moreInfo(el.dataset.moreInfo));
    root.querySelectorAll("[data-ha-path]").forEach(el => el.onclick = () => this.navigateHA(el.dataset.haPath));
    root.querySelectorAll("[data-pref]").forEach(el => el.onclick = () => { const [key, value] = el.dataset.pref.split("|"); this.setPref(key, value); });
    root.querySelectorAll("[data-pref-select]").forEach(el => el.onchange = () => this.setPref(el.dataset.prefSelect, el.value));
    root.querySelectorAll("[data-unref-tab]").forEach(el => el.onclick = () => { this.unrefTab = el.dataset.unrefTab; if (this.view === "cleanup") (this.viewTab ||= {}).cleanup = this.unrefTab === "statistics" ? "stats" : "unused"; this.retryOrphanLast(); this.pages = {}; this.render(); });
    root.querySelector("[data-diag-copy]")?.addEventListener("click", () => this.copyIssueText());
    root.querySelector("[data-diagnostics]")?.addEventListener("click", () => this.downloadText("diagnostics.json", JSON.stringify(this.diagnosticsData(), null, 2), "application/json"));
    root.querySelectorAll("[data-protection]").forEach(el => el.addEventListener("change", ev => this.setProtection(ev.target.value)));
    root.querySelector("[data-notify]")?.addEventListener("change", async ev => {
      try { await this._hass.callWS({ type: "ha_housekeeper/notify_set", enabled: ev.target.checked }); this.data.meta.notify = ev.target.checked; }
      catch (err) { this.failed(err); }
      this.render();
    });
    root.querySelectorAll("[data-bp-open]").forEach(el => el.onclick = ev => { const inner = ev?.target?.closest?.("button, select, input, a, label"); if (inner && inner !== el && el.contains(inner)) return; this.bpOpen = el.dataset.bpOpen; (this.viewTab ||= {}).blueprint = "overview"; this.render(); });
    root.querySelectorAll("tr[data-bp-open]").forEach(openByKey);
    root.querySelector("[data-bp-back]")?.addEventListener("click", () => { this.bpOpen = ""; this.render(); });
    root.querySelector("[data-bp-refresh]")?.addEventListener("click", () => { this._blueprintsRequested = false; this._bpDetailKey = ""; this.blueprints = null; this.render(); });
    root.querySelector("[data-weekly]")?.addEventListener("click", () => this.weeklyReport());
    root.querySelectorAll("[data-fsel-group]").forEach(el => el.onchange = () => { (this._findGroups?.[el.dataset.fselGroup] || []).forEach(key => (el.checked ? this.findSel.add(key) : this.findSel.delete(key))); this.render(); });
    root.querySelectorAll("[data-fsel]").forEach(el => el.onchange = () => { this.pickRows("fsel", el.dataset.fsel, el.checked, this.findSel, this._findPage); this.render(); });
    root.querySelectorAll("[data-sel-only]").forEach(el => el.onclick = () => { const id = el.dataset.selOnly; this.selOnly = { ...this.selOnly, [id]: !this.selOnly?.[id] }; this.pages = {}; this.render(); });
    root.querySelectorAll("[data-lreset]").forEach(el => el.onclick = () => { const st = this.lv[el.dataset.lreset]; if (st) { st.q = ""; st.f = {}; this.persistLv(el.dataset.lreset); } this.pages = {}; this.render(); });
    root.querySelector("[data-fsel-page]")?.addEventListener("click", () => { (this._findPage || []).forEach(key => this.findSel.add(key)); this.render(); });
    root.querySelector("[data-fsel-clear]")?.addEventListener("click", () => { this.findSel.clear(); this.render(); });
    root.querySelector("[data-fsel-unhide]")?.addEventListener("click", () => this.unhideSelectedFindings());
    root.querySelector("[data-fsel-hide]")?.addEventListener("click", () => this.hideSelectedFindings());
    root.querySelectorAll("[data-sel]").forEach(el => el.onchange = () => { this.pickRows("sel", el.dataset.sel, el.checked, this.cleanupSel, this._cleanupVisible); this.render(); });
    root.querySelector("[data-sel-page]")?.addEventListener("change", ev => { (this._cleanupVisible || []).forEach(id => (ev.target.checked ? this.cleanupSel.add(id) : this.cleanupSel.delete(id))); this.render(); });
    const pageBox = root.querySelector("[data-sel-page]"); if (pageBox) pageBox.indeterminate = pageBox.hasAttribute("data-partial");
    root.querySelector("[data-sel-clear]")?.addEventListener("click", () => { this.cleanupSel.clear(); this.render(); });
    root.querySelector("[data-recorder-choice]")?.addEventListener("change", ev => { this.cleanupRecorder = ev.target.value; this.render(); });
    root.querySelectorAll("[data-rec-own]").forEach(el => el.addEventListener("click", () => { const [id, value] = el.dataset.recOwn.split("|"); this.cleanupRecorderOwn = { ...(this.cleanupRecorderOwn || {}), [id]: value }; this.render(); }));
    root.querySelectorAll("[data-qtype]").forEach(el => el.onclick = () => { this.quarantineType = el.dataset.qtype; this.cleanupKind = el.dataset.qtype === "device" ? "remove_device" : "remove_entity"; this.cleanupSel = new Set(); if (this.lv.cleanup) this.lv.cleanup.f = {}; this.pages = {}; this.render(); });
    const kind = root.querySelector("[data-cleanup-kind]"); if (kind) kind.onchange = () => { this.cleanupKind = kind.value; this.cleanupSel = new Set(); if (this.lv.cleanup) this.lv.cleanup.f = {}; this.pages = {}; this.render(); };
    root.querySelectorAll("[data-repair-task]").forEach(el => el.onclick = () => { if (this.repairTask === el.dataset.repairTask) { this.repairTask = null; this.render(); return; } this.repairTask = el.dataset.repairTask; this.cleanupKind = this.repairTask; this.cleanupSel = new Set(); this.plan = null; this.render(); });
    // (the acknowledgement boxes are gone: the confirm dialog is the acknowledgement)
    root.querySelector("[data-ack-all]")?.addEventListener("change", e => { this.ack = new Set(e.target.checked ? this.plan.actions.filter(x => x.verdict === "review" && x.executable).map(x => x.object_id) : []); this.cleanupError = ""; this.render(); });
    root.querySelector("[data-plan-confirm]")?.addEventListener("click", ev => this.confirmAsk(this.confirmSummary(this.plan, Number(ev.currentTarget.dataset.count)), () => this.confirmAndRun(), { title: this.t("confirmRunTitle"), yes: this.t("runNow"), danger: ev.currentTarget.dataset.risky === "true", warn: this.largeRemovalWarning(this.plan) }));
    root.querySelector("[data-plan-discard]")?.addEventListener("click", () => this.discardPlan());
    root.querySelector("[data-purge-states-switch]")?.addEventListener("change", ev => this.setPurgeStates(ev.currentTarget.checked));
    root.querySelector("[data-plan-cancel]")?.addEventListener("click", () => this.cancelPlan());
    root.querySelector("[data-undo-all]")?.addEventListener("click", () => { this.undoAsk = "all"; this.render(); });
    root.querySelector("[data-undo-all-yes]")?.addEventListener("click", () => this.undoPlan());
    root.querySelectorAll("[data-undo-one]").forEach(el => el.onclick = () => { this.undoAsk = el.dataset.undoOne; this.render(); });
    root.querySelectorAll("[data-undo-one-yes]").forEach(el => el.onclick = () => this.undoPlan([el.dataset.undoOneYes]));
    root.querySelectorAll("[data-undo-no]").forEach(el => el.onclick = () => { this.undoAsk = null; this.render(); });
    root.querySelectorAll("[data-plan-repeat]").forEach(el => el.addEventListener("click", () => this.repeatPlan([this.plan, ...(this.journal || [])].find(x => x?.plan_id === el.dataset.planRepeat))));
    root.querySelectorAll("[data-plan-repeat-full]").forEach(el => el.addEventListener("click", () => this.repeatPlan([this.plan, ...(this.journal || [])].find(x => x?.plan_id === el.dataset.planRepeatFull), true)));
    root.querySelector("[data-plan-create]")?.addEventListener("click", () => this.createPlan());
    root.querySelectorAll("[data-repl-pick]").forEach(el => el.onclick = () => { this.replNew = el.dataset.replPick; this.render(); });
    root.querySelectorAll("[data-meter-pick]").forEach(el => el.onclick = () => { this.meterNew = el.dataset.meterPick; this.render(); });
    root.querySelectorAll("[data-psel]").forEach(el => el.onchange = () => { this.pickRows("psel", el.dataset.psel, el.checked, this.purgeSel, this._purgePage); this.render(); });
    root.querySelectorAll("[data-psel-all]").forEach(el => { el.indeterminate = el.hasAttribute("data-partial"); el.onchange = () => { (this._purgePage || []).forEach(id => el.checked ? this.purgeSel.add(id) : this.purgeSel.delete(id)); this.render(); }; });
    root.querySelector("[data-purge-page]")?.addEventListener("click", () => { (this._purgePage || []).forEach(id => this.purgeSel.add(id)); this.render(); });
    root.querySelector("[data-purge-clear]")?.addEventListener("click", () => { this.purgeSel.clear(); this.render(); });
    root.querySelector("[data-purge-run]")?.addEventListener("click", () => this.purgeRun());
    root.querySelectorAll("[data-meter-mode]").forEach(el => el.onclick = () => { this.meterMode = el.dataset.meterMode; this.render(); });
    root.querySelector("[data-repl-meter]")?.addEventListener("click", () => this.startCleanup("migrate_meter", () => { this.meterOld = this.replOld; this.meterNew = this.replNew; }));
    root.querySelector("[data-meter-refs]")?.addEventListener("click", () => this.startCleanup("replace_references", () => { this.replOld = this.meterOld; this.replNew = this.meterNew; }));
    root.querySelector("[data-costs-load]")?.addEventListener("click", ev => this.loadCosts(ev.currentTarget.hasAttribute("data-refresh")));
    root.querySelectorAll("[data-release]").forEach(el => el.onclick = () => { this.releaseConfirm = el.dataset.release; this.releaseMessage = ""; this.render(); });
    root.querySelectorAll("[data-release-yes]").forEach(el => el.onclick = () => this.releaseQuarantine(el.dataset.releaseYes));
    root.querySelectorAll("[data-release-no]").forEach(el => el.onclick = () => { this.releaseConfirm = null; this.render(); });
    root.querySelector("[data-runs-refresh]")?.addEventListener("click", () => this.loadRuns());
    root.querySelector("[data-rel-compare]")?.addEventListener("click", () => { this.relCompare = !this.relCompare; this.reliability = null; this.loadReliability(); });
    root.querySelectorAll("[data-rel-window]").forEach(el => el.onclick = () => { this.relWindow = Number(el.dataset.relWindow); this.reliability = null; this.pages.relentries = 1; this.pages.relunstable = 1; this.loadReliability(); });
    root.querySelectorAll("[data-storm-entry]").forEach(el => el.onclick = () => { this.stormEntry = el.dataset.stormEntry; this.pages.stormentities = 1; (this.viewTab ||= {}).recload = "entities"; this.render(); });
    root.querySelector("[data-storm-entry-clear]")?.addEventListener("click", () => { this.stormEntry = ""; this.pages.stormentities = 1; this.render(); });
    root.querySelectorAll("[data-storm-window]").forEach(el => el.onclick = () => { this.stormsWindow = Number(el.dataset.stormWindow); this.storms = null; this.pages.stormfind = 1; this.pages.stormentities = 1; this.loadStorms(); });
    root.querySelector("[data-storm-refresh]")?.addEventListener("click", () => this.loadStorms(true));
    root.querySelector("[data-rel-refresh]")?.addEventListener("click", () => this.loadReliability(true));
    root.querySelector("[data-expo-refresh]")?.addEventListener("click", () => this.loadExposure());
    root.querySelector("[data-policy-refresh]")?.addEventListener("click", () => this.loadPolicies());
    root.querySelector("[data-policy-hidden]")?.addEventListener("click", () => { this.policyShowHidden = !this.policyShowHidden; this.render(); });
    root.querySelectorAll("[data-policy-toggle]").forEach(el => el.onchange = () => this.changePolicy({ type: "ha_housekeeper/set_policy", rule: el.dataset.policyToggle, enabled: el.checked }));
    root.querySelector("[data-policy-limit-save]")?.addEventListener("click", () => this.setPolicyLimit(root.querySelector("#polLimit")?.value));
    root.querySelector("[data-policy-prefix-add]")?.addEventListener("click", () => this.addPolicyPrefix(root.querySelector("#polDomain")?.value, root.querySelector("#polPrefix")?.value));
    root.querySelectorAll("[data-policy-prefix-remove]").forEach(el => el.onclick = () => this.removePolicyPrefix(el.dataset.policyPrefixRemove));
    root.querySelectorAll("[data-policy-ignore]").forEach(el => el.onclick = () => this.changePolicy({ type: "ha_housekeeper/ignore", finding_key: el.dataset.policyIgnore, ignored: el.dataset.policyValue === "1" }));
    root.querySelector("[data-db-refresh]")?.addEventListener("click", () => this.loadDbHealth(true));
    root.querySelector("[data-db-check]")?.addEventListener("click", () => this.loadDbHealth(false, true));
    root.querySelector("[data-bh-refresh]")?.addEventListener("click", () => this.loadBackup());
    root.querySelector("[data-bkc-open]")?.addEventListener("click", () => { this.folds = { ...this.folds, bkc: true }; this.render(); this.shadowRoot?.querySelector?.("#hk-bkc")?.scrollIntoView?.({ block: "start" }); });
    root.querySelectorAll("[data-bh-open]").forEach(el => el.onclick = () => { this.bhForm = this.bhForm === el.dataset.bhOpen ? null : el.dataset.bhOpen; this.render(); });
    root.querySelector("[data-bh-cancel]")?.addEventListener("click", () => { this.bhForm = null; this.render(); });
    root.querySelectorAll("[data-bh-save]").forEach(el => el.onclick = () => {
      const kind = el.dataset.bhSave, date = root.querySelector(`[data-bh-date="${kind}"]`)?.value;
      this.loadBackup({ type: "ha_housekeeper/backup_attest", kind, ...(date ? { date } : {}) });
    });
    root.querySelector("[data-levels-ok]")?.addEventListener("click", () => { try { globalThis.localStorage?.setItem("ha_housekeeper.levels_hint", "1"); } catch (_) { /* no storage */ } this.render(); });
    root.querySelector("[data-levels-go]")?.addEventListener("click", () => { try { globalThis.localStorage?.setItem("ha_housekeeper.levels_hint", "1"); } catch (_) { /* no storage */ } this.noteJump("settings"); this.settingsTab = "scan"; this.view = "settings"; this.selected = null; this.pages = {}; this.render(); });
    this.bindOften(root);
    root.querySelectorAll("[data-why-level]").forEach(el => el.onclick = () => { this.noteJump("findingsNav"); this.view = "findingsNav"; this.pages = {}; this.findingFilter = ""; this.findingAfter = false; this._impactOnce = el.dataset.whyLevel; this.render(); });
    root.querySelectorAll("[data-watch-mark]").forEach(el => el.onclick = async ev => { ev.stopPropagation(); const obj = this.findObject(el.dataset.watchMark); if (!obj) return; this._pendingTab = "actions"; await this.openObject(obj); this.openMark(el.dataset.watchMark); });
    root.querySelectorAll("[data-watch-end]").forEach(el => el.onclick = () => this.askEndWatch());
    root.querySelectorAll("[data-watch-go]").forEach(el => el.onclick = () => { this.noteJump?.("findingsNav"); this.view = "findingsNav"; this.pages = {}; this.selected = null; this.trail = []; this.folds = { ...this.folds, corr: true, [this.incidentFoldId(el.dataset.watchGo)]: true }; this.render(); });
    root.querySelectorAll("[data-fold]").forEach(el => el.onclick = () => { if (el.dataset.fold.startsWith("chg_")) this.changesCat = ""; this.folds = { ...this.folds, [el.dataset.fold]: el.getAttribute("aria-expanded") !== "true" }; this.render(); });
    root.querySelectorAll("[data-bh-clear]").forEach(el => el.onclick = () => this.loadBackup({ type: "ha_housekeeper/backup_attest", kind: el.dataset.bhClear, clear: true }));
    root.querySelectorAll("img[data-fallback-icon]").forEach(img => img.addEventListener("error", () => { const i = document.createElement("ha-icon"); i.setAttribute("icon", img.dataset.fallbackIcon); img.replaceWith(i); }, { once: true }));
    root.querySelector("[data-pf-refresh]")?.addEventListener("click", () => this.loadPreflight());
    root.querySelector("[data-config-check]")?.addEventListener("click", () => this.runConfigCheck());
    root.querySelectorAll("[data-plan-close]").forEach(el => el.addEventListener("click", () => this.leavePlan()));
    root.querySelector("[data-journal-refresh]")?.addEventListener("click", () => this.refreshJournal());
    root.querySelectorAll("[data-plan-open]").forEach(el => el.onclick = ev => { if (el.tagName === "BUTTON") ev?.stopPropagation?.(); const inner = ev?.target?.closest?.("button, select, input, a, label"); if (inner && inner !== el && el.contains(inner)) return; this.openPlan(el.dataset.planOpen); });
    root.querySelectorAll("[data-merge-sel]").forEach(el => el.onchange = () => { this.mergeSel = new Set(this.mergeSel || []); el.checked ? this.mergeSel.add(el.dataset.mergeSel) : this.mergeSel.delete(el.dataset.mergeSel); this.render(); });
    root.querySelector("[data-merge]")?.addEventListener("click", () => this.mergePlans());
    root.querySelector("[data-merge-delete]")?.addEventListener("click", () => { const n = this.mergeSel?.size || 0; if (n) this.confirmAsk(this.t("confirmPlansDelete", { count: n }), () => this.deletePlans()); });
    root.querySelectorAll("[data-merge-page]").forEach(el => { el.indeterminate = el.hasAttribute("data-partial"); el.onchange = () => { this.mergeSel = new Set(this.mergeSel || []); el.dataset.mergePage.split(",").forEach(id => (el.checked ? this.mergeSel.add(id) : this.mergeSel.delete(id))); this.render(); }; });
    root.querySelectorAll("[data-plan-renew]").forEach(el => el.onclick = ev => { ev.stopPropagation(); this.renewPlan(el.dataset.planRenew); });
    root.querySelectorAll("[data-plan-delete]").forEach(el => el.onclick = () => { const id = el.dataset.planDelete, plan = (this.journal || []).find(p => p.plan_id === id) || this.plan; this.confirmAsk(this.t("confirmPlanDelete", { date: this.formatDate(plan?.created_at) }), () => this.deletePlan(id)); });
    root.querySelector("[data-opts-save]")?.addEventListener("click", () => this.saveOptions());
    // Saving stays off until a threshold differs from the saved one; typing must not rebuild the page.
    const optInputs = [...root.querySelectorAll("[data-opt]")];
    optInputs.forEach(el => el.oninput = () => {
      const conv = root.querySelector(`[data-conv="${el.dataset.opt}"]`), field = OPTION_FIELDS.find(f => f[0] === el.dataset.opt);
      if (conv && field) conv.textContent = this.optConversion(field[3], el.value);
      const reset = root.querySelector(`[data-opt-reset="${el.dataset.opt}"]`);
      if (reset && field) reset.hidden = String(el.value) === String(field[4]);
      const save = root.querySelector("[data-opts-save]");
      if (save) save.disabled = !optInputs.some(input => input.value !== input.dataset.saved);
    });
    root.querySelectorAll("[data-opt-reset]").forEach(el => el.onclick = () => {
      const input = root.querySelector(`[data-opt="${el.dataset.optReset}"]`), field = OPTION_FIELDS.find(f => f[0] === el.dataset.optReset);
      if (input && field) { input.value = field[4]; input.dispatchEvent(new Event("input")); }
    });
    root.querySelectorAll("[data-set-tab]").forEach(el => {
      el.onclick = () => { this.settingsTab = el.dataset.setTab; this.optionsMessage = ""; if (this.settingsTab === "exceptions" && this.exc) this.loadExceptions(); this.render(); };
      el.onkeydown = ev => {
        const ids = [...root.querySelectorAll("[data-set-tab]")].map(b => b.dataset.setTab), at = ids.indexOf(el.dataset.setTab);
        const next = { ArrowRight: ids[(at + 1) % ids.length], ArrowLeft: ids[(at - 1 + ids.length) % ids.length], Home: ids[0], End: ids[ids.length - 1] }[ev.key];
        if (!next) return;
        ev.preventDefault();
        this.settingsTab = next;
        this.render();
        this.shadowRoot.querySelector(`[data-set-tab="${next}"]`)?.focus();
      };
    });
    root.querySelector("[data-pref-reset]")?.addEventListener("click", () => { this.prefs = { ...DEFAULT_PREFS }; this.pageSize = DEFAULT_PREFS.pageSize; this.pages = {}; this.savePrefs(); this.render(); });
    root.querySelectorAll("[data-copy-event]").forEach(el => el.onclick = async () => {
      try { await this.copyText(el.dataset.copyEvent); this.copiedEvent = el.dataset.copyEvent.replace("ha_housekeeper_", ""); } catch (_) { this.copiedEvent = ""; }
      this.render();
      setTimeout(() => { this.copiedEvent = ""; this.render(); }, 1500);
    });
    root.querySelector("[data-copy-info]")?.addEventListener("click", async () => {
      try { await this.copyText(this.infoText()); this.copied = true; } catch (_) { this.copied = false; }
      this.render();
      setTimeout(() => { this.copied = false; this.render(); }, 1500);
    });
    root.querySelectorAll("[data-lq]").forEach(input => input.oninput = () => {
      this.lv[input.dataset.lq].q = input.value; this.pages = {};
      this.scheduleRender();
    });
    root.querySelectorAll("[data-lview-open]").forEach(el => el.onclick = () => { this._viewOpen = this._viewOpen === el.dataset.lviewOpen ? "" : el.dataset.lviewOpen; this.render(); });
    root.querySelectorAll("[data-lview-pick]").forEach(el => el.onclick = () => this.applyView(el.dataset.lviewPick, el.dataset.name));
    root.querySelectorAll("[data-lview-save]").forEach(el => el.onclick = () => this.saveView(el.dataset.lviewSave));
    root.querySelectorAll("[data-lview-form]").forEach(form => form.onsubmit = ev => {
      ev.preventDefault();
      this.commitView(form.dataset.lviewForm, form.querySelector("[data-lview-name]")?.value);
    });
    root.querySelectorAll("[data-lview-name]").forEach(el => {
      el.oninput = () => { this.viewDraft = el.value; };
      el.onkeydown = ev => { if (ev.key === "Escape") { ev.preventDefault(); this.cancelView(el.dataset.lviewName); } };
    });
    root.querySelectorAll("[data-lview-cancel]").forEach(el => el.onclick = () => this.cancelView(el.dataset.lviewCancel));
    root.querySelectorAll("[data-lview-delete]").forEach(el => el.onclick = () => { const id = el.dataset.lviewDelete, name = el.dataset.name; this.confirmAsk(this.t("confirmView", { name }), () => this.deleteView(id, name)); });
    root.querySelectorAll("[data-lf]").forEach(el => el.onchange = () => { const [id, name] = el.dataset.lf.split("|"); this.lv[id].f[name] = el.value; this.persistLv(id); this.pages = {}; this.render(); });
    root.querySelectorAll("[data-ls]").forEach(el => el.onchange = () => { const st = this.lv[el.dataset.ls]; st.sort = el.value; st.dir = this.lvDirs[el.dataset.ls][el.value] || "asc"; this.persistLv(el.dataset.ls); this.pages = {}; this.render(); });
    root.querySelectorAll("[data-lsort]").forEach(el => el.onclick = () => {
      const [id, key, dir] = el.dataset.lsort.split("|"), st = this.lv[id];
      if (st.sort === key) st.dir = st.dir === "desc" ? "asc" : "desc"; else { st.sort = key; st.dir = dir; }
      this.persistLv(id); this.pages = {}; this.render();
    });
    root.querySelectorAll("[data-dense]").forEach(el => el.onclick = () => this.toggleDenseList(el.dataset.dense));
    root.querySelectorAll("[data-ld]").forEach(el => el.onclick = () => { const st = this.lv[el.dataset.ld]; st.dir = st.dir === "desc" ? "asc" : "desc"; this.persistLv(el.dataset.ld); this.pages = {}; this.render(); });
    root.querySelectorAll("[data-lpage]").forEach(el => el.onclick = () => { const [id, n] = el.dataset.lpage.split("|"); this.pages[id] = Number(n); this.render(); this.focusListPage(id); });
    root.querySelectorAll("[data-lpagesize]").forEach(el => el.onchange = () => { (this.listSizes ||= {})[el.dataset.lpagesize] = Number(el.value); this.pages[el.dataset.lpagesize] = 1; this.render(); });
    root.querySelectorAll("[data-bh-more], [data-bh-row]").forEach(el => el.addEventListener("click", ev => {
      const inner = ev.target?.closest?.("button, select, input, a, label");
      if (el.dataset.bhRow !== undefined && inner && inner !== el && el.contains(inner)) return;
      const key = el.dataset.bhMore ?? el.dataset.bhRow, open = this.bhOpen || [];
      this.bhOpen = open.includes(key) ? open.filter(x => x !== key) : [...open, key];
      this.render();
    }));
    root.querySelectorAll("[data-pagesize]").forEach(el => el.onchange = () => { this.pageSize = Number(el.value); this.pages = {}; this.render(); });
  }
}
