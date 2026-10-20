"""Runtime tests executed when Home Assistant test support is installed."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest

pytest.importorskip("homeassistant")
pytestmark = pytest.mark.asyncio

from homeassistant import config_entries  # noqa: E402
from homeassistant.core import HomeAssistant  # noqa: E402
from homeassistant.data_entry_flow import FlowResultType  # noqa: E402
from homeassistant.helpers import entity_registry as er  # noqa: E402
from homeassistant.helpers.dispatcher import async_dispatcher_send  # noqa: E402
from scanner_entry import attach_scanner  # noqa: E402

from custom_components.ha_housekeeper.const import (  # noqa: E402
    API_SCHEMA,
    DOMAIN,
    SIGNAL_SCAN_STARTED,
)
from custom_components.ha_housekeeper.inventory import (  # noqa: E402
    InventoryScanner,
    _device_config_entry_ids,
    _registry_entries,
)
from custom_components.ha_housekeeper.runtime import loaded_scanner  # noqa: E402


@pytest.fixture(autouse=True)
def _enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Allow loading the integration from custom_components."""


async def test_config_flow_creates_single_entry(hass: HomeAssistant) -> None:
    """The empty confirmation flow creates the local service entry."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "HA Housekeeper"
    assert result["data"] == {}
    await hass.async_block_till_done(wait_background_tasks=True)
    assert loaded_scanner(hass) is not None
    # The initial scan ran on the event loop and finished (a plain function would run in a thread).
    assert loaded_scanner(hass).snapshot is not None


async def test_scanner_reads_entity_registry_and_state(hass: HomeAssistant) -> None:
    """A registered live entity appears as active in the normalized snapshot."""
    registry = er.async_get(hass)
    entry = registry.async_get_or_create(
        domain="sensor",
        platform="test",
        unique_id="housekeeper-test",
        suggested_object_id="housekeeper_test",
    )
    hass.states.async_set(entry.entity_id, "42", {"unit_of_measurement": "kWh"})

    scanner = InventoryScanner(hass)
    await scanner.async_initialize()
    snapshot = await scanner.async_scan()

    item = next(value for value in snapshot["objects"] if value["object_id"] == entry.entity_id)
    assert item["object_type"] == "entity"
    assert item["status"] == "active"
    assert item["reason"] == "state_available"
    assert snapshot["meta"]["read_only"] is True


async def test_scan_builds_the_existing_objects_once(hass: HomeAssistant) -> None:
    """Every reference analysis of one scan works from the same view of what exists."""
    scanner = InventoryScanner(hass)
    await scanner.async_initialize()
    calls = 0
    original = scanner._existing_objects

    def counting() -> dict[str, set[str]]:
        nonlocal calls
        calls += 1
        return original()

    scanner._existing_objects = counting  # type: ignore[method-assign]
    await scanner.async_scan()

    assert calls == 1


async def test_registry_helpers_accept_old_and_new_home_assistant_shapes() -> None:
    """Registry adapters support mappings and read-only collections; a device has one config entry."""

    class Entry:
        def __init__(self, entry_id: str) -> None:
            self.id = entry_id

    old_entry = Entry("old")
    new_entry = Entry("new")
    assert _registry_entries({"old": old_entry}) == [old_entry]
    assert _registry_entries((new_entry,)) == [new_entry]

    modern_device = type("ModernDevice", (), {"config_entry_id": "modern"})()
    assert _device_config_entry_ids(modern_device) == ["modern"]


async def test_scanner_counts_entities_per_device(hass: HomeAssistant) -> None:
    """Devices report how many registry entities they provide."""
    from homeassistant.helpers import device_registry as dr
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    config_entry = MockConfigEntry(domain="test")
    config_entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=config_entry.entry_id, identifiers={("test", "device-1")}
    )
    registry = er.async_get(hass)
    for index in range(2):
        registry.async_get_or_create(
            domain="sensor",
            platform="test",
            unique_id=f"count-{index}",
            config_entry=config_entry,
            device_id=device.id,
        )

    scanner = InventoryScanner(hass)
    await scanner.async_initialize()
    snapshot = await scanner.async_scan()

    item = next(value for value in snapshot["objects"] if value["object_id"] == device.id)
    assert item["entity_count"] == 2
    assert item["status"] == "active"


async def test_scan_payload_omits_attributes_but_details_are_available(hass: HomeAssistant) -> None:
    """Attributes are served on demand instead of inside the list payload."""
    registry = er.async_get(hass)
    entry = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="detail-test", suggested_object_id="detail_test"
    )
    hass.states.async_set(entry.entity_id, "7", {"unit_of_measurement": "W"})

    scanner = InventoryScanner(hass)
    await scanner.async_initialize()
    snapshot = await scanner.async_scan()

    item = next(value for value in snapshot["objects"] if value["object_id"] == entry.entity_id)
    assert "attributes" not in item
    assert scanner.get_details("entity", entry.entity_id) == {
        "attributes": {"unit_of_measurement": "W"}
    }
    assert scanner.get_details("entity", "sensor.unknown") is None


async def test_diagnostics_exports_only_aggregates(hass: HomeAssistant) -> None:
    """The diagnostics download contains counts but no names or entity IDs."""
    from homeassistant.config_entries import ConfigEntryState

    from custom_components.ha_housekeeper.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    entry = er.async_get(hass).async_get_or_create(
        domain="sensor", platform="test", unique_id="diag-1", suggested_object_id="secret_name"
    )
    scanner = InventoryScanner(hass)
    config_entry = attach_scanner(hass, scanner)
    await scanner.async_scan()

    result = await async_get_config_entry_diagnostics(hass, config_entry)

    assert result["loaded"] is True
    assert result["meta"]["object_count"] >= 1
    assert sum(result["findings_by_rule"].values()) == 1
    assert entry.entity_id not in repr(result)
    assert "secret_name" not in repr(result)

    config_entry.mock_state(hass, ConfigEntryState.NOT_LOADED)
    assert (await async_get_config_entry_diagnostics(hass, config_entry))["loaded"] is False


async def test_options_flow_stores_threshold(hass: HomeAssistant) -> None:
    """The unavailable threshold is editable through the options flow."""
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] == FlowResultType.FORM
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"outage_high_hours": 168}
    )
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert entry.options["outage_high_hours"] == 168
    assert entry.options["outage_info_minutes"] == 15
    assert entry.options["scan_interval_hours"] == 6
    assert entry.options["unused_automation_days"] == 90
    assert entry.options["low_battery_percent"] == 20
    assert entry.options["history_days"] == 30


async def test_options_flow_refuses_falling_thresholds_and_a_running_write(
    hass: HomeAssistant,
) -> None:
    """Thresholds out of order keep the form open; while a plan writes, the flow does not open."""
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    from custom_components.ha_housekeeper.writelock import acquire_write, release_write

    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"outage_low_hours": 48, "outage_medium_hours": 24}
    )
    assert result["type"] == FlowResultType.FORM
    assert result["errors"] == {"base": "thresholds_order"}

    acquire_write(hass, "plan")
    result = await hass.config_entries.options.async_init(entry.entry_id)
    release_write(hass, "plan")
    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] == "busy"


async def test_low_battery_threshold_is_configurable(hass: HomeAssistant) -> None:
    """The scanner uses its configured threshold for low batteries."""
    registry = er.async_get(hass)
    entry = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="bat-1", suggested_object_id="remote_battery"
    )
    hass.states.async_set(
        entry.entity_id, "35", {"device_class": "battery", "unit_of_measurement": "%"}
    )
    scanner = InventoryScanner(hass)
    snapshot = await scanner.async_scan()
    assert snapshot["meta"]["low_battery_percent"] == 20
    assert snapshot["meta"]["low_batteries"] == 0
    assert snapshot["meta"]["ha_version"]
    assert snapshot["meta"]["scan_interval_hours"] == 6

    scanner.low_battery_percent = 50
    snapshot = await scanner.async_scan()
    assert snapshot["meta"]["low_battery_percent"] == 50
    assert snapshot["meta"]["low_batteries"] == 1


async def test_repairs_hints_only_cover_entity_and_reference_findings(hass: HomeAssistant) -> None:
    """A failed config entry stays a panel finding; it must not raise "unavailable entities"."""
    from homeassistant.helpers import issue_registry as ir

    from custom_components.ha_housekeeper.issues import async_sync_issues

    async_sync_issues(hass, [{"classification": "problem"}, {"classification": "something_new"}])
    assert ir.async_get(hass).async_get_issue(DOMAIN, "unavailable_entities") is None
    async_sync_issues(hass, [{"classification": "unavailable"}])
    assert ir.async_get(hass).async_get_issue(DOMAIN, "unavailable_entities") is not None


async def test_scan_health_tells_a_failed_and_an_old_scan_from_a_good_one(
    hass: HomeAssistant,
) -> None:
    """The last good counts stay on screen after a failed scan; the health says so, and only a lasting failure is a repair."""
    from homeassistant.helpers import issue_registry as ir

    from custom_components.ha_housekeeper.issues import SCAN_ISSUE_ID, async_sync_scan_issue

    health = InventoryScanner(hass).health
    now = datetime.now(UTC)
    health.started(now)
    health.succeeded(now, 2.0, False)
    assert health.report(now, 24)["state"] == "ok"
    assert health.report(now + timedelta(hours=73), 24)["state"] == "stale"
    assert (
        health.report(now + timedelta(days=30), 0)["state"] == "ok"
    )  # only on request: never overdue

    for n in range(3):
        health.failed(now + timedelta(minutes=n + 1), "automations", RuntimeError("boom"))
        report = health.report(now + timedelta(minutes=10), 24)
        assert report["state"] == "failed" and report["needs_repair"] is (n == 2)
        async_sync_scan_issue(hass, report)
    assert ir.async_get(hass).async_get_issue(DOMAIN, SCAN_ISSUE_ID) is not None

    health.succeeded(now + timedelta(minutes=20), 2.0, False)
    report = health.report(now + timedelta(minutes=21), 24)
    assert report["state"] == "ok" and report["failed_phase"] is None
    async_sync_scan_issue(hass, report)
    assert ir.async_get(hass).async_get_issue(DOMAIN, SCAN_ISSUE_ID) is None


async def test_a_scan_says_which_sources_it_read_and_which_it_could_not(
    hass: HomeAssistant,
) -> None:
    """An empty list must not look the same as a source that was never read."""
    scanner = InventoryScanner(hass)
    snapshot = await scanner.async_scan()
    by_source = {item["source"]: item for item in snapshot["meta"]["coverage"]}
    assert by_source["registry"]["state"] == "checked"
    assert by_source["apps"] == {"source": "apps", "state": "absent", "reason": "no_supervisor"}
    assert by_source["dashboards"]["state"] == "skipped"  # no Lovelace in this test instance
    assert "dashboard" in snapshot["meta"]["unchecked"]


async def test_scan_creates_and_clears_repairs_hints(hass: HomeAssistant) -> None:
    """Findings become aggregated, non-fixable issues that disappear once resolved."""
    from homeassistant.helpers import issue_registry as ir

    registry = er.async_get(hass)
    entry = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="issue-1", suggested_object_id="issue_test"
    )
    scanner = InventoryScanner(hass)
    await scanner.async_scan()

    issue = ir.async_get(hass).async_get_issue(DOMAIN, "orphaned_entities")
    assert issue is not None
    assert issue.is_fixable is False
    assert issue.learn_more_url == "/ha-housekeeper?view=findingsNav&filter=orphaned"
    assert issue.translation_placeholders == {
        "count": "1",
        "link": "/ha-housekeeper?view=findingsNav&filter=orphaned",
    }

    hass.states.async_set(entry.entity_id, "1")
    await scanner.async_scan()
    assert ir.async_get(hass).async_get_issue(DOMAIN, "orphaned_entities") is None


async def test_scripts_and_scenes_are_inventoried_with_missing_references(
    hass: HomeAssistant,
) -> None:
    """Scripts and scenes become objects, edges and findings like automations."""
    from homeassistant.setup import async_setup_component

    hass.states.async_set("light.present", "on")
    assert await async_setup_component(
        hass,
        "script",
        {
            "script": {
                "tidy": {
                    "alias": "Tidy",
                    "sequence": [
                        {"action": "light.turn_off", "target": {"entity_id": "light.present"}},
                        {"action": "light.turn_off", "target": {"entity_id": "light.gone"}},
                    ],
                }
            }
        },
    )
    hass.states.async_set(
        "scene.evening",
        "scening",
        {"friendly_name": "Evening", "entity_id": ["light.present", "light.vanished"]},
    )

    scanner = InventoryScanner(hass)
    snapshot = await scanner.async_scan()

    types = {item["object_id"]: item["object_type"] for item in snapshot["objects"]}
    assert types["script.tidy"] == "script"
    assert types["scene.evening"] == "scene"

    rules = {(f["rule_id"], f["object_id"], f.get("affected_object")) for f in snapshot["findings"]}
    assert ("script.missing_entity", "script.tidy", "light.gone") in rules
    assert ("scene.missing_entity", "scene.evening", "light.vanished") in rules
    assert not any(affected == "light.present" for _, _, affected in rules)

    targets = {(e["source"], e["target"]) for e in snapshot["edges"]}
    assert ("script:script.tidy", "entity:light.present") in targets
    assert ("scene:scene.evening", "entity:light.present") in targets


async def test_dashboards_are_inventoried_with_missing_entities(hass: HomeAssistant) -> None:
    """Dashboard entity references become edges, and gone entities become findings."""
    from types import SimpleNamespace

    from homeassistant.components.lovelace.const import LOVELACE_DATA

    class FakeDashboard:
        mode = "storage"
        config = {"title": "Wohnzimmer"}

        async def async_load(self, force: bool) -> dict:
            return {
                "views": [
                    {"cards": [{"type": "entity", "entity": "light.present"}]},
                    {"cards": [{"type": "entity", "entity": "light.gone"}]},
                ]
            }

    class BrokenDashboard:
        async def async_load(self, force: bool) -> dict:
            raise RuntimeError("auto-generated")

    hass.states.async_set("light.present", "on")
    hass.data[LOVELACE_DATA] = SimpleNamespace(
        dashboards={"dash-living": FakeDashboard(), None: BrokenDashboard()}
    )

    snapshot = await InventoryScanner(hass).async_scan()

    dashboards = [o for o in snapshot["objects"] if o["object_type"] == "dashboard"]
    assert [d["object_id"] for d in dashboards] == ["dash-living"]
    assert dashboards[0]["name"] == "Wohnzimmer"
    assert dashboards[0]["view_count"] == 2
    assert dashboards[0]["missing_reference_count"] == 1

    assert ("dashboard:dash-living", "entity:light.present") in {
        (e["source"], e["target"]) for e in snapshot["edges"]
    }
    finding = next(f for f in snapshot["findings"] if f["rule_id"] == "dashboard.missing_entity")
    assert finding["affected_object"] == "light.gone"
    assert finding["evidence"][0]["location"] == "views/1/cards/0/entity"


async def test_second_scan_can_be_compared_with_the_first(hass: HomeAssistant) -> None:
    """The scanner records history so a later scan shows what changed."""
    registry = er.async_get(hass)
    entry = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="cmp-1", suggested_object_id="cmp_test"
    )
    hass.states.async_set(entry.entity_id, "1")
    scanner = InventoryScanner(hass)
    await scanner.async_scan()
    assert scanner.history.compare(scanner.snapshot)["available"] is False

    hass.states.async_set(entry.entity_id, "unavailable")
    await scanner.async_scan()

    result = scanner.history.compare(scanner.snapshot)
    assert result["available"] is True
    changes = result["status_changes"]["items"]
    assert [(c["object_id"], c["from"], c["to"]) for c in changes] == [
        (entry.entity_id, "active", "unavailable")
    ]


async def test_scan_flags_duplicates_and_keeps_hints_out_of_repairs(hass: HomeAssistant) -> None:
    """A suffixed leftover becomes a finding, but never a Repairs card."""
    from homeassistant.helpers import issue_registry as ir

    registry = er.async_get(hass)
    base = registry.async_get_or_create(
        domain="media_player", platform="cast", unique_id="a", suggested_object_id="tv"
    )
    twin = registry.async_get_or_create(
        domain="media_player", platform="cast", unique_id="b", suggested_object_id="tv_2"
    )
    hass.states.async_set(base.entity_id, "on")
    hass.states.async_set(twin.entity_id, "unavailable")

    scanner = InventoryScanner(hass)
    scanner.outage_info_minutes = 0  # an outage counts at once
    snapshot = await scanner.async_scan()

    duplicate = next(f for f in snapshot["findings"] if f["rule_id"] == "entity.possible_duplicate")
    assert (duplicate["object_id"], duplicate["affected_object"]) == (
        twin.entity_id,
        base.entity_id,
    )
    assert ir.async_get(hass).async_get_issue(DOMAIN, "orphaned_entities") is None
    assert snapshot["meta"]["unused_automation_days"] == 90


async def test_groups_and_helpers_link_their_members(hass: HomeAssistant) -> None:
    """Group members and helper sources become edges; vanished ones become findings."""
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    hass.states.async_set("light.present", "on")
    hass.states.async_set("light.group", "on", {"entity_id": ["light.present", "light.vanished"]})
    MockConfigEntry(
        domain="derivative", title="Rate", options={"source": "sensor.gone_source"}
    ).add_to_hass(hass)

    snapshot = await InventoryScanner(hass).async_scan()

    edges = {(e["source"], e["target"], e["relation"]) for e in snapshot["edges"]}
    assert ("entity:light.group", "entity:light.present", "INCLUDES") in edges
    rules = {(f["rule_id"], f["object_id"], f.get("affected_object")) for f in snapshot["findings"]}
    assert ("entity.missing_member", "light.group", "light.vanished") in rules
    helper = next(f for f in snapshot["findings"] if f["rule_id"] == "config_entry.missing_entity")
    assert helper["affected_object"] == "sensor.gone_source"
    assert any(
        s.startswith("config_entry:") and t == "entity:sensor.gone_source" for s, t, _ in edges
    )


async def test_the_ignore_label_on_a_device_hides_the_findings_of_its_entities(
    hass: HomeAssistant,
) -> None:
    from homeassistant.helpers import device_registry as dr
    from homeassistant.helpers import label_registry as lr
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    label = lr.async_get(hass).async_create("housekeeper_ignore")
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={("test", "d")}
    )
    dr.async_get(hass).async_update_device(device.id, labels={label.label_id})
    registry = er.async_get(hass)
    inside = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="in", device_id=device.id
    )
    outside = registry.async_get_or_create(domain="sensor", platform="test", unique_id="out")

    snapshot = await InventoryScanner(hass).async_scan()
    by_object = {f["object_id"]: f for f in snapshot["findings"]}
    assert by_object[inside.entity_id]["ignored_by"] == "label"
    assert by_object[outside.entity_id]["ignored"] is False


async def test_findings_can_be_hidden_by_the_user_or_by_label(hass: HomeAssistant) -> None:
    """Hidden findings stay in the snapshot but no longer produce Repairs hints."""
    from homeassistant.helpers import issue_registry as ir
    from homeassistant.helpers import label_registry as lr

    registry = er.async_get(hass)
    plain = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="p", suggested_object_id="plain"
    )
    labelled = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="l", suggested_object_id="labelled"
    )
    label = lr.async_get(hass).async_create("housekeeper_ignore")
    registry.async_update_entity(labelled.entity_id, labels={label.label_id})

    scanner = InventoryScanner(hass)
    snapshot = await scanner.async_scan()
    by_object = {f["object_id"]: f for f in snapshot["findings"]}

    assert by_object[labelled.entity_id]["ignored_by"] == "label"
    assert by_object[plain.entity_id]["ignored"] is False
    issues = ir.async_get(hass)
    assert (
        issues.async_get_issue(DOMAIN, "orphaned_entities").translation_placeholders["count"] == "1"
    )

    key = by_object[plain.entity_id]["key"]
    assert scanner.set_finding_ignored(key, True) is True
    assert by_object[plain.entity_id]["ignored_by"] == "user"
    assert issues.async_get_issue(DOMAIN, "orphaned_entities") is None

    assert scanner.set_finding_ignored(key, False) is True
    assert by_object[plain.entity_id]["ignored"] is False
    assert issues.async_get_issue(DOMAIN, "orphaned_entities") is not None
    assert scanner.set_finding_ignored("does|not|exist", True) is False

    assert scanner.set_finding_ignored(key, True, kind="keep", reason="Reserve", days=30)
    info = by_object[plain.entity_id]["ignore_info"]
    assert info["kind"] == "keep" and info["reason"] == "Reserve" and info["until"]
    scanner.ignored._items[key]["until"] = "2000-01-01T00:00:00+00:00"  # the time ran out
    await scanner.async_scan()
    again = {f["object_id"]: f for f in scanner.snapshot["findings"]}[plain.entity_id]
    assert again["ignored"] is False and again["resurfaced"] is True

    assert scanner.set_mark("entity", "sensor.nope", "keep") == "not_found"
    assert scanner.set_mark("entity", plain.entity_id, "keep", reason="Reserve") is None
    item = next(o for o in scanner.snapshot["objects"] if o["object_id"] == plain.entity_id)
    assert item["marked_keep"] and item["mark"]["reason"] == "Reserve"
    assert scanner.clear_mark("entity", plain.entity_id) and "marked_keep" not in item


async def test_sensors_expose_counts_and_follow_scans(hass: HomeAssistant) -> None:
    """The set-up entry provides count sensors that ignore hidden findings."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done(wait_background_tasks=True)

    registry = er.async_get(hass)
    registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="s1", suggested_object_id="ghost"
    )
    scanner = loaded_scanner(hass)
    await scanner.async_scan()
    await hass.async_block_till_done(wait_background_tasks=True)

    assert hass.states.get("sensor.ha_housekeeper_orphaned_entities").state == "1"
    assert hass.states.get("sensor.ha_housekeeper_findings").state == "1"
    assert hass.states.get("sensor.ha_housekeeper_last_scan").state not in {
        "unknown",
        "unavailable",
    }

    finding = scanner.snapshot["findings"][0]
    scanner.set_finding_ignored(finding["key"], True)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert hass.states.get("sensor.ha_housekeeper_findings").state == "0"


