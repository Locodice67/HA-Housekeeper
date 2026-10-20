"""Hand a scanner to the integration the way a loaded config entry does, without setting it up."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.ha_housekeeper.const import DOMAIN
from custom_components.ha_housekeeper.inventory import InventoryScanner


def attach_scanner(hass: HomeAssistant, scanner: InventoryScanner) -> MockConfigEntry:
    """Add a loaded entry that carries the scanner as its runtime data."""
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    entry.runtime_data = scanner
    entry.mock_state(hass, ConfigEntryState.LOADED)
    return entry
