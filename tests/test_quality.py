"""The quality view: what it rates and what it leaves alone."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from custom_components.ha_housekeeper.quality import build

CRITERIA = SimpleNamespace(items={}, stats=lambda *_: {"ok": 0, "missed": 0})


def entity(entity_id, status, **extra):
    return {"object_type": "entity", "object_id": entity_id, "status": status, **extra}


def automation(entity_id, status="active"):
    return {
        "object_type": "automation",
        "object_id": entity_id,
        "name": entity_id,
        "status": status,
    }


def integrity(objects):
    edges = [
        {"source": f"automation:{o['object_id']}", "target": f"entity:{t}", "relation": rel}
        for o in objects
        if o["object_type"] == "automation"
        for t, rel in (("light.a", "TARGETS"), ("light.b", "TARGETS"), ("light.c", "TARGETS"))
    ]
    snapshot = {"objects": objects, "edges": edges, "findings": []}
    rows = build(snapshot, {}, [], CRITERIA, date(2026, 10, 9), lambda _: None)["items"]
    return {row["entity_id"]: row["dimensions"]["integrity"] for row in rows}


def test_stale_targets_skip_decided_entities_and_disabled_automations() -> None:
    objects = [
        entity("light.a", "unavailable", mark={"kind": "expected_offline"}),
        entity("light.b", "disabled", reason="integration_disabled"),
        entity("light.c", "unavailable"),
        automation("automation.live"),
        automation("automation.off", "disabled"),
    ]
    found = integrity(objects)
    assert (
        found["automation.live"]["level"] == "warn"
        and found["automation.live"]["reasons"][0]["count"] == 1
    )
    assert found["automation.off"]["level"] == "ok"
