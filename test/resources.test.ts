import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import type { ILoadOptionsFunctions,IHttpRequestOptions } from 'n8n-workflow';
import {resources,resourceOptions} from '../nodes/Famulor/v3/resources';
import {operationProperties} from '../nodes/Famulor/v3/properties';
import {operations} from '../nodes/Famulor/v3/generated/catalog';
const uuid='00000000-0000-4000-8000-000000000001';
function context(send:(options:IHttpRequestOptions)=>Promise<unknown>):ILoadOptionsFunctions{return {getCredentials:async()=>({apiKey:'test-key',baseUrl:'https://app.famulor.io'}),helpers:{httpRequestWithAuthentication:async function(_name:string,options:IHttpRequestOptions){return {statusCode:200,body:await send(options)};}}} as unknown as ILoadOptionsFunctions;}
describe('workspace resource selectors',()=>{
 for(const resource of resources)it(`loads ${resource.label} with a read-only request`,async()=>{
  const requests:IHttpRequestOptions[]=[];
  const result=await resourceOptions({context:context(async request=>{requests.push(request);return {data:resource.key?{[resource.key]:[{id:uuid,name:'QA'}]}:[{id:uuid,name:'QA'}]};}),resource});
  assert.equal(result.options[0].value,uuid);assert.equal(requests[0].method,'GET');assert.equal(new URL(requests[0].url).pathname,`/api/v1${resource.path}`);
 });
 it('provides searchable list and mapped-ID modes for call inputs',()=>{const property=operationProperties(operations.find(op=>op.id==='createCall')!).find(prop=>prop.name==='body_assistant_id')!;assert.equal(property.type,'resourceLocator');assert.equal(property.modes?.[0].typeOptions?.searchable,true);assert.equal(property.modes?.[1].name,'id');});
 it('unwraps automation detail when finding an exact UUID',async()=>{const result=await resourceOptions({context:context(async()=>({data:{automation:{id:uuid,name:'QA'},runs:[]}})),resource:resources.find(resource=>resource.path==='/automations')!,searchValue:uuid});assert.equal(result.options[0].value,uuid);});
 for(const path of ['/leads','/scheduled-callbacks'])it(`finds an older ${path} UUID without applying a text-only search filter`,async()=>{
  const queries:URLSearchParams[]=[];
  const result=await resourceOptions({context:context(async request=>{const query=new URL(request.url).searchParams;queries.push(query);return {data:query.get('offset')==='0'?Array.from({length:100},(_,i)=>({id:`other-${i}`,name:'Other'})):[{id:uuid,name:'QA'}],meta:{result_cap_reached:true}};}),resource:resources.find(resource=>resource.path===path)!,searchValue:uuid});
  assert.equal(result.options[0].value,uuid);assert.equal(queries.length,2);assert.ok(queries.every(query=>!query.has('search')));assert.ok(result.placeholder?.includes('capped'));
 });
});
