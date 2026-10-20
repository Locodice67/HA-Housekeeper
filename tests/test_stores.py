"""Every store of Housekeeper: bad data on disk never stops loading, and changes survive a reload."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402
from pytest_homeassistant_custom_component.common import async_fire_time_changed  # noqa: E402

from custom_components.ha_housekeeper import const  # noqa: E402
from custom_components.ha_housekeeper.backup_health import AttestStore  # noqa: E402
from custom_components.ha_housekeeper.cleanup import JournalStore  # noqa: E402
from custom_components.ha_housekeeper.events import EventLog  # noqa: E402
from custom_components.ha_housekeeper.goals import GoalStore  # noqa: E402
from custom_components.ha_housekeeper.history import ScanHistory  # noqa: E402
from custom_components.ha_housekeeper.ignored import IgnoreStore, _clean  # noqa: E402
from custom_components.ha_housekeeper.marks import MarkStore  # noqa: E402
from custom_components.ha_housekeeper.observations import ObservationStore  # noqa: E402
from custom_components.ha_housekeeper.policies import PolicyStore  # noqa: E402
from custom_components.ha_housekeeper.queries import ReplyStore  # noqa: E402
from custom_components.ha_housekeeper.runs import RunStore  # noqa: E402

STORES = [
    (ObservationStore, const.STORAGE_KEY),
    (IgnoreStore, const.IGNORED_STORAGE_KEY),
    (MarkStore, const.MARKS_STORAGE_KEY),
    (GoalStore, const.GOALS_STORAGE_KEY),
    (ScanHistory, const.HISTORY_STORAGE_KEY),
    (JournalStore, const.JOURNAL_STORAGE_KEY),
    (AttestStore, const.ATTEST_STORAGE_KEY),
    (EventLog, const.EVENTS_STORAGE_KEY),
    (RunStore, const.RUNS_STORAGE_KEY),
    (PolicyStore, const.POLICIES_STORAGE_KEY),
    (ReplyStore, const.REPLIES_STORAGE_KEY),
]
GARBAGE = [
    "text",
    7,
    [1, "a"],
    {},
    {"items": "no", "events": "no", "plans": "no", "record": "no", "days": "no", "sizes": "no"},
    {"items": {"x": 1}, "events": [1, None, {"kind": "start"}], "plans": [1, "a"], "record": [1]},
    {"latest": "x", "previous": 5, "daily": "d"},
    {"enabled": "no"},
    {"replies": "no"},
    {"replies": {"storms:1": 5, "BAD key": {"computed_at": 1}, "storms:7": {"computed_at": "x"}}},
    {"replies": {"db_health": {"computed_at": True}}},
    {"prefixes": "no"},
    {"prefixes": {"sensor": 5, "BAD domain": "x", "light": "UPPER", "switch": "ok_"}},
    {"enabled": {"entity_area": "yes", "unknown_rule": True, "device_area": 1}},
    {"since": 3, "items": {"automation.a": {"days": "no", "seen": 5}}},
    {"sizes": {"2026-10-08": "big", "x": -4}, "heartbeat": 5, "versions": "v"},
]


def put(hass_storage, key: str, data) -> None:
    hass_storage[key] = {
        "version": const.STORAGE_VERSION,
        "minor_version": 1,
        "key": key,
        "data": data,
    }


@pytest.mark.parametrize(("cls", "key"), STORES, ids=lambda v: getattr(v, "__name__", v))
@pytest.mark.parametrize("garbage", GARBAGE, ids=range(len(GARBAGE)))
async def test_bad_data_on_disk_never_stops_loading(
    hass: HomeAssistant, hass_storage, cls, key: str, garbage
) -> None:
    put(hass_storage, key, garbage)
    store = cls(hass)
    await store.async_load()  # must not raise


async def flush(hass: HomeAssistant) -> None:
    async_fire_time_changed(hass, datetime.now(UTC) + timedelta(hours=1))
    await hass.async_block_till_done()


async def test_ignored_findings_survive_a_reload(hass: HomeAssistant, hass_storage) -> None:
    store = IgnoreStore(hass)
    await store.async_load()
    store.set_ignored("rule|a", True, datetime.now(UTC))
    await flush(hass)
    again = IgnoreStore(hass)
    await again.async_load()
    assert again.is_ignored("rule|a") and not again.is_ignored("rule|b")
    again.set_ignored("rule|a", False, datetime.now(UTC))
    await flush(hass)
    third = IgnoreStore(hass)
    await third.async_load()
    assert not third.is_ignored("rule|a")


async def test_a_decision_rests_while_its_finding_is_away_and_knows_when_it_was_last_seen(
    hass: HomeAssistant, hass_storage
) -> None:
    store = IgnoreStore(hass)
    await store.async_load()
    then = datetime(2026, 9, 1, tzinfo=UTC)
    store.decide("rule|a|", "keep", then, reason="off on purpose")
    store.decide("policy.x|b|", "ignore", then)
    store.note_seen({"rule|a|", "other|c|"}, then + timedelta(minutes=10))
    assert store.entry("rule|a|")["seen"] == then.isoformat(), "within the hour nothing is written"
    store.note_seen({"rule|a|"}, then + timedelta(days=2))
    assert store.entry("rule|a|")["seen"] == (then + timedelta(days=2)).isoformat()
    assert store.resting({"rule|a|"}) == []
    assert [e["key"] for e in store.resting(set())] == ["rule|a|"], (
        "a policy violation is no finding"
    )


async def test_decisions_keep_their_reason_run_out_and_read_old_entries(
    hass: HomeAssistant, hass_storage
) -> None:
    assert _clean("2026-01-01T00:00:00+00:00")["kind"] == "ignore", "an old entry was just a time"
    assert _clean({"kind": "x"}) is None and _clean(3) is None
    store = IgnoreStore(hass)
    await store.async_load()
    now = datetime.now(UTC)
    store.decide("k", "keep", now, reason=" Reserve " + "x" * 300, until=now + timedelta(days=30))
    await flush(hass)
    store.decide("s", "snooze", now - timedelta(days=9), until=now - timedelta(days=2))
    await flush(hass)
    again = IgnoreStore(hass)
    await again.async_load()
    assert again.info("k")["reason"].startswith("Reserve") and len(again.info("k")["reason"]) == 200
    assert not again.is_ignored("s") and again.is_due("s"), "ran out: shown again, marked due"
    assert not again.is_due("k")
    again.set_ignored("s", False, now)
    assert not again.is_due("s")


async def test_observations_survive_a_reload_and_forget_what_is_gone(
    hass: HomeAssistant, hass_storage
) -> None:
    store = ObservationStore(hass)
    await store.async_load()
    now = datetime.now(UTC)
    await store.async_update({"sensor.a": "unavailable", "sensor.b": "unused"}, now)
    await flush(hass)
    again = ObservationStore(hass)
    await again.async_load()
    assert again.since("sensor.a", "unavailable") == now.isoformat()
    assert again.since("sensor.a", "unused") is None
    await again.async_update({"sensor.a": "unavailable"}, now + timedelta(days=1))
    await flush(hass)
    third = ObservationStore(hass)
    await third.async_load()
    assert third.since("sensor.b", "unused") is None


async def test_the_attestation_survives_a_reload(hass: HomeAssistant, hass_storage) -> None:
    store = AttestStore(hass)
    await store.async_load()
    store.set("restore_test", date(2026, 9, 1))
    await flush(hass)
    again = AttestStore(hass)
    await again.async_load()
    assert again.record["restore_test"].startswith("2026-09-01")
    again.clear("restore_test")
    await flush(hass)
    third = AttestStore(hass)
    await third.async_load()
    assert third.record["restore_test"] is None


async def test_the_event_log_survives_a_reload_and_stays_bounded(
    hass: HomeAssistant, hass_storage
) -> None:
    log = EventLog(hass)
    await log.async_load()
    now = datetime.now(UTC)
    log.record_start(now)
    log.record_size("2026-10-08", 1234)
    log.observe("2026.9.4", {"demo": "1.0"}, now)
    log.observe("2026.10.0", {"demo": "1.1"}, now + timedelta(days=1))
    await log._store.async_save(log._data())  # its delayed save waits five minutes
    again = EventLog(hass)
    await again.async_load()
    assert [e["kind"] for e in again.events] == ["start", "ha_version", "entry_version"]
    assert again.sizes == {"2026-10-08": 1234} and again.heartbeat
    assert again.versions == {"ha": "2026.10.0", "entries": {"demo": "1.1"}}
    for n in range(200):
        again.record("plan", now + timedelta(seconds=n), n=n)
    assert len(again.events) <= 5000


async def test_the_history_survives_a_reload(hass: HomeAssistant, hass_storage) -> None:
    history = ScanHistory(hass)
    await history.async_load()
    snapshot = {
        "meta": {"scanned_at": "2026-10-07T10:00:00+00:00", "object_count": 1},
        "objects": [],
        "findings": [],
    }
    history.record(snapshot)
    await flush(hass)
    again = ScanHistory(hass)
    await again.async_load()
    assert again.baselines() is not None
    again.record(
        {**snapshot, "meta": {**snapshot["meta"], "scanned_at": "2026-10-08T10:00:00+00:00"}}
    )
    assert again._previous["at"].startswith("2026-10-07")


@pytest.mark.parametrize(
    "garbage", [{"latest": "x", "previous": 5, "daily": "d"}, {"daily": [1, {"at": 3}]}]
)
async def test_a_history_with_bad_content_still_records_and_compares(
    hass: HomeAssistant, hass_storage, garbage
) -> None:
    put(hass_storage, const.HISTORY_STORAGE_KEY, garbage)
    history = ScanHistory(hass)
    await history.async_load()
    snapshot = {
        "meta": {"scanned_at": "2026-10-08T10:00:00+00:00", "object_count": 0},
        "objects": [],
        "findings": [],
    }
    history.record(snapshot)
    history.record(
        {**snapshot, "meta": {**snapshot["meta"], "scanned_at": "2026-10-09T10:00:00+00:00"}}
    )
    assert isinstance(history.baselines(), list)


async def test_replies_can_be_cleared_and_the_event_log_takes_a_purge(
    hass: HomeAssistant, hass_storage
) -> None:
    replies = ReplyStore(hass)
    await replies.async_load()
    replies.keep("storms:1", {"computed_at": 5})
    replies.clear()
    await flush(hass)
    again = ReplyStore(hass)
    await again.async_load()
    assert again.replies == {}
    log = EventLog(hass)
    log.record("purge", datetime.now(UTC), removed=2, skipped=0)
    assert log.events[-1]["kind"] == "purge"


async def test_goal_choices_survive_a_reload_and_stay_in_range(
    hass: HomeAssistant, hass_storage
) -> None:
    store = GoalStore(hass)
    await store.async_load()
    assert store.set("backup_age", limit=48, enabled=False)
    assert not store.set("backup_age", limit=0) and not store.set("nope", limit=3)
    await flush(hass)
    again = GoalStore(hass)
    await again.async_load()
    assert again.items["backup_age"] == {"enabled": False, "limit": 48}


async def test_purges_are_noted_in_the_journal_and_survive_a_reload(
    hass: HomeAssistant, hass_storage
) -> None:
    journal = JournalStore(hass)
    await journal.async_load()
    for n in range(105):
        journal.add_purge(
            {"at": f"2026-10-09T10:00:{n % 60:02d}+00:00", "removed": [f"sensor.a{n}"]}
        )
    assert len(journal.purges) == 100 and journal.purges[0]["removed"] == ["sensor.a104"]
    # the delayed save merges calls made close together (a debounce), so save at once
    await journal._store.async_save({"plans": journal.plans, "purges": journal.purges})
    again = JournalStore(hass)
    await again.async_load()
    assert len(again.purges) == 100 and again.plans == []
    put(hass_storage, const.JOURNAL_STORAGE_KEY, {"plans": [], "purges": ["x", {"at": "t"}]})
    third = JournalStore(hass)
    await third.async_load()
    assert third.purges == [{"at": "t"}]


async def test_previews_older_than_a_day_are_dropped_but_plans_that_ran_stay(
    hass: HomeAssistant,
) -> None:
    journal = JournalStore(hass)
    await journal.async_load()
    old = (datetime.now(UTC) - timedelta(hours=25)).isoformat()
    fresh = datetime.now(UTC).isoformat()
    journal._plans[:] = [
        {"plan_id": "old", "created_at": old},
        {"plan_id": "fresh", "created_at": fresh},
        {"plan_id": "ran", "created_at": old, "executed": True},
    ]
    assert journal.drop_stale_previews() == 1
    assert [p["plan_id"] for p in journal.plans] == ["fresh", "ran"]
