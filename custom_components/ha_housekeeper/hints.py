"""Which repair hints Home Assistant shows. One switch per group, kept apart from the options so it
takes effect at once.

The hints that point at something broken or about to break are on from the start. The two about
tidying up (orphaned and unavailable entities) and the orphaned statistics are on request, except
for an installation that showed the first two before: it keeps them until you switch them off.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN, HINTS_STORAGE_KEY, STORAGE_KEY, STORAGE_VERSION

# The keys are the ids of the repair hints of the group (see issues.py).
HINT_KEYS = (
    "orphaned_entities",
    "unavailable_entities",
    "broken_automations",
    "scan_health",
    "database_damaged",
    "backup_problem",
    "orphaned_statistics",
)
DEFAULT_ON = frozenset({"broken_automations", "scan_health", "database_damaged", "backup_problem"})
# Shown by every version before the switches; an installation that already ran keeps them.
LEGACY_ON = frozenset({"orphaned_entities", "unavailable_entities"})
SAVE_DELAY = 10


def enabled_hints(hass: HomeAssistant) -> frozenset[str]:
    """The groups that are on; every group while no store is loaded, so nothing is held back."""
    store = hass.data.get(DOMAIN, {}).get("hints")
    return store.enabled if isinstance(store, HintStore) else frozenset(HINT_KEYS)


class HintStore:
    """The groups whose repair hints are on."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, HINTS_STORAGE_KEY)
        self.enabled: frozenset[str] = DEFAULT_ON

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if isinstance(data, dict) and isinstance(data.get("enabled"), list):
            self.enabled = frozenset(key for key in data["enabled"] if key in HINT_KEYS)
            return
        # First start with the switches: the observations only exist where Housekeeper ran before.
        ran_before = await Store(self._hass, STORAGE_VERSION, STORAGE_KEY).async_load() is not None
        self.enabled = DEFAULT_ON | LEGACY_ON if ran_before else DEFAULT_ON
        self._save()

    def set(self, key: str, on: bool) -> None:
        enabled = self.enabled | {key} if on else self.enabled - {key}
        if key in HINT_KEYS and enabled != self.enabled:
            self.enabled = enabled
            self._save()

    def _save(self) -> None:
        self._store.async_delay_save(
            lambda: {"enabled": [key for key in HINT_KEYS if key in self.enabled]}, SAVE_DELAY
        )
