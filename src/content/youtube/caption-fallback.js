const DEFAULT_SLOT_LIMIT = 16;
const DEFAULT_SUPERSEDED_LIMIT = 64;

function normalizeLimit(value) {
	const number = Math.floor(Number(value));

	return Number.isFinite(number) && number > 0
		? number
		: DEFAULT_SUPERSEDED_LIMIT;
}

function createCaptionFallbackStore(options = {}) {
	const slotLimit = normalizeLimit(options.slotLimit || DEFAULT_SLOT_LIMIT);
	const supersededLimit = normalizeLimit(options.supersededLimit);
	const slots = new Map();
	const slotByActiveId = new Map();
	const supersededIds = new Set();
	let coalescedFallbackCount = 0;
	let supersededResultCount = 0;

	function rememberSupersededId(id) {
		if (!id) {
			return;
		}

		supersededIds.delete(id);
		supersededIds.add(id);
		while (supersededIds.size > supersededLimit) {
			supersededIds.delete(supersededIds.values().next().value);
		}
	}

	function supersedeSlot(slotId) {
		const state = slots.get(slotId);

		if (!state) {
			return false;
		}

		slots.delete(slotId);
		slotByActiveId.delete(state.activeId);
		rememberSupersededId(state.activeId);
		return true;
	}

	function offer(slotId, item) {
		if (!slotId || !item || typeof item.id !== "string") {
			return { accepted: false, coalesced: false };
		}

		const current = slots.get(slotId);

		if (!current) {
			if (slotByActiveId.has(item.id) || slots.size >= slotLimit) {
				return { accepted: false, coalesced: false };
			}

			slots.set(slotId, {
				activeId: item.id,
				activeText: String(item.text || ""),
				latest: null,
			});
			slotByActiveId.set(item.id, slotId);
			return { accepted: true, coalesced: false };
		}

		const itemText = String(item.text || "");

		if (
			(current.activeId === item.id && current.activeText === itemText) ||
			(current.latest?.id === item.id && current.latest?.text === itemText)
		) {
			return { accepted: false, coalesced: false };
		}

		coalescedFallbackCount += 1;
		current.latest = { id: item.id, text: itemText };
		return { accepted: false, coalesced: true };
	}

	function retain(activeSlotIds) {
		const active = activeSlotIds instanceof Set ? activeSlotIds : new Set();

		for (const slotId of slots.keys()) {
			if (!active.has(slotId)) {
				supersedeSlot(slotId);
			}
		}
	}

	function getLatest(id) {
		const slotId = slotByActiveId.get(id);
		const latest = slotId ? slots.get(slotId)?.latest : null;

		return latest ? { ...latest } : null;
	}

	function settle(id) {
		if (supersededIds.delete(id)) {
			supersededResultCount += 1;
			return { shouldRetry: false, superseded: true, tracked: true };
		}

		const slotId = slotByActiveId.get(id);
		const state = slotId ? slots.get(slotId) : null;

		if (!state || state.activeId !== id) {
			return { shouldRetry: false, superseded: false, tracked: false };
		}

		slots.delete(slotId);
		slotByActiveId.delete(id);
		const shouldRetry = Boolean(state.latest);

		if (shouldRetry) {
			supersededResultCount += 1;
		}

		return {
			shouldRetry,
			superseded: shouldRetry,
			tracked: true,
		};
	}

	function clear() {
		slots.clear();
		slotByActiveId.clear();
		supersededIds.clear();
		coalescedFallbackCount = 0;
		supersededResultCount = 0;
	}

	function getSummary() {
		let latestPendingCount = 0;

		for (const state of slots.values()) {
			if (state.latest) {
				latestPendingCount += 1;
			}
		}

		return {
			activeSlotCount: slots.size,
			coalescedFallbackCount,
			latestPendingCount,
			supersededResultCount,
		};
	}

	return { clear, getLatest, getSummary, offer, retain, settle };
}

const api = { createCaptionFallbackStore };

export { createCaptionFallbackStore };
export default api;
