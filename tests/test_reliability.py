"""Integration reliability: availability per config entry and shared outages."""

from __future__ import annotations

from datetime import timedelta

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402
from pytest_homeassistant_custom_component.components.recorder.common import (  # noqa: E402
    async_wait_recording_done,
)

from custom_components.ha_housekeeper.queries import ReplyStore  # noqa: E402
from custom_components.ha_housekeeper.reliability import (  # noqa: E402
    compute,
    reliability,
    shared_outages,
)

HOUR = 3600
START, END = 0.0, 100 * HOUR


def test_a_shared_outage_needs_eighty_percent_of_the_entities() -> None:
    four_of_five = [[(10 * HOUR, 11 * HOUR)] for _ in range(4)] + [[]]
    assert shared_outages(four_of_five) == [(10 * HOUR, 11 * HOUR)]
    three_of_five = [[(10 * HOUR, 11 * HOUR)] for _ in range(3)] + [[], []]
    assert shared_outages(three_of_five) == []


def test_a_shared_outage_needs_five_minutes_and_three_entities() -> None:
    short = [[(0, 299)] for _ in range(3)]
    assert shared_outages(short) == []
    exact = [[(0, 300)] for _ in range(3)]
    assert shared_outages(exact) == [(0, 300)]
    assert shared_outages([[(0, HOUR)], [(0, HOUR)]]) == []


def test_intervals_that_only_touch_do_not_overlap() -> None:
    members = [[(0, 600)], [(600, 1200)], [(0, 600)]]
    # 2 of 3 are down at the same time (66 %), then 1 of 3: never 80 %.
    assert shared_outages(members) == []


def test_overlapping_outages_are_joined_by_the_sweep() -> None:
    members = [[(0, 400)], [(100, 500)], [(100, 400)]]
    assert shared_outages(members) == [(100, 400)]


def entities(*names: str, entry: str = "e1", status: str = "active") -> list[dict]:
    return [{"entity_id": n, "config_entry_id": entry, "status": status} for n in names]


ENTRIES = {"e1": {"title": "Hue", "domain": "hue", "state": "loaded", "iot_class": "local_push"}}


def runs(seen: dict, intervals: dict) -> dict:
    return {"start": START, "end": END, "seen": seen, "intervals": intervals, "took_ms": 5}


def test_availability_is_time_weighted_from_the_first_report() -> None:
    result = compute(
        runs({"a": START, "b": 50 * HOUR}, {"a": [(10 * HOUR, 20 * HOUR)]}),
        entities("a", "b"),
        ENTRIES,
    )
    row = result["entries"][0]
    # a: 10 h of 100 down, b: 0 of 50 down -> 10 of 150.
    assert row["availability"] == round(100 * (1 - 10 / 150), 2)
    assert row["entities"] == 2 and row["permanent"] == 0 and row["layer"] is None


def test_entities_down_the_whole_window_are_counted_apart() -> None:
    result = compute(
        runs(
            {"a": START, "b": START},
            {"a": [(START, END)], "b": [(10 * HOUR, 11 * HOUR)]},
        ),
        entities("a", "b", "c"),
        ENTRIES,
    )
    row = result["entries"][0]
    assert row["permanent"] == 1 and row["entities"] == 1
    assert row["availability"] == 99.0


def test_an_entity_without_rows_that_is_down_now_is_permanent() -> None:
    items = [*entities("a"), *entities("gone", status="unavailable")]
    row = compute(runs({"a": START}, {}), items, ENTRIES)["entries"][0]
    assert row["permanent"] == 1 and row["availability"] == 100.0


def test_a_shared_outage_names_the_likely_layer_from_the_iot_class() -> None:
    outage = {name: [(40 * HOUR, 41 * HOUR)] for name in "abc"}
    seen = {name: START for name in "abc"}
    local = compute(runs(seen, outage), entities("a", "b", "c"), ENTRIES)["entries"][0]
    assert local["shared_outages"] == 1 and local["layer"] == "local"
    assert local["longest_outage"] == HOUR
    assert local["last_disruption"] == {"end": 41 * HOUR, "seconds": HOUR, "shared": True}
    cloud_entries = {"e1": {**ENTRIES["e1"], "iot_class": "cloud_polling"}}
    cloud = compute(runs(seen, outage), entities("a", "b", "c"), cloud_entries)["entries"][0]
    assert cloud["layer"] == "cloud"