async def test_scan_button_is_available_after_a_scan(hass: HomeAssistant) -> None:
    """The button reads the status when the scan ends, so it must not still say running."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done(wait_background_tasks=True)
    scanner = loaded_scanner(hass)
    await scanner.async_scan()
    await hass.async_block_till_done(wait_background_tasks=True)
    button = next(state for state in hass.states.async_all("button"))
    assert button.state != "unavailable"


async def test_scan_button_stays_available_while_a_scan_runs(hass: HomeAssistant) -> None:
    """Issue 35: Housekeeper saw its own button fail with every scan; the activity says it."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done(wait_background_tasks=True)
    scanner = loaded_scanner(hass)
    scanner.status["running"] = True
    async_dispatcher_send(hass, SIGNAL_SCAN_STARTED)
    await hass.async_block_till_done()
    button = next(state for state in hass.states.async_all("button"))
    assert button.state != "unavailable"
    assert hass.states.get("sensor.ha_housekeeper_activity").state == "scanning"


async def test_the_button_and_the_service_refuse_a_scan_with_a_translated_reason(
    hass: HomeAssistant,
) -> None:
    """While Home Assistant starts, a press and a call say why; without a loaded entry the call says so."""
    from homeassistant.exceptions import ServiceValidationError

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done(wait_background_tasks=True)
    loaded_scanner(hass).begin_warmup(300)
    button = next(state.entity_id for state in hass.states.async_all("button"))
    with pytest.raises(ServiceValidationError) as refused:
        await hass.services.async_call("button", "press", {"entity_id": button}, blocking=True)
    assert refused.value.translation_key == "starting"
    with pytest.raises(ServiceValidationError) as refused:
        await hass.services.async_call(DOMAIN, "scan", {}, blocking=True, return_response=True)
    assert refused.value.translation_key == "starting"

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    with pytest.raises(ServiceValidationError) as refused:
        await hass.services.async_call(DOMAIN, "scan", {}, blocking=True, return_response=True)
    assert refused.value.translation_key == "not_loaded"


