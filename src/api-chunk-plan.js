((root) => {
	const DEFAULT_MAX_BATCH_CHARS = 5000;
	const ProtectedFragments = root.TranslatorProtectedFragments;
	const maskProtectedFragments = ProtectedFragments.maskProtectedFragments;
	const unmaskProtectedFragments = ProtectedFragments.unmaskProtectedFragments;
	const collectPreservedFragments =
		ProtectedFragments.collectPreservedFragments;
	const extractTokensForText = ProtectedFragments.extractTokensForText;
	const SPLIT_BOUNDARIES = [
		{ regex: /\n\s*\n+/g, joiner: "\n\n" },
		{ regex: /\n+/g, joiner: "\n" },
		{ regex: /[.!?。！？]+\s+/g, joiner: " " },
		{ regex: /[,;:，；：、]\s*/g, joiner: " " },
		{ regex: /\s+/g, joiner: " " },
	];

	function normalizeChunkText(text) {
		return String(text || "").trim();
	}

	function splitByBoundary(text, boundary) {
		const parts = [];
		let lastIndex = 0;

		boundary.regex.lastIndex = 0;
		let match = boundary.regex.exec(text);

		while (match !== null) {
			const part = normalizeChunkText(
				text.slice(lastIndex, match.index + match[0].length),
			);

			if (part) {
				parts.push(part);
			}

			lastIndex = match.index + match[0].length;
			match = boundary.regex.exec(text);
		}

		const tail = normalizeChunkText(text.slice(lastIndex));

		if (tail) {
			parts.push(tail);
		}

		return parts;
	}

	function hardSplitText(text, limit) {
		const normalized = normalizeChunkText(text);
		const parts = [];

		for (let index = 0; index < normalized.length; index += limit) {
			parts.push({
				text: normalized.slice(index, index + limit),
				joiner: index + limit < normalized.length ? " " : "",
			});
		}

		return parts;
	}

	function splitTextRecursively(text, limit, level) {
		const normalized = normalizeChunkText(text);
		const boundaryLevel = level || 0;

		if (!normalized) {
			return [];
		}

		if (normalized.length <= limit) {
			return [{ text: normalized, joiner: "" }];
		}

		if (boundaryLevel >= SPLIT_BOUNDARIES.length) {
			return hardSplitText(normalized, limit);
		}

		const boundary = SPLIT_BOUNDARIES[boundaryLevel];
		const parts = splitByBoundary(normalized, boundary);

		if (parts.length <= 1) {
			return splitTextRecursively(normalized, limit, boundaryLevel + 1);
		}

		const descriptors = [];

		for (let index = 0; index < parts.length; index += 1) {
			const part = parts[index];
			const nested =
				part.length <= limit
					? [{ text: part, joiner: "" }]
					: splitTextRecursively(part, limit, boundaryLevel + 1);

			descriptors.push(...nested);

			if (index < parts.length - 1 && descriptors.length > 0) {
				descriptors[descriptors.length - 1].joiner = boundary.joiner;
			}
		}

		return descriptors;
	}

	function chunkTranslationItems(items, maxChars) {
		const limit = maxChars || DEFAULT_MAX_BATCH_CHARS;
		const chunks = [];
		let current = [];
		let currentChars = 0;

		for (const item of items || []) {
			const textLength = (item.text || "").length;

			if (current.length > 0 && currentChars + textLength > limit) {
				chunks.push(current);
				current = [];
				currentChars = 0;
			}

			current.push(item);
			currentChars += textLength;
		}

		if (current.length > 0) {
			chunks.push(current);
		}

		return chunks;
	}

	function createRecursiveChunkPlan(items, maxChars) {
		const limit = maxChars || DEFAULT_MAX_BATCH_CHARS;
		const normalizedItems = [];
		const expandedItems = [];
		const mergePlan = new Map();

		for (const item of items || []) {
			const protectedFragments = maskProtectedFragments(
				item.text,
				item.protectedFragments,
			);
			const normalizedItem = {
				...item,
				maskedText: protectedFragments.maskedText,
				protectedFragments: protectedFragments.tokens,
			};
			const parts = splitTextRecursively(normalizedItem.maskedText, limit, 0);

			normalizedItems.push(normalizedItem);

			if (parts.length <= 1) {
				expandedItems.push({
					id: item.id,
					kind: item.kind || "paragraph",
					text: parts[0]
						? parts[0].text
						: normalizeChunkText(normalizedItem.maskedText),
					sourceId: item.id,
					partIndex: 0,
					partCount: 1,
					joiner: "",
					protectedFragments: extractTokensForText(
						normalizedItem.maskedText,
						normalizedItem.protectedFragments,
					),
				});
				mergePlan.set(item.id, {
					originalId: item.id,
					partIds: [item.id],
					protectedFragments: normalizedItem.protectedFragments,
				});
				continue;
			}

			const partIds = [];

			for (let index = 0; index < parts.length; index += 1) {
				const partId = `${item.id}__part_${index + 1}`;

				expandedItems.push({
					id: partId,
					kind: item.kind || "paragraph",
					text: parts[index].text,
					sourceId: item.id,
					partIndex: index,
					partCount: parts.length,
					joiner: parts[index].joiner,
					protectedFragments: extractTokensForText(
						parts[index].text,
						normalizedItem.protectedFragments,
					),
				});
				partIds.push(partId);
			}

			mergePlan.set(item.id, {
				originalId: item.id,
				partIds,
				protectedFragments: normalizedItem.protectedFragments,
			});
		}

		return {
			chunks: expandedItems.map((item) => [item]),
			expandedItems,
			items: normalizedItems,
			mergePlan,
		};
	}

	function createProgressiveMergeState(plan) {
		return {
			completedSegmentIds: new Set(),
			partTranslations: new Map(),
			expandedById: new Map(
				(plan.expandedItems || []).map((item) => [item.id, item]),
			),
		};
	}

	function consumeProgressiveTranslations(plan, state, translations) {
		const completed = [];
		const touchedSegmentIds = new Set();

		for (const translation of translations || []) {
			state.partTranslations.set(translation.id, translation.translation);

			const meta = state.expandedById.get(translation.id);

			if (meta) {
				touchedSegmentIds.add(meta.sourceId);
			}
		}

		for (const sourceId of touchedSegmentIds) {
			if (state.completedSegmentIds.has(sourceId)) {
				continue;
			}

			const group = plan.mergePlan.get(sourceId);

			if (!group) {
				continue;
			}

			const hasAllParts = group.partIds.every((partId) =>
				state.partTranslations.has(partId),
			);

			if (!hasAllParts) {
				continue;
			}

			let mergedText = "";

			for (const partId of group.partIds) {
				const fragment = state.partTranslations.get(partId);
				const meta = state.expandedById.get(partId);

				if (typeof fragment !== "string" || !meta) {
					continue;
				}

				mergedText += fragment;

				if (meta.joiner) {
					mergedText += meta.joiner;
				}
			}

			const sourceItem = (plan.items || []).find(
				(item) => item.id === sourceId,
			);

			completed.push({
				id: sourceId,
				kind: sourceItem ? sourceItem.kind || "paragraph" : "paragraph",
				sourceText: sourceItem?.text || "",
				translation: unmaskProtectedFragments(
					mergedText.trim(),
					group.protectedFragments,
				),
				protectedFragments: collectPreservedFragments(group.protectedFragments),
			});
			state.completedSegmentIds.add(sourceId);
		}

		return completed;
	}

	function getIncompleteSegmentIds(plan, state) {
		return (plan.items || [])
			.map((item) => item.id)
			.filter((id) => !state.completedSegmentIds.has(id));
	}

	function mergeRecursiveTranslations(plan, translations) {
		const byId = new Map(
			(translations || []).map((item) => [item.id, item.translation]),
		);
		const expandedById = new Map(
			(plan.expandedItems || []).map((item) => [item.id, item]),
		);
		const merged = [];

		for (const item of plan.items || []) {
			const group = plan.mergePlan.get(item.id);

			if (!group) {
				continue;
			}

			let translation = "";

			for (const partId of group.partIds) {
				const fragment = byId.get(partId);
				const meta = expandedById.get(partId);

				if (typeof fragment !== "string" || !meta) {
					continue;
				}

				translation += fragment;

				if (meta.joiner) {
					translation += meta.joiner;
				}
			}

			merged.push({
				id: item.id,
				kind: item.kind || "paragraph",
				sourceText: item.text || "",
				translation: unmaskProtectedFragments(
					translation.trim(),
					group.protectedFragments,
				),
				protectedFragments: collectPreservedFragments(group.protectedFragments),
			});
		}

		return merged;
	}

	const api = {
		DEFAULT_MAX_BATCH_CHARS,
		chunkTranslationItems,
		consumeProgressiveTranslations,
		createProgressiveMergeState,
		createRecursiveChunkPlan,
		getIncompleteSegmentIds,
		mergeRecursiveTranslations,
		normalizeChunkText,
		splitTextRecursively,
	};

	root.TranslatorApiChunkPlan = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
