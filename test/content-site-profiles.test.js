const test = require("node:test");
const assert = require("node:assert/strict");

const {
	DISQUS_COMMENT_TEXT_SELECTOR,
	SAFE_EMPTY_SELECTOR,
	SCHIIT_ARTICLE_ROOT_SELECTOR,
	SCHIIT_ARTICLE_TEXT_SELECTOR,
	THREADS_TEXT_BLOCK_SELECTOR,
	X_CURRENT_POST_TEXT_SELECTOR,
	YOUTUBE_CAPTION_ROOT_SELECTOR,
	YOUTUBE_CAPTION_TEXT_SELECTOR,
	X_TWEET_TEXT_SELECTOR,
	buildProfileSelectors,
	getActiveSiteProfile,
	normalizeHostname,
	resolveSiteProfile,
} = require("../src/content-site-profiles.js");
const {
	createExtractionSelectorsForProfile,
} = require("../src/content-extraction.js");

test("normalizeHostname lowercases and strips trailing dots", () => {
	assert.equal(normalizeHostname(" WWW.X.COM. "), "www.x.com");
	assert.equal(
		normalizeHostname("mobile.Twitter.com..."),
		"mobile.twitter.com",
	);
	assert.equal(normalizeHostname(null), "");
});

test("resolveSiteProfile matches exact built-in hosts", () => {
	const cases = [
		["x.com", "x"],
		["www.x.com", "x"],
		["twitter.com", "x"],
		["www.twitter.com", "x"],
		["mobile.twitter.com", "x"],
		["threads.net", "threads"],
		["disqus.com", "disqus"],
		["schiit.com", "schiit-article"],
		["www.schiit.com", "schiit-article"],
		["www.threads.net", "threads"],
		["youtube.com", "youtube"],
		["www.youtube.com", "youtube"],
		["m.youtube.com", "youtube"],
		["music.youtube.com", "default"],
		["example.com", "default"],
		["notx.com", "default"],
		["x.com.evil.example", "default"],
		["threads.net.evil.example", "default"],
	];

	for (const [hostname, expectedProfileId] of cases) {
		assert.equal(resolveSiteProfile(hostname).id, expectedProfileId, hostname);
	}
});

test("getActiveSiteProfile accepts location-like objects and host strings", () => {
	assert.equal(getActiveSiteProfile({ hostname: "www.x.com" }).id, "x");
	assert.equal(getActiveSiteProfile("www.threads.net").id, "threads");
	assert.equal(getActiveSiteProfile({}).id, "default");
});

test("buildProfileSelectors filters empty entries and returns a safe empty selector", () => {
	assert.equal(buildProfileSelectors([" p ", ""], [null, "h1"]), "p, h1");
	assert.equal(buildProfileSelectors([], []), SAFE_EMPTY_SELECTOR);
});

test("default extraction selectors exclude site-only social selectors", () => {
	const selectors = createExtractionSelectorsForProfile(
		resolveSiteProfile("example.com"),
	);

	assert.equal(selectors.SOCIAL_TEXT_BLOCK_SELECTOR, SAFE_EMPTY_SELECTOR);
	assert.equal(
		selectors.READABLE_BLOCK_SELECTOR.includes(X_TWEET_TEXT_SELECTOR),
		false,
	);
	assert.equal(
		selectors.READABLE_BLOCK_SELECTOR.includes(X_CURRENT_POST_TEXT_SELECTOR),
		false,
	);
	assert.equal(
		selectors.READABLE_BLOCK_SELECTOR.includes(THREADS_TEXT_BLOCK_SELECTOR),
		false,
	);
});

test("YouTube extraction is restricted to persistent native caption text", () => {
	const profile = resolveSiteProfile("www.youtube.com");
	const selectors = createExtractionSelectorsForProfile(profile);

	assert.equal(profile.dynamic, true);
	assert.equal(profile.presentation, "subtitle");
	assert.equal(profile.requireRoot, true);
	assert.equal(profile.windowed, false);
	assert.deepEqual(profile.rootSelectors, [YOUTUBE_CAPTION_ROOT_SELECTOR]);
	assert.equal(selectors.SITE_ROOT_SELECTOR, YOUTUBE_CAPTION_ROOT_SELECTOR);
	assert.equal(
		YOUTUBE_CAPTION_TEXT_SELECTOR,
		"#ytp-caption-window-container .ytp-caption-segment",
	);
	assert.ok(
		selectors.READABLE_BLOCK_SELECTOR.includes(YOUTUBE_CAPTION_TEXT_SELECTOR),
	);
	assert.ok(
		selectors.DIRECT_NOTE_TARGET_SELECTOR.includes(
			YOUTUBE_CAPTION_TEXT_SELECTOR,
		),
	);
});