def test_a_single_entity_outage_is_the_last_disruption_without_a_layer() -> None:
    row = compute(
        runs({"a": START, "b": START}, {"a": [(5 * HOUR, 6 * HOUR)]}),
        entities("a", "b"),
        ENTRIES,
    )["entries"][0]
    assert row["layer"] is None and row["shared_outages"] == 0
    assert row["last_disruption"] == {"end": 6 * HOUR, "seconds": HOUR, "shared": False}


def test_intervals_are_clipped_to_the_window_and_merged_per_entity() -> None:
    row = compute(
        runs({"a": START}, {"a": [(-5 * HOUR, 5 * HOUR), (4 * HOUR, 6 * HOUR)]}),
        entities("a"),
        ENTRIES,
    )["entries"][0]
    assert row["availability"] == 94.0


def test_the_worst_entry_comes_first() -> None:
    entries = {
        "e1": {**ENTRIES["e1"], "title": "Good"},
        "e2": {**ENTRIES["e1"], "title": "Bad"},
    }
    items = [*entities("a", entry="e1"), *entities("b", entry="e2")]
    result = compute(runs({"a": START, "b": START}, {"b": [(0, 10 * HOUR)]}), items, entries)
    assert [r["title"] for r in result["entries"]] == ["Bad", "Good"]


def snapshot_for(*names: str, entry: str) -> dict:
    return {
        "objects": [
            {
                "object_type": "entity",
                "object_id": n,
                "config_entry_id": entry,
                "status": "active",
            }
            for n in names
        ]
    }


async def test_without_a_recorder_there_is_no_result(hass: HomeAssistant) -> None:
    assert (await reliability(hass, snapshot_for(entry="x")))["available"] is False


async def test_the_recorder_gives_the_unavailable_time(
    recorder_mock, hass: HomeAssistant, freezer
) -> None:
    from homeassistant.util import dt as dt_util
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    entry = MockConfigEntry(domain="test", title="Probe")
    entry.add_to_hass(hass)
    now = dt_util.utcnow()
    names = ("sensor.a", "sensor.b", "sensor.c")
    freezer.move_to(now - timedelta(days=2))
    for name in names:
        hass.states.async_set(name, "1")
    freezer.move_to(now - timedelta(days=1, hours=1))
    for name in names:
        hass.states.async_set(name, "unavailable")
    freezer.move_to(now - timedelta(days=1))
    for name in names:
        hass.states.async_set(name, "2")
    freezer.move_to(now)
    await async_wait_recording_done(hass)

    snapshot = snapshot_for(*names, entry=entry.entry_id)
    result = await reliability(hass, snapshot, refresh=True)
    row = result["entries"][0]
    assert row["entry_id"] == entry.entry_id and row["entities"] == 3
    assert row["shared_outages"] == 1 and row["longest_outage"] == HOUR
    assert row["availability"] == round(100 * (1 - 1 / 48), 2)
    assert result["cached"] is False and isinstance(result["took_ms"], int)

    day = await reliability(hass, snapshot, window_days=1, refresh=True)
    # The outage began before the 24 hour window: it is counted from the first report in it.
    assert day["entries"][0]["shared_outages"] == 0 and day["entries"][0]["availability"] == 100.0

    again = await reliability(hass, snapshot)
    assert again["cached"] is True

    plain = await reliability(hass, snapshot, window_days=1)
    assert plain["comparison"] == {"requested": False, "available": False}
    assert "delta" not in plain["entries"][0]
    # The day before had the hour of outage; the last day had none: up by the missing hour of 24.
    compared = await reliability(hass, snapshot, window_days=1, compare=True)
    assert compared["comparison"] == {"requested": True, "available": True}
    row = compared["entries"][0]
    assert row["previous_availability"] == round(100 * (1 - 1 / 24), 2)
    assert row["delta"] == round(100 - row["previous_availability"], 2)


async def test_a_second_query_does_not_start_while_one_runs(
    recorder_mock, hass: HomeAssistant
) -> None:
    from custom_components.ha_housekeeper.const import DOMAIN

    lock = hass.data.setdefault(DOMAIN, {}).setdefault(
        "reliability_lock", __import__("asyncio").Lock()
    )
    await lock.acquire()
    try:
        result = await reliability(hass, snapshot_for(entry="x"), refresh=True)
    finally:
        lock.release()
    assert result["busy"] is True and result["entries"] == []


# --- flapping -------------------------------------------------------------------------------

DAY = 86400
WEEK_END = 7 * DAY


