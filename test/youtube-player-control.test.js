const test = require("node:test");
const assert = require("node:assert/strict");

const {
	CONTROL_ATTR,
	CONTROL_SELECTOR,
	findYoutubePlayerControlAnchor,
	getVisibleYoutubeCaptionText,
	hasAvailableYoutubeCaptionTrack,
	isYoutubeWatchLocation,
	mountYoutubePlayerControl,
	turnOnNativeYoutubeCaptions,
} = require("../src/youtube-player-control.js");

test("YouTube control is limited to watch and Shorts video routes", () => {
	assert.equal(
		isYoutubeWatchLocation({
			hostname: "www.youtube.com",
			pathname: "/watch",
			search: "?v=g7AxxkywiFI",
		}),
		true,
	);
	assert.equal(
		isYoutubeWatchLocation({
			hostname: "www.youtube.com",
			pathname: "/shorts/abc123",
			search: "",
		}),
		true,
	);
	assert.equal(
		isYoutubeWatchLocation({
			hostname: "www.youtube.com",
			pathname: "/",
			search: "",
		}),
		false,
	);
	assert.equal(
		isYoutubeWatchLocation({
			hostname: "music.youtube.com",
			pathname: "/watch",
			search: "?v=abc123",
		}),
		false,
	);
});

test("YouTube control reads all visible native caption segments", () => {
	assert.equal(
		getVisibleYoutubeCaptionText({
			querySelectorAll() {
				return [
					{ textContent: " First line " },
					{ textContent: "Second line" },
				];
			},
		}),
		"First line\nSecond line",
	);
	assert.equal(getVisibleYoutubeCaptionText(null), "");
});

test("YouTube control detects manually supplied and auto-generated caption tracks", () => {
	assert.equal(
		hasAvailableYoutubeCaptionTrack({
			captions: {
				playerCaptionsTracklistRenderer: {
					captionTracks: [
						{
							kind: "asr",
							languageCode: "en",
							name: { simpleText: "English (auto-generated)" },
						},
					],
				},
			},
		}),
		true,
	);
	assert.equal(hasAvailableYoutubeCaptionTrack({ captions: null }), false);
});

test("YouTube control activates an available auto-generated caption track", () => {
	const selectedTracks = [];
	const captionButton = {
		click() {},
		getAttribute(name) {
			if (name === "aria-pressed") {
				return "false";
			}

			return name === "aria-label" ? "Subtitles unavailable" : null;
		},
	};
	const player = {
		querySelector() {
			return captionButton;
		},
		setOption(namespace, option, value) {
			selectedTracks.push({ namespace, option, value });
		},
	};
	const playerResponse = {
		captions: {
			playerCaptionsTracklistRenderer: {
				captionTracks: [
					{
						kind: "asr",
						languageCode: "en",
						name: { simpleText: "English (auto-generated)" },
					},
				],
			},
		},
	};

	assert.equal(turnOnNativeYoutubeCaptions(player, playerResponse), false);
	assert.deepEqual(selectedTracks, [
		{
			namespace: "captions",
			option: "track",
			value: {
				kind: "asr",
				languageCode: "en",
				name: "English (auto-generated)",
			},
		},
	]);
});

test("repeated mounting does not move an already positioned control", () => {
	let insertCount = 0;
	const controls = {
		insertBefore() {
			insertCount += 1;
		},
	};
	const captionButton = { parentElement: controls };
	const existingButton = {
		nextElementSibling: captionButton,
		parentElement: controls,
	};
	const player = {
		querySelector(selector) {
			if (selector === ".ytp-subtitles-button") {
				return captionButton;
			}

			return selector === CONTROL_SELECTOR ? existingButton : null;
		},
	};
	const documentLike = {
		querySelector(selector) {
			return selector === "#movie_player" ? player : null;
		},
	};

	assert.equal(
		mountYoutubePlayerControl({
			document: documentLike,
			location: {
				hostname: "www.youtube.com",
				pathname: "/watch",
				search: "?v=abc123",
			},
		}),
		existingButton,
	);
	assert.equal(insertCount, 0);
});

test("YouTube control anchors beside the native captions button", () => {
	const controls = {};
	const captionButton = { parentElement: controls };
	const player = {
		querySelector(selector) {
			if (selector === ".ytp-subtitles-button") {
				return captionButton;
			}

			return null;
		},
	};

	assert.deepEqual(findYoutubePlayerControlAnchor(player), {
		controls,
		reference: captionButton,
	});
	assert.equal(CONTROL_ATTR, "data-ot-youtube-control");
	assert.equal(CONTROL_SELECTOR, `[${CONTROL_ATTR}]`);
});
