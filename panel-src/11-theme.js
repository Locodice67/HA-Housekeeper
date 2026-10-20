// ThemeMixin: methods of the panel element, mixed into the class in 99-register.js.
class ThemeMixin {
  // Display preferences live in this browser only; storage may be unavailable.
  loadPrefs() {
    try { return this.sanitizePrefs(JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) || "{}")); } catch (_) { return { ...DEFAULT_PREFS }; }
  }

  // Keep only known, valid values; anything else falls back to the default.
  sanitizePrefs(saved) {
    const prefs = { ...DEFAULT_PREFS };
    if (!saved || typeof saved !== "object") return prefs;
    if (SIZES[saved.size]) prefs.size = saved.size;
    if (["auto", "light", "dark"].includes(saved.mode)) prefs.mode = saved.mode;
    const scheme = SCHEME_ALIASES[saved.scheme] || saved.scheme;
    if (SCHEMES[scheme]) prefs.scheme = scheme;
    if (["normal", "compact"].includes(saved.density)) prefs.density = saved.density;
    if (["auto", "reduced"].includes(saved.motion)) prefs.motion = saved.motion;
    if (PAGE_SIZES.includes(saved.pageSize)) prefs.pageSize = saved.pageSize;
    if (START_VIEWS.includes(saved.startView)) prefs.startView = saved.startView;
    if (["list", "graph"].includes(saved.graphMode)) prefs.graphMode = saved.graphMode;
    if (["auto", "de", "en"].includes(saved.language)) prefs.language = saved.language;
    return prefs;
  }

  // The Home Assistant user profile keeps the preferences across devices; this browser is the fallback.
  async loadUserPrefs() {
    try {
      const result = await this._hass?.callWS?.({ type: "frontend/get_user_data", key: USER_DATA_KEY });
      if (!result?.value) return;
      const prefs = this.sanitizePrefs(result.value);
      if (JSON.stringify(prefs) === JSON.stringify(this.prefs)) return;
      this.prefs = prefs; this.pageSize = prefs.pageSize; this.pages = {};
      this.savePrefs(false);
      this.render();
    } catch (_) { /* no user data available; local preferences stay */ }
  }

  savePrefs(sync = true) {
    try { globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch (_) { /* ignore */ }
    if (sync) Promise.resolve(this._hass?.callWS?.({ type: "frontend/set_user_data", key: USER_DATA_KEY, value: this.prefs })).catch(() => {});
  }

  isDark() {
    if (this.prefs.mode !== "auto") return this.prefs.mode === "dark";
    const ha = this._hass?.themes?.darkMode;
    if (typeof ha === "boolean") return ha;
    try { return Boolean(globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches); } catch (_) { return false; }
  }

  themeCss() {
    const { scheme, mode, size } = this.prefs;
    const darkNow = this.isDark();
    let vars = `--hk-fs:${SIZES[size] || 1};font-size:calc(14px*${SIZES[size] || 1});--hk-sh-rgb:${darkNow ? "0,0,0" : "19,28,23"};--hk-hi:inset 0 1px 0 rgba(255,255,255,${darkNow ? ".05" : ".7"})`;
    if (!(scheme === "standard" && mode === "auto")) {
      const dark = this.isDark(), p = (SCHEMES[scheme] || SCHEMES.standard)[dark ? "dark" : "light"];
      vars += `;--hk-blue:${p.accent};--hk-bg:${p.bg};--hk-surface:${p.surface};--hk-soft:${p.soft};--hk-text:${p.text};--hk-muted:${p.muted};--hk-border:${p.border};--hk-on:${p.on || "#ffffff"};--hk-green:${p.positive};--hk-amber:${p.warning};--hk-red:${p.danger};color-scheme:${dark ? "dark" : "light"}`;
    }
    const compact = this.prefs.density === "compact" ? `.row{padding-top:6px;padding-bottom:6px}.card{padding:10px 12px}.panelhead{min-height:44px;padding-top:8px;padding-bottom:8px}td{padding:6px 14px}th{padding:7px 14px}.nav{min-height:36px}.tile{width:30px;height:30px}.setrow{padding-top:9px;padding-bottom:9px}.chips{padding-top:8px;padding-bottom:8px}.listbar{padding-top:8px;padding-bottom:8px}.summary,.stack,.grid2{gap:10px}.heading{margin-bottom:14px}` : "";
    const calm = "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.taskcard:hover{transform:none!important}";
    const motion = this.prefs.motion === "reduced" ? calm : `@media(prefers-reduced-motion:reduce){${calm}}`;
    return `:host{${vars}}${compact}${motion}`;
  }

  setPref(key, raw) {
    const value = key === "pageSize" ? Number(raw) : raw;
    this.prefs = { ...this.prefs, [key]: value };
    if (key === "pageSize") { this.pageSize = value; this.pages = {}; }
    this.savePrefs();
    this.render();
  }
}
