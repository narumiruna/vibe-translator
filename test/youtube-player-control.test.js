const test = require("node:test");
const assert = require("node:assert/strict");

const YoutubeDiagnostics = require("../src/youtube-diagnostics.js");

const {
	CONTROL_ATTR,
	CONTROL_SELECTOR,
	createYoutubePlayerControl,
	findYoutubePlayerControlAnchor,
	getVisibleYoutubeCaptionText,
	hasAvailableYoutubeCaptionTrack,
	isYoutubeWatchLocation,
	mountYoutubePlayerControl,
	turnOnNativeYoutubeCaptions,
} = require("../src/youtube-player-control.js");

test("YouTube diagnostics describe the current player without secrets", () => {
	const control = {
		disabled: false,
		getAttribute(name) {
			return name === "data-state" ? "loading" : null;
		},
		getBoundingClientRect() {
			return { height: 40, left: 10, top: 20, width: 40 };
		},
	};
	const captionButton = {
		getAttribute(name) {
			return name === "aria-pressed" ? "true" : "English captions";
		},
	};
	const captionSegment = { textContent: "Visible native caption" };
	const documentLike = {
		elementFromPoint() {
			return control;
		},
		querySelector(selector) {
			if (selector === "[data-ot-youtube-control]") {
				return control;
			}
			if (selector === ".ytp-subtitles-button") {
				return captionButton;
			}
			return null;
		},
		querySelectorAll() {
			return [captionSegment];
		},
	};

	assert.deepEqual(
		YoutubeDiagnostics.collectYoutubeDiagnostics({
			document: documentLike,
			extensionVersion: "0.1.3",
			location: {
				hostname: "www.youtube.com",
				pathname: "/watch",
				search: "?v=abc123&t=5",
			},
			playerResponse: {
				captions: {
					playerCaptionsTracklistRenderer: { captionTracks: [{ kind: "asr" }] },
				},
			},
		}),
		{
			captionButton: {
				ariaLabel: "English captions",
				ariaPressed: "true",
				found: true,
			},
			control: {
				disabled: false,
				found: true,
				hitTarget: true,
				state: "loading",
			},
			extensionVersion: "0.1.3",
			page: "www.youtube.com/watch?v=abc123",
			trackCount: 1,
			visibleCaptionCharacters: 22,
		},
	);
});

test("YouTube diagnostic reports redact secrets", () => {
	const report = YoutubeDiagnostics.createDiagnosticReport(
		{ extensionVersion: "0.1.3", page: "www.youtube.com/watch?v=abc123" },
		[
			{ stage: "click", detail: "received" },
			{
				stage: "error",
				detail:
					'apiKey="sk-example-secret" Authorization: Bearer private-token',
			},
		],
	);

	assert.match(report, /Vibe Translator YouTube diagnostics/);
	assert.match(report, /\[redacted\]/);
	assert.doesNotMatch(report, /sk-example-secret|private-token/);
});

test("YouTube diagnostic store keeps only recent bounded events", () => {
	const store = YoutubeDiagnostics.createDiagnosticStore();

	for (let index = 0; index < 35; index += 1) {
		store.add("step", String(index));
	}

	assert.equal(store.getEvents().length, 30);
	assert.equal(store.getEvents()[0].detail, "5");
	store.clear();
	assert.deepEqual(store.getEvents(), []);
});

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

test("creating a replacement control does not reset owner lifecycle state", () => {
	const button = {
		addEventListener() {},
		appendChild() {},
		setAttribute() {},
	};
	const documentLike = {
		createElement() {
			return button;
		},
		createElementNS() {
			return {
				appendChild() {},
				setAttribute() {},
			};
		},
	};
	let appliedState = "";

	createYoutubePlayerControl({
		applyState(_button, state) {
			appliedState = state;
		},
		document: documentLike,
	});

	assert.equal(appliedState, "");
});

test("the mounted control handles a direct click exactly once", () => {
	const listeners = [];
	const attributes = new Map();
	const button = {
		addEventListener(type, listener) {
			listeners.push({ listener, type });
		},
		appendChild() {},
		setAttribute(name, value) {
			attributes.set(name, value);
		},
	};
	const documentLike = {
		createElement() {
			return button;
		},
		createElementNS(_namespace, tagName) {
			return {
				appendChild() {},
				setAttribute() {},
				tagName,
			};
		},
	};
	let clickCount = 0;

	assert.equal(
		createYoutubePlayerControl({
			document: documentLike,
			onClick() {
				clickCount += 1;
			},
		}),
		button,
	);
	assert.equal(listeners.length, 1);
	assert.equal(listeners[0].type, "click");
	listeners[0].listener({});
	assert.equal(clickCount, 1);
});

test("delegated clicks survive YouTube replacing the mounted control", () => {
	const listeners = [];
	const controls = {
		insertBefore() {},
	};
	const captionButton = { parentElement: controls };
	const existingButton = {
		nextElementSibling: captionButton,
		parentElement: controls,
	};
	const replacementButton = {};
	const player = {
		contains(element) {
			return element === replacementButton;
		},
		querySelector(selector) {
			if (selector === ".ytp-subtitles-button") {
				return captionButton;
			}

			return selector === CONTROL_SELECTOR ? existingButton : null;
		},
	};
	const documentLike = {
		addEventListener(type, listener, capture) {
			listeners.push({ capture, listener, type });
		},
		querySelector(selector) {
			return selector === "#movie_player" ? player : null;
		},
	};
	let clickedControl = null;

	mountYoutubePlayerControl({
		document: documentLike,
		location: {
			hostname: "www.youtube.com",
			pathname: "/watch",
			search: "?v=abc123",
		},
		onClick(_event, control) {
			clickedControl = control;
		},
	});

	assert.equal(listeners.length, 1);
	assert.equal(listeners[0].type, "click");
	assert.equal(listeners[0].capture, true);
	listeners[0].listener({
		target: {
			closest(selector) {
				return selector === CONTROL_SELECTOR ? replacementButton : null;
			},
		},
	});
	assert.equal(clickedControl, replacementButton);
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
