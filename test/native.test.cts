import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe,it } from 'node:test';
import type { IExecuteFunctions,IHttpRequestOptions,INodeParameters } from 'n8n-workflow';
import { NodeApiError, NodeHelpers } from 'n8n-workflow';
import { Famulor } from '../nodes/Famulor/Famulor.node';
import { FamulorTrigger } from '../nodes/Famulor/FamulorTrigger.node';
import { FamulorV3 } from '../nodes/Famulor/v3/FamulorV3.node';
import { operations,catalogSource } from '../nodes/Famulor/v3/generated/catalog';
import { operationProperties } from '../nodes/Famulor/v3/properties';
import { famulorV3Api,safeBaseUrl } from '../nodes/Famulor/v3/client';
import type { ApiField } from '../nodes/Famulor/v3/types';

const node=new FamulorV3();
const uuid='00000000-0000-4000-8000-000000000001';
function sample(field:ApiField):unknown {
 if(field.enum) return field.enum.find(value=>value!==null);
 if(field.type==='boolean')return false;
 if(['integer','number'].includes(field.type))return field.minimum??1;
 if(field.type==='array')return [];
 if(['object','json'].includes(field.type))return {};
 return field.format==='uuid'?uuid:'test'.padEnd(Math.max(field.minLength??1,4),'x').slice(0,field.maxLength);
}
function context(params:Record<string,unknown>,send:(options:IHttpRequestOptions)=>Promise<unknown>,count=1,fail=false):IExecuteFunctions {
 return {getInputData:()=>Array.from({length:count},()=>({json:{}})),getNodeParameter:(name:string,_index:number,fallback:unknown)=>Object.hasOwn(params,name)?params[name]:fallback,getCredentials:async()=>({apiKey:'test-key',baseUrl:'https://app.famulor.io'}),getNode:()=>({name:'Famulor',typeVersion:3}),continueOnFail:()=>fail,helpers:{httpRequestWithAuthentication:async function(_name:string,options:IHttpRequestOptions){return send(options);},prepareBinaryData:async(_body:Buffer,fileName:string,mimeType:string)=>({data:'test',mimeType,fileName})}} as unknown as IExecuteFunctions;
}

