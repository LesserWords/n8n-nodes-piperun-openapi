// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { N8NPropertiesBuilder, N8NPropertiesBuilderConfig } from '@devlikeapro/n8n-openapi-node';
import {
	NodeConnectionTypes,
	NodeOperationError,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type INodeProperties,
	type INodePropertyRouting,
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

/**
 * PreSend hook executed before making an HTTP request.
 * Unpacks custom query parameters into requestOptions.qs
 * and merges custom body fields into requestOptions.body (root payload).
 */
export async function piperunPreSend(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	let resource = '';
	let operation = '';
	try {
		resource = this.getNodeParameter('resource', 0) as string;
		operation = this.getNodeParameter('operation', 0) as string;
	} catch {
		return requestOptions;
	}

	const scopeKey = `${resource}::${operation}`;
	const collectionName = getCollectionName(scopeKey);

	let additionalFields: Record<string, unknown> = {};
	try {
		additionalFields = (this.getNodeParameter(collectionName, 0, {}) as Record<string, unknown>) || {};
	} catch {
		return requestOptions;
	}

	// 1. Process Custom Query Parameters (key-value fixedCollection)
	if (additionalFields.customQueryParameters && typeof additionalFields.customQueryParameters === 'object') {
		const customQueryParams = (
			additionalFields.customQueryParameters as {
				parameters?: Array<{ name?: string; value?: unknown }>;
			}
		).parameters;
		if (Array.isArray(customQueryParams)) {
			requestOptions.qs = requestOptions.qs || {};
			for (const param of customQueryParams) {
				if (param && typeof param.name === 'string' && param.name.trim() !== '') {
					requestOptions.qs[param.name.trim()] = param.value !== undefined ? param.value : '';
				}
			}
		}
	}

	// 2. Process Custom Query (raw JSON object)
	if (additionalFields.customQueryJson) {
		try {
			const parsedQs =
				typeof additionalFields.customQueryJson === 'string'
					? JSON.parse(additionalFields.customQueryJson)
					: additionalFields.customQueryJson;
			if (parsedQs && typeof parsedQs === 'object' && !Array.isArray(parsedQs)) {
				requestOptions.qs = requestOptions.qs || {};
				Object.assign(requestOptions.qs, parsedQs);
			}
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Invalid JSON in Custom Query (JSON): ${(error as Error).message}`,
			);
		}
	}

	// 3. Process Custom Body Fields (key-value fixedCollection to root payload)
	if (additionalFields.customBodyFields && typeof additionalFields.customBodyFields === 'object') {
		const customFields = (
			additionalFields.customBodyFields as {
				fields?: Array<{ name?: string; value?: unknown }>;
			}
		).fields;
		if (Array.isArray(customFields)) {
			if (typeof requestOptions.body === 'string') {
				try {
					requestOptions.body = JSON.parse(requestOptions.body);
				} catch {
					requestOptions.body = {};
				}
			}
			requestOptions.body = requestOptions.body || {};

			for (const field of customFields) {
				if (field && typeof field.name === 'string' && field.name.trim() !== '') {
					let val = field.value;
					if (typeof val === 'string') {
						const trimmed = val.trim();
						if (
							(trimmed.startsWith('{') && trimmed.endsWith('}')) ||
							(trimmed.startsWith('[') && trimmed.endsWith(']')) ||
							trimmed === 'true' ||
							trimmed === 'false' ||
							(!isNaN(Number(trimmed)) && trimmed !== '')
						) {
							try {
								val = JSON.parse(trimmed);
							} catch {
								// Keep original string if JSON.parse fails
							}
						}
					}
					if (typeof requestOptions.body === 'object' && requestOptions.body !== null) {
						(requestOptions.body as Record<string, unknown>)[field.name.trim()] = val;
					}
				}
			}
		}
	}

	// 4. Process Custom Body (raw JSON object to root payload)
	if (additionalFields.customBodyJson) {
		try {
			const parsedBody =
				typeof additionalFields.customBodyJson === 'string'
					? JSON.parse(additionalFields.customBodyJson)
					: additionalFields.customBodyJson;
			if (parsedBody && typeof parsedBody === 'object') {
				if (typeof requestOptions.body === 'string') {
					try {
						requestOptions.body = JSON.parse(requestOptions.body);
					} catch {
						requestOptions.body = {};
					}
				}
				requestOptions.body = requestOptions.body || {};
				if (typeof requestOptions.body === 'object' && requestOptions.body !== null) {
					Object.assign(requestOptions.body, parsedBody);
				}
			}
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Invalid JSON in Custom Body (JSON): ${(error as Error).message}`,
			);
		}
	}

	return requestOptions;
}