async def test_a_home_function_gets_a_sensor_events_and_loses_the_sensor_when_deleted(
    hass: HomeAssistant,
) -> None:
    """The sensor follows the definition; the event entity carries the transitions."""
    from custom_components.ha_housekeeper.const import SIGNAL_MONITOR_EVENT

    registry = er.async_get(hass)
    registry.async_get_or_create("light", "test", "flur", suggested_object_id="flur")
    hass.states.async_set("light.flur", "on")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done(wait_background_tasks=True)
    scanner = loaded_scanner(hass)
    await scanner.async_scan()
    item_id = scanner.monitor.upsert(
        None,
        "Flur",
        "",
        False,
        [{"object_key": "entity:light.flur", "required": True}],
        scanner.snapshot,
        scanner.health_report(),
    )
    await hass.async_block_till_done()
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    sensor = registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_monitor_{item_id}")
    assert sensor is not None

    event = registry.async_get_entity_id("event", DOMAIN, f"{entry.entry_id}_monitor_event")
    async_dispatcher_send(
        hass, SIGNAL_MONITOR_EVENT, "beeintraechtigt", {"function_id": item_id, "name": "Flur"}
    )
    await hass.async_block_till_done()
    assert hass.states.get(event).attributes["event_type"] == "beeintraechtigt"

    scanner.monitor.delete(item_id)
    await hass.async_block_till_done()
    assert registry.async_get(sensor) is None
    assert hass.states.get(sensor) is None