def week(seen: dict, intervals: dict) -> dict:
    return {"start": 0.0, "end": WEEK_END, "seen": seen, "intervals": intervals, "took_ms": 1}


def episodes(count: int, *, every: float = 3600, at: float = 1000, length: float = 60) -> list:
    return [(at + i * every, at + i * every + length) for i in range(count)]


def flap(intervals: dict, *, outages=None, used=None, ignored=None, status="active", runs=None):
    from custom_components.ha_housekeeper.reliability import flapping

    seen = {name: 0.0 for name in intervals}
    items = [
        {"entity_id": n, "name": n, "config_entry_id": "e1", "status": status} for n in intervals
    ]
    return flapping(
        runs or week(seen, intervals), items, outages or {}, used or {}, ignored or set()
    )


def test_three_episodes_a_week_are_not_enough_but_four_are_unstable() -> None:
    assert flap({"a": episodes(2)})["items"] == []
    # 3 episodes in 7 days is 0.43 a day: below 0.5.
    assert flap({"a": episodes(3)})["items"] == []
    result = flap({"a": episodes(4)})
    assert [(i["episodes"], i["level"]) for i in result["items"]] == [(4, "unstable")]


def test_a_rate_of_one_and_a_half_a_day_is_flapping() -> None:
    below = flap({"a": episodes(10)})["items"][0]  # 1.43 a day
    assert below["level"] == "unstable" and below["per_day"] == 1.4
    exact = flap({"a": episodes(11)})["items"][0]  # 1.57 a day
    assert exact["level"] == "flapping"


def test_time_without_a_value_counts_for_the_pattern_but_not_for_the_availability() -> None:
    from custom_components.ha_housekeeper.reliability import compute

    runs = {**week({"a": 0.0}, {"a": episodes(2)}), "blank": {"a": episodes(2, at=90000)}}
    result = flap({"a": []}, runs=runs)
    assert [i["episodes"] for i in result["items"]] == [4]
    entries = {"e1": {"title": "E", "domain": "x"}}
    row = compute(runs, [{"entity_id": "a", "config_entry_id": "e1"}], entries)["entries"][0]
    assert row["affected"][0]["availability"] == round(100 * (1 - 120 / WEEK_END), 2)


def test_the_day_window_needs_three_episodes() -> None:
    day = {"start": 0.0, "end": DAY, "seen": {"a": 0.0}, "intervals": {"a": episodes(2)}}
    assert flap({"a": []}, runs=day)["items"] == []
    day["intervals"] = {"a": episodes(3)}
    assert flap({"a": []}, runs=day)["items"][0]["level"] == "flapping"


def test_episodes_inside_a_shared_outage_belong_to_the_integration() -> None:
    inside = [(a, b) for a, b in episodes(6, every=600)]
    covered = {"e1": [(0.0, 10 * 3600.0)]}
    assert flap({"a": inside}, outages=covered)["items"] == []
    partly = {"e1": [(0.0, 5000.0)]}  # the first two episodes lie in it
    assert flap({"a": episodes(6)}, outages=partly)["items"][0]["episodes"] == 4


def test_entities_that_are_down_all_the_time_disabled_or_ignored_are_left_out() -> None:
    assert flap({"a": [(0.0, float(WEEK_END))]})["items"] == []
    assert flap({"a": episodes(8)}, status="disabled")["items"] == []
    assert flap({"a": episodes(8)}, ignored={"a"})["items"] == []
    assert flap({"a": episodes(8)})["items"][0]["entity_id"] == "a"


def test_duration_and_followers_set_the_order() -> None:
    result = flap({"quiet": episodes(8, length=120), "used": episodes(6)}, used={"used": 3})
    assert [i["entity_id"] for i in result["items"]] == ["used", "quiet"]
    quiet = result["items"][1]
    assert quiet["total_seconds"] == 960 and quiet["mean_seconds"] == 120 and quiet["used"] == 0


def pattern(hours: list[int], days: list[int]):
    """Episode starts at the given hours on the given days (UTC)."""
    starts = [d * DAY + h * 3600 for d, h in zip(days, hours, strict=True)]
    return flap({"a": [(t, t + 60.0) for t in starts]})["items"]


