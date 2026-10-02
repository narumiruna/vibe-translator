import { fileURLToPath } from "node:url";

const textSdkLoader = fileURLToPath(
	new URL("./text-sdk-loader.cjs", import.meta.url),
);

// pi-ai uses these SDKs only for streaming text requests. Removing unused
// resources lets the bundler discard their image, agent, batch, and tool code.
const textSdkRules = [
	{
		test: /node_modules\/openai\/client\.mjs$/u,
		options: {
			className: "OpenAI",
			namespaceResources: true,
			resources: ["chat", "responses"],
		},
	},
	{
		test: /node_modules\/openai\/resources\/chat\/completions\/completions\.mjs$/u,
		options: {
			className: "Completions",
			namespaceResources: true,
			resources: [],
			methods: ["constructor", "create"],
		},
	},
	{
		test: /node_modules\/openai\/resources\/responses\/responses\.mjs$/u,
		options: {
			className: "Responses",
			namespaceResources: true,
			resources: [],
			methods: ["constructor", "create"],
		},
	},
	{
		test: /node_modules\/@anthropic-ai\/sdk\/client\.mjs$/u,
		options: {
			className: "Anthropic",
			namespaceResources: true,
			resources: ["beta"],
		},
	},
	{
		test: /node_modules\/@anthropic-ai\/sdk\/resources\/beta\/beta\.mjs$/u,
		options: {
			className: "Beta",
			namespaceResources: true,
			resources: ["messages"],
		},
	},
	{
		test: /node_modules\/@anthropic-ai\/sdk\/resources\/beta\/messages\/messages\.mjs$/u,
		options: {
			className: "Messages",
			namespaceResources: true,
			resources: [],
			methods: ["constructor", "create"],
		},
	},
	{
		test: /node_modules\/@google\/genai\/dist\/web\/index\.mjs$/u,
		options: {
			classes: [
				{
					className: "GoogleGenAI",
					resources: ["apiClient", "models"],
					methods: ["constructor"],
				},
				{
					className: "Models",
					methods: [
						"constructor",
						"generateContentStream",
						"maybeMoveToResponseJsonSchema",
						"processParamsMaybeAddMcpUsage",
						"initAfcToolsMap",
						"processAfcStream",
						"generateContentStreamInternal",
					],
				},
			],
		},
	},
].map(({ test, options }) => ({
	test,
	use: [{ loader: textSdkLoader, options }],
}));

const browserSdkRules = [
	...textSdkRules,
	{
		test: /node_modules\/@earendil-works\/pi-ai\/dist\/providers\/data\/[a-z][^/]*\.json$/u,
		type: "javascript/auto",
		use: [
			fileURLToPath(new URL("./model-catalog-loader.cjs", import.meta.url)),
		],
	},
];

export { browserSdkRules };
