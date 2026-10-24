// PropertiesMixin: property cards for entity and device pages (assignment, properties, technical data, times).
class PropertiesMixin {
  propLink(key, text, sub = "") {
    const obj = this.findObject(key);
    if (!obj) return this.esc(text);
    return `<button class="link" data-object="${this.esc(key)}">${this.esc(text)}</button>${sub ? ` <small>${this.esc(sub)}</small>` : ""}`;
  }

  propChips(names) { return names.length ? `<span class="chips bare">${names.map(n => `<span class="chip">${this.esc(n)}</span>`).join("")}</span>` : ""; }

  // The registry gives 1970 for objects created before it recorded the time; that is "unknown", not a date.
  realTime(value) { return value && Date.parse(value) >= Date.UTC(2000, 0, 1) ? value : ""; }

  propTime(value) { return this.realTime(value) ? `${this.esc(this.formatDate(value))} <span class="rel">· ${this.esc(this.relTime(value))}</span>` : ""; }

  propCard(title, icon, rows) {
    const shown = rows.filter(r => r && r[1] !== "" && r[1] !== null && r[1] !== undefined);
    if (!shown.length) return "";
    return `<section class="panel"><div class="panelhead"><h2 class="proph"><ha-icon icon="${icon}"></ha-icon>${this.esc(title)}</h2></div><div class="pad"><dl class="kv">${shown.map(([k, v, tip]) => `<dt${tip ? ` title="${this.esc(tip)}"` : ""}>${this.esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></div></section>`;
  }

  propCode(value) { return value ? `<code>${this.esc(value)}</code>` : ""; }

  propArea(areaId, deviceAreaId) {
    const name = id => this.findObject(`area:${id}`)?.name || id;
    if (areaId) return this.propLink(`area:${areaId}`, name(areaId));
    return deviceAreaId ? this.t("propAreaInherited", { area: this.esc(name(deviceAreaId)) }) : "";
  }

  propLabels(ids) { return this.propChips((ids || []).map(id => this.findObject(`label:${id}`)?.name || id)); }

  // The labels of an object, always as a row: its own, or a note that there are none.
  labelRows(item) {
    return [[this.t("propLabels"), this.propLabels(item.labels) || `<span class="muted">${this.esc(this.t("propLabelsNone"))}</span>`]];
  }

  // Automations, scripts, scenes and areas have no property cards; their labels still get their place.
  labelCard(item) { return this.propCard(this.t("propAssignment"), "mdi:link-variant", this.labelRows(item)); }

  propBy(value) { return value ? this.t(`by_${value}`) : ""; }

  entityCards(item) {
    const t = k => this.t(k), device = item.device_id ? this.findObject(`device:${item.device_id}`) : null;
    const entry = item.config_entry_id ? this.findObject(`config_entry:${item.config_entry_id}`) : null;
    const integration = entry ? this.propLink(`config_entry:${entry.object_id}`, entry.integration_name || entry.name, entry.integration_name ? `(${entry.domain})` : "") : this.esc(item.platform || "");
    const deviceSub = device ? [device.manufacturer, device.model].filter(Boolean).join(" ") : "";
    const assignment = this.propCard(t("propAssignment"), "mdi:link-variant", [
      [t("propIntegration"), integration],
      [t("propDeviceOf"), device ? this.propLink(`device:${device.object_id}`, device.name, deviceSub) : ""],
      [t("propArea"), this.propArea(item.area_id, device?.area_id)],
      ...this.labelRows(item),
    ]);
    const properties = this.propCard(t("propProperties"), "mdi:tune-variant", [
      [t("propDomain"), this.esc(item.object_id.split(".")[0])],
      [t("propDeviceClass"), this.esc(item.device_class || "")],
      [t("propStateClass"), this.esc(item.state_class || item.attributes?.state_class || "")],
      [t("propUnit"), this.esc(item.unit || "")],
      [t("propCategory"), item.entity_category ? this.esc(this.t(`cat_${item.entity_category}`)) : ""],
      [t("propOriginalName"), item.original_name && item.original_name !== item.name ? this.esc(item.original_name) : ""],
      [t("propAliases"), this.propChips(item.aliases || [])],
      [t("propIcon"), item.icon ? this.propCode(item.icon) : ""],
      [t("propDisabledBy"), this.esc(this.propBy(item.disabled_by))],
      [t("propHiddenBy"), this.esc(this.propBy(item.hidden_by))],
    ]);
    const technical = this.propCard(t("propTechnical"), "mdi:identifier", [
      [t("propEntityId"), this.propCode(item.object_id)], [t("propUniqueId"), this.propCode(item.unique_id)], [t("propPlatform"), this.propCode(item.platform)],
    ]);
    const times = this.propCard(t("propTimes"), "mdi:clock-outline", [
      [t("propCreated"), this.propTime(item.created_at)], [t("propModified"), this.propTime(item.modified_at)],
      [t("propLastChangedShort"), this.propTime(item.last_changed), t("propLastChanged")], [t("propLastUpdatedShort"), this.propTime(item.last_updated), t("propLastUpdated")],
    ]);
    // Two columns, each card as high as its content: assignment and ids on the left, properties and times on the right.
    return `<div class="propcol">${assignment}${technical}</div><div class="propcol">${properties}${times}</div>`;
  }

  deviceCards(item) {
    const t = k => this.t(k);
    const via = item.via_device_id ? this.findObject(`device:${item.via_device_id}`) : null;
    const parent = item.parent_device_id ? this.findObject(`device:${item.parent_device_id}`) : null;
    const children = this.data.objects.filter(o => o.object_type === "device" && (o.via_device_id === item.object_id || o.parent_device_id === item.object_id));
    const isChild = item.device_kind === "child";
    // The same two structural reasons that block a cleanup plan (see cleanup.py), so the page explains the block before a plan is made.
    const blocks = [isChild ? "reason_child_device" : "", children.length ? "reason_has_children" : ""].filter(Boolean).map(k => this.esc(this.t(k))).join("<br>");
    const entries = (item.config_entry_ids || []).map(id => this.findObject(`config_entry:${id}`)).filter(Boolean);
    const info = this.propCard(t("propDevice"), "mdi:devices", [
      [t("propManufacturer"), this.esc(item.manufacturer || "")],
      [t("propModel"), this.esc([item.model, item.model_id && item.model_id !== item.model ? `(${item.model_id})` : ""].filter(Boolean).join(" "))],
      [t("propSerial"), this.propCode(item.serial_number)],
      [t("propFirmware"), this.esc(item.sw_version || "")],
      [t("propHardware"), this.esc(item.hw_version || "")],
      [t("propEntryType"), item.entry_type ? this.esc(this.t(`type_${item.entry_type}`) === `type_${item.entry_type}` ? item.entry_type : this.t(`type_${item.entry_type}`)) : ""],
      [t("propUserName"), item.original_name ? this.esc(item.name) : ""],
      [t("propOriginalDeviceName"), this.esc(item.original_name || "")],
    ]);
    const assignment = this.propCard(t("propAssignment"), "mdi:link-variant", [
      [t("propIntegration"), entries.map(e => this.propLink(`config_entry:${e.object_id}`, e.integration_name || e.name, e.integration_name ? `(${e.domain})` : "")).join("<br>")],
      [t("propArea"), this.propArea(item.area_id, null)],
      [t("propKind"), isChild ? t("propKindChild") : ""],
      [t("propParent"), parent ? this.propLink(`device:${parent.object_id}`, parent.name) : ""],
      [t("propVia"), via ? this.propLink(`device:${via.object_id}`, via.name) : ""],
      [t("propChildren"), children.length ? this.t("propChildrenCount", { count: children.length }) : ""],
      [t("propCleanupBlock"), blocks],
      ...this.labelRows(item),
      [t("propConfigUrl"), /^https?:\/\//i.test(item.configuration_url || "") ? `<a href="${this.esc(item.configuration_url)}" target="_blank" rel="noopener noreferrer">${this.esc(item.configuration_url)}</a>` : this.esc(item.configuration_url || "")],
    ]);
    const members = this.data.objects.filter(o => o.object_type === "entity" && o.device_id === item.object_id).sort((a, b) => a.name.localeCompare(b.name));
    const memberRows = this.objectTable(`members-${item.object_id}`, members.map(m => ({ key: `entity:${m.object_id}`, type: "entity", name: m.name, sub: m.object_id, tone: this.tone(m.status), state: m.status, stateLabel: this.statusLabel(m.status), pill: this.pill(m.status), value: m.state === null || m.state === undefined ? "" : `${m.state}${m.unit ? ` ${m.unit}` : ""}` })), {
      extras: [{ key: "value", label: "objColState", get: r => r.value, cell: r => r.value ? this.esc(r.value) : `<span class="muted">—</span>` }], empty: t("propNoEntities"), menu: true, stripe: true, sort: "status",
    });
    const entities = `<section class="panel wide"><div class="panelhead"><h2><ha-icon icon="mdi:shape-outline" class="propicon"></ha-icon>${t("propEntities")} (${members.length})</h2></div>${memberRows}</section>`;
    const technical = this.propCard(t("propTechnical"), "mdi:identifier", [
      [t("propDeviceId"), this.propCode(item.object_id)],
      [t("propIdentifiers"), (item.identifiers || []).map(v => this.propCode(v)).join("<br>")],
      [t("propConnections"), (item.connections || []).map(v => this.propCode(v)).join("<br>")],
    ]);
    const times = this.propCard(t("propTimes"), "mdi:clock-outline", [[t("propCreated"), this.propTime(item.created_at)], [t("propModified"), this.propTime(item.modified_at)]]);
    return info + assignment + entities + technical + times;
  }

  propertyCards(item) {
    if (item.object_type === "entity") return this.entityCards(item);
    if (item.object_type === "device") return this.deviceCards(item);
    if (item.object_type === "config_entry") return this.integrationCard(item);
    if (["automation", "script", "scene", "area"].includes(item.object_type)) return `<div class="propcol">${this.labelCard(item)}</div>`;
    return "";
  }
}