async def test_scan_survives_a_scene_that_lists_non_names(hass: HomeAssistant) -> None:
    hass.states.async_set("scene.odd", "unknown", {"entity_id": [1, 2, "light.real"]})
    scanner = InventoryScanner(hass)
    await scanner.async_initialize()
    await scanner.async_scan()
    assert scanner.status["phase"] == "complete"


async def _ws_setup(hass: HomeAssistant, hass_ws_client):
    from homeassistant.setup import async_setup_component

    from custom_components.ha_housekeeper import async_setup

    assert await async_setup(hass, {})
    scanner = InventoryScanner(hass)
    attach_scanner(hass, scanner)
    await scanner.async_initialize()
    scanner.protection.mode = "full"  # a new install starts read-only
    assert await async_setup_component(hass, "websocket_api", {})
    return scanner, await hass_ws_client(hass)


async def test_cleanup_plan_is_a_dry_run_recorded_in_the_journal(
    hass: HomeAssistant, hass_ws_client
) -> None:
    """A plan judges candidates, is journaled, and changes nothing in Home Assistant."""
    registry = er.async_get(hass)
    orphan = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="p-1", suggested_object_id="old_sensor"
    )
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()

    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/plan_create",
            "actions": [{"kind": "disable_entity", "object_id": orphan.entity_id}],
        }
    )
    plan = (await client.receive_json())["result"]
    assert plan["executed"] is False and plan["status"] == "dry_run"
    assert plan["actions"][0]["verdict"] == "ok"
    assert registry.async_get(orphan.entity_id).disabled_by is None  # nothing was changed

    await client.send_json_auto_id({"type": "ha_housekeeper/plan_list"})
    listed = (await client.receive_json())["result"]
    assert listed["plans"][0]["plan_id"] == plan["plan_id"] and listed["removed"] == []
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/plan_delete", "plan_id": plan["plan_id"]}
    )
    assert (await client.receive_json())["result"] == {"removed": True}
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/plan_delete", "plan_id": plan["plan_id"]}
    )
    assert (await client.receive_json())["success"] is False


async def test_options_can_be_changed_from_the_panel(hass: HomeAssistant, hass_ws_client) -> None:
    """The panel command validates ranges and stores the options on the entry."""
    from unittest.mock import patch

    from pytest_homeassistant_custom_component.common import MockConfigEntry

    entry = MockConfigEntry(domain=DOMAIN, data={}, options={"min_unavailable_days": 7})
    entry.add_to_hass(hass)
    _, client = await _ws_setup(hass, hass_ws_client)
    with patch.object(hass.config_entries, "async_schedule_reload"):
        await client.send_json_auto_id(
            {"type": "ha_housekeeper/set_options", "scan_interval_hours": 6}
        )
        result = await client.receive_json()
    assert result["success"] and result["result"]["options"]["scan_interval_hours"] == 6
    assert entry.options["scan_interval_hours"] == 6 and entry.options["min_unavailable_days"] == 7

    await client.send_json_auto_id(
        {"type": "ha_housekeeper/set_options", "low_battery_percent": 500}
    )
    assert (await client.receive_json())["success"] is False
    await client.send_json_auto_id({"type": "ha_housekeeper/set_options"})
    assert (await client.receive_json())["success"] is False

    # No reload while something writes: it would drop the runner and journal of the running plan.
    hass.data[DOMAIN]["write_holder"] = "plan"
    await client.send_json_auto_id({"type": "ha_housekeeper/set_options", "stale_hours": 12})
    busy = await client.receive_json()
    assert busy["error"]["code"] == "busy" and "stale_hours" not in entry.options
    hass.data[DOMAIN]["write_holder"] = None


