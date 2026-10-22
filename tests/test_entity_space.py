"""Space per entity: the ranking over states and attributes, and the keys of one entity."""

from __future__ import annotations

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402
from pytest_homeassistant_custom_component.components.recorder.common import (  # noqa: E402
    async_wait_recording_done,
)

from custom_components.ha_housekeeper import entity_space as module  # noqa: E402
from custom_components.ha_housekeeper.queries import ReplyStore  # noqa: E402


async def test_the_entity_with_changing_large_attributes_comes_first_and_names_its_key(
    recorder_mock, hass: HomeAssistant, monkeypatch
) -> None:
    monkeypatch.setattr(module, "PAUSE", 0)
    for i in range(5):
        hass.states.async_set("weather.home", "sunny", {"forecast": [i] * 400, "source": "x" * 50})
        hass.states.async_set("sensor.calm", str(i))
    await async_wait_recording_done(hass)

    store = ReplyStore(hass)
    assert await module.start(hass, store) is True
    await hass.data["ha_housekeeper"]["space_run"].task
    result = module.status(hass, store)["result"]
    assert result["state"] == "done" and result["read_share"] == 1.0
    top = result["entities"][0]
    assert top["entity_id"] == "weather.home" and top["rows"] == 5 and top["variants"] == 5

    keys = await module.entity_attributes(hass, "weather.home")
    assert keys["total"] == 5 and keys["read"] == 5
    first = keys["keys"][0]
    assert first["key"] == "forecast" and first["driver"] and first["alone"] == 4
    assert not next(k for k in keys["keys"] if k["key"] == "source")["driver"]


def test_a_shared_attribute_row_is_split_and_an_unused_one_stays_loose() -> None:
    run = module.SpaceRun(
        started=0.0,
        tables={},
        estimated=False,
        names={1: "sensor.a", 2: "sensor.b"},
        states_range=None,
        attrs_range=None,
    )
    module.add_attrs(run, {10: 100, 11: 40}, {10: [1, 2]})
    assert run.attrs[1] == [0.5, 50.0, 1.0] and run.attrs[2] == [0.5, 50.0, 1.0]
    assert run.loose_attrs == [1, 40]