def test_a_daily_pattern_needs_sixty_percent_in_two_hours_on_three_days() -> None:
    assert pattern([3, 3, 4, 3], [0, 1, 2, 3])[0]["pattern_hour"] == 3
    # 3 of 5 in the band is exactly 60 %: counts. 2 of 5 does not.
    assert pattern([3, 3, 4, 9, 15], [0, 1, 2, 3, 4])[0]["pattern_hour"] == 3
    assert pattern([3, 3, 9, 15, 20], [0, 1, 2, 3, 4])[0]["pattern_hour"] is None
    # Enough starts in the band but only on two days.
    assert pattern([3, 4, 3, 4], [0, 0, 1, 1])[0]["pattern_hour"] is None
    # The band may wrap around midnight.
    assert pattern([23, 0, 23, 0], [0, 1, 2, 3])[0]["pattern_hour"] == 23


def test_the_list_is_capped_and_counts_all() -> None:
    result = flap({f"e{i:03d}": episodes(5) for i in range(40)})
    assert len(result["items"]) == 30 and result["total"] == 40


async def test_the_recorder_result_carries_the_unstable_entities(
    recorder_mock, hass: HomeAssistant, freezer
) -> None:
    from homeassistant.util import dt as dt_util
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    entry = MockConfigEntry(domain="test", title="Probe")
    entry.add_to_hass(hass)
    now = dt_util.utcnow()
    start = now - timedelta(days=3)
    for step in range(5):
        for name, state in (
            ("sensor.a", "unavailable"),
            ("sensor.b", "unavailable"),
            ("sensor.c", "unavailable"),
        ):
            freezer.move_to(start + timedelta(hours=step * 6))
            hass.states.async_set(name, state)
        freezer.move_to(start + timedelta(hours=step * 6, minutes=10))
        hass.states.async_set("sensor.a", "1")
        hass.states.async_set("sensor.b", "1")
        hass.states.async_set("sensor.c", "1")
    freezer.move_to(now)
    await async_wait_recording_done(hass)

    snapshot = snapshot_for("sensor.a", "sensor.b", "sensor.c", entry=entry.entry_id)
    snapshot["edges"] = [{"target": "entity:sensor.a", "source": "automation:x"}]
    result = await reliability(hass, snapshot, refresh=True)
    # Both entities fail together: that is a shared outage of the entry, not their own flapping.
    assert result["unstable"] == {
        "items": [],
        "total": 0,
        "excluded": {"ignored": 0, "disabled": 0, "permanent": 0},
        "entities": {},
    }
    assert "outage_periods" not in result
    assert result["entries"][0]["shared_outages"] == 5


async def test_one_entity_that_flaps_alone_is_named_with_its_followers(
    recorder_mock, hass: HomeAssistant, freezer
) -> None:
    from homeassistant.util import dt as dt_util
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    entry = MockConfigEntry(domain="test", title="Probe")
    entry.add_to_hass(hass)
    now = dt_util.utcnow()
    start = now - timedelta(days=3)
    for name in ("sensor.a", "sensor.b", "sensor.c"):
        freezer.move_to(start)
        hass.states.async_set(name, "1")
    for step in range(1, 6):
        freezer.move_to(start + timedelta(hours=step * 6))
        hass.states.async_set("sensor.a", "unavailable")
        freezer.move_to(start + timedelta(hours=step * 6, minutes=10))
        hass.states.async_set("sensor.a", "1")
    freezer.move_to(now)
    await async_wait_recording_done(hass)

    snapshot = snapshot_for("sensor.a", "sensor.b", "sensor.c", entry=entry.entry_id)
    snapshot["edges"] = [
        {"target": "entity:sensor.a", "source": "automation:x"},
        {"target": "entity:sensor.a", "source": "automation:y", "confidence": "probable"},
    ]
    item = (await reliability(hass, snapshot, refresh=True))["unstable"]["items"][0]
    assert item["entity_id"] == "sensor.a" and item["episodes"] == 5
    assert item["level"] == "unstable" and item["used"] == 1  # 5 in 7 days
    assert item["entry_title"] == "Probe" and item["mean_seconds"] == 600


def test_the_coverage_says_how_many_entities_had_data_and_how_much_of_the_period() -> None:
    # a was seen from the start (100 h observed), b only for the last 50 h; c never reported.
    result = compute(runs({"a": START, "b": 50 * HOUR}, {}), entities("a", "b", "c"), ENTRIES)
    assert result["coverage"] == {"known": 3, "with_data": 2, "observed_share": 75}
    empty = compute(runs({}, {}), entities("c"), ENTRIES)
    assert empty["coverage"] == {"known": 1, "with_data": 0, "observed_share": None}


