((root) => {
	const SAFE_EMPTY_SELECTOR = ":not(*)";
	const DEFAULT_PROFILE_ID = "default";
	const X_TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]';
	const X_CURRENT_POST_TEXT_SELECTOR =
		'article[data-tweet-id] div[dir="auto"].whitespace-pre-wrap:has(> span)';
	const THREADS_TEXT_BLOCK_SELECTOR = 'div[lang]:has(> div > span[dir="auto"])';
	const DEFAULT_SITE_PROFILE = Object.freeze({
		id: DEFAULT_PROFILE_ID,
		hosts: Object.freeze([]),
		socialTextSelectors: Object.freeze([]),
		directNoteTargetSelectors: Object.freeze([]),
	});
	const SITE_PROFILES = Object.freeze([
		Object.freeze({
			id: "x",
			hosts: Object.freeze([
				"x.com",
				"www.x.com",
				"twitter.com",
				"www.twitter.com",
				"mobile.twitter.com",
			]),
			socialTextSelectors: Object.freeze([
				X_TWEET_TEXT_SELECTOR,
				X_CURRENT_POST_TEXT_SELECTOR,
			]),
			directNoteTargetSelectors: Object.freeze([
				X_TWEET_TEXT_SELECTOR,
				X_CURRENT_POST_TEXT_SELECTOR,
			]),
		}),
		Object.freeze({
			id: "threads",
			hosts: Object.freeze(["threads.net", "www.threads.net"]),
			socialTextSelectors: Object.freeze([THREADS_TEXT_BLOCK_SELECTOR]),
			directNoteTargetSelectors: Object.freeze([THREADS_TEXT_BLOCK_SELECTOR]),
		}),
	]);

	function normalizeHostname(hostname) {
		return String(hostname || "")
			.trim()
			.toLowerCase()
			.replace(/\.+$/u, "");
	}

	function normalizeSelectorList(selectors) {
		return (Array.isArray(selectors) ? selectors : [selectors])
			.map((selector) => String(selector || "").trim())
			.filter(Boolean);
	}

	function buildSelector(selectors, fallback = SAFE_EMPTY_SELECTOR) {
		const normalized = normalizeSelectorList(selectors);

		return normalized.length > 0 ? normalized.join(", ") : fallback;
	}

	function buildProfileSelectors(
		defaultSelectors,
		profileSelectors,
		fallback = SAFE_EMPTY_SELECTOR,
	) {
		return buildSelector(
			[
				...normalizeSelectorList(defaultSelectors),
				...normalizeSelectorList(profileSelectors),
			],
			fallback,
		);
	}

	function resolveSiteProfile(hostname) {
		const normalizedHostname = normalizeHostname(hostname);

		for (const profile of SITE_PROFILES) {
			if (profile.hosts.includes(normalizedHostname)) {
				return profile;
			}
		}

		return DEFAULT_SITE_PROFILE;
	}

	function getActiveSiteProfile(locationLike) {
		return resolveSiteProfile(locationLike?.hostname || locationLike || "");
	}

	const api = {
		DEFAULT_PROFILE_ID,
		DEFAULT_SITE_PROFILE,
		SAFE_EMPTY_SELECTOR,
		SITE_PROFILES,
		THREADS_TEXT_BLOCK_SELECTOR,
		X_CURRENT_POST_TEXT_SELECTOR,
		X_TWEET_TEXT_SELECTOR,
		buildProfileSelectors,
		buildSelector,
		getActiveSiteProfile,
		normalizeHostname,
		normalizeSelectorList,
		resolveSiteProfile,
	};

	root.TranslatorContentSiteProfiles = api;

	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this);
