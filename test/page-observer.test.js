import assert from "node:assert/strict";
import test from "node:test";

import { isSubtitleRelatedMutation } from "../src/content/page/observer.js";

function createElement(options = {}) {
	return {
		nodeType: 1,
		matches(selector) {
			return options.matches === selector;
		},
		closest(selector) {
			return options.closest === selector ? {} : null;
		},
		querySelector(selector) {
			return options.descendant === selector ? {} : null;
		},
	};
}

const Node = { ELEMENT_NODE: 1 };
const selector = ".ytp-caption-segment";

test("subtitle observer accepts only mutations involving caption segments", () => {
	assert.equal(
		isSubtitleRelatedMutation(
			{
				target: createElement(),
				addedNodes: [createElement({ matches: selector })],
				removedNodes: [],
			},
			{ Node, selector },
		),
		true,
	);
	assert.equal(
		isSubtitleRelatedMutation(
			{
				target: {
					nodeType: 3,
					parentElement: createElement({ closest: selector }),
				},
				addedNodes: [],
				removedNodes: [],
			},
			{ Node, selector },
		),
		true,
	);
	assert.equal(
		isSubtitleRelatedMutation(
			{
				target: createElement({ descendant: selector }),
				addedNodes: [createElement()],
				removedNodes: [],
			},
			{ Node, selector },
		),
		false,
	);
});