def test_the_unstable_list_counts_what_it_left_out_and_why() -> None:
    from custom_components.ha_housekeeper.reliability import flapping

    week_seen = {"ign": 0.0, "off": 0.0, "perm": 0.0, "ok": 0.0, "never": None}
    intervals = {
        "ign": episodes(5),
        "off": episodes(5),
        "perm": [(0.0, WEEK_END)],
        "ok": episodes(5),
    }
    items = [
        {
            "entity_id": n,
            "name": n,
            "config_entry_id": "e1",
            "status": "disabled" if n == "off" else "active",
        }
        for n in week_seen
    ]
    runs_data = {
        "start": 0.0,
        "end": WEEK_END,
        "seen": {k: v for k, v in week_seen.items() if v is not None},
        "intervals": intervals,
    }
    result = flapping(runs_data, items, {}, {}, {"ign"})
    assert [i["entity_id"] for i in result["items"]] == ["ok"]
    assert result["excluded"] == {"ignored": 1, "disabled": 1, "permanent": 1}


def test_each_entry_lists_its_entities_with_downtime_worst_first() -> None:
    result = compute(
        runs(
            {"a": START, "b": START, "c": START},
            {"a": [(10 * HOUR, 20 * HOUR)], "b": [(10 * HOUR, 11 * HOUR)]},
        ),
        entities("a", "b", "c"),
        ENTRIES,
    )
    row = result["entries"][0]
    assert row["affected_total"] == 2
    assert [m["entity_id"] for m in row["affected"]] == ["a", "b"]
    assert row["affected"][0]["availability"] == 90.0


def test_the_list_of_affected_entities_is_capped() -> None:
    names = [f"e{n:02d}" for n in range(40)]
    seen = {n: START for n in names}
    down = {n: [(10 * HOUR, 11 * HOUR)] for n in names}
    row = compute(runs(seen, down), entities(*names), ENTRIES)["entries"][0]
    assert row["affected_total"] == 40 and len(row["affected"]) == 15


async def test_the_last_reply_is_kept_and_an_old_one_is_marked_stale(
    recorder_mock, hass: HomeAssistant, hass_storage, freezer
) -> None:
    from datetime import UTC, datetime

    from homeassistant.util import dt as dt_util
    from pytest_homeassistant_custom_component.common import MockConfigEntry

    entry = MockConfigEntry(domain="hue", title="Hue")
    entry.add_to_hass(hass)
    now = dt_util.utcnow()
    freezer.move_to(now - timedelta(days=1))
    hass.states.async_set("light.a", "1")
    freezer.move_to(now)
    await async_wait_recording_done(hass)
    snapshot = snapshot_for("light.a", entry=entry.entry_id)

    store = ReplyStore(hass)
    fresh = await reliability(hass, snapshot, store=store)
    assert fresh["stale"] is False and "reliability:7:0" in store.replies
    await store._store.async_save({"replies": store.replies})
    await hass.async_block_till_done()

    again = ReplyStore(hass)
    await again.async_load()
    assert again.replies["reliability:7:0"]["entries"][0]["entry_id"] == entry.entry_id
    quick = await reliability(hass, snapshot, store=again)
    assert quick["cached"] is True and quick["stale"] is False

    freezer.move_to(datetime.fromtimestamp(now.timestamp() + 3600, UTC))
    old = await reliability(hass, snapshot, store=again)
    assert old["stale"] is True and old["age_seconds"] >= 3600
    renewed = await reliability(hass, snapshot, store=again, refresh=True)
    assert renewed["stale"] is False and renewed["cached"] is False


def test_every_unstable_entity_is_named_by_id_not_only_the_listed_ones() -> None:
    names = {f"s{n:02d}": episodes(4 + n % 3) for n in range(40)}
    result = flap(names)
    assert len(result["items"]) == 30 and result["total"] == 40
    assert set(result["entities"]) == set(names), (
        "the map covers all of them, the list only the worst"
    )
    one = result["entities"]["s00"]
    assert set(one) == {
        "level",
        "episodes",
        "per_day",
        "total_seconds",
        "mean_seconds",
        "pattern_hour",
        "used",
    }
    assert flap({"a": episodes(2)})["entities"] == {}


