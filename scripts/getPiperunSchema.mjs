import { access, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { organizeSchemaPaths } from './organizePiperunSchemaPaths.mjs';

const LEGACY_SCHEMA_URL = 'https://developers.pipe.run/openapi/686d5ab389846000619e863f';
const REFERENCE_SEED_URL = 'https://developers.pipe.run/reference/listar-atividades';
const REFERENCE_BASE_URL = 'https://developers.pipe.run/reference';
const FETCH_CONCURRENCY = 15;

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
		const match =
			typeof summary === 'string'
				? summary.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/)
				: null;
		return match?.[0] ?? null;
	} catch {
		return null;
	}
};

const extractSsrProps = (html) => {
	const markerIndex = html.indexOf('id="ssr-props"');
	if (markerIndex === -1) {
		return null;
	}
	const start = html.indexOf('>', markerIndex) + 1;
	const end = html.indexOf('</script>', start);
	if (start <= 0 || end === -1) {
		return null;
	}
	return JSON.parse(html.slice(start, end));
};

const collectEndpointSlugs = (node, slugs = new Set()) => {
	if (!node || typeof node !== 'object') {
		return slugs;
	}
	if (Array.isArray(node)) {
		for (const item of node) {
			collectEndpointSlugs(item, slugs);
		}
		return slugs;
	}
	if (node.type === 'endpoint' && typeof node.slug === 'string' && node.slug.trim() !== '') {
		slugs.add(node.slug.trim());
	}
	if (Array.isArray(node.pages)) {
		collectEndpointSlugs(node.pages, slugs);
	}
	return slugs;
};

const mergeSchemas = (baseSchema, partialSchema) => {
	if (!partialSchema || typeof partialSchema !== 'object') {
		return baseSchema;
	}

	if (partialSchema.paths && typeof partialSchema.paths === 'object') {
		baseSchema.paths = baseSchema.paths ?? {};
		for (const [pathKey, pathItem] of Object.entries(partialSchema.paths)) {
			if (!pathItem || typeof pathItem !== 'object') continue;
			baseSchema.paths[pathKey] = {
				...(baseSchema.paths[pathKey] ?? {}),
				...pathItem,
			};
		}
	}

	if (partialSchema.components && typeof partialSchema.components === 'object') {
		baseSchema.components = baseSchema.components ?? {};
		for (const [compType, compGroup] of Object.entries(partialSchema.components)) {
			if (!compGroup || typeof compGroup !== 'object') continue;
			baseSchema.components[compType] = {
				...(baseSchema.components[compType] ?? {}),
				...compGroup,
			};
		}
	}

	return baseSchema;
};

const fetchSchemaFromPortal = async () => {
	// 1. Try direct OpenAPI download first in case PipeRun re-enables public OpenAPI downloads
	try {
		const directResponse = await fetch(LEGACY_SCHEMA_URL, { redirect: 'manual' });
		if (directResponse.status === 200) {
			const parsed = JSON.parse(await directResponse.text());
			if (parsed?.paths && Object.keys(parsed.paths).length > 0) {
				return parsed;
			}
		}
	} catch {
		// Fall back to SSR extraction
	}

	// 2. Fallback: Reconstruct full OpenAPI specification from ReadMe SSR endpoint pages
	console.log('Direct OpenAPI download unavailable; reconstructing schema from developers.pipe.run reference pages...');
	const seedResponse = await fetch(REFERENCE_SEED_URL);
	if (!seedResponse.ok) {
		throw new Error(`Failed to fetch reference seed page (${seedResponse.status} ${seedResponse.statusText})`);
	}

	const seedProps = extractSsrProps(await seedResponse.text());
	if (!seedProps) {
		throw new Error('Failed to extract SSR props from reference seed page');
	}

	const slugs = [...collectEndpointSlugs(seedProps.sidebar)];
	if (slugs.length === 0) {
		throw new Error('No endpoint slugs found in developers.pipe.run sidebar');
	}

	const seedSchema = seedProps.document?.api?.schema ?? {};
	const combinedSchema = {
		openapi: seedSchema.openapi ?? '3.1.0',
		info: {
			title: 'application/json',
			version: seedProps.version?.version ?? seedSchema.info?.version ?? '1.1-CRM',
		},
		servers: seedSchema.servers ?? [{ url: 'https://api.pipe.run/v1' }],
		components: structuredClone(seedSchema.components ?? {}),
		security: seedSchema.security ?? [{ sec0: [] }],
		paths: {},
		...(seedSchema['x-readme'] ? { 'x-readme': seedSchema['x-readme'] } : {}),
		...(seedSchema['x-readme-fauxas'] ? { 'x-readme-fauxas': seedSchema['x-readme-fauxas'] } : {}),
	};

	let cursor = 0;
	const worker = async () => {
		while (cursor < slugs.length) {
			const slug = slugs[cursor++];
			const pageUrl = `${REFERENCE_BASE_URL}/${encodeURIComponent(slug)}`;
			const pageResponse = await fetch(pageUrl);
			if (!pageResponse.ok) {
				throw new Error(`Failed to fetch endpoint page ${pageUrl} (${pageResponse.status})`);
			}
			const pageProps = extractSsrProps(await pageResponse.text());
			const endpointSchema = pageProps?.document?.api?.schema;
			if (endpointSchema) {
				mergeSchemas(combinedSchema, endpointSchema);
			}
		}
	};

	await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, () => worker()));

	// Also merge any additional public API registries exposed by ReadMe (e.g. Atendimentos / CXM)
	const apiRegistries = seedProps.context?.project?.apiRegistries ?? seedProps.version?.apiRegistries ?? [];
	for (const registry of apiRegistries) {
		if (!registry?.uuid) continue;
		try {
			const regResponse = await fetch(`https://dash.readme.com/api/v1/api-registry/${registry.uuid}`);
			if (regResponse.ok) {
				const regSchema = JSON.parse(await regResponse.text());
				if (regSchema?.paths && Object.keys(regSchema.paths).length > 0) {
					mergeSchemas(combinedSchema, regSchema);
				}
			}
		} catch {
			// Ignore optional registry fetch failures
		}
	}

	return combinedSchema;
};

const timestamp = new Date().toISOString();
const previousTimestamp = (await fileExists(latestPath))
	? await extractTimestampFromLatest(latestPath)
	: null;

// Fetch and validate the new schema BEFORE archiving the existing latest.Piperun.openapi.json
const fetchedSchema = await fetchSchemaFromPortal();
fetchedSchema.info = fetchedSchema.info ?? {};
fetchedSchema.info.summary = `Fetched at ${timestamp}`;

if (await fileExists(latestPath)) {
	const archiveDatePart = toDatePart(previousTimestamp ?? timestamp);
	const archivePath = resolve(schemasDir, `${archiveDatePart}.Piperun.openapi.json`);

	if (await fileExists(archivePath)) {
		await unlink(archivePath);
	}

	await rename(latestPath, archivePath);
	console.log(`Archived previous latest schema to ${archivePath}`);
}

await writeFile(latestPath, `${JSON.stringify(fetchedSchema, null, 2)}\n`, 'utf8');
console.log(`Schema saved to ${latestPath}`);

await organizeSchemaPaths(latestPath);
