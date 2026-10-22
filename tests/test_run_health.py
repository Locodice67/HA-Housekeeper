"""Judging runs: every threshold at and just below its boundary, and the static checks."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from custom_components.ha_housekeeper.run_health import evaluate, static_traits
from custom_components.ha_housekeeper.runs import (
    ALREADY,
    CONDITION,
    DUR_MAX,
    DUR_N,
    DUR_SUM,
    ERROR,
    FIELDS,
    MAXED,
    OK,
    RUNS,
    STOPPED,
)

NOW = datetime(2026, 10, 8, 12, 0, tzinfo=UTC)
TODAY = NOW.date()
OBJ = {
    "object_type": "automation",
    "object_id": "automation.demo",
    "automation_id": "demo",
    "name": "Demo",
    "status": "active",
    "mode": "single",
    "max": None,
}


def counters(runs=0, ok=0, cond=0, err=0, already=0, maxed=0, dur_ms=0, dur_max=0, dur_n=0):
    c = [0] * FIELDS
    c[RUNS], c[OK], c[CONDITION], c[ERROR], c[ALREADY], c[MAXED] = (
        runs,
        ok,
        cond,
        err,
        already,
        maxed,
    )
    c[DUR_SUM], c[DUR_MAX], c[DUR_N] = dur_ms, dur_max, dur_n
    return c


def put(days, back, **kw):
    days[(TODAY - timedelta(days=back)).isoformat()] = {
        "c": counters(**kw),
        **({"s": kw.pop("s")} if "s" in kw else {}),
    }


def rate(days, updates=(), actions=None, obj=OBJ):
    result = evaluate(
        {"automation.demo": {"days": days}},
        [obj],
        {"automation.demo": actions},
        set(),
        list(updates),
        NOW,
        None,
    )
    return result["items"][0]["findings"] if result["items"] else []


def kinds(findings):
    return [f["kind"] for f in findings]


def test_failures_need_three_errors_and_a_fifth_of_the_runs() -> None:
    days: dict = {}
    put(days, 0, runs=10, ok=8, err=2)
    assert rate(days) == []
    days = {}
    put(days, 0, runs=15, ok=12, err=3)  # 3 of 15 = 20 %
    found = rate(days)
    assert kinds(found) == ["failing"] and found[0]["level"] == "warn"
    days = {}
    put(days, 0, runs=16, ok=13, err=3)  # 18.75 %
    assert rate(days) == []
    days = {}
    put(days, 0, runs=6, ok=3, err=3)  # 50 %
    assert rate(days)[0]["level"] == "red"


def test_the_failing_step_is_named_only_when_it_repeats() -> None:
    days = {
        (TODAY).isoformat(): {
            "c": counters(runs=6, ok=2, err=4),
            "s": {"action/2": 3, "action/0": 1},
        }
    }
    assert rate(days)[0]["step"] == "action/2"
    days = {
        (TODAY).isoformat(): {
            "c": counters(runs=6, ok=2, err=4),
            "s": {"action/2": 2, "action/0": 2},
        }
    }
    assert rate(days)[0]["step"] is None


def test_runs_outside_the_week_do_not_count() -> None:
    days: dict = {}
    put(days, 7, runs=20, err=20)
    assert rate(days) == []


def test_overlap_counts_already_running_and_max_together() -> None:
    days: dict = {}
    put(days, 0, runs=10, ok=8, already=2)
    assert rate(days) == []
    put(days, 1, runs=10, ok=8, maxed=1)
    assert kinds(rate(days)) == ["overlap"]


def test_never_successful_needs_five_runs_that_ended_badly() -> None:
    days: dict = {}
    put(days, 0, runs=4, err=4)
    assert "never_ok" not in kinds(rate(days))
    days = {}
    put(days, 0, runs=5, err=5)
    assert "never_ok" in kinds(rate(days))
    days = {}
    put(days, 0, runs=30, cond=30)  # only conditions: not "never ok", but no effect
    assert kinds(rate(days)) == ["no_effect"]


def test_no_effect_needs_twenty_runs_and_ninety_percent() -> None:
    days: dict = {}
    put(days, 0, runs=19, cond=19)
    assert rate(days) == []
    days = {}
    put(days, 0, runs=20, ok=2, cond=18)
    assert kinds(rate(days)) == ["no_effect"]
    days = {}
    put(days, 0, runs=21, ok=3, cond=18)  # 85.7 %
    assert rate(days) == []


def test_a_burst_is_measured_against_the_automations_own_normal() -> None:
    days: dict = {}
    for back in range(0, 7):
        put(days, back, runs=500, ok=500)
    for back in range(7, 14):
        put(days, back, runs=100, ok=100)
    assert kinds(rate(days)) == ["burst"]  # 5x and at least 100 a day
    days = {}
    for back in range(0, 7):
        put(days, back, runs=499, ok=499)
    for back in range(7, 14):
        put(days, back, runs=100, ok=100)
    assert rate(days) == []
    days = {}
    for back in range(0, 7):
        put(days, back, runs=99, ok=99)
    for back in range(7, 14):
        put(days, back, runs=1, ok=1)
    assert rate(days) == []  # fifty-fold but below 100 a day
    days = {}
    for back in range(0, 7):
        put(days, back, runs=500, ok=500)
    for back in range(7, 13):  # only six baseline days: no verdict
        put(days, back, runs=1, ok=1)
    assert rate(days) == []


def test_long_runs_need_ten_times_the_normal_and_a_minute() -> None:
    def build(longest, normal_ms=1000):
        days: dict = {}
        put(days, 0, runs=2, ok=2, dur_ms=longest, dur_max=longest, dur_n=2)
        for back in range(7, 14):
            put(days, back, runs=2, ok=2, dur_ms=normal_ms * 2, dur_max=normal_ms, dur_n=2)
        return days

    assert kinds(rate(build(60_000))) == ["long_run"]
    assert rate(build(59_999)) == []
    assert rate(build(60_000, normal_ms=6001)) == []  # under ten times the normal


def test_the_error_rate_before_and_after_an_update() -> None:
    update = {"kind": "ha_version", "at": (NOW - timedelta(days=4)).isoformat(), "to": "2026.10.0"}

    def build(before_err, after_err):
        days: dict = {}
        for back in range(5, 12):  # before the update day (back 4)
            put(days, back, runs=2, ok=2 - (1 if before_err and back < 5 + before_err else 0))
        for back in range(0, 4):
            put(days, back, runs=3, ok=3 - after_err[back], err=after_err[back])
        return days

    days = build(0, [1, 1, 1, 0])  # before 14 runs/0 errors; after 12 runs/3 errors (25 %)
    found = rate(days, [update])
    assert kinds(found) == ["after_update"] and found[0]["rate_after"] == 25
    assert found[0]["to"] == "2026.10.0"
    days = build(0, [1, 1, 0, 0])  # only two errors
    assert rate(days, [update]) == []
    short = {}
    put(short, 5, runs=9, ok=9)
    put(short, 0, runs=12, ok=6, err=6)
    assert "after_update" not in kinds(rate(short, [update]))  # fewer than ten runs before


def test_an_update_outside_the_lookback_is_ignored() -> None:
    old = {"kind": "ha_version", "at": (NOW - timedelta(days=15)).isoformat()}
    days: dict = {}
    for back in range(0, 7):
        put(days, back, runs=5, ok=1, err=4)
    assert "after_update" not in kinds(rate(days, [old]))


def test_static_traits_in_nested_actions() -> None:
    actions = [
        {"delay": "00:05:00"},
        {"choose": [{"sequence": [{"wait_template": "{{ true }}"}]}]},
        {"service": "x.y", "continue_on_error": True},
        {"repeat": {"sequence": [{"wait_for_trigger": [], "timeout": {"minutes": 10}}]}},
        {"delay": "{{ states('input_number.n') }}"},
    ]
    traits = static_traits(actions)
    assert traits == {"long_wait": 600.0, "unbounded": 1, "continue_on_error": 1}
    assert static_traits([{"delay": 299}])["long_wait"] == 299.0
    assert static_traits(None) == {"long_wait": 0.0, "unbounded": 0, "continue_on_error": 0}


def test_static_findings_use_the_threshold_of_five_minutes() -> None:
    assert rate({}, actions=[{"delay": "00:04:59"}]) == []
    found = rate(
        {}, actions=[{"delay": "00:05:00"}, {"wait_template": "x"}, {"continue_on_error": True}]
    )
    assert kinds(found) == ["long_wait", "wait_no_timeout", "continue_on_error"]
    assert all(f["level"] == "info" for f in found)


def test_ignored_and_unknown_automations_are_left_out_and_rows_are_ranked() -> None:
    days: dict = {}
    put(days, 0, runs=10, ok=2, err=8)
    quiet: dict = {}
    put(quiet, 0, runs=40, ok=40)
    other = {**OBJ, "object_id": "automation.other", "automation_id": "other", "name": "Other"}
    items = {
        "automation.demo": {"days": days},
        "automation.other": {"days": quiet},
        "automation.gone": {"days": days},
    }
    result = evaluate(items, [OBJ, other], {}, set(), [], NOW, "2026-10-01T00:00:00+00:00")
    assert [r["entity_id"] for r in result["items"]] == ["automation.demo", "automation.other"]
    assert result["since"] == "2026-10-01T00:00:00+00:00" and result["total"] == 2
    muted = evaluate(items, [OBJ, other], {}, {"automation.demo"}, [], NOW, None)
    assert [r["entity_id"] for r in muted["items"]] == ["automation.other"]
    row = result["items"][0]
    assert row["per_day"] == [0, 0, 0, 0, 0, 0, 10] and row["errors"] == 8
    assert len(row["per_day_30"]) == 30 and row["per_day_30"][-1] == 10


def test_a_script_is_keyed_by_its_entity_id() -> None:
    script = {
        "object_type": "script",
        "object_id": "script.night",
        "name": "Night",
        "status": "active",
    }
    days: dict = {}
    put(days, 0, runs=6, err=6)
    result = evaluate({"script.night": {"days": days}}, [script], {}, set(), [], NOW, None)
    assert [f["kind"] for f in result["items"][0]["findings"]] == ["failing", "never_ok"]


def test_the_result_counts_the_automations_it_left_out() -> None:
    other = {**OBJ, "object_id": "automation.other", "automation_id": "other", "name": "Other"}
    result = evaluate({}, [OBJ, other], {}, {"automation.other"}, [], NOW, None)
    assert result["excluded"] == {"ignored": 1}
    assert evaluate({}, [OBJ], {}, set(), [], NOW, None)["excluded"] == {"ignored": 0}


def test_a_run_that_stopped_at_a_condition_of_the_actions_is_not_a_failure() -> None:
    c = counters(runs=7)
    c[STOPPED] = 7
    entry = {"c": c, "a": {"action/1": 7}}
    days = {TODAY.isoformat(): entry}
    actions = [{"action": "script.a"}, {"condition": "template", "value_template": "{{ x }}"}]
    assert "never_ok" not in kinds(rate(days, actions=actions))
    assert "never_ok" in kinds(rate(days, actions=[{"action": "script.a"}, {"delay": 5}]))
