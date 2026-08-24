const SAFE_EMPTY_SELECTOR = ":not(*)";
const DEFAULT_PROFILE_ID = "default";
const ANTIREZ_PROSE_CONTAINER_SELECTOR = "article.comment > pre";
const ANTIREZ_PROSE_TEXT_SELECTOR =
	"article.comment > pre > [data-ot-prose-block]";
const DISQUS_COMMENT_TEXT_SELECTOR = '[data-role="message"] p';
const FINDY_ARTICLE_ROOT_SELECTOR = ".p-single__wrap";
const SCHIIT_ARTICLE_ROOT_SELECTOR =
	"body:where(.faq, .guides) #content-box .product > .pad";
const SCHIIT_ARTICLE_TEXT_SELECTOR = `${SCHIIT_ARTICLE_ROOT_SELECTOR} > .body > div`;
const X_TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]';
const X_CURRENT_POST_TEXT_SELECTOR =
	'article[data-tweet-id] div[dir="auto"].whitespace-pre-wrap:has(> span)';
const THREADS_TEXT_BLOCK_SELECTOR = 'div[lang]:has(> div > span[dir="auto"])';
const YOUTUBE_CAPTION_ROOT_SELECTOR = "#ytp-caption-window-container";
const YOUTUBE_CAPTION_TEXT_SELECTOR = `${YOUTUBE_CAPTION_ROOT_SELECTOR} .ytp-caption-segment`;
const DEFAULT_SITE_PROFILE = Object.freeze({
	id: DEFAULT_PROFILE_ID,
	hosts: Object.freeze([]),
	socialTextSelectors: Object.freeze([]),
	proseTextSelectors: Object.freeze([]),
	rootSelectors: Object.freeze([]),
	splitProseContainerSelectors: Object.freeze([]),
	directNoteTargetSelectors: Object.freeze([]),
	embeddedFramePatterns: Object.freeze([]),
	dynamic: false,
	presentation: "inline",
	requireRoot: false,
	windowed: true,
});
const SITE_PROFILES = Object.freeze([
	Object.freeze({
		id: "antirez",
		hosts: Object.freeze(["antirez.com", "www.antirez.com"]),
		socialTextSelectors: Object.freeze([]),
		proseTextSelectors: Object.freeze([ANTIREZ_PROSE_TEXT_SELECTOR]),
		rootSelectors: Object.freeze(["#content"]),
		splitProseContainerSelectors: Object.freeze([
			ANTIREZ_PROSE_CONTAINER_SELECTOR,
		]),
		directNoteTargetSelectors: Object.freeze([ANTIREZ_PROSE_TEXT_SELECTOR]),
		embeddedFramePatterns: Object.freeze(["https://disqus.com/*"]),
		windowed: true,
	}),
	Object.freeze({
		id: "disqus",
		hosts: Object.freeze(["disqus.com"]),
		socialTextSelectors: Object.freeze([DISQUS_COMMENT_TEXT_SELECTOR]),
		proseTextSelectors: Object.freeze([]),
		rootSelectors: Object.freeze(["#posts"]),
		splitProseContainerSelectors: Object.freeze([]),
		directNoteTargetSelectors: Object.freeze([DISQUS_COMMENT_TEXT_SELECTOR]),
		embeddedFramePatterns: Object.freeze([]),
		windowed: false,
	}),
	Object.freeze({
		id: "findy-article",
		hosts: Object.freeze(["findy.co.jp", "www.findy.co.jp"]),
		socialTextSelectors: Object.freeze([]),
		proseTextSelectors: Object.freeze([]),
		rootSelectors: Object.freeze([FINDY_ARTICLE_ROOT_SELECTOR]),
		splitProseContainerSelectors: Object.freeze([]),
		directNoteTargetSelectors: Object.freeze([]),
		embeddedFramePatterns: Object.freeze([]),
		windowed: true,
	}),
	Object.freeze({
		id: "schiit-article",
		hosts: Object.freeze(["schiit.com", "www.schiit.com"]),
		socialTextSelectors: Object.freeze([]),
		proseTextSelectors: Object.freeze([SCHIIT_ARTICLE_TEXT_SELECTOR]),
		rootSelectors: Object.freeze([SCHIIT_ARTICLE_ROOT_SELECTOR]),
		splitProseContainerSelectors: Object.freeze([]),
		directNoteTargetSelectors: Object.freeze([SCHIIT_ARTICLE_TEXT_SELECTOR]),
		embeddedFramePatterns: Object.freeze([]),
		windowed: true,
	}),
	Object.freeze({
		id: "youtube",
		hosts: Object.freeze(["youtube.com", "www.youtube.com", "m.youtube.com"]),
		socialTextSelectors: Object.freeze([YOUTUBE_CAPTION_TEXT_SELECTOR]),
		proseTextSelectors: Object.freeze([]),
		rootSelectors: Object.freeze([YOUTUBE_CAPTION_ROOT_SELECTOR]),
		splitProseContainerSelectors: Object.freeze([]),
		directNoteTargetSelectors: Object.freeze([YOUTUBE_CAPTION_TEXT_SELECTOR]),
		embeddedFramePatterns: Object.freeze([]),
		dynamic: true,
		presentation: "subtitle",
		requireRoot: true,
		windowed: false,
	}),
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
		proseTextSelectors: Object.freeze([]),
		rootSelectors: Object.freeze([
			'[data-testid="primaryColumn"]',
			'main:not(:has([data-testid="primaryColumn"]))',
		]),
		splitProseContainerSelectors: Object.freeze([]),
		directNoteTargetSelectors: Object.freeze([
			X_TWEET_TEXT_SELECTOR,
			X_CURRENT_POST_TEXT_SELECTOR,
		]),
		embeddedFramePatterns: Object.freeze([]),
		windowed: true,
	}),
	Object.freeze({
		id: "threads",
		hosts: Object.freeze(["threads.net", "www.threads.net"]),
		socialTextSelectors: Object.freeze([THREADS_TEXT_BLOCK_SELECTOR]),
		proseTextSelectors: Object.freeze([]),
		rootSelectors: Object.freeze([]),
		splitProseContainerSelectors: Object.freeze([]),
		directNoteTargetSelectors: Object.freeze([THREADS_TEXT_BLOCK_SELECTOR]),
		embeddedFramePatterns: Object.freeze([]),
		windowed: true,
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
	ANTIREZ_PROSE_CONTAINER_SELECTOR,
	ANTIREZ_PROSE_TEXT_SELECTOR,
	DEFAULT_PROFILE_ID,
	DISQUS_COMMENT_TEXT_SELECTOR,
	DEFAULT_SITE_PROFILE,
	FINDY_ARTICLE_ROOT_SELECTOR,
	SAFE_EMPTY_SELECTOR,
	SCHIIT_ARTICLE_ROOT_SELECTOR,
	SCHIIT_ARTICLE_TEXT_SELECTOR,
	SITE_PROFILES,
	THREADS_TEXT_BLOCK_SELECTOR,
	X_CURRENT_POST_TEXT_SELECTOR,
	X_TWEET_TEXT_SELECTOR,
	YOUTUBE_CAPTION_ROOT_SELECTOR,
	YOUTUBE_CAPTION_TEXT_SELECTOR,
	buildProfileSelectors,
	buildSelector,
	getActiveSiteProfile,
	normalizeHostname,
	normalizeSelectorList,
	resolveSiteProfile,
};

export {
	ANTIREZ_PROSE_CONTAINER_SELECTOR,
	ANTIREZ_PROSE_TEXT_SELECTOR,
	buildProfileSelectors,
	buildSelector,
	DEFAULT_PROFILE_ID,
	DEFAULT_SITE_PROFILE,
	DISQUS_COMMENT_TEXT_SELECTOR,
	FINDY_ARTICLE_ROOT_SELECTOR,
	getActiveSiteProfile,
	normalizeHostname,
	normalizeSelectorList,
	resolveSiteProfile,
	SAFE_EMPTY_SELECTOR,
	SCHIIT_ARTICLE_ROOT_SELECTOR,
	SCHIIT_ARTICLE_TEXT_SELECTOR,
	SITE_PROFILES,
	THREADS_TEXT_BLOCK_SELECTOR,
	X_CURRENT_POST_TEXT_SELECTOR,
	X_TWEET_TEXT_SELECTOR,
	YOUTUBE_CAPTION_ROOT_SELECTOR,
	YOUTUBE_CAPTION_TEXT_SELECTOR,
};
export default api;
