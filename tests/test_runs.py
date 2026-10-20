"""Run counting: every finished run once, daily numbers only, nothing sensitive."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402
from homeassistant.setup import async_setup_component  # noqa: E402
from scanner_entry import attach_scanner  # noqa: E402

from custom_components.ha_housekeeper.runs import (  # noqa: E402
    ALREADY,
    CONDITION,
    DUR_MAX,
    DUR_N,
    DUR_SUM,
    ERROR,
    FIELDS,
    MAXED,
    OK,
    RETENTION_DAYS,
    RUNS,
    STOPPED,
    RunStore,
    aggregate,
    prune,
)

T0 = datetime(2026, 10, 8, 10, 0, tzinfo=UTC)


def head(run_id, execution="finished", seconds=2, state="stopped", step="action/0", at=T0):
    return {
        "run_id": run_id,
        "state": state,
        "script_execution": execution,
        "last_step": step,
        "timestamp": {
            "start": at.isoformat(),
            "finish": (at + timedelta(seconds=seconds)).isoformat() if state == "stopped" else None,
        },
        "domain": "automation",
        "item_id": "1",
    }


def day(item, at=T0):
    return item["days"][at.date().isoformat()]


def test_each_outcome_lands_in_its_own_counter() -> None:
    item: dict = {}
    heads = [
        head("a", "finished", 2),
        head("b", "finished", 6),
        head("c", "failed_conditions", 0, step="condition/0"),
        head("d", "error", 1, step="action/3"),
        head("e", "aborted"),
        head("f", "cancelled"),
        head("g", "failed_single"),
        head("h", "failed_max_runs"),
    ]
    assert aggregate(item, heads, 20) == 8
    c = day(item)["c"]
    assert len(c) == FIELDS
    assert c[RUNS] == 8 and c[OK] == 2 and c[CONDITION] == 1 and c[ERROR] == 1
    assert c[STOPPED] == 2 and c[ALREADY] == 1 and c[MAXED] == 1
    assert (c[DUR_SUM], c[DUR_MAX], c[DUR_N]) == (8000, 6000, 2)
    assert day(item)["s"] == {"condition/0": 1, "action/3": 1}


def test_a_run_is_counted_once_however_often_it_is_seen() -> None:
    item: dict = {}
    heads = [head("a"), head("b")]
    assert aggregate(item, heads, 5) == 2
    assert aggregate(item, heads, 5) == 0
    assert aggregate(item, heads + [head("c")], 5) == 1
    assert day(item)["c"][RUNS] == 3


def test_trace_times_may_be_datetimes_or_strings() -> None:
    item: dict = {}
    as_objects = head("a")
    as_objects["timestamp"] = {"start": T0, "finish": T0 + timedelta(seconds=3)}
    assert aggregate(item, [as_objects, head("b")], 5) == 2
    assert day(item)["c"][DUR_SUM] == 5000


def test_a_running_run_waits_until_it_has_stopped() -> None:
    item: dict = {}
    assert aggregate(item, [head("a", state="running")], 5) == 0
    assert item["days"] == {}
    assert aggregate(item, [head("a")], 5) == 1


def test_a_full_bucket_of_new_runs_marks_the_day_as_a_lower_bound() -> None:
    item: dict = {}
    first = [head(str(n), at=T0 + timedelta(minutes=n)) for n in range(5)]
    aggregate(item, first, 5)
    assert "lo" not in day(item)  # the very first look cannot tell
    second = [head(str(n), at=T0 + timedelta(minutes=n)) for n in range(5, 10)]
    aggregate(item, second, 5)
    assert day(item)["lo"] == 1
    third = [head("x", at=T0 + timedelta(minutes=20))] + second[:4]
    item["days"] = {}
    item["seen"] = [h["run_id"] for h in second[:4]]
    aggregate(item, third, 5)
    assert "lo" not in day(item)  # not every trace was new


def test_the_seen_list_and_steps_stay_small() -> None:
    item: dict = {}
    for n in range(60):
        aggregate(item, [head(str(n), "error", step=f"action/{n}")], 5)
    assert len(item["seen"]) == 20
    assert len(day(item)["s"]) == 10
    assert day(item)["c"][ERROR] == 60


def test_old_days_and_empty_automations_are_pruned() -> None:
    old = T0 - timedelta(days=RETENTION_DAYS + 1)
    items = {"automation.old": {}, "automation.mixed": {}}
    aggregate(items["automation.old"], [head("o", at=old)], 5)
    aggregate(items["automation.mixed"], [head("o", at=old), head("n")], 5)
    prune(items, T0)
    assert list(items) == ["automation.mixed"]
    assert list(items["automation.mixed"]["days"]) == [T0.date().isoformat()]


async def test_a_real_automation_is_counted_without_variables_or_error_texts(
    hass: HomeAssistant, hass_storage
) -> None:
    assert await async_setup_component(hass, "trace", {})
    assert await async_setup_component(
        hass,
        "automation",
        {
            "automation": [
                {
                    "id": "demo",
                    "alias": "Demo",
                    "trigger": {"platform": "event", "event_type": "demo_go"},
                    "variables": {"token": "TOPSECRET-VALUE"},
                    "action": [
                        {"event": "demo_done", "event_data": {"v": "{{ token }}"}},
                    ],
                },
                {
                    "id": "broken",
                    "alias": "Broken",
                    "trigger": {"platform": "event", "event_type": "demo_go"},
                    "action": [
                        {"service": "no_such_domain.explode", "data": {"x": "TOPSECRET-ERROR"}}
                    ],
                },
            ]
        },
    )
    hass.bus.async_fire("demo_go", {"payload": "TOPSECRET-PAYLOAD"})
    await hass.async_block_till_done()

    store = RunStore(hass)
    assert await store.async_collect() == 0  # the first collection is only a starting point
    assert store.since is not None and store.items["automation.demo"]["seen"]
    assert not store.items["automation.demo"]["days"]
    assert await store.async_collect() == 0
    hass.bus.async_fire("demo_go", {"payload": "TOPSECRET-PAYLOAD"})
    await hass.async_block_till_done()
    assert await store.async_collect() == 2
    assert await store.async_collect() == 0
    assert store.items["automation.demo"]["days"]
    ok = list(store.items["automation.demo"]["days"].values())[0]["c"]
    bad = list(store.items["automation.broken"]["days"].values())[0]["c"]
    assert ok[OK] == 1 and bad[ERROR] == 1 and bad[OK] == 0
    assert store.since is not None

    await store._store.async_save(store._data())
    stored = json.dumps(hass_storage["ha_housekeeper.runs"])
    for secret in ("TOPSECRET", "no_such_domain", "token"):
        assert secret not in stored, secret

    again = RunStore(hass)
    await again.async_load()
    assert again.items == store.items
    assert await again.async_collect() == 0  # restored seen list prevents double counting


async def test_collecting_without_the_trace_component_is_harmless(hass: HomeAssistant) -> None:
    store = RunStore(hass)
    assert await store.async_collect() == 0
    assert store.items == {} and store.since is None


async def test_bad_stored_data_is_dropped(hass: HomeAssistant, hass_storage) -> None:
    hass_storage["ha_housekeeper.runs"] = {
        "version": 1,
        "data": {
            "since": "nonsense",
            "items": {
                "automation.a": {
                    "days": {
                        "2026-10-08": {"c": [1] * FIELDS, "s": {"action/0": 1, "x": "y"}, "lo": 1},
                        "bad": {"c": [1] * FIELDS},
                        "2026-10-07": {"c": [1, 2]},
                        "2026-10-06": {"c": [-1] * FIELDS},
                    },
                    "seen": ["r1", 5],
                },
                "script.b": "nope",
            },
        },
    }
    store = RunStore(hass)
    await store.async_load()
    assert store.since is None
    assert list(store.items) == ["automation.a"]
    item = store.items["automation.a"]
    assert list(item["days"]) == ["2026-10-08"]
    assert item["days"]["2026-10-08"]["s"] == {"action/0": 1}
    assert item["seen"] == ["r1"]


async def test_the_websocket_rates_a_failing_automation_and_hides_secrets(
    hass: HomeAssistant, hass_ws_client
) -> None:
    from custom_components.ha_housekeeper import async_setup
    from custom_components.ha_housekeeper.inventory import InventoryScanner

    assert await async_setup_component(hass, "trace", {})
    assert await async_setup_component(
        hass,
        "automation",
        {
            "automation": [
                {
                    "id": "broken",
                    "alias": "Broken",
                    "trigger": {"platform": "event", "event_type": "demo_go"},
                    "action": [
                        {"service": "no_such_domain.explode", "data": {"x": "TOPSECRET-ERROR"}},
                        {"delay": "00:10:00"},
                    ],
                }
            ]
        },
    )
    assert await async_setup(hass, {})
    scanner = InventoryScanner(hass)
    attach_scanner(hass, scanner)
    await scanner.async_initialize()
    assert await async_setup_component(hass, "websocket_api", {})
    client = await hass_ws_client(hass)
    await scanner.runs.async_collect()  # the starting point
    for _ in range(3):
        hass.bus.async_fire("demo_go")
        await hass.async_block_till_done()
    await client.send_json_auto_id({"type": "ha_housekeeper/automation_runs"})
    reply = await client.receive_json()
    assert reply["success"], reply
    result = reply["result"]
    assert result["schema"] == 1 and result["window_days"] == 7 and result["since"]
    row = next(r for r in result["items"] if r["entity_id"] == "automation.broken")
    assert row["runs"] == 3 and row["errors"] == 3 and row["name"] == "Broken"
    assert {f["kind"] for f in row["findings"]} == {"failing", "long_wait"}
    assert "TOPSECRET" not in json.dumps(result)


def test_a_bucket_larger_than_twenty_is_counted_once() -> None:
    item: dict = {}
    heads = [head(f"r{n}", at=T0 + timedelta(seconds=n)) for n in range(50)]
    assert aggregate(item, heads, 50) == 50
    assert aggregate(item, heads, 50) == 0  # the second collection sees the same 50 traces
    shifted = heads[10:] + [head(f"n{n}", at=T0 + timedelta(seconds=100 + n)) for n in range(10)]
    assert aggregate(item, shifted, 50) == 10  # only the new ones, however the bucket shifts
    assert len(item["seen"]) >= 50


def test_the_first_collection_only_remembers_what_is_there() -> None:
    item: dict = {}
    assert aggregate(item, [head("a"), head("b")], 5, baseline=True) == 0
    assert item["seen"] == ["a", "b"] and not item.get("days")
    assert aggregate(item, [head("a"), head("b"), head("c")], 5) == 1


async def test_the_starting_point_is_saved_even_without_a_counted_run(hass: HomeAssistant) -> None:
    from unittest.mock import MagicMock

    assert await async_setup_component(hass, "trace", {})
    store = RunStore(hass)
    store._store.async_delay_save = MagicMock()
    await store.async_collect()  # no automation, nothing to count
    assert store.since is not None
    store._store.async_delay_save.assert_called_once()
    store._store.async_delay_save.reset_mock()
    await store.async_collect()  # nothing changed: no needless write
    store._store.async_delay_save.assert_not_called()


def test_pruning_reports_what_it_removed() -> None:
    old = T0 - timedelta(days=90)
    items = {"automation.a": {"days": {old.date().isoformat(): {"c": [0] * 10}}, "seen": ["x"]}}
    assert prune(items, T0) is True and items == {}
    assert prune(items, T0) is False
