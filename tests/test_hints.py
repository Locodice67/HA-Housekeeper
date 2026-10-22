"""The switches of the repair hints: what is on from the start, what an older installation keeps."""

from __future__ import annotations

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from homeassistant.core import HomeAssistant  # noqa: E402
from homeassistant.helpers import issue_registry as ir  # noqa: E402
from homeassistant.helpers.storage import Store  # noqa: E402

from custom_components.ha_housekeeper.const import DOMAIN, STORAGE_KEY  # noqa: E402
from custom_components.ha_housekeeper.hints import (  # noqa: E402
    DEFAULT_ON,
    HINT_KEYS,
    LEGACY_ON,
    HintStore,
)
from custom_components.ha_housekeeper.issues import ISSUE_IDS, async_sync_issues  # noqa: E402


async def test_a_new_installation_starts_with_the_hints_that_matter(hass: HomeAssistant) -> None:
    store = HintStore(hass)
    await store.async_load()
    assert store.enabled == DEFAULT_ON
    assert set(ISSUE_IDS) <= set(HINT_KEYS)


async def test_an_installation_that_ran_before_keeps_its_hints(hass: HomeAssistant) -> None:
    await Store(hass, 1, STORAGE_KEY).async_save({"items": {}})
    store = HintStore(hass)
    await store.async_load()
    assert store.enabled == DEFAULT_ON | LEGACY_ON


async def test_a_group_that_is_off_raises_no_hint_and_loses_its_hint(hass: HomeAssistant) -> None:
    store = hass.data.setdefault(DOMAIN, {})["hints"] = HintStore(hass)
    findings = [{"classification": "unavailable"}]
    async_sync_issues(hass, findings)  # off from the start
    assert ir.async_get(hass).async_get_issue(DOMAIN, "unavailable_entities") is None
    store.set("unavailable_entities", True)
    async_sync_issues(hass, findings)
    assert ir.async_get(hass).async_get_issue(DOMAIN, "unavailable_entities") is not None
    store.set("unavailable_entities", False)
    async_sync_issues(hass, findings)
    assert ir.async_get(hass).async_get_issue(DOMAIN, "unavailable_entities") is None


async def test_the_switches_turn_a_group_off_at_once(
    hass: HomeAssistant, enable_custom_integrations: None
) -> None:
    from homeassistant import config_entries

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done(wait_background_tasks=True)
    states = {s.entity_id: s for s in hass.states.async_all("switch")}
    assert len(states) == len(HINT_KEYS)
    switch = "switch.ha_housekeeper_repair_hint_broken_references"
    assert states[switch].state == "on"
    await hass.services.async_call("switch", "turn_off", {"entity_id": switch}, blocking=True)
    assert hass.states.get(switch).state == "off"