async def test_energy_dashboard_counts_as_a_user_of_its_entities(hass: HomeAssistant) -> None:
    """Entities used by the Energy dashboard show up as used and are never cleanup-safe."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, patch

    hass.config.components.add("energy")
    hass.states.async_set("sensor.grid", "5")
    prefs = {
        "energy_sources": [{"type": "grid", "flow_from": [{"stat_energy_from": "sensor.grid"}]}],
        "device_consumption": [{"stat_consumption": "sensor.gone"}],
    }
    manager = SimpleNamespace(data=prefs)
    with patch(
        "homeassistant.components.energy.data.async_get_manager", AsyncMock(return_value=manager)
    ):
        snapshot = await InventoryScanner(hass).async_scan()

    energy = next(o for o in snapshot["objects"] if o["object_id"] == "energy")
    assert energy["object_type"] == "dashboard" and energy["entity_count"] == 2
    assert {"source": "dashboard:energy", "target": "entity:sensor.grid"}.items() <= next(
        e for e in snapshot["edges"] if e["target"] == "entity:sensor.grid"
    ).items()


async def test_statistics_flag_is_false_without_a_recorder(hass: HomeAssistant) -> None:
    registry = er.async_get(hass)
    registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="s-1", suggested_object_id="plain"
    )
    snapshot = await InventoryScanner(hass).async_scan()
    assert snapshot["meta"]["recorder_available"] is False
    assert all(
        o["has_statistics"] is False for o in snapshot["objects"] if o["object_type"] == "entity"
    )


async def test_orphaned_statistics_are_listed_without_becoming_findings(
    hass: HomeAssistant,
) -> None:
    """Statistics of vanished entities are a hint list, not findings, repairs or health."""
    from unittest.mock import AsyncMock, patch

    hass.states.async_set("sensor.alive", "1")
    statistics = [
        {"statistic_id": "sensor.alive", "source": "recorder"},
        {"statistic_id": "sensor.gone", "source": "recorder", "has_sum": True},
    ]
    scanner = InventoryScanner(hass)
    with patch.object(InventoryScanner, "_statistics", AsyncMock(return_value=statistics)):
        snapshot = await scanner.async_scan()

    assert [o["statistic_id"] for o in snapshot["orphaned_statistics"]] == ["sensor.gone"]
    assert snapshot["meta"]["orphaned_statistics"] == 1
    assert snapshot["findings"] == []


async def test_a_refused_unload_keeps_the_runtime_objects(hass: HomeAssistant) -> None:
    """If the platforms stay loaded, the panel and the scanner must stay as well."""
    from unittest.mock import patch

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done(wait_background_tasks=True)
    entry = hass.config_entries.async_entries(DOMAIN)[0]

    with patch.object(hass.config_entries, "async_unload_platforms", return_value=False):
        from custom_components.ha_housekeeper import async_unload_entry

        assert await async_unload_entry(hass, entry) is False

    assert loaded_scanner(hass) is not None
    assert "ha-housekeeper" in hass.data["frontend_panels"]


async def test_an_unload_stops_a_running_plan_and_writes_the_journal_after_it(
    hass: HomeAssistant,
) -> None:
    """A reload in the middle of a plan lets the current step finish before the journal is saved."""
    import asyncio
    from unittest.mock import AsyncMock

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done(wait_background_tasks=True)
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    runner = loaded_scanner(hass).cleanup
    order: list[str] = []

    async def step() -> None:
        while not runner._cancel:
            await asyncio.sleep(0)
        order.append("stopped")
        runner.status["running"] = False

    runner.status["running"] = True
    runner._task = hass.async_create_task(step())
    flush = AsyncMock(side_effect=lambda: order.append("flushed"))
    with patch.object(runner, "flush_journal", flush):
        assert await hass.config_entries.async_unload(entry.entry_id)

    assert order == ["stopped", "flushed"]


async def test_preliminary_scan_during_warmup_changes_no_stored_state(
    hass: HomeAssistant,
) -> None:
    """While Home Assistant is starting, a scan neither records history nor raises repairs."""
    from homeassistant.helpers import issue_registry as ir

    registry = er.async_get(hass)
    registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="w-1", suggested_object_id="late_sensor"
    )
    scanner = InventoryScanner(hass)
    scanner.begin_warmup(300)
    assert scanner.warming_up

    snapshot = await scanner.async_scan()
    assert snapshot["meta"]["preliminary"] is True
    assert snapshot["meta"]["warmup_seconds_left"] > 0
    assert scanner.observations.since("entity:sensor.late_sensor", "orphaned") is None
    assert ir.async_get(hass).async_get_issue(DOMAIN, "orphaned_entities") is None
    assert scanner.history.compare(snapshot, None)["baselines"] == []

    scanner._warmup_until = 0.0  # the warm-up is over
    assert not scanner.warming_up
    snapshot = await scanner.async_scan()
    assert snapshot["meta"]["preliminary"] is False
    assert scanner.observations.since("entity:sensor.late_sensor", "orphaned") is not None
    assert ir.async_get(hass).async_get_issue(DOMAIN, "orphaned_entities") is not None


async def test_a_brief_orphan_flash_does_not_reset_the_unavailable_period(
    hass: HomeAssistant,
) -> None:
    """A long outage must keep its start when an early scan sees the state missing."""
    from datetime import UTC, datetime, timedelta

    registry = er.async_get(hass)
    entry = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="w-2", suggested_object_id="long_gone"
    )
    scanner = InventoryScanner(hass)
    long_ago = datetime.now(UTC) - timedelta(days=30)
    await scanner.observations.async_update({"entity:sensor.long_gone": "unavailable"}, long_ago)
    since = scanner.observations.since("entity:sensor.long_gone", "unavailable")

    scanner.begin_warmup(300)
    await scanner.async_scan()  # no state yet: classified orphaned, but only preliminarily
    scanner._warmup_until = 0.0
    hass.states.async_set(entry.entity_id, "unavailable")
    snapshot = await scanner.async_scan()

    item = next(o for o in snapshot["objects"] if o["object_id"] == "sensor.long_gone")
    assert item["status"] == "unavailable"
    assert item["status_since"] == since
    assert any(f["object_id"] == "sensor.long_gone" for f in snapshot["findings"])


async def test_sensors_stay_unknown_for_preliminary_snapshots(hass: HomeAssistant) -> None:
    """Counts taken during the warm-up would be wrong, so the sensors do not show them."""
    from custom_components.ha_housekeeper.sensor import compute_values

    scanner = InventoryScanner(hass)
    scanner.begin_warmup(300)
    snapshot = await scanner.async_scan()
    assert compute_values(snapshot) == {}
    scanner._warmup_until = 0.0
    assert compute_values(await scanner.async_scan())["findings"] == 0


async def test_cleanup_is_locked_while_warming_up(hass: HomeAssistant, hass_ws_client) -> None:
    """Plans are neither created nor confirmed from preliminary data."""
    registry = er.async_get(hass)
    orphan = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="w-3", suggested_object_id="locked"
    )
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()
    scanner.begin_warmup(300)

    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/plan_create",
            "actions": [{"kind": "disable_entity", "object_id": orphan.entity_id}],
        }
    )
    reply = await client.receive_json()
    assert reply["success"] is False and reply["error"]["code"] == "warming_up"

    scanner._warmup_until = 0.0
    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/plan_create",
            "actions": [{"kind": "disable_entity", "object_id": orphan.entity_id}],
        }
    )
    plan = (await client.receive_json())["result"]
    scanner.begin_warmup(300)
    from custom_components.ha_housekeeper.cleanup_exec import CleanupError

    with pytest.raises(CleanupError, match="warming_up"):
        scanner.cleanup.confirm(plan["plan_id"], [], None)
    with pytest.raises(CleanupError, match="warming_up"):
        scanner.cleanup.start(plan["plan_id"], "token", None)


async def test_a_boot_scan_is_followed_by_a_final_scan(hass: HomeAssistant) -> None:
    """A set-up that happens while Home Assistant boots scans again once the warm-up is over."""
    from datetime import timedelta

    from homeassistant.core import CoreState
    from homeassistant.util import dt as dt_util
    from pytest_homeassistant_custom_component.common import async_fire_time_changed

    from custom_components.ha_housekeeper.const import WARMUP_SECONDS

    hass.set_state(CoreState.not_running)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done(wait_background_tasks=True)
    scanner = loaded_scanner(hass)
    assert scanner.snapshot is None  # nothing scans before Home Assistant has started
    assert scanner.warming_up and scanner.warmup_seconds_left == WARMUP_SECONDS

    # The panel can ask for the inventory long before "started"; that scan must not count either.
    early = await scanner.async_get_snapshot()
    assert early["meta"]["preliminary"] is True
    assert scanner.observations.since("entity:sensor.early", "orphaned") is None

    await hass.async_start()
    await hass.async_block_till_done(wait_background_tasks=True)
    assert scanner.snapshot["meta"]["preliminary"] is True

    assert scanner.warming_up and 0 < scanner.warmup_seconds_left <= WARMUP_SECONDS
    scanner._warmup_until = 0.0
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=WARMUP_SECONDS + 10))
    await hass.async_block_till_done(wait_background_tasks=True)
    assert scanner.snapshot["meta"]["preliminary"] is False


async def test_warmup_ends_a_minute_after_the_integrations_have_loaded(hass: HomeAssistant) -> None:
    """With nothing loading any more only the safety buffer is left, never more than the cap."""
    import time

    from custom_components.ha_housekeeper.const import WARMUP_SECONDS, WARMUP_SETTLE_SECONDS
    from custom_components.ha_housekeeper.inventory import InventoryScanner

    scanner = InventoryScanner(hass)
    scanner.begin_warmup(WARMUP_SECONDS)
    assert scanner.warmup_settling and scanner.warmup_seconds_left <= WARMUP_SETTLE_SECONDS
    scanner._settled_at = time.monotonic() - WARMUP_SETTLE_SECONDS - 1
    assert not scanner.warming_up


async def test_a_short_loading_blip_does_not_restart_the_warmup_buffer(hass: HomeAssistant) -> None:
    """Only an integration that keeps loading for a while takes the settled mark away."""
    import time

    from homeassistant.config_entries import ConfigEntryState

    from custom_components.ha_housekeeper.const import WARMUP_BLIP_SECONDS, WARMUP_SECONDS
    from custom_components.ha_housekeeper.inventory import InventoryScanner

    scanner = InventoryScanner(hass)
    scanner.begin_warmup(WARMUP_SECONDS)
    settled = scanner._settled_at
    assert settled is not None
    scanner.hass = type(
        "H",
        (),
        {
            "config_entries": type(
                "C",
                (),
                {
                    "async_entries": lambda self: [
                        type(
                            "E",
                            (),
                            {
                                "state": ConfigEntryState.SETUP_IN_PROGRESS,
                                "domain": "shelly",
                                "title": "Shelly",
                                "disabled_by": None,
                            },
                        )()
                    ]
                },
            )()
        },
    )()
    scanner.check_warmup()
    assert scanner._settled_at == settled
    assert scanner.integrations_loading == ["Shelly"] and (
        scanner.integrations_done,
        scanner.integrations_total,
    ) == (0, 1)
    scanner._pending_since = time.monotonic() - WARMUP_BLIP_SECONDS - 1
    scanner.check_warmup()
    assert scanner._settled_at is None


async def test_a_set_up_after_the_start_has_no_warmup(hass: HomeAssistant) -> None:
    """Reloading the integration on a running Home Assistant scans normally."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done(wait_background_tasks=True)
    scanner = loaded_scanner(hass)
    assert not scanner.warming_up
    assert scanner.snapshot["meta"]["preliminary"] is False