describe('native API actions',()=>{
 it('retains all published v2.1.1 action routes and saved input field names and types',()=>{
  const baseline=JSON.parse(readFileSync('test/fixtures/v2.1.1-action-inputs.json','utf8')) as {id:string;tag:string;method:string;path:string;fields:{name:string;in?:string;type:string;required:boolean}[]}[];
  assert.equal(baseline.length,423);
  for(const saved of baseline){
   const current=operations.find(operation=>operation.id===saved.id);
   assert.ok(current,`Missing saved operation ${saved.id}`);
   for(const key of ['tag','method','path'] as const)assert.equal(current[key],saved[key],`${saved.id}: ${key}`);
   const fields=[...current.parameters,...current.body?.fields??[]];
   for(const field of saved.fields){
    const currentField=fields.find(candidate=>candidate.name===field.name&&candidate.in===field.in);
    assert.ok(currentField,`${saved.id}: missing ${field.name}`);
    if(field.required){
     const name=`${field.in??'body'}_${field.name}`;
     assert.ok(operationProperties(current).some(prop=>prop.name===name),`${saved.id}: lost top-level ${name}`);
    }
    const migratedHistoryFilter=saved.id==='listHistory'&&field.in==='query'&&['type','direction','status','assistant_id','campaign_id'].includes(field.name);
    if(migratedHistoryFilter){
     assert.equal(field.type,'string');assert.equal(currentField.type,'array');
     assert.equal(currentField.style,'form');assert.equal(currentField.explode,false);
    }else assert.equal(currentField.type,field.type,`${saved.id}: type for ${field.name}`);
   }
  }
 });
 it('preserves every saved 2.2.0 route and input while adding compatible operations',()=>{
  const baseline=JSON.parse(readFileSync('test/fixtures/v2.2.0-action-inputs.json','utf8')) as {id:string;tag:string;method:string;path:string;fields:{name:string;in?:string;type:string;required:boolean}[]}[];
  assert.equal(baseline.length,474);
  for(const saved of baseline){
   const current=operations.find(op=>op.id===saved.id)!;assert.ok(current,saved.id);
   for(const key of ['tag','method','path'] as const)assert.equal(current[key],saved[key],saved.id+': '+key);
   const fields=[...current.parameters,...current.body?.fields??[]];
   for(const previous of saved.fields){const field=fields.find(f=>f.name===previous.name&&f.in===previous.in)!;assert.ok(field,saved.id+': '+previous.name);assert.equal(field.type,previous.type);assert.equal(field.required,previous.required);}
   for(const field of fields.filter(f=>f.required))assert.ok(saved.fields.some(f=>f.name===field.name&&f.in===field.in&&f.required),saved.id+': new required field '+field.name);
  }
 });
 for(const id of ['getCallBrowserRecording','getMessagingBrowserRecording'])it(id+': returns exact video bytes as a file',async()=>{
  const operation=operations.find(op=>op.id===id)!;
  const bytes=Buffer.from([0,255,34,128,12]);let received:Buffer|undefined;
  const ctx=context({resource:operation.tag,operation:operation.id,path_id:uuid,path_recordingId:uuid},async req=>{assert.equal(req.encoding,'arraybuffer');assert.equal(req.json,false);return {statusCode:200,body:bytes,headers:{'Content-Type':'VIDEO/WEBM; codecs=vp9'}};});
  ctx.helpers.prepareBinaryData=async(body)=>{received=body as Buffer;return {data:'fixture',mimeType:'video/webm',fileName:'file.webm'};};
  const result=await node.execute.call(ctx);assert.deepEqual(received,bytes);assert.equal(result[0][0].binary?.data.mimeType,'video/webm');
 });
 it('registers 487 native choices and preserves saved v2 action and webhook nodes',()=>{
  assert.equal(operations.length,487);assert.equal(catalogSource.count,487);
  const choices=node.description.properties.filter(prop=>prop.name==='operation').flatMap(prop=>prop.options??[]);
  assert.equal(choices.length,487);
  assert.equal(new Set(operations.map(operation=>operation.id)).size,487);
  assert.equal(new Famulor().getNodeType(2).description.version,2);
  assert.equal(new Famulor().getNodeType().description.version,3);
  assert.equal(new FamulorTrigger().getNodeType(2).description.version,2);
  assert.equal(new FamulorTrigger().getNodeType().description.version,4);
 });
 it('executes saved v2 call parameters with their original request and output shape',async()=>{
  const legacy=new Famulor().getNodeType(2);
  const requests:IHttpRequestOptions[]=[];
  const result=await legacy.execute!.call(context({resource:'call',operation:'make',assistantId:uuid,toNumber:'+4915123456789',additionalFields:{phoneNumberId:uuid,lead:'{"name":"Legacy"}'}},async req=>{requests.push(req);return {data:{id:'saved-call'}};}));
  assert.equal(requests[0].method,'POST');assert.equal(requests[0].url,'https://app.famulor.io/api/v1/calls');
  assert.deepEqual(requests[0].body,{assistant_id:uuid,to_number:'+4915123456789',phone_number_id:uuid,lead:{name:'Legacy'}});
  assert.deepEqual(result,[[{json:{id:'saved-call'},pairedItem:{item:0}}]]);
 });
 for(const operation of operations)it(`${operation.id}: executes the registered action with actual n8n builder defaults`,async()=>{
  const required:Record<string,unknown>={resource:operation.tag,operation:operation.id};
  for(const field of operation.parameters.filter(field=>field.required))required[`${field.in}_${field.name}`]=sample(field);
  for(const field of operation.body?.fields?.filter(field=>field.required)??[])required[`body_${field.name}`]=sample(field);
  if(operation.body?.required&&!operation.body.fields)required.body={};
  const defaults=NodeHelpers.getNodeParameters(node.description.properties,required as INodeParameters,true,false,{typeVersion:3},node.description)!;
  assert.deepEqual(defaults.optionalFields??{},{});
  const requests:IHttpRequestOptions[]=[];
  const result=await node.execute.call(context(defaults,async request=>{requests.push(request);return {statusCode:200,body:operation.binary?Buffer.from('audio'):{data:{id:'result'}}};}));
  assert.equal(requests.length,1);
  const req=requests[0];
  assert.equal(req.method,operation.method);
  assert.equal(req.disableFollowRedirect,true);
  assert.equal(new URL(req.url).origin,'https://app.famulor.io');
  assert.equal(new URL(req.url).pathname,'/api/v1'+operation.path.replace(/\{([^}]+)\}/g,(_,key:string)=>encodeURIComponent(String(required[`path_${key}`]))));
  if(operation.body?.fields){
   const expected=Object.fromEntries(operation.body.fields.filter(field=>field.required).map(field=>[field.name,required[`body_${field.name}`]]));
   assert.deepEqual(req.body,operation.body.required||Object.keys(expected).length?expected:undefined);
  }
  assert.deepEqual(result[0][0].pairedItem,{item:0});
  if(operation.binary)assert.equal(result[0][0].binary?.data.mimeType,operation.binaryContentType);else assert.equal(result[0][0].json.id,'result');
 });
 it('executes saved History text filters and resource locators as well as current arrays',async()=>{
  const operation=operations.find(operation=>operation.id==='listHistory')!;
  for(const optionalFields of [
   {query_type:'call,avatar',query_direction:'inbound',query_status:'completed,failed',query_assistant_id:{mode:'id',value:uuid},query_campaign_id:uuid},
   {query_type:['call','avatar'],query_direction:['inbound'],query_status:'["completed","failed"]',query_assistant_id:[uuid],query_campaign_id:[uuid]},
  ]){
   const defaults=NodeHelpers.getNodeParameters(node.description.properties,{resource:operation.tag,operation:operation.id,optionalFields} as INodeParameters,true,false,{typeVersion:3},node.description)!;
   const requests:IHttpRequestOptions[]=[];
   await node.execute.call(context(defaults,async req=>{requests.push(req);return {statusCode:200,body:{data:[]}};}));
   const query=Object.fromEntries(new URL(requests[0].url).searchParams);
   assert.deepEqual(query,{type:'call,avatar',direction:'inbound',status:'completed,failed',assistant_id:uuid,campaign_id:uuid});
  }
 });
 it('does not accept legacy text as an array request body',()=>{
  const operation:Parameters<typeof famulorV3Api.buildRequest>[0]['operation']={id:'fixture',method:'POST',path:'/test',summary:'Test',description:'Test',tag:'Test',parameters:[],body:{required:true,fields:[{name:'items',type:'array',required:true}]}};
  assert.throws(()=>famulorV3Api.buildRequest({operation,node:context({},async()=>({})).getNode(),values:{body_items:'a,b'}}),/valid array/);
 });
 it('preserves saved custom-domain address inputs and allows new hosted addresses',async()=>{
  const operation=operations.find(operation=>operation.id==='createEmailAddress')!;
  for(const savedDomain of [uuid,undefined]){
   const saved={resource:operation.tag,operation:operation.id,body_local_part:'support',...(savedDomain?{body_domain_id:savedDomain}:{optionalFields:{body_hosted:true}})};
   const defaults=NodeHelpers.getNodeParameters(node.description.properties,saved,true,false,{typeVersion:3},node.description)!;
   const requests:IHttpRequestOptions[]=[];
   await node.execute.call(context(defaults,async req=>{requests.push(req);return {statusCode:200,body:{data:{id:uuid}}};}));
   assert.deepEqual(requests[0].body,{local_part:'support',...(savedDomain?{domain_id:savedDomain}:{hosted:true})});
  }
 });
 it('does not change phone-number call permissions when only the label is updated',async()=>{
  const op=operations.find(op=>op.id==='updatePhoneNumber')!;
  const requests:IHttpRequestOptions[]=[];
  await node.execute.call(context({resource:op.tag,operation:op.id,path_id:uuid,optionalFields:{body_label:'QA'}},async req=>{requests.push(req);return {statusCode:200,body:{data:{id:uuid}}};}));
  assert.deepEqual(requests[0].body,{label:'QA'});
 });
 it('preserves intentional false, zero and explicit clearing values',()=>{
  const operation={id:'fixture',method:'PATCH',path:'/assistants/{id}',summary:'Fixture',description:'Fixture',tag:'Fixture',parameters:[{name:'id',in:'path',required:true,type:'string'}],body:{required:true,fields:[{name:'enabled',required:false,type:'boolean'},{name:'limit',required:false,type:'number'},{name:'tags',required:false,type:'array'},{name:'name',required:false,type:'string'},{name:'greeting',required:false,type:'string'}]}};
  assert.deepEqual(famulorV3Api.buildRequest({operation,node:context({},async()=>({})).getNode(),values:{path_id:uuid,body_enabled:false,body_limit:0,body_tags:[],body_name:'',body_greeting:null}}).body,{enabled:false,limit:0,tags:[],name:'',greeting:null});
 });
 it('preserves JSON objects with mode and value keys instead of unwrapping them as locators',()=>{
  const operation=operations.find(op=>op.id==='createCall')!;
  const variables={mode:'test',value:'text'};
  assert.deepEqual((famulorV3Api.buildRequest({operation,node:context({},async()=>({})).getNode(),values:{body_assistant_id:uuid,body_to_number:'+4915123456789',body_variables:variables}}).body as Record<string,unknown>).variables,variables);
  assert.deepEqual((famulorV3Api.buildRequest({operation,node:context({},async()=>({})).getNode(),values:{body_assistant_id:{mode:'id',value:uuid},body_to_number:'+4915123456789',body_variables:JSON.stringify(variables)}}).body as Record<string,unknown>).variables,variables);
 });
 it('pairs every output and continue-on-fail error to its input item',async()=>{
  const op=operations.find(op=>op.id==='getMe')!;
  const result=await node.execute.call(context({resource:op.tag,operation:op.id},async()=>{throw new Error('Bearer sensitive-key');},2,true));
  assert.deepEqual(result[0].map(item=>item.pairedItem),[{item:0},{item:1}]);
  assert.ok(result[0].every(item=>!JSON.stringify(item.json).includes('sensitive-key')));
 });
 it('rejects redirects without retrying a write',async()=>{
  const operation=operations.find(op=>op.id==='createCall')!;
  let calls=0;
  await assert.rejects(node.execute.call(context({resource:operation.tag,operation:operation.id,body_assistant_id:uuid,body_to_number:'+4915123456789'},async()=>{calls++;return {statusCode:302,body:{}};})),/request failed/);
  assert.equal(calls,1);
 });
 it('explains the real n8n service-account rejection for personal credit warnings without leaking transport details',async()=>{
  const op=operations.find(op=>op.id==='getCreditNotificationPreferences')!;
  const error=new NodeApiError({name:'Famulor',typeVersion:3} as never,{message:'Bearer sensitive-key',httpCode:'403'});
  await assert.rejects(node.execute.call(context({resource:op.tag,operation:op.id},async()=>{throw error;})),(failure:unknown)=>{
   assert.ok(failure instanceof Error);
   assert.match(failure.message,/HTTP 403/);
   assert.match(failure.message,/user-owned credential/);
   assert.match(failure.message,/Service-account keys/);
   assert.ok(!failure.message.includes('sensitive-key'));
   return true;
  });
 });
 it('keeps safe HTTP diagnostics for full non-success responses and string status codes',async()=>{
  for(const error of [{response:{status:'429',data:{message:'Bearer sensitive-key'}}},{statusCode:401},{httpCode:'402'}]) {
   const status=Number('httpCode' in error?error.httpCode:'statusCode' in error?error.statusCode:error.response!.status);
   await assert.rejects(famulorV3Api.request(context({},async()=>{throw error;}),{method:'GET',path:'/me'}),new RegExp(`HTTP ${status}`));
  }
  await assert.rejects(famulorV3Api.request(context({},async()=>({statusCode:302,body:{}})),{method:'POST',path:'/calls'}),/HTTP 302/);
 });
 it('preserves the audio response MIME and selects the matching filename',async()=>{
  const op=operations.find(op=>op.binary)!;
  const values:Record<string,unknown>={resource:op.tag,operation:op.id};
  for(const field of op.parameters.filter(field=>field.required))values[`${field.in}_${field.name}`]=sample(field);
  const result=await node.execute.call(context(values,async()=>({statusCode:200,headers:{'content-type':'audio/ogg'},body:Buffer.from('audio')})));
  assert.equal(result[0][0].binary?.data.mimeType,'audio/ogg');assert.equal(result[0][0].binary?.data.fileName,'audio.ogg');
 });
 it('rejects unsafe origins and path traversal before transmitting credentials',()=>{
  for(const origin of ['http://app.famulor.io','https://user:password@app.famulor.io','https://app.famulor.io:444','https://app.famulor.io/other'])assert.throws(()=>safeBaseUrl(context({},async()=>({})).getNode(),origin));
  const operation=operations.find(op=>op.id==='getCall')!;
  for(const path of ['..','../me','%2e%2e','x/y'])assert.throws(()=>famulorV3Api.buildRequest({operation,node:context({},async()=>({})).getNode(),values:{path_id:path}}));
 });
});
