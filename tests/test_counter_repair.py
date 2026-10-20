"""Counter glitches: finding a wrong reading of a meter and repairing the recorder rows it left."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

pytest.importorskip("homeassistant")

from custom_components.ha_housekeeper.counter_repair import (  # noqa: E402
    REF,
    analyse,
    build_changes,
    find_runs,
    fingerprint,
)

START = datetime(2026, 10, 1, tzinfo=UTC).timestamp()
HOUR = 3600


def ha_sums(states: list[float], increasing: bool = True) -> list[float]:
    """The ``sum`` Home Assistant compiles from these readings (sensor/recorder.py)."""
    total, old, new = 0.0, states[0], states[0]
    result = [0.0]
    for value in states[1:]:
        reset = increasing and value < 0.9 * new
        if reset:
            total += new - old
            new, old = value, 0.0
        else:
            new = value
        result.append(total + new - old)
    return result


def hourly(states: list[float], increasing: bool = True) -> list[dict]:
    sums = ha_sums(states, increasing)
    return [
        {"id": i + 1, "ts": START + i * HOUR - REF["long_term"], "state": s, "sum": m}
        for i, (s, m) in enumerate(zip(states, sums, strict=True))
    ]


def water(dip: tuple[int, int] = (20, 30), low: float = 41.5) -> tuple[list[float], list[float]]:
    clean = [91.5 + 0.01 * i for i in range(48)]
    glitchy = [low if dip[0] <= i < dip[1] else v for i, v in enumerate(clean)]
    return clean, glitchy


def apply(rows: list[dict], block: dict) -> list[dict]:
    """What the recorder holds after the tails and the rewritten rows were written."""
    result = [dict(row) for row in rows]
    for tail in block["tails"]:
        for row in result:
            if row["ts"] >= tail["from"]:
                row["sum"] -= tail["offset"]
    by_id = {row["id"]: row for row in result}
    for change in block["rows"]:
        by_id[change["id"]]["state"], by_id[change["id"]]["sum"] = change["new"]
    return result


def test_a_dip_that_comes_back_is_found_and_a_reset_is_not() -> None:
    clean, glitchy = water()
    (finding,) = analyse([], hourly(glitchy))
    assert finding["low"] == 41.5 and finding["count"] == {"long_term": 10}
    assert finding["lo"] == pytest.approx(clean[19]) and finding["hi"] == pytest.approx(clean[30])
    assert analyse([], hourly(clean)) == []
    # A meter that restarts and keeps counting from low is a real change, not a glitch.
    reset = [100.0 + i for i in range(30)] + [5.0 + i for i in range(30)]
    assert find_runs([(i * HOUR, v) for i, v in enumerate(reset)]) == []
    # Neither is a value that stays wrong longer than the limit.
    assert analyse([], hourly(water((10, 40))[1])) == []
    # A glitch that is still going on has no good value after it yet.
    assert analyse([], hourly(water((40, 48))[1])) == []


def test_a_spike_up_is_found_too() -> None:
    spiked = [10.0 + 0.1 * i for i in range(40)]
    spiked[15:18] = [900.0, 900.0, 900.0]
    (finding,) = analyse([], hourly(spiked, increasing=False))
    assert finding["high"] == 900.0 and finding["count"]["long_term"] == 3


@pytest.mark.parametrize("increasing", [True, False])
def test_the_repaired_hourly_rows_match_a_series_that_never_had_the_glitch(increasing) -> None:
    clean, glitchy = water()
    rows = hourly(glitchy, increasing)
    findings = analyse([], rows)
    changes = build_changes(findings, [], rows, [], "hold")
    fixed = apply(rows, changes["long_term"])
    # Hold the last good value through the glitch; the readings after it are the real ones.
    held = [clean[19] if 20 <= i < 30 else v for i, v in enumerate(clean)]
    expected = ha_sums(held, increasing)
    assert [r["state"] for r in fixed] == pytest.approx(held)
    assert [r["sum"] for r in fixed] == pytest.approx(expected)
    if increasing:  # HA counted the reading at the glitch start as new consumption again
        assert changes["long_term"]["tails"][0]["offset"] == pytest.approx(clean[19])
    else:
        assert changes["long_term"]["tails"] == []


def test_a_glitch_inside_one_hour_only_needs_the_sum_offset() -> None:
    short = []
    for i in range(24 * 12):
        value = 91.5 + 0.001 * i
        if 100 <= i < 106:
            value = 41.5
        short.append(value)
    sums = ha_sums(short)
    short_rows = [
        {"id": i + 1, "ts": START + i * 300, "state": s, "sum": m}
        for i, (s, m) in enumerate(zip(short, sums, strict=True))
    ]
    # The hourly row is the last 5-minute row of its hour: no hour ends inside the glitch.
    long_rows = [
        {
            "id": h + 1,
            "ts": START + h * HOUR,
            "state": short[h * 12 + 11],
            "sum": sums[h * 12 + 11],
        }
        for h in range(24)
    ]
    (finding,) = analyse(short_rows, long_rows)
    assert finding["count"] == {"short_term": 6}
    changes = build_changes([finding], short_rows, long_rows, [], "hold")
    assert changes["counts"]["short_term"] == 6 and changes["counts"]["long_term"] == 0
    assert changes["long_term"]["tails"][0]["offset"] == pytest.approx(
        changes["short_term"]["tails"][0]["offset"]
    )
    fixed = apply(long_rows, changes["long_term"])
    clean_sums = ha_sums([91.5 + 0.001 * i for i in range(24 * 12)])
    assert [r["sum"] for r in fixed] == pytest.approx([clean_sums[h * 12 + 11] for h in range(24)])


def test_raw_states_are_replaced_only_where_they_are_wrong() -> None:
    clean, glitchy = water()
    rows = hourly(glitchy)
    findings = analyse([], rows)
    start = findings[0]["start"]
    states = [
        {"id": 1, "ts": start + 10, "state": "91.7"},
        {"id": 2, "ts": start + HOUR * 5, "state": "41.5"},
        {"id": 3, "ts": start + HOUR * 6, "state": "unavailable"},
        {"id": 4, "ts": start + HOUR * 40, "state": "41.5"},
    ]
    changes = build_changes(findings, [], rows, states, "hold")
    assert [(c["id"], c["old"]) for c in changes["states"]] == [(2, "41.5")]
    assert float(changes["states"][0]["new"]) == pytest.approx(clean[19])


def test_interpolation_follows_the_line_between_the_good_values() -> None:
    _, glitchy = water()
    rows = hourly(glitchy)
    findings = analyse([], rows)
    changes = build_changes(findings, [], rows, [], "interpolate")
    new = [c["new"][0] for c in changes["long_term"]["rows"]]
    assert new == sorted(new) and findings[0]["lo"] < new[0] and new[-1] < findings[0]["hi"]


def test_the_fingerprint_follows_the_data_and_the_mode() -> None:
    _, glitchy = water()
    rows = hourly(glitchy)
    findings = analyse([], rows)
    counts = build_changes(findings, [], rows, [], "hold")["counts"]
    assert fingerprint(findings, counts, "hold") == fingerprint(findings, counts, "hold")
    assert fingerprint(findings, counts, "hold") != fingerprint(findings, counts, "interpolate")
    other = analyse([], hourly(water((20, 31))[1]))
    assert fingerprint(other, counts, "hold") != fingerprint(findings, counts, "hold")


def test_a_table_without_a_good_row_before_is_skipped_not_guessed() -> None:
    _, glitchy = water()
    rows = hourly(glitchy)
    findings = analyse([], rows)
    short = [
        {"id": 1, "ts": findings[0]["bad_first"] + 300, "state": 41.5, "sum": 41.5},
        {"id": 2, "ts": findings[0]["bad_first"] + 600, "state": 41.5, "sum": 41.5},
    ]
    changes = build_changes(findings, short, rows, [], "hold")
    assert changes["short_term"]["rows"] == []
    assert changes["short_term"]["skipped"][0]["reason"] == "no_before"


# ---- with a real recorder --------------------------------------------------------------------

SENSOR = "sensor.water_meter"
BASE = datetime(2026, 10, 1, tzinfo=UTC)


def _seed(hass, clean_states: list[float], glitchy: list[float]) -> None:
    """Blocking: hourly and 5-minute rows plus raw states of a water meter with a glitch."""
    from homeassistant.components.recorder.db_schema import (
        States,
        StatesMeta,
        StatisticsMeta,
        StatisticsShortTerm,
    )
    from homeassistant.components.recorder.util import session_scope
    from sqlalchemy import select

    sums = ha_sums(glitchy)
    with session_scope(hass=hass) as session:
        meta_id = session.execute(
            select(StatisticsMeta.id).where(StatisticsMeta.statistic_id == SENSOR)
        ).scalar_one()
        for i in range(len(glitchy)):
            session.add(
                StatisticsShortTerm(
                    metadata_id=meta_id,
                    start_ts=(BASE + timedelta(hours=i, minutes=55)).timestamp(),
                    state=glitchy[i],
                    sum=sums[i],
                )
            )
        states_meta = StatesMeta(entity_id=SENSOR)
        session.add(states_meta)
        session.flush()
        for i, value in ((18, clean_states[18]), (21, 41.5), (22, 41.5), (24, 41.5), (31, 91.9)):
            session.add(
                States(
                    state=format(value, ".12g"),
                    metadata_id=states_meta.metadata_id,
                    last_updated_ts=(BASE + timedelta(hours=i, minutes=30)).timestamp(),
                    last_changed_ts=(BASE + timedelta(hours=i, minutes=30)).timestamp(),
                )
            )


def _dump(hass) -> dict:
    from homeassistant.components.recorder.db_schema import States, Statistics, StatisticsShortTerm
    from homeassistant.components.recorder.util import session_scope
    from sqlalchemy import select

    with session_scope(hass=hass, read_only=True) as session:
        return {
            "states": [
                r.state for r in session.execute(select(States.state).order_by(States.state_id))
            ],
            "short": [
                (r.state, r.sum)
                for r in session.execute(
                    select(StatisticsShortTerm.state, StatisticsShortTerm.sum).order_by(
                        StatisticsShortTerm.start_ts
                    )
                )
            ],
            "long": [
                (r.state, r.sum)
                for r in session.execute(
                    select(Statistics.state, Statistics.sum).order_by(Statistics.start_ts)
                )
            ],
        }


async def test_the_repair_writes_all_three_tables_verifies_and_can_be_undone(
    recorder_mock, hass
) -> None:
    from unittest.mock import patch

    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.models import StatisticMeanType
    from homeassistant.components.recorder.statistics import async_import_statistics
    from pytest_homeassistant_custom_component.components.recorder.common import (
        async_wait_recording_done,
    )
    from test_cleanup_exec import fake_backup, make_scanner, run

    from custom_components.ha_housekeeper import counter_repair
    from custom_components.ha_housekeeper.cleanup import build_plan

    clean, glitchy = water()
    sums = ha_sums(glitchy)
    async_import_statistics(
        hass,
        {
            "mean_type": StatisticMeanType.NONE,
            "has_sum": True,
            "name": None,
            "source": "recorder",
            "statistic_id": SENSOR,
            "unit_class": "volume",
            "unit_of_measurement": "m³",
        },
        [
            {"start": BASE + timedelta(hours=i), "state": glitchy[i], "sum": sums[i]}
            for i in range(len(glitchy))
        ],
    )
    await async_wait_recording_done(hass)
    instance = get_instance(hass)
    await instance.async_add_executor_job(_seed, hass, clean, glitchy)
    before = await instance.async_add_executor_job(_dump, hass)

    scanner = await make_scanner(hass)
    snapshot = await scanner.async_scan()
    snapshot["meta"]["recorder_available"] = True
    found = await counter_repair.prepare(hass, SENSOR, "hold")
    assert found["error"] is None and found["counts"]["states"] == 3
    assert found["counts"]["long_term"] == 10 and found["counts"]["short_term"] == 10
    plan = build_plan(
        snapshot,
        [{"kind": "repair_counter", "object_id": SENSOR, "mode": "hold"}],
        datetime.now(UTC),
        counter_data={(SENSOR, "hold", None, None, None): found},
    )
    scanner.journal.add(plan)
    action = plan["actions"][0]
    assert action["verdict"] == "review" and action["executable"] is True

    manager, create = fake_backup()
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        await run(scanner, plan, [SENSOR])
        create.assert_awaited_once()  # the database is written: a backup comes first

    assert plan["status"] == "verified", plan["actions"][0].get("result")
    held = [clean[19] if 20 <= i < 30 else v for i, v in enumerate(clean)]
    expected_sums = ha_sums(held)
    after = await instance.async_add_executor_job(_dump, hass)
    assert [s for s, _ in after["long"]] == pytest.approx(held)
    assert [m for _, m in after["long"]] == pytest.approx(expected_sums)
    assert [m for _, m in after["short"]] == pytest.approx(expected_sums)
    assert [float(s) for s in after["states"]] == pytest.approx(
        [clean[18]] + [clean[19]] * 3 + [91.9]
    )
    assert (await counter_repair.prepare(hass, SENSOR, "hold"))["error"] == "nothing_found"

    undo = await scanner.cleanup.undo(plan["plan_id"], None)
    assert undo["results"] == [{"object_id": SENSOR, "outcome": "undone"}]
    assert await instance.async_add_executor_job(_dump, hass) == before

    # Once someone else changed a row, undoing it would overwrite their change: it is refused.
    again = build_plan(
        snapshot,
        [{"kind": "repair_counter", "object_id": SENSOR, "mode": "interpolate"}],
        datetime.now(UTC),
        counter_data={
            (SENSOR, "interpolate", None, None, None): await counter_repair.prepare(
                hass, SENSOR, "interpolate"
            )
        },
    )
    scanner.journal.add(again)
    with patch("homeassistant.components.backup.async_get_manager", return_value=manager):
        await run(scanner, again, [SENSOR])
    written = again["actions"][0]["result"]["counter"]
    written["tables"]["long_term"]["rows"][0]["new"][1] += 5
    assert (await scanner.cleanup.undo(again["plan_id"], None))["results"][0][
        "outcome"
    ] == "conflict_partial"  # the changed row stays, every other row is put back
    assert len(written["tables"]["long_term"]["rows"]) == 1
    assert (await scanner.cleanup.undo(again["plan_id"], None))["results"][0][
        "outcome"
    ] == "conflict_changed"


def test_a_measurement_range_rebuilds_the_hours_from_the_corrected_five_minute_rows() -> None:
    from custom_components.ha_housekeeper.counter_repair import measurement_changes

    def row(i, ts, mean, low=None, high=None):
        return {"id": i, "ts": ts, "mean": mean, "min": low or mean, "max": high or mean}

    # Two hours: the first has 12 five-minute rows with a spike, the second has none left.
    short = [row(i, START + i * 300, 85.0 if 3 <= i < 6 else 20.0) for i in range(12)]
    long_rows = [row(100, START, 25.0, 20.0, 85.0), row(101, START + HOUR, 90.0, 85.0, 95.0)]
    finding = {
        "bad_first": START + 900,
        "bad_last": START + 1799,
        "bracket": [START + 600, 20.0, START + HOUR + 7200, 24.0],
        "fixed": None,
    }
    changes = measurement_changes(short, long_rows, [], finding, "hold")
    assert [r["id"] for r in changes["short_term"]["rows"]] == [3, 4, 5]
    hour = changes["long_term"]["rows"]
    assert [r["id"] for r in hour] == [100] and hour[0]["new"] == [20.0, 20.0, 20.0]
    assert changes["counts"]["estimated_long_term"] == 0

    # The second hour is partly inside the range and has no 5-minute rows: it is an estimate.
    finding["bad_last"] = START + HOUR + 600
    changes = measurement_changes(short, long_rows, [], finding, "hold")
    assert changes["counts"]["estimated_long_term"] == 1
    assert [r["id"] for r in changes["long_term"]["rows"]] == [100, 101]
    assert changes["long_term"]["rows"][1]["new"] == [20.0, 20.0, 20.0]


async def test_a_picked_counter_range_is_cleaned_in_all_tables_and_undone(
    recorder_mock, hass
) -> None:
    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.models import StatisticMeanType
    from homeassistant.components.recorder.statistics import async_import_statistics
    from pytest_homeassistant_custom_component.components.recorder.common import (
        async_wait_recording_done,
    )

    from custom_components.ha_housekeeper import counter_repair

    clean, glitchy = water()
    sums = ha_sums(glitchy)
    async_import_statistics(
        hass,
        {
            "mean_type": StatisticMeanType.NONE,
            "has_sum": True,
            "name": None,
            "source": "recorder",
            "statistic_id": SENSOR,
            "unit_class": "volume",
            "unit_of_measurement": "m³",
        },
        [
            {"start": BASE + timedelta(hours=i), "state": glitchy[i], "sum": sums[i]}
            for i in range(len(glitchy))
        ],
    )
    await async_wait_recording_done(hass)
    instance = get_instance(hass)
    await instance.async_add_executor_job(_seed, hass, clean, glitchy)
    before = await instance.async_add_executor_job(_dump, hass)

    rng = {
        "from": (BASE + timedelta(hours=19, minutes=58)).timestamp(),
        "to": (BASE + timedelta(hours=29, minutes=58)).timestamp(),
    }
    found = await counter_repair.prepare(hass, SENSOR, "hold", rng=rng)
    assert found["error"] is None and found["kind"] == "counter"
    assert found["counts"]["states"] == 3 and found["counts"]["long_term"] == 10
    assert found["available"]["long_term"] == 11 and found["detail"]["states"]

    # A fixed value must not break the order of the counter.
    low = await counter_repair.prepare(hass, SENSOR, "fixed", rng={**rng, "fixed": 10.0})
    assert low["error"] == "fixed_outside"
    # A range that stops short of any good reading after it is refused, never guessed.
    late = {**rng, "to": (BASE + timedelta(hours=60)).timestamp()}
    assert (await counter_repair.prepare(hass, SENSOR, "hold", rng=late))["error"] == "no_bracket"

    written = await counter_repair.apply(hass, SENSOR, "hold", found["fingerprint"], rng=rng)
    assert not written.get("error"), written
    held = [clean[19] if 20 <= i < 30 else v for i, v in enumerate(clean)]
    after = await instance.async_add_executor_job(_dump, hass)
    assert [s for s, _ in after["long"]] == pytest.approx(held)
    assert [m for _, m in after["long"]] == pytest.approx(ha_sums(held))
    assert [float(s) for s in after["states"]] == pytest.approx(
        [clean[18]] + [clean[18]] * 3 + [91.9]
    )
    assert (await counter_repair.prepare(hass, SENSOR, "hold", rng=rng))["error"] == "nothing_found"

    assert await counter_repair.undo(hass, written) == "undone"
    assert await instance.async_add_executor_job(_dump, hass) == before


def _seed_measurement(hass) -> None:
    """Blocking: five-minute rows with a spike for a measurement that has hourly rows already."""
    from homeassistant.components.recorder.db_schema import StatisticsMeta, StatisticsShortTerm
    from homeassistant.components.recorder.util import session_scope
    from sqlalchemy import select

    with session_scope(hass=hass) as session:
        meta_id = session.execute(
            select(StatisticsMeta.id).where(StatisticsMeta.statistic_id == TEMPERATURE)
        ).scalar_one()
        for i in range(48 * 12):
            value = 85.0 if 120 <= i < 126 else 20.0 + (i % 12) * 0.01
            session.add(
                StatisticsShortTerm(
                    metadata_id=meta_id,
                    start_ts=(BASE + timedelta(minutes=5 * i)).timestamp(),
                    mean=value,
                    min=value,
                    max=value,
                )
            )


def _dump_measurement(hass) -> dict:
    from homeassistant.components.recorder.db_schema import Statistics, StatisticsShortTerm
    from homeassistant.components.recorder.util import session_scope
    from sqlalchemy import select

    with session_scope(hass=hass, read_only=True) as session:
        return {
            "short": [
                (r.mean, r.min, r.max)
                for r in session.execute(
                    select(
                        StatisticsShortTerm.mean, StatisticsShortTerm.min, StatisticsShortTerm.max
                    ).order_by(StatisticsShortTerm.start_ts)
                )
            ],
            "long": [
                (r.mean, r.min, r.max)
                for r in session.execute(
                    select(Statistics.mean, Statistics.min, Statistics.max).order_by(
                        Statistics.start_ts
                    )
                )
            ],
        }


TEMPERATURE = "sensor.boiler_temperature"


async def test_a_picked_measurement_range_is_replaced_and_undone(recorder_mock, hass) -> None:
    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.models import StatisticMeanType
    from homeassistant.components.recorder.statistics import async_import_statistics
    from pytest_homeassistant_custom_component.components.recorder.common import (
        async_wait_recording_done,
    )

    from custom_components.ha_housekeeper import counter_repair

    async_import_statistics(
        hass,
        {
            "mean_type": StatisticMeanType.ARITHMETIC,
            "has_sum": False,
            "name": None,
            "source": "recorder",
            "statistic_id": TEMPERATURE,
            "unit_class": "temperature",
            "unit_of_measurement": "°C",
        },
        [
            {
                "start": BASE + timedelta(hours=i),
                "mean": 85.0 if i == 10 else 20.0,
                "min": 20.0,
                "max": 85.0 if i == 10 else 20.1,
            }
            for i in range(48)
        ],
    )
    await async_wait_recording_done(hass)
    instance = get_instance(hass)
    await instance.async_add_executor_job(_seed_measurement, hass)
    before = await instance.async_add_executor_job(_dump_measurement, hass)

    rng = {
        "from": (BASE + timedelta(hours=10)).timestamp(),
        "to": (BASE + timedelta(hours=10, minutes=29)).timestamp(),
    }
    shown = await counter_repair.series(hass, TEMPERATURE, rng["from"] - 3600, rng["to"] + 3600)
    assert shown["kind"] == "measurement" and shown["table"] == "short_term"
    assert max(v for _, v in shown["points"]) == 85.0
    found = await counter_repair.prepare(hass, TEMPERATURE, "interpolate", rng=rng)
    assert found["error"] is None and found["kind"] == "measurement", found
    assert found["counts"]["short_term"] == 6 and found["counts"]["long_term"] == 1
    assert found["counts"]["estimated_long_term"] == 0

    written = await counter_repair.apply(
        hass, TEMPERATURE, "interpolate", found["fingerprint"], rng=rng
    )
    assert not written.get("error"), written
    after = await instance.async_add_executor_job(_dump_measurement, hass)
    assert max(m for _, _, m in after["short"]) < 21
    assert max(m for _, _, m in after["long"]) < 21
    assert (await counter_repair.prepare(hass, TEMPERATURE, "interpolate", rng=rng))["error"] == (
        "nothing_found"
    )
    assert await counter_repair.undo(hass, written) == "undone"
    assert await instance.async_add_executor_job(_dump_measurement, hass) == before


def test_spikes_are_found_only_far_outside_what_the_sensor_normally_reports() -> None:
    from custom_components.ha_housekeeper.counter_repair import find_spikes, suggest_range

    temp = [(i * 300.0, 20.0 + 0.1 * (i % 7)) for i in range(200)]
    for i in (100, 101, 102):
        temp[i] = (temp[i][0], 85.0)
    runs = find_spikes(temp)
    assert [(r["first"], r["last"], r["count"], r["high"]) for r in runs] == [
        (30000.0, 30600.0, 3, 85.0)
    ]
    finding = {"bad_first": 30000.0, "bad_last": 30600.0, "count": {"short_term": 3}}
    assert suggest_range(finding) == {"from": 29850.0, "to": 30749.0}
    # a power sensor that pulses to its normal maximum, a value that stays high and a constant series
    power = [(i * 300.0, 2000.0 if i % 10 < 3 else 0.0) for i in range(200)]
    assert find_spikes(power) == []
    stays = temp[:100] + [(t, 85.0) for t, _ in temp[100:]]
    assert find_spikes(stays) == []
    assert find_spikes([(i * 300.0, 5.0) for i in range(200)]) == []


async def test_the_scan_finds_a_spike_in_a_measurement(recorder_mock, hass) -> None:
    """A temperature with one wrong reading of 500 °C is a measurement with one finding."""
    from homeassistant.components.recorder import get_instance
    from homeassistant.components.recorder.models import StatisticMeanType
    from homeassistant.components.recorder.statistics import async_import_statistics
    from pytest_homeassistant_custom_component.components.recorder.common import (
        async_wait_recording_done,
    )

    from custom_components.ha_housekeeper import counter_repair

    means = [20 + (i % 3) * 0.5 for i in range(40)]
    means[20] = 500.0
    async_import_statistics(
        hass,
        {
            "mean_type": StatisticMeanType.ARITHMETIC,
            "has_sum": False,
            "name": None,
            "source": "recorder",
            "statistic_id": "sensor.temperature",
            "unit_class": "temperature",
            "unit_of_measurement": "°C",
        },
        [
            {"start": BASE + timedelta(hours=i), "mean": m, "min": m, "max": m}
            for i, m in enumerate(means)
        ],
    )
    await async_wait_recording_done(hass)
    found = await get_instance(hass).async_add_executor_job(
        counter_repair.scan_blocking, hass, None, None, counter_repair.MAX_SPAN
    )
    assert found["checked"] == 1
    (item,) = found["items"]
    assert item["statistic_id"] == "sensor.temperature" and item["kind"] == "measurement"
    assert len(item["findings"]) == 1 and item["unit"] == "°C"
