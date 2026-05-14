((root) => {
	const TECH_TERM_REGEX =
		/\b(?:API|LLM|OpenAI|GitHub|Telegram|Markdown|README|Chrome|Yahoo Finance|JSON|HTML|CSS|JavaScript|TypeScript|Node\.js)\b/g;
	const FILE_PATH_REGEX =
		/\b(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w./-]*[\w.-]\b|\b[\w.-]+\.(?:md|txt|json|ya?ml|toml|js|jsx|ts|tsx|css|html|py|sh|rb|go|rs|java|kt|swift)\b/g;
	const URL_REGEX = /\bhttps?:\/\/[^\s<>"']+/g;
	const INLINE_CODE_REGEX = /`[^`\n]+`/g;
	const DISPLAY_LATEX_REGEX = /\$\$[\s\S]+?\$\$/g;
	const INLINE_DOLLAR_MATH_REGEX = /\$[^$\n]+\$/g;
	const INLINE_PAREN_MATH_REGEX = /\\\([\s\S]+?\\\)/g;
	const BLOCK_BRACKET_MATH_REGEX = /\\\[[\s\S]+?\\\]/g;

	function maskProtectedFragments(text, existingTokens) {
		const tokens = [...(existingTokens || [])];
		let maskedText = String(text || "");
		let counter = tokens.reduce((max, token) => {
			const match = /^__OT_TOKEN_(\d+)__$/.exec(String(token?.placeholder));

			return match ? Math.max(max, Number(match[1]) || 0) : max;
		}, 0);

		function replaceWithToken(regex) {
			maskedText = maskedText.replace(regex, (match) => {
				const placeholder = `__OT_TOKEN_${++counter}__`;

				tokens.push({
					placeholder,
					value: match,
				});

				return placeholder;
			});
		}

		replaceWithToken(DISPLAY_LATEX_REGEX);
		replaceWithToken(BLOCK_BRACKET_MATH_REGEX);
		replaceWithToken(INLINE_PAREN_MATH_REGEX);
		replaceWithToken(INLINE_DOLLAR_MATH_REGEX);
		replaceWithToken(INLINE_CODE_REGEX);
		replaceWithToken(URL_REGEX);
		replaceWithToken(FILE_PATH_REGEX);
		replaceWithToken(TECH_TERM_REGEX);

		return {
			maskedText,
			tokens,
		};
	}

	function shouldPreservePlaceholder(token) {
		return Boolean(token?.preservePlaceholder);
	}

	function unmaskProtectedFragments(text, tokens) {
		let restored = String(text || "");

		for (const token of tokens || []) {
			if (shouldPreservePlaceholder(token)) {
				continue;
			}

			restored = restored.split(token.placeholder).join(token.value);
		}

		return restored;
	}

	function collectPreservedFragments(tokens) {
		return (tokens || []).filter((token) => shouldPreservePlaceholder(token));
	}

	function extractTokensForText(text, tokens) {
		return (tokens || []).filter((token) =>
			String(text || "").includes(token.placeholder),
		);
	}

	function validateProtectedFragments(items, translations) {
		const itemById = new Map((items || []).map((item) => [item.id, item]));

		for (const translation of translations || []) {
			const sourceItem = itemById.get(translation.id);

			if (!sourceItem) {
				throw new Error(`Unknown translation item id: ${translation.id}`);
			}

			for (const fragment of sourceItem.protectedFragments || []) {
				if (!translation.translation.includes(fragment.placeholder)) {
					throw new Error(
						`Protected placeholder missing from translation for ${translation.id}`,
					);
				}
			}
		}
	}

	const api = {
		collectPreservedFragments,
		extractTokensForText,
		maskProtectedFragments,
		unmaskProtectedFragments,
		validateProtectedFragments,
	};

	root.TranslatorProtectedFragments = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
