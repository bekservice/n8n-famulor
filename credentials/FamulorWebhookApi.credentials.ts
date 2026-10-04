import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class FamulorWebhookApi implements ICredentialType {
  name='famulorWebhookApi';
  displayName='Famulor Webhook API';
  documentationUrl='https://docs.famulor.io/automations/n8n';
  icon='file:famulor.svg' as const;
  properties:INodeProperties[]=[{displayName:'Webhook Secret',name:'secret',type:'string',typeOptions:{password:true},default:'',required:true,description:'Secret configured for the Famulor webhook destination. n8n stores it encrypted in credentials'}];
}