async def test_cached_only_never_starts_a_query_and_hands_out_what_exists(
    recorder_mock, hass: HomeAssistant
) -> None:
    from custom_components.ha_housekeeper.const import DOMAIN

    store = ReplyStore(hass)
    snapshot = snapshot_for(entry="x")
    nothing = await reliability(hass, snapshot, store=store, cached_only=True)
    assert nothing["missing"] is True and nothing["entries"] == []
    assert "query_cache" not in hass.data.get(DOMAIN, {}), "no query ran"
    store.keep(
        "reliability:7:0", {"available": True, "entries": [], "computed_at": 1.0, "window_days": 7}
    )
    old = await reliability(hass, snapshot, store=store, cached_only=True)
    assert old["stale"] is True and old["cached"] is True and "missing" not in old


async def test_kept_days_give_the_same_runs_and_loads_as_one_query_also_over_midnight(
    recorder_mock, hass: HomeAssistant, freezer
) -> None:
    from datetime import UTC, datetime

    from homeassistant.components.recorder import get_instance

    from custom_components.ha_housekeeper.queries import DayCache, pieces
    from custom_components.ha_housekeeper.storms import query_storms

    day = 86400
    base = (int(datetime.now(UTC).timestamp()) // day - 3) * day
    for offset, state in (
        (HOUR, "1"),
        (23 * HOUR, "unavailable"),  # open over midnight into the next day
        (day + 2 * HOUR, "2"),
        (day + 5 * HOUR, "unavailable"),
        (2 * day, "1"),  # a row exactly at midnight
        (2 * day + 3 * HOUR, "unavailable"),
    ):
        freezer.move_to(datetime.fromtimestamp(base + offset, UTC))
        hass.states.async_set("sensor.a", state)
    end = base + 2 * day + 6 * HOUR
    freezer.move_to(datetime.fromtimestamp(end, UTC))
    await async_wait_recording_done(hass)

    from custom_components.ha_housekeeper.reliability import _merge, query_runs

    run = get_instance(hass).async_add_executor_job
    whole = await run(query_runs, hass, base, end)
    days = DayCache(hass, "reliability")
    assert [keep for *_, keep in pieces(base, end, days.oldest)] == [True, True, False]
    for _ in range(2):  # read once, then from the kept days
        split = await run(query_runs, hass, base, end, days)
        assert split["seen"] == whole["seen"]
        assert _merge(split["intervals"]["sensor.a"]) == _merge(whole["intervals"]["sensor.a"])
        assert _merge(split["intervals"]["sensor.a"])[0] == (
            base + 23 * HOUR,
            base + day + 2 * HOUR,
        )
    loads = DayCache(hass, "storms")
    plain = await run(query_storms, hass, base, end)
    for _ in range(2):
        kept = await run(query_storms, hass, base, end, loads)
        assert kept["entities"] == plain["entities"] and kept["events"] == plain["events"]


def test_an_entry_that_was_down_the_whole_window_is_dead_and_comes_first() -> None:
    entries = {
        "e1": {**ENTRIES["e1"], "title": "Fine"},
        "e2": {**ENTRIES["e1"], "title": "Gone"},
    }
    items = [*entities("a", entry="e1"), *entities("b", entry="e2")]
    result = compute(runs({"a": START, "b": START}, {"b": [(START, END)]}), items, entries)
    gone = result["entries"][0]
    assert gone["title"] == "Gone" and gone["dead"] and gone["availability"] is None
    assert not result["entries"][1]["dead"]


def test_the_outage_periods_and_the_seconds_per_local_day_of_an_entry() -> None:
    from datetime import UTC

    down = {n: [(30 * HOUR, 32 * HOUR)] for n in "abc"}
    result = compute(
        runs({n: START for n in "abc"}, down), entities("a", "b", "c"), ENTRIES, zone=UTC
    )
    row = result["entries"][0]
    assert [(p["kind"], p["seconds"], p["affected"]) for p in row["periods"]] == [
        ("shared", 2 * HOUR, 3)
    ]
    days = {d["date"]: d["seconds"] for d in row["days"]}
    assert days["1970-01-02"] == 2 * HOUR and days["1970-01-01"] == 0 and len(days) == 5

    small = compute(runs({"a": START}, {"a": [(10 * HOUR, 11 * HOUR)]}), entities("a"), ENTRIES)
    assert [p["kind"] for p in small["entries"][0]["periods"]] == ["single"]

    gone = compute(runs({"a": START}, {"a": [(START, END)]}), entities("a"), ENTRIES)
    period = gone["entries"][0]["periods"][0]
    assert period["kind"] == "down" and period["seconds"] == 100 * HOUR
