import { NodeConnectionTypes } from '../connections';
import type { INodeType, INodeTypeDescription, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';
import { extractAssistantId, extractWebhookEvent } from '../api';
import { SIGNATURE_HEADER,verifyWebhookSignature } from '../webhookSignature';

export const webhookEvents=['booking.cancelled','booking.created','booking.rescheduled','call.completed','conversation.ended'];

function assistantId(body: Record<string, unknown>): unknown {
  const data = body.data as Record<string, unknown> | undefined;
  return extractAssistantId(body) ?? (data?.assistant as Record<string, unknown> | undefined)?.id ?? (body.assistant as Record<string, unknown> | undefined)?.id;
}

export class FamulorTriggerV3 implements INodeType {
  description:INodeTypeDescription={displayName:'Famulor Trigger',name:'famulorTrigger',icon:'file:famulor.svg',group:['trigger'],version:3,
    subtitle:'={{$parameter["event"]}}',description:'Receive signed Famulor call, conversation and booking webhooks',defaults:{name:'Famulor Trigger'},inputs:[],outputs:[NodeConnectionTypes.Main],
    credentials:[{name:'famulorWebhookApi',required:true}],webhooks:[{name:'default',httpMethod:'POST',responseMode:'onReceived',path:'webhook'}],
    properties:[
      {displayName:'Event',name:'event',type:'options',required:true,default:'',noDataExpression:true,options:webhookEvents.map(event=>({name:event,value:event}))},
      {displayName:'Assistant ID',name:'assistantId',type:'string',default:'',displayOptions:{show:{event:['call.completed','conversation.ended']}},description:'Optional assistant UUID filter. Events without this assistant ID are ignored.'},
      {displayName:'Configure the Production URL in Famulor: call.completed in Settings → Webhooks, conversation.ended in Settings → Webhooks with a signing secret, and booking events in the booking event type. Add the same signing secret to Famulor and these n8n credentials. Existing destinations are not changed automatically.',name:'setupNotice',type:'notice',default:''},
    ],
  };
  async webhook(this:IWebhookFunctions):Promise<IWebhookResponseData>{
    const credentials=await this.getCredentials('famulorWebhookApi');
    const request=this.getRequestObject() as {rawBody?:Buffer|string};
    const headers=this.getHeaderData();
    const signature=headers[SIGNATURE_HEADER]??headers['X-Famulor-Signature'];
    if(typeof credentials.secret!=='string'||!request.rawBody||!verifyWebhookSignature({secret:credentials.secret,rawBody:request.rawBody,headerValue:typeof signature==='string'?signature:undefined})) {
      this.getResponseObject().status(401).json({error:'Invalid Famulor webhook signature'}); return {noWebhookResponse:true};
    }
    const body=this.getBodyData();
    const event=this.getNodeParameter('event') as string;
    const filter=event.startsWith('booking.')?'':this.getNodeParameter('assistantId','') as string;
    if(!webhookEvents.includes(event)||extractWebhookEvent(body)!==event||filter&&assistantId(body)!==filter) return {workflowData:[[]]};
    return {workflowData:[[{json:body}]]};
  }
}