async def test_manual_scans_are_refused_while_a_plan_runs(
    hass: HomeAssistant, hass_ws_client
) -> None:
    """A scan during a plan would record intermediate states; the runner scans for itself."""
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()

    scanner.cleanup.status["running"] = True
    await client.send_json_auto_id({"type": "ha_housekeeper/scan"})
    reply = await client.receive_json()
    assert reply["success"] is False and reply["error"]["code"] == "cleanup_busy"

    # Reading the last result stays possible, and the runner's own scan is not affected.
    await client.send_json_auto_id({"type": "ha_housekeeper/inventory"})
    assert (await client.receive_json())["success"] is True
    assert (await scanner.async_scan())["meta"]["preliminary"] is False

    scanner.cleanup.status["running"] = False
    await client.send_json_auto_id({"type": "ha_housekeeper/scan"})
    assert (await client.receive_json())["success"] is True


async def test_replies_carry_the_api_schema_version(hass: HomeAssistant, hass_ws_client) -> None:
    """Panel replies are marked with the contract version; cached data stays untouched."""
    registry = er.async_get(hass)
    orphan = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="s-1", suggested_object_id="old_sensor"
    )
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()

    async def reply(message: dict) -> dict:
        await client.send_json_auto_id(message)
        response = await client.receive_json()
        assert response["success"], response
        return response["result"]

    plan = await reply(
        {
            "type": "ha_housekeeper/plan_create",
            "actions": [{"kind": "disable_entity", "object_id": orphan.entity_id}],
        }
    )
    results = {
        "inventory": await reply({"type": "ha_housekeeper/inventory"}),
        "status": await reply({"type": "ha_housekeeper/status"}),
        "plan_create": plan,
        "plan_list": await reply({"type": "ha_housekeeper/plan_list"}),
        "plan_detail": await reply(
            {"type": "ha_housekeeper/plan_detail", "plan_id": plan["plan_id"]}
        ),
        "plan_status": await reply(
            {"type": "ha_housekeeper/plan_status", "plan_id": plan["plan_id"]}
        ),
        "recorder_costs": await reply({"type": "ha_housekeeper/recorder_costs"}),
        "backup_health": await reply({"type": "ha_housekeeper/backup_health"}),
        "reliability": await reply({"type": "ha_housekeeper/reliability"}),
        "events": await reply({"type": "ha_housekeeper/events"}),
        "automation_runs": await reply({"type": "ha_housekeeper/automation_runs"}),
        "storms": await reply({"type": "ha_housekeeper/storms"}),
        "db_health": await reply({"type": "ha_housekeeper/db_health"}),
        "exposure": await reply({"type": "ha_housekeeper/exposure"}),
        "statistics_last": await reply({"type": "ha_housekeeper/statistics_last"}),
        "policies": await reply({"type": "ha_housekeeper/policies"}),
    }
    for name, result in results.items():
        assert result["schema"] == API_SCHEMA, name
    assert "schema" not in scanner.snapshot


async def test_backup_health_and_attestations_over_the_websocket(
    hass: HomeAssistant, hass_ws_client
) -> None:
    from unittest.mock import patch

    from test_backup_health import backup, fake_manager

    scanner, client = await _ws_setup(hass, hass_ws_client)

    async def ask(message: dict) -> dict:
        await client.send_json_auto_id(message)
        return await client.receive_json()

    manager = fake_manager(backups=[backup()])
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        reply = await ask({"type": "ha_housekeeper/backup_health"})
        assert reply["success"] and reply["result"]["schema"] == API_SCHEMA
        assert reply["result"]["available"] is True
        levels = {item["id"]: item["level"] for item in reply["result"]["checks"]}
        assert levels["emergency_kit"] == "note" and levels["restore_test"] == "note"

        attested = await ask(
            {"type": "ha_housekeeper/backup_attest", "kind": "restore_test", "date": "2026-09-01"}
        )
        assert (
            attested["success"]
            and attested["result"]["attest"]["restore_test"] == "2026-09-01T00:00:00+00:00"
        )
        assert scanner.attest.record["restore_test"] == "2026-09-01T00:00:00+00:00"
        locations = await ask(
            {"type": "ha_housekeeper/backup_attest", "kind": "targets", "date": "2026-09-02"}
        )
        assert locations["result"]["attest"]["targets"] == "2026-09-02T00:00:00+00:00"
        today = await ask({"type": "ha_housekeeper/backup_attest", "kind": "emergency_kit"})
        assert today["result"]["attest"]["emergency_kit"] is not None
        cleared = await ask(
            {"type": "ha_housekeeper/backup_attest", "kind": "emergency_kit", "clear": True}
        )
        assert cleared["result"]["attest"]["emergency_kit"] is None

        for bad in (
            {"kind": "restore_test", "date": "2999-01-01"},
            {"kind": "restore_test", "date": "2026-02-30"},
            {"kind": "restore_test", "date": "yesterday"},
            {"kind": "backup_ok"},
        ):
            refused = await ask({"type": "ha_housekeeper/backup_attest", **bad})
            assert refused["success"] is False, bad
        assert (
            scanner.attest.record["restore_test"] == "2026-09-01T00:00:00+00:00"
        )  # refused calls change nothing

    with patch("homeassistant.components.backup.async_get_manager", side_effect=KeyError("backup")):
        missing = await ask({"type": "ha_housekeeper/backup_health"})
    assert missing["success"] and missing["result"]["available"] is False


async def test_backup_commands_are_refused_for_non_admins(
    hass: HomeAssistant, hass_ws_client, hass_admin_user
) -> None:
    scanner, _ = await _ws_setup(hass, hass_ws_client)
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    for message in (
        {"type": "ha_housekeeper/backup_health"},
        {"type": "ha_housekeeper/backup_attest", "kind": "restore_test"},
        {"type": "ha_housekeeper/reliability"},
        {"type": "ha_housekeeper/events"},
        {"type": "ha_housekeeper/automation_runs"},
    ):
        await client.send_json_auto_id(message)
        reply = await client.receive_json()
        assert reply["success"] is False and reply["error"]["code"] == "unauthorized", message
    assert scanner.attest.record["restore_test"] is None


async def test_reliability_over_the_websocket_validates_the_window(
    hass: HomeAssistant, hass_ws_client
) -> None:
    _, client = await _ws_setup(hass, hass_ws_client)
    for window in (1, 7):
        await client.send_json_auto_id(
            {"type": "ha_housekeeper/reliability", "window_days": window}
        )
        reply = await client.receive_json()
        assert reply["success"] and reply["result"]["available"] is False
    await client.send_json_auto_id({"type": "ha_housekeeper/reliability", "window_days": 3})
    assert (await client.receive_json())["success"] is False


async def test_the_scan_reports_the_size_of_housekeepers_own_files(
    hass: HomeAssistant, tmp_path
) -> None:
    from custom_components.ha_housekeeper.inventory import storage_sizes

    storage = tmp_path / ".storage"
    storage.mkdir()
    (storage / "ha_housekeeper.events").write_text("x" * 123)
    (storage / "ha_housekeeper.runs").write_text("y" * 45)
    with patch.object(hass.config, "path", lambda *parts: str(tmp_path.joinpath(*parts))):
        sizes = storage_sizes(hass)
    assert {name: item["bytes"] for name, item in sizes.items()} == {"events": 123, "runs": 45}
    assert all(item["changed"] > 0 for item in sizes.values())


# What the panel reads from each reply: renaming or removing one of these fields needs a new API schema.
CONTRACT = {
    "ha_housekeeper/policies": {
        "available": bool,
        "rules": list,
        "violations": int,
        "enabled": int,
        "prefixes": dict,
    },
    "ha_housekeeper/statistics_last": {"available": bool, "busy": bool, "last": dict},
    "ha_housekeeper/exposure": {
        "available": bool,
        "assistants": list,
        "bridges": list,
        "webhooks": int,
        "checked": int,
        "findings": list,
    },
    "ha_housekeeper/automation_runs": {
        "items": list,
        "since": (str, type(None)),
        "window_days": int,
    },
    "ha_housekeeper/events": {"events": list},
    "ha_housekeeper/storms": {"available": bool, "findings": list},
    "ha_housekeeper/db_health": {"available": bool, "findings": list},
    "ha_housekeeper/reliability": {"available": bool},
    "ha_housekeeper/backup_health": {"available": bool},
    "ha_housekeeper/recorder_costs": {"available": bool, "entities": list, "statistics": list},
}


async def test_replies_keep_the_fields_the_panel_reads(hass: HomeAssistant, hass_ws_client) -> None:
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()
    for command, fields in CONTRACT.items():
        await client.send_json_auto_id({"type": command})
        reply = await client.receive_json()
        assert reply["success"], (command, reply)
        for field, kind in fields.items():
            assert field in reply["result"], (command, field)
            assert isinstance(reply["result"][field], kind), (command, field)


