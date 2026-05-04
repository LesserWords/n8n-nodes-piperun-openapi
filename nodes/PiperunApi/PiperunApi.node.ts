// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { N8NPropertiesBuilder, N8NPropertiesBuilderConfig } from '@devlikeapro/n8n-openapi-node';
import {
	NodeConnectionTypes,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';

import * as rawDoc from '../../schemas/latest.Piperun.openapi.json';

/** Matches @devlikeapro/n8n-openapi-node SchemaToINodeProperties.fromRequestBody guard. */
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

function formatResourceDisplayText(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(' ');
}

function deriveContextTagFromPath(path: string): string {
	const segments = path.split('/').filter(Boolean);
	const firstStaticSegment = segments.find((segment) => !segment.startsWith('{'));
	if (!firstStaticSegment) {
		return 'Default';
	}
	return formatResourceDisplayText(firstStaticSegment);
}

function findApplicationJsonSchema(content: Record<string, unknown>): Record<string, unknown> | undefined {
	for (const key of Object.keys(content)) {
		if (!/application\/json.*/.test(key)) continue;
		const media = content[key];
		if (!media || typeof media !== 'object') continue;
		const schema = (media as { schema?: unknown }).schema;
		if (schema !== undefined && typeof schema === 'object' && schema !== null) {
			return schema as Record<string, unknown>;
		}
		return undefined;
	}
	return undefined;
}

function jsonBodySchemaUnsupportedByN8nOpenapi(schema: Record<string, unknown> | undefined): boolean {
	if (!schema) return true;
	if ('$ref' in schema) return false;
	const properties = schema.properties;
	const type = schema.type;
	if (properties && typeof properties === 'object') return false;
	if (type === 'object' || type === 'array') return false;
	return true;
}

/**
 * PipeRun OpenAPI lists bogus `requestBody` blocks on some DELETE routes with `"schema": {}`.
 * The generator throws "Request body schema type 'undefined' not supported".
 */
function stripUnsupportedJsonRequestBodies(spec: typeof rawDoc): typeof rawDoc {
	const clone = structuredClone(spec) as typeof rawDoc;
	const paths = clone.paths;
	if (!paths) return clone;

	for (const [pathKey, pathItem] of Object.entries(paths)) {
		if (!pathItem || typeof pathItem !== 'object') continue;
		const item = pathItem as Record<string, unknown>;
		const contextTag = deriveContextTagFromPath(pathKey);
		for (const method of HTTP_METHODS) {
			const op = item[method];
			if (!op || typeof op !== 'object') continue;
			(op as { tags?: string[] }).tags = [contextTag];
			const requestBody = (op as { requestBody?: unknown }).requestBody;
			if (!requestBody || typeof requestBody !== 'object') continue;
			const content = (requestBody as { content?: unknown }).content;
			if (!content || typeof content !== 'object') continue;
			const schema = findApplicationJsonSchema(content as Record<string, unknown>);
			if (jsonBodySchemaUnsupportedByN8nOpenapi(schema)) {
				delete (op as { requestBody?: unknown }).requestBody;
			}
		}
	}
	return clone;
}

const doc = stripUnsupportedJsonRequestBodies(rawDoc);

const config: N8NPropertiesBuilderConfig = {};
const parser = new N8NPropertiesBuilder(doc, config);
const properties = buildStructuredProperties(parser.build());

function toSafeToken(value: string): string {
	return value
		.replace(/[^a-zA-Z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.map((word, index) => {
			const lower = word.toLowerCase();
			return index === 0 ? lower : lower[0].toUpperCase() + lower.slice(1);
		})
		.join('');
}

function getScopeKey(property: INodeProperties): string | null {
	const show = property.displayOptions?.show as Record<string, unknown> | undefined;
	if (!show) {
		return null;
	}

	const resources = Array.isArray(show.resource) ? show.resource : [];
	const operations = Array.isArray(show.operation) ? show.operation : [];
	if (!resources.length || !operations.length) {
		return null;
	}

	return `${resources.join('|')}::${operations.join('|')}`;
}

function getCollectionName(scopeKey: string): string {
	const [resourcePart, operationPart] = scopeKey.split('::');
	const resourceToken = toSafeToken(resourcePart ?? 'resource');
	const operationToken = toSafeToken(operationPart ?? 'operation');
	return `${resourceToken}${operationToken}AdditionalFields`;
}

function isSelectorProperty(property: INodeProperties): boolean {
	return property.name === 'resource' || (property.name === 'operation' && property.type === 'options');
}

function buildStructuredProperties(generatedProperties: INodeProperties[]): INodeProperties[] {
	const selectors: INodeProperties[] = [];
	const passthrough: INodeProperties[] = [];
	const scopedRequired = new Map<string, INodeProperties[]>();
	const scopedOptional = new Map<string, INodeProperties[]>();
	const scopeToDisplayOptions = new Map<string, INodeProperties['displayOptions']>();
	const scopeToCollectionName = new Map<string, string>();
	const scopeOrder: string[] = [];

	for (const property of generatedProperties) {
		if (isSelectorProperty(property)) {
			selectors.push(property);
			continue;
		}

		const scopeKey = getScopeKey(property);
		if (!scopeKey || property.type === 'notice') {
			passthrough.push(property);
			continue;
		}

		if (!scopeOrder.includes(scopeKey)) {
			scopeOrder.push(scopeKey);
		}

		if (!scopeToCollectionName.has(scopeKey)) {
			scopeToCollectionName.set(scopeKey, getCollectionName(scopeKey));
		}
		if (!scopeToDisplayOptions.has(scopeKey)) {
			scopeToDisplayOptions.set(scopeKey, property.displayOptions);
		}

		if (property.required === true) {
			const bucket = scopedRequired.get(scopeKey) ?? [];
			bucket.push(property);
			scopedRequired.set(scopeKey, bucket);
			continue;
		}

		const optionalProperty = { ...property };
		delete optionalProperty.displayOptions;
		const bucket = scopedOptional.get(scopeKey) ?? [];
		bucket.push(optionalProperty);
		scopedOptional.set(scopeKey, bucket);
	}

	const structuredProperties = [...selectors, ...passthrough];

	for (const scopeKey of scopeOrder) {
		const requiredFields = scopedRequired.get(scopeKey) ?? [];
		structuredProperties.push(...requiredFields);

		const optionalFields = scopedOptional.get(scopeKey) ?? [];
		if (!optionalFields.length) {
			continue;
		}

		const collectionName = scopeToCollectionName.get(scopeKey) ?? getCollectionName(scopeKey);
		const displayOptions = scopeToDisplayOptions.get(scopeKey);
		structuredProperties.push({
			displayName: 'Additional Parameters',
			name: collectionName,
			type: 'collection',
			placeholder: 'Add Parameter',
			default: {},
			displayOptions,
			options: optionalFields,
		});
	}

	return structuredProperties;
}

export class PiperunApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PipeRun API',
		name: 'piperunApi',
		icon: { light: 'file:piperun.svg', dark: 'file:piperun.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the PipeRun CRM API.',
		defaults: {
			name: 'PipeRun API',
		},
		credentials: [
			{
				name: 'piperunApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: 'https://api.pipe.run/v1',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				// PipeRun requires the user token in the `token` header for all requests.
				token: '={{$credentials.token}}',
			},
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties,
	};
}
