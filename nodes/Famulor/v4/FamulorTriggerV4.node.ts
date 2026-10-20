import type { IHookFunctions } from 'n8n-workflow';
import { FamulorTriggerV3 } from '../v3/FamulorTriggerV3.node';
import { webhookExists, createWebhook, deleteWebhook } from '../webhookLifecycle';

export class FamulorTriggerV4 extends FamulorTriggerV3 {
	constructor() {
		super();
		this.description = {
			...this.description,
			version: 4,
			properties: this.description.properties.map((property) =>
				property.name === 'registrationMode'
					? { ...property, default: 'automatic' }
					: property.name === 'setupNotice'
						? {
								...property,
								displayName:
									'Automatic registration creates a dedicated signed workspace subscription when activated and removes only that subscription when deactivated. Add a workspace API key and a signing secret of 16–256 characters to Famulor Webhook API credentials. Existing manual destinations stay unchanged. Use one event per trigger.',
							}
						: property,
			),
		};
	}
	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions) {
				return webhookExists(this, 4);
			},
			async create(this: IHookFunctions) {
				return createWebhook(this, 4);
			},
			async delete(this: IHookFunctions) {
				return deleteWebhook(this, 4);
			},
		},
	};
}
