"""Meter migration: joining the statistics of a replaced meter and taking over its entity ID."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.components.recorder import get_instance  # noqa: E402
from homeassistant.components.recorder.models import StatisticMeanType  # noqa: E402
from homeassistant.components.recorder.statistics import async_import_statistics  # noqa: E402
from homeassistant.core import HomeAssistant  # noqa: E402
from homeassistant.helpers import entity_registry as er  # noqa: E402
from pytest_homeassistant_custom_component.components.recorder.common import (  # noqa: E402
    async_wait_recording_done,
)
from scanner_entry import attach_scanner  # noqa: E402
from test_cleanup_exec import fake_backup, make_scanner, run  # noqa: E402

from custom_components.ha_housekeeper.cleanup import (  # noqa: E402
    build_plan,
    judge_meter_action,
)
from custom_components.ha_housekeeper.cleanup_exec import CleanupError  # noqa: E402
from custom_components.ha_housekeeper.meter import (  # noqa: E402
    analyse,
    prepare_meter,
    read_series,
)

OLD, NEW = "sensor.meter_old", "sensor.meter_new"
START = datetime(2026, 9, 1, tzinfo=UTC)


def meta(statistic_id: str, *, has_sum: bool = True, unit: str = "kWh") -> dict:
    return {
        "mean_type": StatisticMeanType.NONE if has_sum else StatisticMeanType.ARITHMETIC,
        "has_sum": has_sum,
        "name": None,
        "source": "recorder",
        "statistic_id": statistic_id,
        "unit_class": "energy" if unit == "kWh" else None,
        "unit_of_measurement": unit,
    }


def rows(first: datetime, hours: int, *, step: float = 1.0, state0: float = 0.0) -> list[dict]:
    return [
        {
            "start": first + timedelta(hours=hour),
            "state": state0 + hour * step,
            "sum": hour * step,
        }
        for hour in range(hours)
    ]


def stat_rows(first: datetime, hours: int, *, step: float = 1.0) -> list[dict]:
    """Rows in the shape ``read_series`` returns (timestamps, not datetimes)."""
    return [
        {"start": row["start"].timestamp(), "state": row["state"], "sum": row["sum"]}
        for row in rows(first, hours, step=step)
    ]


# ---- pure analysis -------------------------------------------------------------------------


def test_analyse_continues_the_sum_with_the_old_final_total() -> None:
    old = stat_rows(START, 48)
    new = stat_rows(START + timedelta(hours=72), 24, step=0.5)
    result = analyse(meta(OLD), old, meta(NEW), new)
    assert result["import_count"] == 48 and result["dropped_overlap"] == 0
    assert result["offset"] == 47.0 and result["gap_hours"] == 24.0
    assert set(result["reasons"]) == {"stats_gap"}
    assert result["preview"]["after"][0]["sum_after"] == 47.0
    assert result["preview"]["before"][-1]["sum"] == 47.0


def test_analyse_never_copies_overlapping_rows() -> None:
    old = stat_rows(START, 48)
    new = stat_rows(START + timedelta(hours=40), 24)
    result = analyse(meta(OLD), old, meta(NEW), new)
    assert result["import_count"] == 40 and result["dropped_overlap"] == 8
    assert "stats_overlap" in result["reasons"]
    assert result["offset"] == 39.0  # the last row that is copied, not the last of the old series


def test_analyse_blocks_what_cannot_be_joined() -> None:
    old = stat_rows(START, 4)
    assert "stats_missing_old" in analyse(None, [], meta(NEW), old)["reasons"]
    assert "stats_unit_differs" in analyse(meta(OLD), old, meta(NEW, unit="Wh"), old)["reasons"]
    assert "stats_type_differs" in analyse(meta(OLD), old, meta(NEW, has_sum=False), old)["reasons"]
    inside = stat_rows(START, 4)  # the new series starts with the old one: nothing to copy
    assert "stats_nothing_to_import" in analyse(meta(OLD), old, meta(NEW), inside)["reasons"]


def test_analyse_without_a_new_series_copies_everything_and_asks_for_a_look() -> None:
    result = analyse(meta(OLD), stat_rows(START, 5), None, [])
    assert result["import_count"] == 5 and result["offset"] is None
    assert "stats_new_empty" in result["reasons"]


# ---- judging -------------------------------------------------------------------------------


def objects() -> dict:
    return {
        OLD: {"object_id": OLD, "status": "unavailable", "unit": "kWh", "device_class": "energy"},
        NEW: {"object_id": NEW, "status": "active", "unit": "kWh", "device_class": "energy"},
    }


def good_meter(**changes) -> dict:
    analysis = analyse(
        meta(OLD), stat_rows(START, 4), meta(NEW), stat_rows(START + timedelta(hours=4), 4)
    )
    return {
        "mode": "both",
        "analysis": analysis,
        "alt_id": "sensor.meter_old_alt",
        "old_in_registry": True,
        "target_in_registry": True,
        "alt_taken": False,
        **changes,
    }


def test_meter_judging() -> None:
    ok = judge_meter_action(OLD, NEW, objects(), [], good_meter())
    assert ok["verdict"] == "review"
    assert {"stats_write", "id_takeover"} <= set(ok["reasons"])
    only_stats = judge_meter_action(OLD, NEW, objects(), [], good_meter(mode="statistics"))
    assert "id_takeover" not in only_stats["reasons"]
    only_id = judge_meter_action(OLD, NEW, objects(), [], good_meter(mode="id", analysis={}))
    assert only_id["verdict"] == "review" and "stats_write" not in only_id["reasons"]

    def blocked(reason: str, **changes) -> None:
        action = judge_meter_action(OLD, NEW, objects(), [], good_meter(**changes))
        assert action["verdict"] == "blocked" and reason in action["reasons"]

    blocked("alt_id_taken", alt_taken=True)
    blocked("old_not_in_registry", old_in_registry=False)
    blocked("target_not_in_registry", target_in_registry=False)
    blocked("stats_missing_old", analysis={"reasons": ["stats_missing_old"]})
    blocked("nothing_to_do", mode="nothing")
    wrong = judge_meter_action(OLD, "light.other", objects(), [], good_meter())
    assert "target_missing" in wrong["reasons"] and wrong["verdict"] == "blocked"
    used = judge_meter_action(
        OLD,
        NEW,
        objects(),
        [{"source": "automation:a", "target": f"entity:{NEW}", "relation": "TRIGGERS_ON"}],
        good_meter(),
    )
    assert "target_in_use" in used["reasons"]


# ---- with a real recorder --------------------------------------------------------------------


def seed(hass: HomeAssistant, statistic_id: str, data: list[dict], **kwargs) -> None:
    async_import_statistics(hass, meta(statistic_id, **kwargs), data)


async def series(hass: HomeAssistant, statistic_id: str) -> list[dict]:
    await async_wait_recording_done(hass)
    _, found = await get_instance(hass).async_add_executor_job(read_series, hass, statistic_id)
    return found


def two_meters(hass: HomeAssistant, *, old_hours: int = 48, gap_hours: int = 24) -> None:
    registry = er.async_get(hass)
    for name in ("meter_old", "meter_new"):
        registry.async_get_or_create(
            "sensor", "test", name, suggested_object_id=name, original_device_class="energy"
        )
    hass.states.async_set(NEW, "5", {"unit_of_measurement": "kWh", "device_class": "energy"})
    seed(hass, OLD, rows(START, old_hours))
    seed(hass, NEW, rows(START + timedelta(hours=old_hours + gap_hours), 24, step=0.5))


async def make_meter_plan(scanner, hass: HomeAssistant, mode: str = "both") -> dict:
    snapshot = await scanner.async_scan()
    registry = er.async_get(hass)
    key = (OLD, NEW, mode)
    plan = build_plan(
        snapshot,
        [{"kind": "migrate_meter", "object_id": OLD, "target": NEW, "mode": mode}],
        datetime.now(UTC),
        meter_data={key: await prepare_meter(hass, *key)},
    )
    scanner.journal.add(plan)
    assert registry.async_get(OLD) is not None
    return plan


async def test_the_statistics_of_the_old_meter_are_joined_in_front_of_the_new_one(
    recorder_mock, hass: HomeAssistant
) -> None:
    two_meters(hass)
    await async_wait_recording_done(hass)
    scanner = await make_scanner(hass)
    manager, create = fake_backup()
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        plan = await make_meter_plan(scanner, hass, "statistics")
        action = plan["actions"][0]
        assert action["verdict"] == "review" and action["executable"] is True
        assert action["statistics"]["import_count"] == 48 and action["statistics"]["offset"] == 47.0

        await run(scanner, plan, [OLD])
        create.assert_awaited_once()  # the database is written: a backup comes first

    joined = await series(hass, NEW)
    assert len(joined) == 48 + 24
    assert joined[0]["start"] == START.timestamp() and joined[0]["sum"] == 0.0
    assert joined[47]["sum"] == 47.0
    assert joined[48]["start"] == (START + timedelta(hours=72)).timestamp()
    assert joined[48]["sum"] == 47.0 and joined[49]["sum"] == 47.5  # the new series is shifted
    assert [row["state"] for row in joined[48:50]] == [0.0, 0.5]  # raw readings stay as they are
    assert len(await series(hass, OLD)) == 48  # the old series is untouched
    result = plan["actions"][0]["result"]
    assert result["state"] == "done" and result["statistics"]["imported"] == 48
    assert result["statistics"]["verified"] is True and result["take_id"] is None
    assert plan["status"] == "verified"
    assert {c["check"] for c in plan["verification"]["checks"]} >= {"meter_statistics"}

    undo = await scanner.cleanup.undo(plan["plan_id"], None)
    assert undo["results"] == [{"object_id": OLD, "outcome": "conflict_statistics"}]
    assert plan["actions"][0]["result"]["state"] == "done"  # only the backup restores statistics
    assert len(await series(hass, NEW)) == 72


async def test_a_second_run_finds_nothing_left_to_copy(recorder_mock, hass: HomeAssistant) -> None:
    two_meters(hass)
    await async_wait_recording_done(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        await run(scanner, await make_meter_plan(scanner, hass, "statistics"), [OLD])
        again = await make_meter_plan(scanner, hass, "statistics")
    action = again["actions"][0]
    assert action["verdict"] == "blocked" and "stats_nothing_to_import" in action["reasons"]
    with pytest.raises(CleanupError, match="nothing_to_do"):
        scanner.cleanup.confirm(again["plan_id"], [OLD], None)


async def test_the_new_entity_takes_the_old_id_and_the_move_can_be_undone(
    recorder_mock, hass: HomeAssistant
) -> None:
    two_meters(hass)
    await async_wait_recording_done(hass)
    scanner = await make_scanner(hass)
    registry = er.async_get(hass)
    new_unique_id = registry.async_get(NEW).unique_id
    manager, _ = fake_backup()
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        plan = await make_meter_plan(scanner, hass, "id")
        assert plan["actions"][0]["alt_id"] == "sensor.meter_old_alt"
        await run(scanner, plan, [OLD])

    assert registry.async_get(OLD).unique_id == new_unique_id  # the stable ID now is the new meter
    assert registry.async_get("sensor.meter_old_alt").unique_id == "meter_old"
    assert registry.async_get(NEW) is None
    await async_wait_recording_done(hass)
    # Home Assistant moved the series along with the entity IDs: nothing was copied here.
    assert (
        len(await series(hass, OLD)) == 24 and len(await series(hass, "sensor.meter_old_alt")) == 48
    )
    result = plan["actions"][0]["result"]
    assert result["take_id"]["old_id"] == OLD and result["statistics"] is None
    assert {"meter_id_taken"} <= {c["check"] for c in plan["verification"]["checks"]}
    assert plan["verification"]["ok"] is True

    hass.states.async_remove(NEW)  # a platform drops the state of an entity it renames
    undo = await scanner.cleanup.undo(plan["plan_id"], None)
    assert undo["results"] == [{"object_id": OLD, "outcome": "undone"}]
    assert registry.async_get(OLD).unique_id == "meter_old"
    assert registry.async_get(NEW).unique_id == new_unique_id
    await async_wait_recording_done(hass)
    assert len(await series(hass, OLD)) == 48 and len(await series(hass, NEW)) == 24


async def test_joining_and_taking_the_id_gives_one_continuous_series(
    recorder_mock, hass: HomeAssistant
) -> None:
    two_meters(hass)
    await async_wait_recording_done(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        plan = await make_meter_plan(scanner, hass, "both")
        await run(scanner, plan, [OLD])

    stable = await series(hass, OLD)
    assert len(stable) == 72 and stable[71]["sum"] == 47.0 + 11.5
    assert len(await series(hass, "sensor.meter_old_alt")) == 48
    result = plan["actions"][0]["result"]
    assert (
        result["statistics"]["verified"] and result["take_id"]["alt_id"] == "sensor.meter_old_alt"
    )
    assert plan["status"] == "verified"

    hass.states.async_remove(NEW)
    undo = await scanner.cleanup.undo(plan["plan_id"], None)
    assert undo["results"][0]["outcome"] == "undone"  # the IDs go back, the history stays joined
    assert plan["actions"][0]["result"]["statistics_kept"] is True
    assert len(await series(hass, NEW)) == 72


async def test_a_changed_history_after_the_preview_stops_the_run(
    recorder_mock, hass: HomeAssistant
) -> None:
    two_meters(hass)
    await async_wait_recording_done(hass)
    scanner = await make_scanner(hass)
    manager, create = fake_backup()
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        plan = await make_meter_plan(scanner, hass, "statistics")
        seed(hass, OLD, rows(START + timedelta(hours=48), 5))  # the old meter kept recording
        await async_wait_recording_done(hass)
        await run(scanner, plan, [OLD])
    assert plan["status"] == "aborted" and plan["executed"] is False
    assert plan["actions"][0]["result"]["reason"] == "meter_changed"
    assert len(await series(hass, NEW)) == 24


async def test_a_taken_alt_id_blocks_the_takeover(recorder_mock, hass: HomeAssistant) -> None:
    two_meters(hass)
    await async_wait_recording_done(hass)
    scanner = await make_scanner(hass)
    plan = await make_meter_plan(scanner, hass, "id")
    assert plan["actions"][0]["alt_id"] == "sensor.meter_old_alt"
    er.async_get(hass).async_get_or_create(
        "sensor", "test", "squatter", suggested_object_id="meter_old_alt"
    )
    again = await make_meter_plan(scanner, hass, "id")
    assert again["actions"][0]["alt_id"] == "sensor.meter_old_alt_2"  # the next free one
    assert again["actions"][0]["verdict"] == "review"


async def test_the_panel_commands_plan_a_meter_change_and_report_maintenance(
    recorder_mock, hass: HomeAssistant, hass_ws_client
) -> None:
    from homeassistant.setup import async_setup_component

    from custom_components.ha_housekeeper import async_setup

    two_meters(hass)
    await async_wait_recording_done(hass)
    assert await async_setup(hass, {})
    scanner = await make_scanner(hass)
    attach_scanner(hass, scanner)
    assert await async_setup_component(hass, "websocket_api", {})
    client = await hass_ws_client(hass)
    await scanner.async_scan()

    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/plan_create",
            "actions": [
                {"kind": "migrate_meter", "object_id": OLD, "target": NEW, "mode": "statistics"}
            ],
        }
    )
    plan = (await client.receive_json())["result"]
    action = plan["actions"][0]
    assert action["verdict"] == "review" and action["statistics"]["import_count"] == 48
    assert action["fingerprint"] and plan["status"] == "dry_run"
    assert len(await series(hass, NEW)) == 24  # a plan never writes

    await client.send_json_auto_id(
        {
            "type": "ha_housekeeper/plan_create",
            "actions": [{"kind": "migrate_meter", "object_id": OLD, "target": NEW, "mode": "bad"}],
        }
    )
    assert (await client.receive_json())["success"] is False  # unknown modes are refused

    await client.send_json_auto_id({"type": "ha_housekeeper/recorder_costs"})
    costs = (await client.receive_json())["result"]
    assert costs["available"] is True and costs["statistics"]

    await client.send_json_auto_id({"type": "ha_housekeeper/preflight"})
    report = (await client.receive_json())["result"]
    assert {c["check"] for c in report["checks"]} >= {
        "backup",
        "repairs",
        "failed_entries",
        "broken",
    }
    assert report["watch"]["hours"] > 0 and report["watch"]["active"] is None


def test_analyse_asks_for_a_look_when_the_old_series_has_no_final_total() -> None:
    old = stat_rows(START, 48)
    old[-1]["sum"] = None
    new = stat_rows(START + timedelta(hours=48), 24, step=0.5)
    result = analyse(meta(OLD), old, meta(NEW), new)
    assert result["offset"] is None and "stats_no_sum" in result["reasons"]
    assert not {"stats_missing_old", "stats_unit_differs", "stats_type_differs"} & set(
        result["reasons"]
    )


async def test_a_value_compiled_meanwhile_does_not_fail_the_join(
    recorder_mock, hass: HomeAssistant
) -> None:
    from custom_components.ha_housekeeper import cleanup_exec

    two_meters(hass)
    await async_wait_recording_done(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    real = cleanup_exec.read_series
    calls = {"n": 0}

    def with_a_new_hour(hass, statistic_id):
        meta_, found = real(hass, statistic_id)
        calls["n"] += 1
        if calls["n"] == 3:  # the read after the import: the live series grew by one hour
            found = [*found, {**found[-1], "start": found[-1]["start"] + 3600}]
        return meta_, found

    with (
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
        patch.object(cleanup_exec, "read_series", with_a_new_hour),
    ):
        plan = await make_meter_plan(scanner, hass, "statistics")
        await run(scanner, plan, [OLD])
    assert plan["actions"][0]["result"]["statistics"]["verified"] is True


async def _stuck_id_takeover(hass: HomeAssistant, scanner, *, state_goes_after: float | None):
    """Run an ID takeover whose old state does not go away (or only after a while)."""
    two_meters(hass)
    hass.states.async_set(OLD, "9")  # nothing drops this state when the entity is renamed
    await async_wait_recording_done(hass)
    manager, _ = fake_backup()
    with (
        patch("homeassistant.components.backup.async_get_manager", return_value=manager),
        patch("custom_components.ha_housekeeper.cleanup_exec.ID_FREE_TIMEOUT", 0.3),
    ):
        plan = await make_meter_plan(scanner, hass, "id")
        if state_goes_after is not None:
            hass.loop.call_later(state_goes_after, hass.states.async_remove, OLD)
        await run(scanner, plan, [OLD])
    return plan


async def test_an_old_state_that_goes_late_still_lets_the_old_entity_come_back(
    recorder_mock, hass: HomeAssistant
) -> None:
    scanner = await make_scanner(hass)
    plan = await _stuck_id_takeover(hass, scanner, state_goes_after=0.45)
    registry = er.async_get(hass)
    assert plan["actions"][0]["result"]["reason"] == "id_not_freed"
    assert plan["status"] == "aborted"
    assert registry.async_get(OLD).unique_id == "meter_old"  # back under its own ID
    assert registry.async_get(NEW).unique_id == "meter_new"


async def test_an_old_entity_that_cannot_come_back_is_journalled_and_can_be_undone(
    recorder_mock, hass: HomeAssistant
) -> None:
    scanner = await make_scanner(hass)
    plan = await _stuck_id_takeover(hass, scanner, state_goes_after=None)
    registry = er.async_get(hass)
    result = plan["actions"][0]["result"]
    assert result["state"] == "done" and result["stopped"] == "rollback_incomplete"
    assert result["cause"] == "id_not_freed" and result["take_id"]["partial"] is True
    assert plan["status"] == "partial"
    assert registry.async_get(OLD) is None  # the stuck state, not the entity, holds the ID
    assert registry.async_get("sensor.meter_old_alt").unique_id == "meter_old"
    assert registry.async_get(NEW).unique_id == "meter_new"

    hass.states.async_remove(OLD)
    undo = await scanner.cleanup.undo(plan["plan_id"], None)
    assert undo["results"] == [{"object_id": OLD, "outcome": "undone"}]
    assert registry.async_get(OLD).unique_id == "meter_old"
    assert registry.async_get("sensor.meter_old_alt") is None


# ---- the fingerprint covers the whole series -------------------------------------------------


def _hash(old, new, old_meta=None, new_meta=None) -> str:
    return analyse(old_meta or meta(OLD), old, new_meta or meta(NEW), new)["hash"]


def test_the_fingerprint_changes_when_any_importable_row_changes() -> None:
    old = stat_rows(START, 48)
    new = stat_rows(START + timedelta(hours=72), 24)
    base = _hash(old, new)
    assert _hash(stat_rows(START, 48), stat_rows(START + timedelta(hours=72), 24)) == base

    for field in ("state", "sum", "min", "max", "mean", "last_reset"):
        changed = [dict(row) for row in old]
        changed[20][field] = 123.0  # a middle row: count, first, last and the last sum stay
        assert _hash(changed, new) != base, field


def test_the_fingerprint_follows_the_switch_point_and_the_compatibility() -> None:
    old = stat_rows(START, 48)
    new = stat_rows(START + timedelta(hours=72), 24)
    base = _hash(old, new)
    first_changed = [dict(row) for row in new]
    first_changed[0]["sum"] = 9.0
    assert _hash(old, first_changed) != base
    assert _hash(old, new, new_meta=meta(NEW, unit="MWh")) != base
    assert _hash(old, new, new_meta=meta(NEW, has_sum=False)) != base


def test_a_value_compiled_later_in_the_new_series_does_not_change_the_fingerprint() -> None:
    old = stat_rows(START, 48)
    new = stat_rows(START + timedelta(hours=72), 24)
    grown = [*new, {**new[-1], "start": new[-1]["start"] + 3600}]
    assert _hash(old, grown) == _hash(old, new)  # the live series grows; the import is the same


async def test_a_changed_middle_row_after_the_preview_stops_the_run(
    recorder_mock, hass: HomeAssistant
) -> None:
    two_meters(hass)
    await async_wait_recording_done(hass)
    scanner = await make_scanner(hass)
    manager, _ = fake_backup()
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        plan = await make_meter_plan(scanner, hass, "statistics")
        middle = rows(START, 48)[20]
        seed(hass, OLD, [{**middle, "sum": middle["sum"] + 0.5}])  # same hour, other value
        await async_wait_recording_done(hass)
        await run(scanner, plan, [OLD])
    assert plan["status"] == "aborted" and plan["executed"] is False
    assert plan["actions"][0]["result"]["reason"] == "meter_changed"
    assert len(await series(hass, NEW)) == 24
