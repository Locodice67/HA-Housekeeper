"""Maintenance assistant: recorder costs and the update preflight."""

from __future__ import annotations

from unittest.mock import patch

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.config_entries import ConfigEntryState  # noqa: E402
from homeassistant.core import HomeAssistant  # noqa: E402
from homeassistant.helpers import issue_registry as ir  # noqa: E402
from pytest_homeassistant_custom_component.common import MockConfigEntry  # noqa: E402
from pytest_homeassistant_custom_component.components.recorder.common import (  # noqa: E402
    async_wait_recording_done,
)
from test_cleanup_exec import make_scanner  # noqa: E402

from custom_components.ha_housekeeper.maintenance import (  # noqa: E402
    judge_preflight,
    pending_updates,
    preflight_verdict,
    rank_costs,
    recorder_costs,
)


def snapshot_with(*entity_ids: str, used: tuple[str, ...] = ()) -> dict:
    return {
        "objects": [
            {"object_type": "entity", "object_id": e, "name": e, "has_statistics": False}
            for e in entity_ids
        ],
        "edges": [
            {"source": "automation:a", "target": f"entity:{e}", "relation": "TRIGGERS_ON"}
            for e in used
        ],
        "findings": [],
    }


def test_rank_costs_suggests_excluding_only_what_nothing_uses() -> None:
    raw = {
        "total_states": 1000,
        "first": 0,
        "last": 86400 * 2,
        "states": [
            ("sensor.noisy", 800, 0, 86400 * 2),
            ("sensor.noisy_but_used", 150, 0, 86400 * 2),
            ("sensor.quiet", 40, 0, 86400 * 2),
            ("sensor.unknown", 10, 0, 86400 * 2),
        ],
        "statistics_total": 5,
        "statistics": [("sensor.noisy", 5)],
        "size_bytes": 1024,
        "keep_days": 10,
        "recorded": lambda entity_id: entity_id != "sensor.quiet",
    }
    snapshot = snapshot_with(
        "sensor.noisy", "sensor.noisy_but_used", "sensor.quiet", used=("sensor.noisy_but_used",)
    )
    # A device or an area that holds the entity is no use of it.
    snapshot["edges"] += [
        {"source": "device:d", "target": "entity:sensor.noisy", "relation": "PROVIDES"},
        {"source": "area:a", "target": "entity:sensor.noisy", "relation": "CONTAINS"},
    ]
    result = rank_costs(raw, snapshot)
    by_id = {e["entity_id"]: e for e in result["entities"]}
    assert by_id["sensor.noisy"]["per_day"] == 400.0 and by_id["sensor.noisy"]["share"] == 80.0
    assert by_id["sensor.noisy"]["suggest_exclude"] is True
    assert by_id["sensor.noisy_but_used"]["suggest_exclude"] is False  # an automation depends on it
    assert by_id["sensor.quiet"]["suggest_exclude"] is False and by_id["sensor.quiet"]["excluded"]
    assert (
        by_id["sensor.unknown"]["known"] is False and not by_id["sensor.unknown"]["suggest_exclude"]
    )
    assert result["statistics"] == [{"statistic_id": "sensor.noisy", "rows": 5, "known": True}]


async def test_costs_are_unavailable_without_a_recorder(hass: HomeAssistant) -> None:
    assert (await recorder_costs(hass, snapshot_with()))["available"] is False


async def test_costs_count_the_states_in_the_database(recorder_mock, hass: HomeAssistant) -> None:
    for index in range(30):
        hass.states.async_set("sensor.chatty", str(index))
    hass.states.async_set("sensor.calm", "1")
    await async_wait_recording_done(hass)
    result = await recorder_costs(hass, snapshot_with("sensor.chatty", "sensor.calm"))
    assert result["available"] is True and result["total_states"] == 31
    assert result["entities"][0]["entity_id"] == "sensor.chatty"
    assert result["entities"][0]["states"] == 30
    assert result["entities"][0]["share"] == pytest.approx(96.8, abs=0.1)


