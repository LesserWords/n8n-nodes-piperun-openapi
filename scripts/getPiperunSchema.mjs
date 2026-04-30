import { access, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { organizeSchemaPaths } from './organizePiperunSchemaPaths.mjs';

const SCHEMA_URL = 'https://developers.pipe.run/openapi/686d5ab389846000619e863f';

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemasDir = resolve(currentDir, '../schemas');
const latestPath = resolve(schemasDir, 'latest.Piperun.openapi.json');

const toDatePart = (timestamp) => timestamp.slice(0, 10).replaceAll('-', '');

const fileExists = async (path) => {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
};

const extractTimestampFromLatest = async (path) => {
	try {
		const previousRaw = await readFile(path, 'utf8');
		const previousSchema = JSON.parse(previousRaw);
		const summary = previousSchema?.info?.summary;
		const match = typeof summary === 'string' ? summary.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/) : null;
		return match?.[0] ?? null;
	} catch {
		return null;
	}
};

const timestamp = new Date().toISOString();
const previousTimestamp = (await fileExists(latestPath))
	? await extractTimestampFromLatest(latestPath)
	: null;

if (await fileExists(latestPath)) {
	const archiveDatePart = toDatePart(previousTimestamp ?? timestamp);
	const archivePath = resolve(schemasDir, `${archiveDatePart}.Piperun.openapi.json`);

	if (await fileExists(archivePath)) {
		await unlink(archivePath);
	}

	await rename(latestPath, archivePath);
	console.log(`Archived previous latest schema to ${archivePath}`);
}

const response = await fetch(SCHEMA_URL);

if (!response.ok) {
	throw new Error(`Failed to fetch schema (${response.status} ${response.statusText})`);
}

const fetchedSchema = JSON.parse(await response.text());
fetchedSchema.info = fetchedSchema.info ?? {};
fetchedSchema.info.summary = `Fetched at ${timestamp}`;

await writeFile(latestPath, `${JSON.stringify(fetchedSchema, null, 2)}\n`, 'utf8');
console.log(`Schema saved to ${latestPath}`);

await organizeSchemaPaths(latestPath);