async def test_policies_over_the_websocket(hass: HomeAssistant, hass_ws_client) -> None:
    """Switch a rule on, see the violation, hide it, and the findings stay untouched."""
    from homeassistant.helpers import device_registry as dr
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={("test", "d1")}, name="Bare device"
    )
    er.async_get(hass).async_get_or_create(
        domain="sensor",
        platform="test",
        unique_id="p-1",
        suggested_object_id="bare",
        config_entry=entry,
        device_id=device.id,
    )
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()

    async def send(message: dict) -> dict:
        await client.send_json_auto_id(message)
        return await client.receive_json()

    result = (await send({"type": "ha_housekeeper/policies"}))["result"]
    assert result["enabled"] == 0 and result["violations"] == 0

    assert (
        await send({"type": "ha_housekeeper/set_policy", "rule": "device_area", "enabled": True})
    )["success"]
    assert not (await send({"type": "ha_housekeeper/set_policy", "rule": "nope", "enabled": True}))[
        "success"
    ]
    findings_before = len((await scanner.async_get_snapshot())["findings"])
    result = (await send({"type": "ha_housekeeper/policies"}))["result"]
    rule = next(r for r in result["rules"] if r["id"] == "device_area")
    assert result["violations"] == 1 and rule["items"][0]["object_id"] == device.id

    hidden = await send(
        {"type": "ha_housekeeper/ignore", "finding_key": rule["items"][0]["key"], "ignored": True}
    )
    assert hidden["success"]
    result = (await send({"type": "ha_housekeeper/policies"}))["result"]
    rule = next(r for r in result["rules"] if r["id"] == "device_area")
    assert result["violations"] == 0 and rule["ignored"] == 1
    assert len((await scanner.async_get_snapshot())["findings"]) == findings_before


async def test_policy_prefixes_over_the_websocket(hass: HomeAssistant, hass_ws_client) -> None:
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()

    async def send(message: dict) -> dict:
        await client.send_json_auto_id(message)
        return await client.receive_json()

    ok = await send(
        {"type": "ha_housekeeper/set_policy_prefix", "domain": " Sensor ", "prefix": "WZ_"}
    )
    assert ok["success"] and ok["result"]["prefixes"] == {"sensor": "wz_"}
    bad = await send(
        {"type": "ha_housekeeper/set_policy_prefix", "domain": "sensor", "prefix": "no good"}
    )
    assert not bad["success"] and bad["error"]["code"] == "invalid_format"
    assert (await send({"type": "ha_housekeeper/policies"}))["result"]["prefixes"] == {
        "sensor": "wz_"
    }
    gone = await send(
        {"type": "ha_housekeeper/set_policy_prefix", "domain": "sensor", "prefix": ""}
    )
    assert gone["result"]["prefixes"] == {}


async def test_goals_are_measured_changed_and_refused_outside_their_range(
    hass: HomeAssistant, hass_ws_client
) -> None:
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()
    await client.send_json_auto_id({"type": "ha_housekeeper/goals"})
    goals = {g["id"]: g for g in (await client.receive_json())["result"]["goals"]}
    assert goals["broken_references"]["state"] == "met" and goals["unavailable"]["limit"] == 10
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/goal_set", "goal": "unavailable", "limit": 3, "enabled": False}
    )
    assert (await client.receive_json())["result"] == {"saved": True}
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/goal_set", "goal": "backup_age", "limit": 0}
    )
    assert (await client.receive_json())["success"] is False, "a limit of 0 hours is not allowed"
    await client.send_json_auto_id({"type": "ha_housekeeper/goals"})
    goals = {g["id"]: g for g in (await client.receive_json())["result"]["goals"]}
    assert goals["unavailable"]["state"] == "off" and goals["unavailable"]["limit"] == 3


async def test_report_and_device_pairs_are_served_to_admins(
    hass: HomeAssistant, hass_ws_client
) -> None:
    scanner, client = await _ws_setup(hass, hass_ws_client)
    snapshot = await scanner.async_scan()
    assert snapshot["regressions"] == []
    scanner.journal.add(
        {
            "plan_id": "p1",
            "created_at": datetime.now(UTC).isoformat(),
            "status": "dry_run",
            "actions": [],
            "events": [],
        }
    )
    await client.send_json_auto_id({"type": "ha_housekeeper/plan_report", "plan_id": "p1"})
    report = (await client.receive_json())["result"]
    assert report["anonymized"] and report["markdown"].startswith("# Audit report")
    await client.send_json_auto_id({"type": "ha_housekeeper/plan_report", "plan_id": "none"})
    assert (await client.receive_json())["error"]["code"] == "not_found"
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/device_pairs", "old_device_id": "a", "new_device_id": "b"}
    )
    assert (await client.receive_json())["error"]["code"] == "not_found"


async def test_only_one_write_runs_at_a_time_across_purge_and_plans(
    hass: HomeAssistant, hass_ws_client
) -> None:
    """A purge plan sits in its backup: a second purge plan and another plan both see busy."""
    import asyncio
    from unittest.mock import patch

    registry = er.async_get(hass)
    orphan = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="w-1", suggested_object_id="old_sensor"
    )
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()
    scanner.snapshot["meta"]["recorder_available"] = True
    scanner.snapshot["orphaned_statistics"] = [{"statistic_id": "sensor.gone", "in_energy": False}]
    gate = asyncio.Event()

    async def slow_backup(plan, with_database=True):
        plan["status"] = "backup"
        await gate.wait()
        plan["backup"] = {"job_id": "j1", "at": "2026-10-09T10:00:00+00:00"}
        plan["status"] = "running"

    async def deleted(hass_, ids, *, states):
        return list(ids), [], None

    async def nothing_left(hass_, ids):
        return set()

    module = "custom_components.ha_housekeeper.cleanup_exec"

    async def make(kind: str, object_id: str) -> tuple[str, str]:
        action = {"kind": kind, "object_id": object_id}
        if kind == "purge_statistics":
            action["states"] = False
        await client.send_json_auto_id({"type": "ha_housekeeper/plan_create", "actions": [action]})
        plan_id = (await client.receive_json())["result"]["plan_id"]
        await client.send_json_auto_id(
            {"type": "ha_housekeeper/plan_confirm", "plan_id": plan_id, "acknowledged": [object_id]}
        )
        return plan_id, (await client.receive_json())["result"]["token"]

    async def execute(plan_id: str, token: str) -> dict:
        await client.send_json_auto_id(
            {"type": "ha_housekeeper/plan_execute", "plan_id": plan_id, "token": token}
        )
        return await client.receive_json()

    with (
        patch.object(scanner.cleanup, "_backup", slow_backup),
        patch(f"{module}.delete_statistics", deleted),
        patch(f"{module}.statistics_left", nothing_left),
        patch(f"{module}.recorder_ready", lambda hass_: True),
        patch(
            f"{module}.judge_purge_action",
            lambda *args: {"verdict": "review", "reasons": []},
        ),
    ):
        first = await make("purge_statistics", "sensor.gone")
        second = await make("purge_statistics", "sensor.gone")
        disable = await make("disable_entity", orphan.entity_id)
        assert (await execute(*first))["success"]
        await asyncio.sleep(0.1)
        assert (await execute(*second))["error"]["code"] == "busy"
        await client.send_json_auto_id({"type": "ha_housekeeper/status"})
        assert (await client.receive_json())["result"]["writing"] == "plan"
        assert (await execute(*disable))["error"]["code"] == "busy"
        gate.set()
        await scanner.cleanup.wait()
    assert registry.async_get(orphan.entity_id).disabled_by is None
    stored = scanner.journal.get(first[0])
    assert stored["actions"][0]["kind"] == "purge_statistics" and stored["followup"]
    assert stored["actions"][0]["result"]["state"] == "done" and stored["backup"]


