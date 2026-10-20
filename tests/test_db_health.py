"""Database health: size, growth, statistics duplicates and holes, recorder gaps."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402
from pytest_homeassistant_custom_component.components.recorder.common import (  # noqa: E402
    async_wait_recording_done,
)

from custom_components.ha_housekeeper import db_health as module  # noqa: E402
from custom_components.ha_housekeeper.db_health import (  # noqa: E402
    db_health,
    down_periods,
    evaluate,
    growth,
    state_gaps,
)

GB = 1024**3
MB = 1024**2
TODAY = date(2026, 10, 8)
NOW = 1_800_000_000.0


def raw(**fields) -> dict:
    return {
        "now": NOW,
        "dialect": "sqlite",
        "db_bytes": 10 * GB,
        "wal_bytes": 0,
        "duplicates": [],
        "series": [],
        "issues": {},
        "state_minutes": [],
        **fields,
    }


def run(raw_data: dict, *, names=None, sizes=None, events=None) -> dict:
    return evaluate(raw_data, names or {}, sizes or {}, events or [], TODAY)


def kinds(result: dict) -> list[str]:
    return [f["kind"] for f in result["findings"]]


def day(offset: int) -> str:
    return (TODAY - timedelta(days=offset)).isoformat()


# --- size and growth ------------------------------------------------------------------------


def test_the_wal_file_is_a_hint_from_a_quarter_of_the_database_or_one_gigabyte() -> None:
    assert kinds(run(raw(db_bytes=2 * GB, wal_bytes=GB // 2 - 1))) == []
    assert kinds(run(raw(db_bytes=2 * GB, wal_bytes=GB // 2))) == ["wal_large"]
    assert kinds(run(raw(db_bytes=100 * GB, wal_bytes=GB - 1))) == []
    assert kinds(run(raw(db_bytes=100 * GB, wal_bytes=GB))) == ["wal_large"]


def test_without_sizes_for_a_week_the_growth_is_unknown_and_silent() -> None:
    result = run(raw(), sizes={day(0): 10 * GB})
    assert result["growth"]["known"] is False and "growth" not in kinds(result)


def test_growth_needs_double_the_earlier_pace_and_100_megabytes() -> None:
    def sizes(recent: int, base_week: int) -> dict:
        return {
            day(0): 10 * GB,
            day(7): 10 * GB - recent,
            day(35): 10 * GB - recent - 4 * base_week,
        }

    assert kinds(run(raw(), sizes=sizes(200 * MB, 100 * MB))) == ["growth"]
    assert kinds(run(raw(), sizes=sizes(199 * MB, 100 * MB))) == []  # just under double
    assert kinds(run(raw(), sizes=sizes(99 * MB, 10 * MB))) == []  # fast but small
    assert kinds(run(raw(), sizes=sizes(100 * MB, 50 * MB))) == ["growth"]


def test_a_sample_within_three_days_of_the_wanted_day_is_used() -> None:
    assert growth({day(0): 5, day(10): 3}, TODAY)["recent_bytes"] == 2
    assert growth({day(0): 5, day(11): 3}, TODAY)["known"] is False


# --- statistics -----------------------------------------------------------------------------


def test_duplicate_statistics_are_named_by_series_and_never_hidden() -> None:
    dups = [
        {"statistic_id": "sensor.a", "start": 1.0, "count": 2},
        {"statistic_id": "sensor.a", "start": 2.0, "count": 2},
        {"statistic_id": "sensor.b", "start": 1.0, "count": 3},
    ]
    result = run(raw(duplicates=dups), names={"sensor.a": "A"})
    finding = result["findings"][0]
    assert (
        finding["kind"] == "duplicates" and finding["level"] == "problem" and finding["groups"] == 3
    )
    assert finding["series"][0] == {"statistic_id": "sensor.a", "name": "A", "groups": 2}


def test_missing_hours_start_at_six_and_only_count_entities_of_the_registry() -> None:
    def series(rows: int, sid: str = "sensor.a") -> dict:
        return {
            "statistic_id": sid,
            "rows": rows,
            "first": 0.0,
            "last": 99 * 3600.0,
        }  # 100 hours expected

    assert kinds(run(raw(series=[series(95)]), names={"sensor.a": "A"})) == []  # 5 missing
    result = run(raw(series=[series(94)]), names={"sensor.a": "A"})
    assert result["findings"][0]["series"][0]["missing"] == 6
    assert kinds(run(raw(series=[series(10, "sensor.gone")]), names={"sensor.a": "A"})) == []


def test_validation_issues_are_listed_without_the_ones_that_mean_gone() -> None:
    result = run(raw(issues={"sensor.a": ["units_changed"]}), names={"sensor.a": "A"})
    assert result["findings"][0]["kind"] == "statistics_issues"
    assert result["findings"][0]["series"][0]["types"] == ["units_changed"]
    assert "no_state" in module.IGNORED_ISSUES


# --- gaps in the states ---------------------------------------------------------------------


def test_a_gap_is_ten_minutes_without_any_row() -> None:
    base = int(NOW // 60)
    gaps = state_gaps([base - 100, base - 91, base - 80, base - 1], NOW, [])
    assert [g["seconds"] for g in gaps] == [
        (base - 80 - (base - 91)) * 60 - 60,
        (base - 1 - (base - 80)) * 60 - 60,
    ]
    # nine minutes apart is no gap, ten is one
    assert state_gaps([0, 9], 9 * 60, []) == []
    assert len(state_gaps([0, 10], 10 * 60, [])) == 1


def test_a_gap_that_ends_just_after_a_start_entry_is_a_restart() -> None:
    now = NOW
    end_minute = int(now // 60) - 1000
    start_ts = end_minute * 60.0 - 30
    events = [
        {
            "kind": "start",
            "at": __import__("datetime")
            .datetime.fromtimestamp(start_ts, __import__("datetime").UTC)
            .isoformat(),
            "down_seconds": 3600,
        }
    ]
    gaps = state_gaps([end_minute - 90, end_minute, int(now // 60) - 1], now, down_periods(events))
    assert [g["cause"] for g in gaps] == ["restart", "recorder"], (
        "the long silence after the restart is not explained"
    )
    gaps = state_gaps([end_minute - 90, end_minute, int(now // 60) - 1], now, [])
    assert [g["cause"] for g in gaps] == ["recorder", "recorder"]


def test_only_gaps_not_explained_by_a_restart_are_a_finding() -> None:
    now = NOW
    base = int(now // 60)
    minutes = [base - 500, base - 300, base - 1]
    result = run(raw(state_minutes=minutes))
    finding = result["findings"][0]
    assert (
        finding["kind"] == "recorder_gap"
        and finding["gaps"] == 2
        and finding["longest_seconds"] > 0
    )
    assert result["restart_gaps"] == 0


def test_start_entries_without_down_seconds_give_no_period() -> None:
    assert (
        down_periods([{"kind": "start", "at": "2026-10-01T10:00:00+00:00"}, {"kind": "plan"}]) == []
    )


def test_problems_come_before_hints() -> None:
    result = run(
        raw(wal_bytes=5 * GB, duplicates=[{"statistic_id": "x", "start": 1.0, "count": 2}])
    )
    assert kinds(result) == ["duplicates", "wal_large"]


def test_another_database_than_sqlite_has_no_sizes_but_is_still_judged() -> None:
    result = run(
        raw(
            dialect="mysql",
            db_bytes=None,
            wal_bytes=None,
            duplicates=[{"statistic_id": "x", "start": 1.0, "count": 2}],
        )
    )
    assert result["db_bytes"] is None and kinds(result) == ["duplicates"]


# --- the recorder ---------------------------------------------------------------------------


class FakeEvents:
    def __init__(self) -> None:
        self.sizes: dict[str, int] = {}
        self.events: list[dict] = []

    def record_size(self, day: str, size: int) -> None:
        self.sizes[day] = size


async def test_without_a_recorder_there_is_no_result(hass: HomeAssistant) -> None:
    assert (await db_health(hass, {"objects": []}, FakeEvents()))["available"] is False


async def test_the_recorder_gives_statistics_duplicates_holes_and_gaps(
    recorder_mock, hass: HomeAssistant, freezer
) -> None:
    import time

    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.db_schema import Statistics, StatisticsMeta
    from homeassistant.components.recorder.util import session_scope
    from homeassistant.util import dt as dt_util
    from sqlalchemy import text

    now = dt_util.utcnow()
    freezer.move_to(now - timedelta(hours=3))
    hass.states.async_set("sensor.a", "1")
    freezer.move_to(now - timedelta(minutes=30))
    hass.states.async_set("sensor.a", "2")
    freezer.move_to(now)
    await async_wait_recording_done(hass)

    def fill() -> None:
        with session_scope(hass=hass) as session:
            session.execute(text("DROP INDEX IF EXISTS ix_statistics_statistic_id_start_ts"))
            meta = StatisticsMeta(
                statistic_id="sensor.a",
                source="recorder",
                unit_of_measurement="W",
                has_sum=False,
                has_mean=True,
            )
            session.add(meta)
            session.flush()
            base = int(time.time() // 3600 * 3600) - 40 * 3600
            for hour in range(0, 30):
                if hour in (10, 11, 12, 13, 14, 15, 16):  # seven hours missing
                    continue
                session.add(Statistics(metadata_id=meta.id, start_ts=base + hour * 3600, mean=1.0))
            session.add(Statistics(metadata_id=meta.id, start_ts=base, mean=2.0))  # a duplicate

    await get_instance(hass).async_add_executor_job(fill)
    events = FakeEvents()
    snapshot = {"objects": [{"object_type": "entity", "object_id": "sensor.a", "name": "A"}]}
    result = await db_health(hass, snapshot, events, refresh=True)
    found = {f["kind"]: f for f in result["findings"]}
    assert found["duplicates"]["groups"] == 1 and found["duplicates"]["series"][0]["name"] == "A"
    assert found["missing_hours"]["series"][0]["missing"] == 7
    assert found["recorder_gap"]["gaps"] >= 1
    assert result["cached"] is False and isinstance(result["took_ms"], int)
    assert (await db_health(hass, snapshot, events))["cached"] is True


async def test_a_unique_statistics_index_spares_the_duplicate_search(
    recorder_mock, hass: HomeAssistant
) -> None:
    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.util import session_scope
    from sqlalchemy import text

    from custom_components.ha_housekeeper.db_health import duplicates_possible

    def check() -> tuple[bool, bool]:
        with session_scope(hass=hass) as session:
            before = duplicates_possible(session)
            session.execute(text("DROP INDEX IF EXISTS ix_statistics_statistic_id_start_ts"))
            return before, duplicates_possible(session)

    assert await get_instance(hass).async_add_executor_job(check) == (False, True)


async def test_a_second_query_does_not_start_while_one_runs(
    recorder_mock, hass: HomeAssistant
) -> None:
    import asyncio

    from custom_components.ha_housekeeper.const import DOMAIN

    lock = hass.data.setdefault(DOMAIN, {}).setdefault("reliability_lock", asyncio.Lock())
    await lock.acquire()
    try:
        result = await db_health(hass, {"objects": []}, FakeEvents(), refresh=True)
    finally:
        lock.release()
    assert result["busy"] is True and result["findings"] == []


def test_the_event_log_keeps_daily_sizes_bounded_and_clean() -> None:
    from custom_components.ha_housekeeper.events import SIZE_DAYS, EventLog

    log = EventLog.__new__(EventLog)
    log.sizes = {}
    log._save = lambda: None
    for offset in range(SIZE_DAYS + 10):
        log.record_size(day(offset), offset)
    assert (
        len(log.sizes) == SIZE_DAYS and day(0) in log.sizes and day(SIZE_DAYS + 9) not in log.sizes
    )


async def test_the_overview_summary_needs_no_table_query(hass: HomeAssistant) -> None:
    from custom_components.ha_housekeeper.db_health import database_summary

    class Events:
        sizes: dict = {}

    assert await database_summary(hass, Events()) is None  # no recorder, no summary


async def test_the_overview_summary_names_size_and_growth(
    recorder_mock, hass: HomeAssistant
) -> None:
    from datetime import UTC, datetime, timedelta

    from custom_components.ha_housekeeper.db_health import database_summary

    today = datetime.now(UTC).date()

    class Events:
        sizes = {
            today.isoformat(): 1700,
            (today - timedelta(days=7)).isoformat(): 1000,
        }

    summary = await database_summary(hass, Events())
    assert summary is not None and summary["per_day"] == 100 and summary["samples"] == 2
    assert set(summary) == {
        "dialect",
        "estimated",
        "db_bytes",
        "wal_bytes",
        "per_day",
        "samples",
        "keep_days",
        "auto_purge",
    }
    assert summary["keep_days"] == 10 and summary["auto_purge"] is True  # Home Assistant's defaults


async def test_the_last_database_reply_is_kept_and_handed_out_while_the_recorder_is_busy(
    recorder_mock, hass: HomeAssistant
) -> None:
    import asyncio

    from custom_components.ha_housekeeper.const import DOMAIN
    from custom_components.ha_housekeeper.queries import ReplyStore

    store = ReplyStore(hass)
    events = FakeEvents()
    first = await db_health(hass, {"objects": []}, events, store=store, refresh=True)
    assert first["stale"] is False and "db_health" in store.replies
    quick = await db_health(hass, {"objects": []}, events, store=store)
    assert quick["cached"] is True and quick["stale"] is False
    lock = hass.data.setdefault(DOMAIN, {}).setdefault("reliability_lock", asyncio.Lock())
    hass.data[DOMAIN].pop("query_cache", None)  # only the file is left, as after a restart
    await lock.acquire()
    try:
        held = await db_health(hass, {"objects": []}, events, store=store, refresh=True)
    finally:
        lock.release()
    assert held["stale"] is True and held["busy"] is False


def test_missing_hours_tell_what_all_series_lack_from_what_only_one_lacks() -> None:
    # Hours 0..99 expected; hours 40..59 have no row in any series (a shared gap of 20 hours).
    present = [h for h in range(100) if not 40 <= h < 60]
    both = {"first": 0.0, "last": 99 * 3600.0}
    series = [
        {"statistic_id": "sensor.a", "rows": 80, **both},  # only the shared gap
        {"statistic_id": "sensor.b", "rows": 70, **both},  # the shared gap and ten more hours
    ]
    down = [{"kind": "start", "at": "1970-01-06T00:00:00+00:00", "down_seconds": 3600}]
    result = run(
        raw(series=series, hours=present), names={"sensor.a": "A", "sensor.b": "B"}, events=down
    )
    finding = result["findings"][0]
    assert finding["gap_hours"] == 20 and finding["gaps_total"] == 1
    assert finding["gaps"][0]["hours"] == 20 and finding["gaps"][0]["cause"] == "recorder"
    assert [(s["name"], s["shared"], s["own"]) for s in finding["series"]] == [
        ("B", 20, 10),
        ("A", 20, 0),
    ]
    assert finding["own_series"] == 1  # A is explained by the shared gap alone


def test_a_malformed_database_error_is_recognised_wrapped_or_not() -> None:
    from custom_components.ha_housekeeper.db_health import is_corruption_error

    assert is_corruption_error(
        RuntimeError("(sqlite3.DatabaseError) database disk image is malformed")
    )
    assert not is_corruption_error(RuntimeError("database is locked"))


def test_the_last_full_check_is_a_finding_when_damaged_and_lets_a_plan_skip_its_own_when_clean() -> (
    None
):
    from datetime import UTC, datetime, timedelta
    from types import SimpleNamespace

    from custom_components.ha_housekeeper.db_health import integrity_fresh, with_integrity

    now = datetime(2026, 10, 15, tzinfo=UTC)
    hass = SimpleNamespace(data={})
    reply = {"available": True, "findings": [{"kind": "growth", "level": "hint"}]}

    damaged = SimpleNamespace(
        integrity={"at": now.isoformat(), "state": "damaged", "lines": ["row 1 missing"]}
    )
    out = with_integrity(hass, reply, damaged)
    assert out["findings"][0]["kind"] == "integrity" and out["findings"][0]["level"] == "problem"
    assert out["integrity"]["state"] == "damaged" and not integrity_fresh(damaged, now)

    clean = SimpleNamespace(integrity={"at": now.isoformat(), "state": "ok", "lines": []})
    assert with_integrity(hass, reply, clean)["findings"] == reply["findings"]
    assert integrity_fresh(clean, now + timedelta(days=2))
    assert not integrity_fresh(clean, now + timedelta(days=4))
    assert not integrity_fresh(SimpleNamespace(integrity=None), now)


def test_files_the_recorder_set_aside_as_damaged_are_a_hint_and_found_next_to_the_database(
    tmp_path,
) -> None:
    from custom_components.ha_housekeeper.db_health import corrupt_copies

    (tmp_path / "home-assistant_v2.db").write_bytes(b"x")
    (tmp_path / "home-assistant_v2.db.corrupt.2026-10-01").write_bytes(b"x" * 5)
    (tmp_path / "other.db.corrupt.1").write_bytes(b"x")
    found = corrupt_copies(str(tmp_path / "home-assistant_v2.db"))
    assert found == [{"name": "home-assistant_v2.db.corrupt.2026-10-01", "bytes": 5}]
    assert kinds(run(raw(corrupt=found))) == ["corrupt_files"]


def test_little_free_disk_space_is_a_problem_from_a_gigabyte_or_five_percent() -> None:
    assert kinds(run(raw(disk_free=2 * GB, disk_total=100 * GB))) == ["disk_low"]
    assert kinds(run(raw(disk_free=10 * GB, disk_total=100 * GB))) == []
    assert kinds(run(raw(disk_free=4 * GB, disk_total=100 * GB))) == ["disk_low"]
    assert kinds(run(raw())) == []


def _damaged_sqlite(path):
    """A real SQLite file whose index no longer matches its table, like the one of issue 12."""
    import re
    import sqlite3

    db = sqlite3.connect(path)
    db.execute("CREATE TABLE states (id INTEGER PRIMARY KEY, entity TEXT, v TEXT)")
    db.execute("CREATE INDEX ix_states_entity ON states (entity)")
    db.executemany(
        "INSERT INTO states (entity, v) VALUES (?, ?)",
        [(f"sensor.e{i % 50}", str(i)) for i in range(20000)],
    )
    db.commit()
    db.close()
    raw = bytearray(path.read_bytes())
    # Change one stored name without touching the index; stay clear of the first pages, where
    # a change goes unnoticed.
    hits = [m.start() for m in re.finditer(rb"sensor\.e17", raw) if m.start() > 50 * 4096]
    raw[hits[0] + 9] = ord("8")
    path.write_bytes(raw)


def _use_file_database(monkeypatch, path):
    from contextlib import contextmanager

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    engine = create_engine(f"sqlite:///{path}")

    @contextmanager
    def session_scope(**_):
        with Session(engine) as session:
            yield session

    monkeypatch.setattr("homeassistant.components.recorder.util.session_scope", session_scope)
    monkeypatch.setattr(module, "database_files", lambda hass: {"dialect": "sqlite"})
    return engine


def test_the_full_check_finds_a_real_index_damage_that_the_quick_check_misses(
    tmp_path, monkeypatch
) -> None:
    from types import SimpleNamespace

    from sqlalchemy import text

    path = tmp_path / "home-assistant_v2.db"
    _damaged_sqlite(path)
    engine = _use_file_database(monkeypatch, path)
    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA quick_check(1)")).scalars().all() == ["ok"]

    hass = SimpleNamespace()
    lines = module.integrity_lines(hass)
    assert lines and "missing from index ix_states_entity" in lines[0]
    assert module.integrity_problem(hass) == lines[0]


async def test_a_damaged_file_is_recorded_as_damaged_and_a_sound_one_as_ok(
    hass: HomeAssistant, tmp_path, monkeypatch
) -> None:
    import sqlite3

    class Recorder:
        def async_add_executor_job(self, *args):
            return hass.async_add_executor_job(*args)

    class Events:
        integrity = None

        def __init__(self) -> None:
            self.states: list[tuple[str, list[str]]] = []

        def record_integrity(self, at, state, lines) -> None:
            self.states.append((state, lines))

    monkeypatch.setattr("homeassistant.components.recorder.get_instance", lambda hass: Recorder())
    monkeypatch.setattr(module, "async_sync_database_issue", lambda hass, found: None)
    events = Events()

    path = tmp_path / "damaged.db"
    _damaged_sqlite(path)
    _use_file_database(monkeypatch, path)
    await module._check(hass, events)

    sound = tmp_path / "sound.db"
    db = sqlite3.connect(sound)
    db.execute("CREATE TABLE t (a)")
    db.commit()
    db.close()
    _use_file_database(monkeypatch, sound)
    await module._check(hass, events)

    assert events.states[0][0] == "damaged" and "missing from index" in events.states[0][1][0]
    assert events.states[1] == ("ok", [])


def test_a_database_server_is_asked_for_its_size(monkeypatch) -> None:
    from types import SimpleNamespace

    instance = SimpleNamespace(dialect_name="mysql", db_url="mysql://u@host/ha")
    monkeypatch.setattr("homeassistant.components.recorder.get_instance", lambda hass: instance)
    asked = []
    monkeypatch.setattr(module, "server_size", lambda hass, dialect: asked.append(dialect) or 5000)
    files = module.database_files(None)
    assert files["db_bytes"] == 5000 and files["estimated"] is True and files["wal_bytes"] is None
    assert module.database_files(None, False)["db_bytes"] is None and asked == ["mysql"]
