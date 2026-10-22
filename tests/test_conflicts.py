"""Conflicts and loops: the evidence stages and the cases that must not be reported."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from custom_components.ha_housekeeper.conflicts import find
from custom_components.ha_housekeeper.runs import FIELDS, RUNS

TODAY = datetime(2026, 10, 9, tzinfo=UTC).date()


def auto(name, triggers, actions, conditions=()):
    return {
        "entity_id": f"automation.{name}",
        "name": name,
        "status": "active",
        "run_key": f"automation.{name}",
        "triggers": list(triggers),
        "conditions": list(conditions),
        "actions": list(actions),
    }


def call(service, entity_id, **data):
    return {"action": service, "target": {"entity_id": entity_id}, "data": data}


def state(entity_id, to=None):
    return {"trigger": "state", "entity_id": entity_id, **({"to": to} if to else {})}


def runs(key, per_day):
    days = {}
    for back, n in enumerate(per_day):
        counters = [0] * FIELDS
        counters[RUNS] = n
        days[(TODAY - timedelta(days=back)).isoformat()] = {"c": counters}
    return {key: {"days": days}}


def test_opposing_commands_need_a_shared_trigger_or_window_and_gain_evidence_from_runs() -> None:
    on = auto("on", [state("binary_sensor.door")], [call("light.turn_on", "light.hall")])
    off = auto("off", [state("binary_sensor.door")], [call("light.turn_off", "light.hall")])
    other = auto("other", [state("sensor.x")], [call("light.turn_off", "light.hall")])
    result = find([on, off, other], [], {}, TODAY)
    assert [(i["kind"], i["stage"], i["reason"]) for i in result["items"]] == [
        ("opposing", "static", "trigger")
    ]
    both = {**runs("automation.on", [1, 1, 1]), **runs("automation.off", [2, 1, 1])}
    assert find([on, off], [], both, TODAY)["items"][0]["stage"] == "confirmed"
    night = auto(
        "night",
        [{"trigger": "time", "at": "22:00"}],
        [call("climate.set_temperature", "climate.hall", temperature=17)],
        [{"condition": "time", "after": "22:00", "before": "06:00"}],
    )
    comfort = auto(
        "comfort",
        [{"trigger": "time", "at": "21:00"}],
        [call("climate.set_temperature", "climate.hall", temperature=21)],
        [{"condition": "time", "after": "20:00", "before": "23:00"}],
    )
    item = find([night, comfort], [], {}, TODAY)["items"][0]
    assert (item["reason"], item["detail"]) == ("window", "22:00–23:00")
    split_on = auto(
        "split_on", [state("input_boolean.s", "on")], [call("light.turn_on", "light.hall")]
    )
    split_off = auto(
        "split_off", [state("input_boolean.s", "off")], [call("light.turn_off", "light.hall")]
    )
    assert find([split_on, split_off], [], {}, TODAY)["items"] == []
    mixed = auto(
        "mixed",
        [state("input_boolean.s", "on"), state("input_boolean.s")],
        [call("light.turn_on", "light.hall")],
    )
    assert len(find([mixed, split_off], [], {}, TODAY)["items"]) == 1


def test_loops_follow_groups_and_other_automations_but_not_filtered_self_triggers() -> None:
    a = auto(
        "a", [state("input_number.x")], [call("input_number.set_value", "input_number.y", value=1)]
    )
    b = auto(
        "b", [state("input_number.y")], [call("input_number.set_value", "input_number.x", value=2)]
    )
    ring = find([a, b], [], runs("automation.a", [30]) | runs("automation.b", [30]), TODAY)
    assert [(i["kind"], i["stage"]) for i in ring["items"]] == [("loop", "observed")]
    group = auto("g", [state("light.group")], [call("light.turn_off", "light.member")])
    edges = [
        {"source": "entity:light.group", "target": "entity:light.member", "relation": "INCLUDES"}
    ]
    assert find([group], edges, {}, TODAY)["items"][0]["entities"] == [
        "light.member",
        "light.group",
    ]
    quiet = auto("q", [state("light.hall", "on")], [call("light.turn_off", "light.hall")])
    assert find([quiet], [], {}, TODAY)["total"] == 0


def test_commands_that_cannot_make_the_trigger_fire_are_no_loop_and_unknown_ones_stay_static() -> (
    None
):
    snap = auto(
        "snap", [state("camera.drive", "recording")], [call("camera.snapshot", "camera.drive")]
    )
    play = auto(
        "play",
        [state("media_player.roon", "on")],
        [call("media_player.media_play", "media_player.roon")],
    )
    assert find([snap, play], [], {}, TODAY)["total"] == 0
    odd = auto("odd", [state("vacuum.rob", "cleaning")], [call("vacuum.clean_spot", "vacuum.rob")])
    busy = runs("automation.odd", [30])
    assert [i["stage"] for i in find([odd], [], busy, TODAY)["items"]] == ["static"]
