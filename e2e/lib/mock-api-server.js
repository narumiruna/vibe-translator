const http = require("node:http");

function readRequestBody(request) {
	return new Promise((resolve, reject) => {
		const chunks = [];

		request.on("data", (chunk) => chunks.push(chunk));
		request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		request.on("error", reject);
	});
}

function extractJsonObject(text) {
	const source = String(text || "");
	const starts = [];

	for (let index = 0; index < source.length; index += 1) {
		if (source[index] === "{") {
			starts.push(index);
		}
	}

	const targetPayloads = [];
	const itemPayloads = [];
	const fallbackPayloads = [];

	for (const start of starts) {
		for (let end = source.length; end > start; end -= 1) {
			try {
				const parsed = JSON.parse(source.slice(start, end));

				if (parsed?.targetLanguage) {
					targetPayloads.push(parsed);
				}

				if (parsed?.items) {
					itemPayloads.push(parsed);
				}

				if (parsed?.text) {
					fallbackPayloads.push(parsed);
				}
			} catch (_error) {
				// Keep trimming until any prompt suffix is removed.
			}
		}
	}

	return (
		targetPayloads.at(-1) ||
		itemPayloads.at(-1) ||
		fallbackPayloads.at(-1) ||
		null
	);
}

function stringifyMessageContent(content) {
	if (Array.isArray(content)) {
		return content
			.map((item) => {
				if (typeof item === "string") {
					return item;
				}

				if (typeof item?.text === "string") {
					return item.text;
				}

				return "";
			})
			.filter(Boolean)
			.join("\n");
	}

	return String(content || "");
}

function buildMockTranslations(requestPayload) {
	const input = Array.isArray(requestPayload?.input)
		? requestPayload.input
		: [];
	const userMessage = input.find((item) => item?.role === "user");
	const sourcePayload = extractJsonObject(
		stringifyMessageContent(userMessage?.content),
	);
	const sourceItems = Array.isArray(sourcePayload?.items)
		? sourcePayload.items
		: sourcePayload?.id
			? [sourcePayload]
			: [{ id: "sample", text: "Hello world." }];

	return sourceItems.map((item) => ({
		id: String(item.id),
		translatedText: `[mock:${String(item.text || "").slice(0, 48)}]`,
	}));
}

async function createMockApiServer() {
	const server = http.createServer(async (request, response) => {
		const requestUrl = new URL(request.url || "/", "http://127.0.0.1");

		if (request.method === "GET" && requestUrl.pathname === "/v1/models") {
			response.writeHead(200, {
				"Content-Type": "application/json; charset=utf-8",
			});
			response.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
			return;
		}

		if (request.method === "POST" && requestUrl.pathname === "/v1/responses") {
			let requestPayload = {};

			try {
				requestPayload = JSON.parse(await readRequestBody(request));
			} catch (_error) {
				requestPayload = {};
			}

			const translations = buildMockTranslations(requestPayload);

			response.writeHead(200, {
				"Content-Type": "application/json; charset=utf-8",
			});
			response.end(
				JSON.stringify({
					output_parsed: { translations },
					output_text: JSON.stringify({ translations }),
				}),
			);
			return;
		}

		response.writeHead(404, {
			"Content-Type": "application/json; charset=utf-8",
		});
		response.end(JSON.stringify({ error: { message: "Not Found" } }));
	});

	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});

	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;

	return {
		origin: `http://127.0.0.1:${port}`,
		baseUrl: `http://127.0.0.1:${port}/v1`,
		close: () =>
			new Promise((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}

					resolve();
				});
			}),
	};
}

module.exports = {
	buildMockTranslations,
	createMockApiServer,
	extractJsonObject,
	stringifyMessageContent,
};
