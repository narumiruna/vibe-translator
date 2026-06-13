const test = require("node:test");
const assert = require("node:assert/strict");

const {
	SAFE_EMPTY_SELECTOR,
	THREADS_TEXT_BLOCK_SELECTOR,
	X_CURRENT_POST_TEXT_SELECTOR,
	X_TWEET_TEXT_SELECTOR,
	buildProfileSelectors,
	getActiveSiteProfile,
	normalizeHostname,
	resolveSiteProfile,
} = require("../content-site-profiles.js");
const {
	createExtractionSelectorsForProfile,
} = require("../content-extraction.js");

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
		["www.threads.net", "threads"],
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