function getCustomParametersForMethod(method: string): INodeProperties[] {
	const isGetOrHead = method === 'GET' || method === 'HEAD';

	const queryFixedCollection: INodeProperties = {
		displayName: 'Custom Query Parameters',
		name: 'customQueryParameters',
		type: 'fixedCollection',
		placeholder: 'Add Query Parameter',
		default: {},
		description: 'Custom query parameters to append to the request URL',
		typeOptions: {
			multipleValues: true,
		},
		options: [
			{
				name: 'parameters',
				displayName: 'Parameter',
				values: [
					{
						displayName: 'Key',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Query parameter name',
						placeholder: 'e.g. with or filter[status]',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Query parameter value',
						placeholder: 'e.g. stage or ={{ $json.param }}',
					},
				],
			},
		],
	};

	const queryJsonField: INodeProperties = {
		displayName: 'Custom Query (JSON)',
		name: 'customQueryJson',
		type: 'json',
		default: '',
		description: 'Custom JSON object of query parameters to merge into the request URL',
		placeholder: '{\n  "with": "deals"\n}',
	};

	if (isGetOrHead) {
		return [queryFixedCollection, queryJsonField];
	}

	const bodyFixedCollection: INodeProperties = {
		displayName: 'Custom Body Fields',
		name: 'customBodyFields',
		type: 'fixedCollection',
		placeholder: 'Add Custom Field',
		default: {},
		description: 'Custom fields to add to the root request body payload',
		typeOptions: {
			multipleValues: true,
		},
		options: [
			{
				name: 'fields',
				displayName: 'Field',
				values: [
					{
						displayName: 'Key',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Field name / key in the root payload',
						placeholder: 'e.g. custom_field_123',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Value to send (supports strings, numbers, booleans, JSON objects/arrays, or expressions)',
						placeholder: 'e.g. value or ={{ $json.field }}',
					},
				],
			},
		],
	};

	const bodyJsonField: INodeProperties = {
		displayName: 'Custom Body (JSON)',
		name: 'customBodyJson',
		type: 'json',
		default: '',
		description: 'Custom JSON object to merge directly into the root request body payload',
		placeholder: '{\n  "custom_field": "value"\n}',
	};

	return [bodyFixedCollection, bodyJsonField, queryFixedCollection, queryJsonField];
}

function buildStructuredProperties(generatedProperties: INodeProperties[]): INodeProperties[] {
	const selectors: INodeProperties[] = [];
	const passthrough: INodeProperties[] = [];
	const scopedRequired = new Map<string, INodeProperties[]>();
	const scopedOptional = new Map<string, INodeProperties[]>();
	const scopeToDisplayOptions = new Map<string, INodeProperties['displayOptions']>();
	const scopeToCollectionName = new Map<string, string>();
	const scopeToMethod = new Map<string, string>();
	const scopeOrder: string[] = [];

	// 1. Process selectors and attach piperunPreSend hook to each operation's routing
	for (const property of generatedProperties) {
		if (isSelectorProperty(property)) {
			if (property.name === 'operation' && Array.isArray(property.options)) {
				const resource = (
					property.displayOptions?.show as Record<string, unknown> | undefined
				)?.resource as string[] | undefined;
				const resourceName = resource?.[0] ?? '';

				for (const option of property.options) {
					const opOption = option as {
						value?: string;
						routing?: INodePropertyRouting;
					};
					if (opOption.value) {
						const scopeKey = `${resourceName}::${opOption.value}`;
						const method = (opOption.routing?.request?.method as string | undefined)?.toUpperCase() || 'GET';
						scopeToMethod.set(scopeKey, method);

						if (!scopeOrder.includes(scopeKey)) {
							scopeOrder.push(scopeKey);
						}
						if (!scopeToCollectionName.has(scopeKey)) {
							scopeToCollectionName.set(scopeKey, getCollectionName(scopeKey));
						}
						if (!scopeToDisplayOptions.has(scopeKey)) {
							scopeToDisplayOptions.set(scopeKey, {
								show: {
									resource: [resourceName],
									operation: [opOption.value],
								},
							});
						}

						// Attach piperunPreSend hook to operation routing
						opOption.routing = opOption.routing || {};
						opOption.routing.send = opOption.routing.send || {};
						opOption.routing.send.preSend = opOption.routing.send.preSend || [];
						if (!opOption.routing.send.preSend.includes(piperunPreSend)) {
							opOption.routing.send.preSend.push(piperunPreSend);
						}
					}
				}
			}
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

	// 2. Build structured properties including custom fields/parameters for every operation
	for (const scopeKey of scopeOrder) {
		const requiredFields = scopedRequired.get(scopeKey) ?? [];
		structuredProperties.push(...requiredFields);

		const optionalFields = scopedOptional.get(scopeKey) ?? [];
		const method = scopeToMethod.get(scopeKey) || 'GET';
		const customParams = getCustomParametersForMethod(method);

		// Append custom parameters beyond the schema-defined fields
		optionalFields.push(...customParams);

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

const doc = stripUnsupportedJsonRequestBodies(rawDoc);

const config: N8NPropertiesBuilderConfig = {};
const parser = new N8NPropertiesBuilder(doc, config);
const properties = buildStructuredProperties(parser.build());

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
