import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import type {IWebhookFunctions,IDataObject} from 'n8n-workflow';
import {FamulorTriggerV3,webhookEvents} from '../nodes/Famulor/v3/FamulorTriggerV3.node';
import {createWebhookSignature} from '../nodes/Famulor/webhookSignature';

const trigger=new FamulorTriggerV3();
function context(event:string,body:IDataObject,signature?:string,filter='',raw?:string):IWebhookFunctions{
 const rawBody=raw??JSON.stringify(body);
 return {getCredentials:async()=>({secret:'test-secret'}),getRequestObject:()=>({rawBody}),getHeaderData:()=>({'x-famulor-signature':signature??createWebhookSignature('test-secret',rawBody)}),getBodyData:()=>body,getNodeParameter:(name:string)=>name==='event'?event:filter,getResponseObject:()=>({status:()=>({json:()=>{}})})} as unknown as IWebhookFunctions;
}
describe('signed native webhooks',()=>{
 for(const event of webhookEvents)it(`accepts a valid ${event} event`,async()=>{const body={event,data:{id:'record'}};assert.deepEqual((await trigger.webhook.call(context(event,body))).workflowData,[[{json:body}]]);});
 it('rejects an invalid signature and modified body',async()=>{assert.equal((await trigger.webhook.call(context('call.completed',{event:'call.completed'},'sha256='+'0'.repeat(64)))).noWebhookResponse,true);});
 it('requires the selected event and assistant filter to match',async()=>{
  assert.deepEqual((await trigger.webhook.call(context('call.completed',{event:'booking.created'}))).workflowData,[[]]);
  assert.deepEqual((await trigger.webhook.call(context('call.completed',{event:'call.completed'},undefined,'assistant-id'))).workflowData,[[]]);
  assert.deepEqual((await trigger.webhook.call(context('call.completed',{event:'call.completed',data:{assistant_id:'other'}},undefined,'assistant-id'))).workflowData,[[]]);
 });
 it('declares encrypted webhook credentials instead of a secret in node parameters',()=>{assert.equal(trigger.description.credentials?.[0].name,'famulorWebhookApi');assert.ok(!trigger.description.properties.some(prop=>prop.name==='webhookSecret'));});
 it('matches the actual signed conversation envelope with nested assistant IDs',async()=>{
  for(const body of [{event:'conversation.ended',data:{conversation:{id:'conversation'},assistant:{id:'assistant-id'}}},{event:'conversation.ended',assistant:{id:'assistant-id'}}]){
   assert.deepEqual((await trigger.webhook.call(context('conversation.ended',body,undefined,'assistant-id'))).workflowData,[[{json:body}]]);
   assert.deepEqual((await trigger.webhook.call(context('conversation.ended',body,undefined,'other'))).workflowData,[[]]);
  }
 });
 it('hides and ignores assistant filtering for booking events without assistant IDs',async()=>{
  assert.deepEqual(trigger.description.properties.find(prop=>prop.name==='assistantId')?.displayOptions?.show?.event,['call.completed','conversation.ended']);
  const body={event:'booking.created',data:{id:'booking'}};
  assert.deepEqual((await trigger.webhook.call(context('booking.created',body,undefined,'stale-filter'))).workflowData,[[{json:body}]]);
 });
});
