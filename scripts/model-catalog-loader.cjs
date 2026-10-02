// Repeated metadata is emitted once as a factory, not a shared object, so
// every model retains the same values and independently mutable nested data.
function encodeModelCatalog(source) {
	const catalog = JSON.parse(source);
	const counts = new Map();
	for (const models of Object.values(catalog)) {
		for (const model of Object.values(models)) {
			for (const value of Object.values(model)) {
				if (value && typeof value === "object") {
					const json = JSON.stringify(value);
					counts.set(json, (counts.get(json) || 0) + 1);
				}
			}
		}
	}
	// Factor only values whose repetition outweighs the definition/call overhead.
	const factories = new Map(
		[...counts]
			.filter(
				([json, count]) => count * json.length > json.length + 30 + count * 8,
			)
			.map(([json], index) => [json, `value${index}`]),
	);
	const encodeModel = (model) =>
		`{${Object.entries(model)
			.map(([key, value]) => {
				const json = JSON.stringify(value);
				const factory = factories.get(json);
				return `${JSON.stringify(key)}:${factory ? `${factory}()` : json}`;
			})
			.join(",")}}`;
	const definitions = [...factories]
		.map(([json, name]) => `const ${name}=()=>(${json});`)
		.join("\n");
	const groups = Object.entries(catalog)
		.map(
			([api, models]) =>
				`${JSON.stringify(api)}:{${Object.entries(models)
					.map(([id, model]) => `${JSON.stringify(id)}:${encodeModel(model)}`)
					.join(",")}}`,
		)
		.join(",");
	return `${definitions}\nexport default {${groups}};`;
}

module.exports = encodeModelCatalog;
module.exports.encodeModelCatalog = encodeModelCatalog;