def state(**changes) -> dict:
    base = {
        "ha_version": "2026.2.3",
        "backup": {"available": True, "level": "ok", "age_hours": 5},
        "disk": {"free": 40 * 1024**3},
        "updates": [],
        "repairs": [],
        "failed_entries": [],
        "broken": [],
    }
    return {**base, **changes}


def test_judging_the_preflight() -> None:
    levels = {c["check"]: c["level"] for c in judge_preflight(state())}
    assert levels == {
        "backup": "ok",
        "disk": "ok",
        "repairs": "ok",
        "failed_entries": "ok",
        "broken": "ok",
    }
    # The backup line follows the verdict of the backup protection and does not judge the age itself.
    assert judge_preflight(state(backup={"available": True, "level": "note"}))[0]["level"] == "warn"
    assert (
        judge_preflight(state(backup={"available": True, "level": "problem"}))[0]["level"] == "red"
    )
    assert judge_preflight(state(backup={"available": False}))[0]["level"] == "warn"
    external = judge_preflight(state(backup={"available": True, "level": "external"}))
    assert external[0]["level"] == "info" and preflight_verdict(external[:1]) == "ready"
    counts = {c["check"]: c for c in judge_preflight(state(repairs=[{"issue_id": "a"}]))}
    assert counts["repairs"]["level"] == "warn" and counts["repairs"]["count"] == 1
    disk = {c["check"]: c["level"] for c in judge_preflight(state(disk={"free": 2 * 1024**3}))}
    assert disk["disk"] == "warn"
    assert judge_preflight(state(disk={"free": 1024**3 // 2}))[1]["level"] == "red"
    # Integrations that cannot start stop a system update, and only that.
    failing = state(failed_entries=[{"entry_id": "e"}])
    assert {c["check"]: c["level"] for c in judge_preflight(failing)}["failed_entries"] == "warn"
    system = {**failing, "updates": [{"group": "system"}]}
    checks = judge_preflight(system)
    assert {c["check"]: c["level"] for c in checks}["failed_entries"] == "red"
    assert preflight_verdict(checks) == "stop"
    assert preflight_verdict(judge_preflight(failing)) == "look"
    assert preflight_verdict(judge_preflight(state())) == "ready"


async def test_pending_updates_are_grouped_by_platform(hass: HomeAssistant) -> None:
    from homeassistant.helpers import entity_registry as er

    registry = er.async_get(hass)
    for entity_id, platform, unique_id in (
        ("update.home_assistant_core_update", "hassio", "core"),
        ("update.cloudflared_update", "hassio", "cf"),
        ("update.card_mod_update", "hacs", "1"),
        ("update.proxy_firmware", "esphome", "p"),
    ):
        registry.async_get_or_create(
            "update", platform, unique_id, suggested_object_id=entity_id[7:]
        )
        hass.states.async_set(
            entity_id,
            "on",
            {"title": entity_id[7:], "installed_version": "1", "latest_version": "2"},
        )
    hass.states.async_set("update.current", "off", {})
    updates = pending_updates(hass)
    assert [(u["entity_id"], u["group"]) for u in updates] == [
        ("update.home_assistant_core_update", "system"),
        ("update.cloudflared_update", "app"),
        ("update.card_mod_update", "hacs"),
        ("update.proxy_firmware", "device"),
    ]
    assert all(not u["blocked"] for u in updates)


async def test_preflight_reads_the_state_and_judges_it(hass: HomeAssistant) -> None:
    from custom_components.ha_housekeeper import maintenance

    ir.async_create_issue(
        hass,
        "demo",
        "old_issue",
        is_fixable=False,
        severity=ir.IssueSeverity.WARNING,
        translation_key="x",
    )
    MockConfigEntry(domain="demo", title="Hub", state=ConfigEntryState.SETUP_RETRY).add_to_hass(
        hass
    )
    scanner = await make_scanner(hass)
    snapshot = await scanner.async_scan()

    report = await maintenance.preflight_report(hass, snapshot)
    assert set(report) == {"state", "checks", "verdict", "counts"}  # nothing is stored
    assert [r["issue_id"] for r in report["state"]["repairs"]] == ["old_issue"]
    assert [e["title"] for e in report["state"]["failed_entries"]] == ["Hub"]
    assert maintenance.repair_keys(hass) == ["demo:old_issue"]


async def test_preflight_ignores_persisted_issues_that_are_not_active(hass: HomeAssistant) -> None:
    """The registry keeps issues no integration raises right now; they are not open repairs."""
    import dataclasses

    from custom_components.ha_housekeeper import maintenance

    for issue_id in ("active_issue", "stale_issue"):
        ir.async_create_issue(
            hass,
            "demo",
            issue_id,
            is_fixable=False,
            severity=ir.IssueSeverity.WARNING,
            translation_key="x",
        )
    registry = ir.async_get(hass)
    stale = registry.issues[("demo", "stale_issue")]
    registry.issues[("demo", "stale_issue")] = dataclasses.replace(stale, active=False)

    assert [r["issue_id"] for r in maintenance._repairs(hass)] == ["active_issue"]


async def test_repair_details_name_a_repair_by_its_key_and_survive_a_missing_title(
    hass: HomeAssistant,
) -> None:
    from custom_components.ha_housekeeper import maintenance

    ir.async_create_issue(
        hass,
        "demo",
        "some_id",
        is_fixable=True,
        severity=ir.IssueSeverity.ERROR,
        translation_key="unknown_key",
        learn_more_url="https://example.org/help",
    )
    details = await maintenance.repair_details(hass)
    assert details["demo:some_id"] == {
        "title": None,
        "fixable": True,
        "severity": "error",
        "url": "https://example.org/help",
    }


def _raw(states, recent=None, **extra):
    raw = {
        "total_states": sum(count for _, count, _, _ in states),
        "first": 0,
        "last": DAY * 30,
        "states": states,
        "statistics_total": 0,
        "statistics": [],
        "size_bytes": 1,
        "keep_days": 31,
        "recorded": None,
        **extra,
    }
    if recent is not None:
        raw["recent"] = recent
    return raw


DAY = 86400


def test_an_exclusion_is_suggested_for_the_current_rate_not_the_history() -> None:
    raw = _raw(
        [
            ("sensor.was_noisy", 500_000, 0, DAY * 30),  # an old burst: 16,000 a day on average
            ("sensor.is_noisy", 200_000, 0, DAY * 30),
            ("sensor.only_now", 900, DAY * 29, DAY * 30),  # small overall, loud today
        ],
        recent={
            "sensor.was_noisy": (6, 2),
            "sensor.is_noisy": (8_000, 1_200),
            "sensor.only_now": (900, 900),
        },
    )
    result = rank_costs(
        raw, snapshot_with("sensor.was_noisy", "sensor.is_noisy", "sensor.only_now")
    )
    by_id = {e["entity_id"]: e for e in result["entities"]}
    was = by_id["sensor.was_noisy"]
    assert was["per_day_avg"] > 16_000 and was["states_24h"] == 2 and was["states_7d"] == 6
    assert (
        was["suggest_exclude"] is False
    )  # the burst is over: shown with its average, not suggested
    assert by_id["sensor.is_noisy"]["suggest_exclude"] is True
    assert by_id["sensor.is_noisy"]["per_day_7d"] == pytest.approx(1142.9, abs=0.1)
    assert by_id["sensor.only_now"]["suggest_exclude"] is True


def test_without_the_windows_the_average_still_decides() -> None:
    raw = _raw([("sensor.old_caller", 3_000, 0, DAY * 3)])  # no "recent": an older caller
    result = rank_costs(raw, snapshot_with("sensor.old_caller"))
    assert result["entities"][0]["suggest_exclude"] is True
    assert result["took_ms"] is None and result["cached"] is False


async def test_costs_separate_the_windows_and_list_what_is_loud_now(
    recorder_mock, hass: HomeAssistant, freezer
) -> None:
    from datetime import timedelta

    from homeassistant.util import dt as dt_util

    now = dt_util.utcnow()
    for age, count in ((timedelta(days=20), 12), (timedelta(days=3), 6)):
        freezer.move_to(now - age)
        for index in range(count):
            hass.states.async_set("sensor.old_burst", f"{age}-{index}")
    freezer.move_to(now)
    for index in range(5):
        hass.states.async_set("sensor.loud_now", str(index))
    await async_wait_recording_done(hass)

    result = await recorder_costs(
        hass, snapshot_with("sensor.old_burst", "sensor.loud_now"), refresh=True
    )
    by_id = {e["entity_id"]: e for e in result["entities"]}
    assert by_id["sensor.old_burst"]["states"] == 18
    assert (
        by_id["sensor.old_burst"]["states_7d"] == 6 and by_id["sensor.old_burst"]["states_24h"] == 0
    )
    assert (
        by_id["sensor.loud_now"]["states_24h"] == 5 and by_id["sensor.loud_now"]["states_7d"] == 5
    )
    assert isinstance(result["took_ms"], int) and result["cached"] is False


async def test_the_costs_are_kept_for_five_minutes_and_refresh_calculates_again(
    recorder_mock, hass: HomeAssistant
) -> None:
    hass.states.async_set("sensor.chatty", "1")
    await async_wait_recording_done(hass)
    snapshot = snapshot_with("sensor.chatty")
    first = await recorder_costs(hass, snapshot)
    assert first["cached"] is False
    hass.states.async_set("sensor.chatty", "2")
    await async_wait_recording_done(hass)
    second = await recorder_costs(hass, snapshot)
    assert second["cached"] is True and second["total_states"] == first["total_states"]
    third = await recorder_costs(hass, snapshot, refresh=True)
    assert third["cached"] is False and third["total_states"] == first["total_states"] + 1


async def test_the_last_costs_reply_is_kept_and_handed_out_while_the_recorder_is_busy(
    recorder_mock, hass: HomeAssistant
) -> None:
    import asyncio

    from custom_components.ha_housekeeper.const import DOMAIN
    from custom_components.ha_housekeeper.queries import ReplyStore

    store = ReplyStore(hass)
    snapshot = snapshot_with("sensor.chatty")
    first = await recorder_costs(hass, snapshot, store=store, refresh=True)
    assert first["stale"] is False and "costs" in store.replies
    lock = hass.data.setdefault(DOMAIN, {}).setdefault("reliability_lock", asyncio.Lock())
    hass.data[DOMAIN].pop("query_cache", None)
    await lock.acquire()
    try:
        held = await recorder_costs(hass, snapshot, store=store, refresh=True)
    finally:
        lock.release()
    assert held["stale"] is True and not held.get("busy")


async def test_the_start_of_a_system_update_takes_the_state_of_that_moment(
    hass: HomeAssistant,
) -> None:
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    scanner = await make_scanner(hass)
    state = lambda busy: SimpleNamespace(attributes={"in_progress": busy})  # noqa: E731
    with patch.object(scanner, "async_request_scan", AsyncMock()) as scan:
        await scanner.async_update_changed(state(False), state(True))
        assert scan.await_count == 1
        await scanner.async_update_changed(state(True), state(True))  # still the same install
        await scanner.async_update_changed(state(True), state(False))  # it ended
        await scanner.async_update_changed(None, None)
        assert scan.await_count == 1
        scanner.watch_hours = 0  # the watch is off: nothing to compare with
        await scanner.async_update_changed(state(False), state(True))
        assert scan.await_count == 1


async def test_the_configuration_check_reports_validity_and_clips_long_texts(
    hass: HomeAssistant,
) -> None:
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, patch

    from custom_components.ha_housekeeper.maintenance import check_configuration

    bad = SimpleNamespace(errors=[object()], error_str="x" * 5000, warning_str="")
    good = SimpleNamespace(errors=[], error_str="", warning_str="a deprecation")
    target = "homeassistant.helpers.check_config.async_check_ha_config_file"
    with patch(target, AsyncMock(return_value=bad)):
        result = await check_configuration(hass)
    assert result["valid"] is False and len(result["errors"]) == 4000 and result["warnings"] is None
    with patch(target, AsyncMock(return_value=good)):
        result = await check_configuration(hass)
    assert (
        result["valid"] is True
        and result["errors"] is None
        and result["warnings"] == "a deprecation"
    )
