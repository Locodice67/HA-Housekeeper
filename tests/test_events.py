"""Housekeeper's own event log: version changes, restarts, bounded and clean."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402
from scanner_entry import attach_scanner  # noqa: E402

from custom_components.ha_housekeeper.events import (  # noqa: E402
    MAX_EVENTS,
    EventLog,
    detect,
)

NOW = datetime(2026, 10, 8, 12, 0, tzinfo=UTC)
KEY = "ha_housekeeper.events"


def test_the_first_observation_is_a_baseline_without_events() -> None:
    assert detect(None, "2026.10.0", {"hacs": "2.0"}, NOW) == []
    assert detect({}, "2026.10.0", {"hacs": "2.0"}, NOW) == []


def test_version_changes_are_found_and_unchanged_ones_are_not() -> None:
    previous = {"ha": "2026.9.4", "entries": {"hacs": "2.0", "other": "1.0"}}
    found = detect(previous, "2026.10.0", {"hacs": "2.1", "other": "1.0", "new": "0.1"}, NOW)
    assert [(e["kind"], e.get("domain"), e["from"], e["to"]) for e in found] == [
        ("ha_version", None, "2026.9.4", "2026.10.0"),
        ("entry_version", "hacs", "2.0", "2.1"),
    ]
    assert detect(previous, "2026.9.4", {"hacs": "2.0", "other": "1.0"}, NOW) == []


async def test_observing_twice_logs_a_change_once(hass: HomeAssistant) -> None:
    log = EventLog(hass)
    log.observe("2026.9.4", {"hacs": "2.0"}, NOW)
    log.observe("2026.10.0", {"hacs": "2.0"}, NOW)
    log.observe("2026.10.0", {"hacs": "2.0"}, NOW)
    assert [e["kind"] for e in log.events] == ["ha_version"]


async def test_a_start_reports_how_long_home_assistant_was_down(hass: HomeAssistant) -> None:
    log = EventLog(hass)
    log.record_start(NOW)
    assert "down_seconds" not in log.events[-1]
    log.beat(NOW)
    log.record_start(NOW + timedelta(minutes=12))
    assert log.events[-1]["down_seconds"] == 720
    assert log.heartbeat == (NOW + timedelta(minutes=12)).isoformat()


async def test_the_log_is_capped_and_newest_come_first(hass: HomeAssistant) -> None:
    log = EventLog(hass)
    for number in range(MAX_EVENTS + 20):
        log.record("plan", NOW, plan_id=str(number))
    assert len(log.events) == MAX_EVENTS
    assert log.events[0]["plan_id"] == "20"
    assert [e["plan_id"] for e in log.recent(2)] == [str(MAX_EVENTS + 19), str(MAX_EVENTS + 18)]
    with pytest.raises(ValueError):
        log.record("invented", NOW)


async def test_the_store_survives_a_restart_and_drops_bad_entries(
    hass: HomeAssistant, hass_storage
) -> None:
    log = EventLog(hass)
    log.record("start", NOW)
    log.observe("2026.10.0", {"hacs": "2.0"}, NOW)
    log.beat(NOW)
    await log._store.async_save(log._data())
    again = EventLog(hass)
    await again.async_load()
    assert again.events == log.events
    assert again.versions == {"ha": "2026.10.0", "entries": {"hacs": "2.0"}}
    assert again.heartbeat == NOW.isoformat()

    hass_storage[KEY] = {
        "version": 1,
        "data": {
            "events": [
                {"kind": "start", "at": "nonsense"},
                {"kind": "x", "at": NOW.isoformat()},
                5,
            ],
            "heartbeat": "nope",
        },
    }
    broken = EventLog(hass)
    await broken.async_load()
    assert broken.events == []
    assert broken.heartbeat is None


async def test_a_scan_records_the_installed_versions_and_events_are_served(
    hass: HomeAssistant, hass_ws_client
) -> None:
    from homeassistant.const import __version__ as ha_version
    from homeassistant.setup import async_setup_component

    from custom_components.ha_housekeeper import async_setup
    from custom_components.ha_housekeeper.inventory import InventoryScanner

    assert await async_setup(hass, {})
    scanner = InventoryScanner(hass)
    attach_scanner(hass, scanner)
    await scanner.async_initialize()
    assert await async_setup_component(hass, "websocket_api", {})
    client = await hass_ws_client(hass)
    scanner.events.versions = {"ha": "1999.1.0", "entries": {}}
    await scanner.async_scan()
    assert scanner.events.versions["ha"] == ha_version
    await client.send_json_auto_id({"type": "ha_housekeeper/events"})
    reply = await client.receive_json()
    assert reply["success"]
    assert [(e["kind"], e["from"]) for e in reply["result"]["events"]] == [
        ("ha_version", "1999.1.0")
    ]


def test_a_start_after_a_run_that_never_announced_its_stop_is_marked_unclean() -> None:
    from datetime import UTC, datetime, timedelta

    from custom_components.ha_housekeeper.events import EventLog

    log = EventLog.__new__(EventLog)
    log.events, log.heartbeat, log.clean_stop = [], None, None
    log._save = lambda: None  # type: ignore[method-assign]
    now = datetime(2026, 10, 15, tzinfo=UTC)
    log.record_start(now)  # the first start: nothing known
    log.record_start(now + timedelta(hours=1))  # the run before never stopped
    log.mark_clean_stop()
    log.record_start(now + timedelta(hours=2))
    assert [bool(e.get("unclean")) for e in log.events] == [False, True, False]


def test_system_updates_are_found_and_an_unread_version_is_no_change() -> None:
    previous = {"ha": "1", "os": "15.0", "supervisor": "2026.9.0", "entries": {}}
    found = detect(previous, "1", {}, NOW, {"os": "15.1"})
    assert [(e["kind"], e["from"], e["to"]) for e in found] == [("os_version", "15.0", "15.1")]
    assert detect(previous, "1", {}, NOW, {}) == []
