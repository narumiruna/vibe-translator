const { parse } = require("acorn");

function trimTextSdk(source, options) {
	if (options.classes) {
		return options.classes.reduce(
			(result, spec) => trimTextSdk(result, spec),
			source,
		);
	}
	const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
	const declaration = ast.body
		.map((node) => node.declaration || node)
		.find(
			(node) =>
				node.type === "ClassDeclaration" && node.id.name === options.className,
		);
	if (!declaration) {
		throw new Error(`Text SDK class not found: ${options.className}`);
	}

	const removals = [];
	const resourceClasses = new Map();
	const constructorMethods = [];
	const constructorNode = declaration.body.body.find(
		(node) => node.kind === "constructor",
	);
	for (const statement of constructorNode?.value.body.body || []) {
		const assignment = statement.expression;
		const target = assignment?.left;
		const value = assignment?.right;
		if (
			assignment?.type !== "AssignmentExpression" ||
			target?.type !== "MemberExpression" ||
			target.object.type !== "ThisExpression" ||
			target.computed
		) {
			continue;
		}
		if (
			["ArrowFunctionExpression", "FunctionExpression"].includes(value?.type)
		) {
			constructorMethods.push(target.property.name);
			if (options.methods && !options.methods.includes(target.property.name)) {
				removals.push(statement);
			}
		}
		if (!options.resources || value?.type !== "NewExpression") {
			continue;
		}
		const callee = value.callee;
		if (
			options.namespaceResources &&
			(callee.type !== "MemberExpression" ||
				!callee.object.name?.endsWith("API"))
		) {
			continue;
		}
		const resource = target.property.name;
		const className = callee.property?.name || callee.name;
		resourceClasses.set(className, resource);
		if (!options.resources.includes(resource)) {
			removals.push(statement);
		}
	}
	for (const resource of options.resources || []) {
		if (![...resourceClasses.values()].includes(resource)) {
			throw new Error(
				`Text SDK resource not found: ${options.className}.${resource}`,
			);
		}
	}

	for (const statement of ast.body) {
		const assignment = statement.expression;
		const target = assignment?.left;
		if (
			assignment?.type === "AssignmentExpression" &&
			target?.type === "MemberExpression" &&
			target.object.name === options.className &&
			resourceClasses.has(target.property.name) &&
			!options.resources.includes(resourceClasses.get(target.property.name))
		) {
			removals.push(statement);
		}
	}

	if (options.methods) {
		const methods = declaration.body.body;
		for (const method of options.methods) {
			if (
				!methods.some((node) => node.key?.name === method) &&
				!constructorMethods.includes(method)
			) {
				throw new Error(
					`Text SDK method not found: ${options.className}.${method}`,
				);
			}
		}
		for (const method of methods) {
			if (!options.methods.includes(method.key?.name)) {
				removals.push(method);
			}
		}
	}

	for (const node of removals.sort((left, right) => right.start - left.start)) {
		source = source.slice(0, node.start) + source.slice(node.end);
	}
	return source;
}

module.exports = function textSdkLoader(source) {
	return trimTextSdk(source, this.getOptions());
};
module.exports.trimTextSdk = trimTextSdk;
