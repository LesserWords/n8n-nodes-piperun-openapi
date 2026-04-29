// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import { N8NPropertiesBuilder, N8NPropertiesBuilderConfig } from '@devlikeapro/n8n-openapi-node';
import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';

import * as doc from './Piperun.openapi.json';

const config: N8NPropertiesBuilderConfig = {};
const parser = new N8NPropertiesBuilder(doc, config);
const properties = parser.build();

export class Piperun implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Piperun',
		name: 'piperun',
		icon: { light: 'file:piperun.svg', dark: 'file:piperun.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the PipeRun API',
		defaults: {
			name: 'Piperun',
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