test("Antirez profile declares its Disqus embedded frame", () => {
	assert.deepEqual(resolveSiteProfile("antirez.com").embeddedFramePatterns, [
		"https://disqus.com/*",
	]);
});

test("Disqus extraction targets comment text without discussion controls", () => {
	const selectors = createExtractionSelectorsForProfile(
		resolveSiteProfile("disqus.com"),
	);

	assert.equal(resolveSiteProfile("disqus.com").windowed, false);
	assert.equal(selectors.SITE_ROOT_SELECTOR, "#posts");
	assert.ok(
		selectors.READABLE_BLOCK_SELECTOR.includes(DISQUS_COMMENT_TEXT_SELECTOR),
	);
	assert.ok(
		selectors.DIRECT_NOTE_TARGET_SELECTOR.includes(
			DISQUS_COMMENT_TEXT_SELECTOR,
		),
	);
});

test("Schiit article extraction includes FAQ and guide div text blocks", () => {
	const profile = resolveSiteProfile("www.schiit.com");
	const selectors = createExtractionSelectorsForProfile(profile);

	assert.deepEqual(profile.rootSelectors, [SCHIIT_ARTICLE_ROOT_SELECTOR]);
	assert.equal(selectors.SITE_ROOT_SELECTOR, SCHIIT_ARTICLE_ROOT_SELECTOR);
	assert.match(SCHIIT_ARTICLE_ROOT_SELECTOR, /body:where\(\.faq, \.guides\)/);
	assert.match(SCHIIT_ARTICLE_TEXT_SELECTOR, /> \.body > div$/);
	assert.ok(
		selectors.READABLE_BLOCK_SELECTOR.includes(SCHIIT_ARTICLE_TEXT_SELECTOR),
	);
	assert.ok(
		selectors.DIRECT_NOTE_TARGET_SELECTOR.includes(
			SCHIIT_ARTICLE_TEXT_SELECTOR,
		),
	);
});

test("X extraction stays rooted at the scrolling post feed", () => {
	const profile = resolveSiteProfile("x.com");
	const selectors = createExtractionSelectorsForProfile(profile);

	assert.deepEqual(profile.rootSelectors, [
		'[data-testid="primaryColumn"]',
		'main:not(:has([data-testid="primaryColumn"]))',
	]);
	assert.equal(
		selectors.SITE_ROOT_SELECTOR,
		'[data-testid="primaryColumn"], main:not(:has([data-testid="primaryColumn"]))',
	);
});

test("X extraction selectors include X post text direct note targets", () => {
	const selectors = createExtractionSelectorsForProfile(
		resolveSiteProfile("x.com"),
	);

	assert.ok(selectors.READABLE_BLOCK_SELECTOR.includes(X_TWEET_TEXT_SELECTOR));
	assert.ok(
		selectors.READABLE_BLOCK_SELECTOR.includes(X_CURRENT_POST_TEXT_SELECTOR),
	);
	assert.ok(
		selectors.DIRECT_NOTE_TARGET_SELECTOR.includes(
			X_CURRENT_POST_TEXT_SELECTOR,
		),
	);
});

test("Threads extraction selectors include Threads post text direct note targets", () => {
	const selectors = createExtractionSelectorsForProfile(
		resolveSiteProfile("threads.net"),
	);

	assert.ok(
		selectors.READABLE_BLOCK_SELECTOR.includes(THREADS_TEXT_BLOCK_SELECTOR),
	);
	assert.ok(
		selectors.DIRECT_NOTE_TARGET_SELECTOR.includes(THREADS_TEXT_BLOCK_SELECTOR),
	);
});
