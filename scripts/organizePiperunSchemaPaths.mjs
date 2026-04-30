import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultSchemaPath = resolve(currentDir, '../schemas/latest.Piperun.openapi.json');

const getPathCategory = (pathItem) => {
	const operationOrder = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

	for (const method of operationOrder) {
		const operation = pathItem?.[method];
		if (operation && Array.isArray(operation.tags) && operation.tags.length > 0) {
			return String(operation.tags[0]).toLowerCase();
		}
	}

	return 'uncategorized';
};

const getUrlGroup = (urlPath) => {
	const firstSegment = urlPath.split('/').filter(Boolean)[0];
	return firstSegment ? firstSegment.toLowerCase() : 'root';
};

export const organizeSchemaPaths = async (schemaPath = defaultSchemaPath) => {
	const schemaRaw = await readFile(schemaPath, 'utf8');
	const schema = JSON.parse(schemaRaw);

	if (!schema.paths || typeof schema.paths !== 'object') {
		throw new Error('Invalid schema: missing "paths" object');
	}

	const sortedPathEntries = Object.entries(schema.paths).sort(([urlA, itemA], [urlB, itemB]) => {
		const categoryA = getPathCategory(itemA);
		const categoryB = getPathCategory(itemB);

		if (categoryA !== categoryB) {
			return categoryA.localeCompare(categoryB);
		}

		const groupA = getUrlGroup(urlA);
		const groupB = getUrlGroup(urlB);
		if (groupA !== groupB) {
			return groupA.localeCompare(groupB);
		}

		return urlA.localeCompare(urlB);
	});

	schema.paths = Object.fromEntries(sortedPathEntries);
	await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
	console.log(`Organized ${sortedPathEntries.length} path entries in ${schemaPath}`);
};

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	const targetPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : defaultSchemaPath;
	await organizeSchemaPaths(targetPath);
}
