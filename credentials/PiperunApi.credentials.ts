import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PiperunApi implements ICredentialType {
	name = 'piperunApi';

	icon: Icon = { light: 'file:../icons/piperun.svg', dark: 'file:../icons/piperun.dark.svg' };

	displayName = 'PipeRun API';

	documentationUrl = 'https://developers.pipe.run';

	properties: INodeProperties[] = [
		{
			displayName: 'Token',
			name: 'token',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				token: '={{$credentials.token}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.pipe.run',
			url: '/v1/users',
			method: 'GET',
		},
	};
}
