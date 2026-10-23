"""Battery estimate, own reminders and the failed-setup history: each at its edge."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest

pytest.importorskip("homeassistant")

from custom_components.ha_housekeeper.battery_trend import DAY, build, estimate  # noqa: E402
from custom_components.ha_housekeeper.entry_states import EntryStateHistory  # noqa: E402
from custom_components.ha_housekeeper.reminders import ReminderError, ReminderStore  # noqa: E402

NOW = datetime(2026, 10, 9, 12, tzinfo=UTC)


def days(values: list[float]) -> list[tuple[float, float]]:
    return [(i * DAY, v) for i, v in enumerate(values)]


def test_the_battery_estimate_follows_the_fall_since_the_last_change_and_promises_nothing_else() -> (
    None
):
    falling = estimate(days([80 - i for i in range(10)]), 20)  # one point a day, now at 71
    assert falling["state"] == "falling" and falling["days_left"] == 51
    assert estimate(days([50, 49, 48]), 20) is None  # too few days
    assert estimate(days([60.0] * 10), 20)["state"] == "stable"
    assert estimate(days([15 - i * 0.1 for i in range(10)]), 20)["state"] == "low"
    replaced = estimate(days([30, 29, 28, 27, 100, 99, 98, 97, 96, 95, 94]), 20)
    assert (
        replaced["points"] == 7 and replaced["level"] == 94
    )  # only the days after the change count

    series = {
        "sensor.a": days([80 - i for i in range(10)]),
        "sensor.b": days([70 - i for i in range(10)]),
        "sensor.c": days([1, 2]),
    }
    result = build(series, {}, 20, NOW)
    assert [r["entity_id"] for r in result["rows"]] == ["sensor.b", "sensor.a"] and result[
        "unknown"
    ] == 1
    assert result["groups"] == [
        {"from_days": 28, "to_days": 41, "entity_ids": ["sensor.b"]},
        {"from_days": 42, "to_days": 55, "entity_ids": ["sensor.a"]},
    ]


async def test_reminders_validate_count_the_days_and_start_a_new_round_when_done(hass) -> None:
    store = ReminderStore(hass)
    today = date(2026, 10, 9)
    item = store.upsert(None, " Filter ", 30, "2026-10-01", "")
    assert store.view(today)[0]["state"] == "due" and store.view(today)[0]["days_left"] == -8
    for args in (
        (None, "", 30, "2026-09-01", ""),
        (None, "x", 0, "2026-09-01", ""),
        (None, "x", 30, "no", ""),
    ):
        with pytest.raises(ReminderError):
            store.upsert(*args)
    store.done(item, today)
    row = store.view(today)[0]
    assert row["state"] == "ok" and row["due"] == "2026-11-08"
    assert row["history"] == ["2026-10-09"] and row["last_done"] == "2026-10-09"
    new = store.upsert(None, "Rauchmelder", 365, "2026-10-22", "")  # new entry, due in 13 days
    first, second = store.view(today)  # soonest first
    assert first["id"] == new and first["state"] == "soon" and first["last_done"] is None
    store.delete_history(item, "2026-10-09")
    assert second["id"] == item and store.view(today)[1]["history"] == []
    assert store.view(today)[1]["due"] == "2026-11-08"
    with pytest.raises(ReminderError):
        store.delete_history(item, "2026-10-09")
    store.delete(item)
    with pytest.raises(ReminderError):
        store.delete(item)


async def test_reminders_from_before_the_history_get_their_due_day_and_one_entry(hass) -> None:
    store = ReminderStore(hass)
    store._store.async_load = lambda: _async(  # type: ignore[method-assign]
        {"items": [{"id": "a", "name": "Filter", "interval_days": 90, "last_done": "2026-07-01"}]}
    )
    await store.async_load()
    row = store.view(date(2026, 10, 9))[0]
    assert row["due"] == "2026-09-29" and row["history"] == ["2026-07-01"] and row["state"] == "due"


async def _async(value):
    return value


async def test_failed_attempts_are_counted_by_their_growth_between_scans(hass) -> None:
    history = EntryStateHistory(hass)
    history.record({"e1": "loaded"}, NOW, {"e1": 0})
    assert history.summary("e1", NOW) is None
    history.record({"e1": "setup_retry"}, NOW + timedelta(minutes=5), {"e1": 3})
    history.record({"e1": "setup_retry"}, NOW + timedelta(minutes=10), {"e1": 8})
    history.record({"e1": "setup_retry"}, NOW + timedelta(minutes=15), {"e1": 2})  # restarted
    history.record({"e1": "setup_retry"}, NOW + timedelta(minutes=20), None)  # attribute gone
    assert history.summary("e1", NOW + timedelta(hours=1))["attempts"] == 10


async def test_a_failing_entry_counts_once_per_episode_and_old_ones_are_dropped(hass) -> None:
    history = EntryStateHistory(hass)
    history.record({"e1": "loaded", "e2": "loaded"}, NOW)
    assert history.summary("e1", NOW) is None
    history.record({"e1": "setup_retry", "e2": "loaded"}, NOW + timedelta(hours=1))
    history.record(
        {"e1": "setup_retry", "e2": "loaded"}, NOW + timedelta(hours=2)
    )  # the same episode
    history.record({"e1": "loaded", "e2": "loaded"}, NOW + timedelta(hours=3))
    history.record({"e1": "setup_error", "e2": "loaded"}, NOW + timedelta(hours=4))
    summary = history.summary("e1", NOW + timedelta(hours=5))
    assert (
        summary["count"] == 2
        and summary["state"] == "setup_error"
        and history.summary("e2", NOW) is None
    )
    assert (
        history.summary("e1", NOW + timedelta(days=30))["count"] == 0
    )  # outside the week, still failing
    history.record({"e1": "loaded"}, NOW + timedelta(days=70))  # older than 60 days: gone
    assert history.summary("e1", NOW + timedelta(days=70)) is None


def test_voltage_batteries_are_judged_by_the_guessed_type_not_by_a_percent_limit() -> None:
    from custom_components.ha_housekeeper import battery_voltage as bv

    assert bv.guess_type(3.1) == ("coin3", 2.5) and bv.guess_type(1.6) == ("cell15", 1.1)
    assert bv.guess_type(2.0) is None
    series = {
        "sensor.coin": days([3.0 - 0.01 * i for i in range(12)]),  # falls 0.01 V a day, now 2.89
        "sensor.flat": days([3.0] * 12),
        "sensor.empty": days([2.6 - 0.02 * i for i in range(12)]),
        "sensor.mv": days([3000 - 10 * i for i in range(12)]),  # the same, in millivolts
    }
    result = bv.build(series, {}, {"sensor.mv": 0.001})
    rows = {r["entity_id"]: r for r in result["rows"]}
    assert rows["sensor.coin"]["state"] == "falling" and rows["sensor.coin"]["days_left"] == 39
    assert rows["sensor.mv"]["days_left"] == 39 and rows["sensor.flat"]["state"] == "stable"
    assert (
        rows["sensor.empty"]["state"] == "low" and result["rows"][0]["entity_id"] == "sensor.empty"
    )
    named = {"object_id": "sensor.x_battery_voltage", "status": "active", "unit": "V"}
    assert bv.is_voltage_battery({**named, "device_class": "voltage", "name": "Battery Voltage"})
    mains = {**named, "object_id": "sensor.x_mains", "device_class": "voltage", "name": "Mains"}
    assert not bv.is_voltage_battery(mains)
    assert not bv.is_voltage_battery({**named, "device_class": "battery", "unit": "%"})