async def test_diagnostics_commands_answer_for_known_and_unknown_automations(
    hass: HomeAssistant, hass_ws_client
) -> None:
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()
    await client.send_json_auto_id({"type": "ha_housekeeper/automation_quality"})
    quality = (await client.receive_json())["result"]
    assert quality["dimensions"][0] == "integrity" and quality["items"] == []
    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/criteria_set",
            "entity_id": "automation.x",
            "criteria": [{"targets": [{"entity_id": "light.a", "state": "on"}], "within": 5}],
        }
    )
    assert (await client.receive_json())["result"]["criteria"][0]["within"] == 5
    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/criteria_set",
            "entity_id": "automation.x",
            "criteria": [{"targets": [], "within": 5}],
        }
    )
    assert (await client.receive_json())["error"]["code"] == "invalid_format"
    await client.send_json_auto_id({"type": "ha_housekeeper/coverage_set", "enabled": True})
    assert (await client.receive_json())["result"] == {"enabled": True}
    for command in ("coverage", "trace_compare", "automation_dry_run"):
        await client.send_json_auto_id(
            {"type": f"ha_housekeeper/{command}", "entity_id": "automation.none"}
        )
        assert (await client.receive_json())["error"]["code"] == "not_found"


async def test_open_previews_merge_into_one_plan_and_conflicts_are_reported(
    hass: HomeAssistant, hass_ws_client
) -> None:
    """Merging rebuilds one plan from the requests; sources go, conflicts are listed, nothing runs."""
    registry = er.async_get(hass)
    one = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="m-1", suggested_object_id="one"
    )
    two = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="m-2", suggested_object_id="two"
    )
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()

    async def create(*actions):
        await client.send_json_auto_id(
            {"type": "ha_housekeeper/plan_create", "actions": list(actions)}
        )
        return (await client.receive_json())["result"]

    first = await create(
        {"kind": "disable_entity", "object_id": one.entity_id},
        {"kind": "disable_entity", "object_id": two.entity_id},
    )
    second = await create(
        {"kind": "disable_entity", "object_id": one.entity_id},
        {"kind": "remove_entity", "object_id": two.entity_id},
    )
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/plan_merge", "plan_ids": [first["plan_id"], second["plan_id"]]}
    )
    result = (await client.receive_json())["result"]
    assert result["dropped"] == 1 and result["conflicts"][0]["object_id"] == two.entity_id
    assert [a["object_id"] for a in result["plan"]["actions"]] == [one.entity_id]
    assert result["merged"] == [first["plan_id"], second["plan_id"]]
    assert {p["plan_id"] for p in scanner.journal.plans} == {result["plan"]["plan_id"]}
    assert registry.async_get(one.entity_id).disabled_by is None  # nothing was changed

    scanner.journal.get(result["plan"]["plan_id"])["executed"] = True
    other = await create({"kind": "disable_entity", "object_id": two.entity_id})
    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/plan_merge",
            "plan_ids": [other["plan_id"], result["plan"]["plan_id"]],
        }
    )
    assert (await client.receive_json())["error"]["code"] == "plan_not_open"


async def test_an_open_preview_is_checked_against_the_current_state_and_renewed(
    hass: HomeAssistant, hass_ws_client
) -> None:
    """A check reports what changed since the preview; renewing replaces the preview."""
    registry = er.async_get(hass)
    entry = registry.async_get_or_create(
        domain="sensor", platform="test", unique_id="r-1", suggested_object_id="renew"
    )
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()
    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/plan_create",
            "actions": [{"kind": "disable_entity", "object_id": entry.entity_id}],
        }
    )
    plan = (await client.receive_json())["result"]
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/plan_check", "plan_id": plan["plan_id"]}
    )
    assert (await client.receive_json())["result"] == {"current": True, "changed": []}

    registry.async_update_entity(entry.entity_id, name="Changed")
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/plan_check", "plan_id": plan["plan_id"]}
    )
    result = (await client.receive_json())["result"]
    assert result["current"] is False and result["changed"][0]["object_id"] == entry.entity_id

    await client.send_json_auto_id(
        {"type": "ha_housekeeper/plan_renew", "plan_id": plan["plan_id"]}
    )
    renewed = (await client.receive_json())["result"]
    assert renewed["plan_id"] != plan["plan_id"]
    assert [p["plan_id"] for p in scanner.journal.plans] == [renewed["plan_id"]]


async def test_reminders_are_saved_finished_and_deleted_over_the_websocket(
    hass: HomeAssistant, hass_ws_client
) -> None:
    scanner, client = await _ws_setup(hass, hass_ws_client)
    await scanner.async_scan()

    async def call(**msg):
        await client.send_json_auto_id({"type": "ha_housekeeper/reminder_set", **msg})
        return await client.receive_json()

    bad = await call(action="save", name="", interval_days=30, due="2026-01-01")
    assert bad["error"]["code"] == "invalid_format"
    saved = await call(action="save", name="Filter", interval_days=30, due="2026-01-01")
    reminder = saved["result"]["reminders"][0]
    assert reminder["state"] == "due" and scanner.snapshot["reminders"][0]["id"] == reminder["id"]
    done = await call(action="done", reminder_id=reminder["id"])
    assert done["result"]["reminders"][0]["state"] == "ok"
    assert (await call(action="delete", reminder_id=reminder["id"]))["result"]["reminders"] == []
    assert (await call(action="delete", reminder_id=reminder["id"]))["error"][
        "code"
    ] == "invalid_format"


async def test_a_detected_battery_replacement_is_entered_once_and_updates_a_matching_reminder(
    hass: HomeAssistant, hass_ws_client
) -> None:
    scanner, client = await _ws_setup(hass, hass_ws_client)
    today = datetime.now(UTC).date()
    scanner.reminders.upsert(
        None,
        "Batterie Bewegungsmelder Flur",
        365,
        (today + timedelta(days=65)).isoformat(),
        "",
    )
    scanner.reminders.upsert(None, "Filter", 90, (today + timedelta(days=80)).isoformat(), "")
    day = (today - timedelta(days=1)).isoformat()
    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/battery_replaced",
            "entity_id": "sensor.flur_battery",
            "day": day,
            "action": "enter",
            "name": "Bewegungsmelder Flur",
            "title": "Batterie gewechselt: Bewegungsmelder Flur",
        }
    )
    result = (await client.receive_json())["result"]
    assert result["reminders_updated"] == 1 and result["handled"]["sensor.flur_battery"] == day
    assert [i["title"] for i in scanner.notes.view()] == [
        "Batterie gewechselt: Bewegungsmelder Flur"
    ]
    assert scanner.reminders.items[0]["history"] == [day]
    assert scanner.reminders.items[1]["history"] == []
    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/battery_type_set",
            "entity_id": "sensor.flur_battery",
            "battery_type": "2× AAA",
        }
    )
    assert (await client.receive_json())["result"]["types"] == {"sensor.flur_battery": "2× AAA"}
    await client.send_json_auto_id(
        {"type": "ha_housekeeper/battery_custom_type", "action": "add", "name": "LR44"}
    )
    assert (await client.receive_json())["result"]["custom_types"] == ["LR44"]


async def test_a_damaged_database_is_a_repair_hint_until_a_check_comes_back_clean(
    hass: HomeAssistant,
) -> None:
    from homeassistant.helpers import issue_registry as ir

    from custom_components.ha_housekeeper.issues import (
        DATABASE_ISSUE_ID,
        async_sync_database_issue,
    )

    registry = ir.async_get(hass)
    damaged = {"state": "damaged", "at": "2026-10-15T06:00:00+00:00", "lines": ["row 1 missing"]}
    async_sync_database_issue(hass, damaged)
    issue = registry.async_get_issue(DOMAIN, DATABASE_ISSUE_ID)
    assert issue is not None and issue.severity == ir.IssueSeverity.ERROR and not issue.is_fixable
    async_sync_database_issue(hass, {**damaged, "state": "ok", "lines": []})
    assert registry.async_get_issue(DOMAIN, DATABASE_ISSUE_ID) is None


async def test_one_unreadable_saved_file_starts_only_that_part_empty(hass: HomeAssistant) -> None:
    from unittest.mock import AsyncMock, patch

    from homeassistant.exceptions import UnsupportedStorageVersionError

    scanner = InventoryScanner(hass)
    with patch.object(scanner.notes, "async_load", AsyncMock(side_effect=ValueError("bad shape"))):
        await scanner.async_initialize()
    assert scanner.load_failures == ["notes"]

    scanner = InventoryScanner(hass)
    newer = AsyncMock(side_effect=UnsupportedStorageVersionError("housekeeper", 9, 1))
    with (
        patch.object(scanner.marks, "async_load", newer),
        pytest.raises(UnsupportedStorageVersionError),
    ):
        await scanner.async_initialize()
