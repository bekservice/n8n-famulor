import assert from 'node:assert/strict';
import { describe,it } from 'node:test';
import type { IExecuteFunctions,IHttpRequestOptions,INodeParameters } from 'n8n-workflow';
import { NodeApiError, NodeHelpers } from 'n8n-workflow';
import { Famulor } from '../nodes/Famulor/Famulor.node';
import { FamulorTrigger } from '../nodes/Famulor/FamulorTrigger.node';
import { FamulorV3 } from '../nodes/Famulor/v3/FamulorV3.node';
import { operations,catalogSource } from '../nodes/Famulor/v3/generated/catalog';
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
 it('registers 423 native choices and preserves saved v2 action and webhook nodes',()=>{
  assert.equal(operations.length,423);assert.equal(catalogSource.count,423);
  const choices=node.description.properties.filter(prop=>prop.name==='operation').flatMap(prop=>prop.options??[]);
  assert.equal(choices.length,423);
  assert.equal(new Set(operations.map(operation=>operation.id)).size,423);
  assert.equal(new Famulor().getNodeType(2).description.version,2);
  assert.equal(new Famulor().getNodeType().description.version,3);
  assert.equal(new FamulorTrigger().getNodeType(2).description.version,2);
  assert.equal(new FamulorTrigger().getNodeType().description.version,3);
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
 it('does not change phone-number call permissions when only the label is updated',async()=>{
  const op=operations.find(op=>op.id==='updatePhoneNumber')!;
  const requests:IHttpRequestOptions[]=[];
  await node.execute.call(context({resource:op.tag,operation:op.id,path_id:uuid,optionalFields:{body_label:'QA'}},async req=>{requests.push(req);return {statusCode:200,body:{data:{id:uuid}}};}));
  assert.deepEqual(requests[0].body,{label:'QA'});
 });
 it('preserves intentional false, zero and explicit clearing values',()=>{
  const operation={id:'fixture',method:'PATCH',path:'/assistants/{id}',summary:'Fixture',description:'Fixture',tag:'Fixture',parameters:[{name:'id',in:'path',required:true,type:'string'}],body:{required:true,fields:[{name:'enabled',required:false,type:'boolean'},{name:'limit',required:false,type:'number'},{name:'tags',required:false,type:'array'},{name:'name',required:false,type:'string'},{name:'greeting',required:false,type:'string'}]}};
  assert.deepEqual(famulorV3Api.buildRequest({operation,values:{path_id:uuid,body_enabled:false,body_limit:0,body_tags:[],body_name:'',body_greeting:null}}).body,{enabled:false,limit:0,tags:[],name:'',greeting:null});
 });
 it('preserves JSON objects with mode and value keys instead of unwrapping them as locators',()=>{
  const operation=operations.find(op=>op.id==='createCall')!;
  const variables={mode:'test',value:'text'};
  assert.deepEqual((famulorV3Api.buildRequest({operation,values:{body_assistant_id:uuid,body_to_number:'+4915123456789',body_variables:variables}}).body as Record<string,unknown>).variables,variables);
  assert.deepEqual((famulorV3Api.buildRequest({operation,values:{body_assistant_id:{mode:'id',value:uuid},body_to_number:'+4915123456789',body_variables:JSON.stringify(variables)}}).body as Record<string,unknown>).variables,variables);
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
  for(const origin of ['http://app.famulor.io','https://user:password@app.famulor.io','https://app.famulor.io:444','https://app.famulor.io/other'])assert.throws(()=>safeBaseUrl(origin));
  const operation=operations.find(op=>op.id==='getCall')!;
  for(const path of ['..','../me','%2e%2e','x/y'])assert.throws(()=>famulorV3Api.buildRequest({operation,values:{path_id:path}}));
 });
});
