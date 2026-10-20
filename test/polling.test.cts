import assert from 'node:assert/strict';
import { describe,it } from 'node:test';
import type { IDataObject,IPollFunctions,IHttpRequestOptions } from 'n8n-workflow';
import { FamulorPollingTrigger } from '../nodes/Famulor/FamulorPollingTrigger.node';
import { pollingDefinitions,PollDefinition } from '../nodes/Famulor/polling/definitions';
import { POLLING_LOOKBACK_MS } from '../nodes/Famulor/polling/engine';

const trigger=new FamulorPollingTrigger();
const campaignId='00000000-0000-4000-8000-000000000003';
function fixture(definition:PollDefinition,state:IDataObject,rows:Record<string,unknown>[],mode='trigger',send?: (req:IHttpRequestOptions)=>Promise<unknown>):IPollFunctions {
 return {getMode:()=>mode,getActivationMode:()=> 'activate',getNode:()=>({name:'Famulor Polling Trigger',typeVersion:1,credentials:{famulorApi:{id:'test-credential'}}}),getWorkflowStaticData:()=>state,getCredentials:async()=>({apiKey:'test-key',baseUrl:'https://app.famulor.io'}),getNodeParameter:(name:string,fallback:unknown)=>name==='event'?definition.name:name==='campaignId'?campaignId:fallback,helpers:{httpRequestWithAuthentication:async function(_name:string,req:IHttpRequestOptions){if(send)return send(req);const offset=Number(new URL(req.url).searchParams.get('offset')??0);const page=rows.slice(offset,offset+100);return {statusCode:200,body:{data:definition.dataKey?{[definition.dataKey]:page}:page}};}}} as unknown as IPollFunctions;
}
function row(id:string,time:number,definition:PollDefinition):Record<string,unknown>{return {id,...definition.query,created_at:new Date(time).toISOString(),updated_at:new Date(time).toISOString(),last_activity_at:new Date(time).toISOString(),ended_at:new Date(time).toISOString()};}

describe('native polling events',()=>{
 it('registers all 32 events with unique names',()=>{assert.equal(pollingDefinitions.length,32);assert.equal(new Set(pollingDefinitions.map(def=>def.name)).size,32);});
 for(const definition of pollingDefinitions)it(`${definition.displayName}: initialize, emit, dedupe and manual test`,async t=>{
  let now=Date.parse('2026-10-04T00:00:00Z');t.mock.method(Date,'now',()=>now);
  const state:IDataObject={};const rows=[row('old',now-60000,definition)];
  const context=fixture(definition,state,rows);
  assert.equal(await trigger.poll.call(context),null);
  now+=1000;rows.unshift(row('new',now,definition));
  assert.equal((await trigger.poll.call(context))?.[0][0].json.id,'new');
  assert.equal(await trigger.poll.call(context),null);
  const before=JSON.stringify(state);
  assert.ok((await trigger.poll.call(fixture(definition,state,rows,'manual')))?.[0].length);
  assert.equal(JSON.stringify(state),before);
  if(definition.once){now+=1000;rows[0]=row('new',now,definition);assert.equal(await trigger.poll.call(context),null);}
  t.mock.restoreAll();
 });
 it('emits activity again when its timestamp changes',async t=>{
  let now=Date.parse('2026-10-04T00:00:00Z');t.mock.method(Date,'now',()=>now);
  const definition=pollingDefinitions.find(def=>def.name==='newHistoryActivity')!;
  const state:IDataObject={};const rows:Record<string,unknown>[]=[];const context=fixture(definition,state,rows);
  await trigger.poll.call(context);now+=1000;rows.push(row('thread',now,definition));assert.equal((await trigger.poll.call(context))?.[0].length,1);
  now+=1000;rows[0]=row('thread',now,definition);assert.equal((await trigger.poll.call(context))?.[0].length,1);
  t.mock.restoreAll();
 });
 it('preserves checkpoints after failed pagination and capped responses',async()=>{
  const definition=pollingDefinitions.find(def=>def.name==='newBooking')!;
  const state:IDataObject={};await trigger.poll.call(fixture(definition,state,[]));const before=JSON.stringify(state);
  const rows=Array.from({length:100},(_,i)=>({id:`row-${i}`}));
  await assert.rejects(trigger.poll.call(fixture(definition,state,[],'trigger',async req=>{if(new URL(req.url).searchParams.get('offset')==='100')throw new Error('page failure');return {statusCode:200,body:{data:rows}};})),/failed/);
  assert.equal(JSON.stringify(state),before);
  await assert.rejects(trigger.poll.call(fixture(definition,state,[],'trigger',async()=>({statusCode:200,body:{data:rows,meta:{result_cap_reached:true}}}))),/capped/);
  assert.equal(JSON.stringify(state),before);
 });
 it('rejects invalid timestamps and IDs without changing state',async()=>{
  const definition=pollingDefinitions.find(def=>def.name==='newCall')!;const state:IDataObject={};await trigger.poll.call(fixture(definition,state,[]));const before=JSON.stringify(state);
  for(const rows of [[{id:'bad',created_at:'invalid'}],[{created_at:new Date().toISOString()}]]){await assert.rejects(trigger.poll.call(fixture(definition,state,rows)),/Invalid/);assert.equal(JSON.stringify(state),before);}
 });
 it('does not include a raw credential in persisted state',async()=>{
  const definition=pollingDefinitions[0];const state:IDataObject={};await trigger.poll.call(fixture(definition,state,[]));assert.ok(!JSON.stringify(state).includes('test-key'));
 });
 it('finds a completion for a call created before activation',async t=>{
  let now=Date.parse('2026-10-04T00:00:00Z');t.mock.method(Date,'now',()=>now);
  const definition=pollingDefinitions.find(def=>def.completed)!;const state:IDataObject={};const rows:Record<string,unknown>[]=[];const context=fixture(definition,state,rows);await trigger.poll.call(context);
  now+=1000;rows.push({...row('call',now,definition),created_at:new Date(now-60000).toISOString()});assert.equal((await trigger.poll.call(context))?.[0][0].json.id,'call');t.mock.restoreAll();
 });
 it('finds delayed-visible records within the lookback without replaying earlier results',async t=>{
  let now=Date.parse('2026-10-04T00:00:00Z');t.mock.method(Date,'now',()=>now);
  const definition=pollingDefinitions.find(def=>def.name==='newCall')!;
  const state:IDataObject={};const rows:Record<string,unknown>[]=[];const context=fixture(definition,state,rows);await trigger.poll.call(context);
  const start=now;now+=10000;rows.push(row('visible',start+9000,definition));assert.deepEqual((await trigger.poll.call(context))?.[0].map(item=>item.json.id),['visible']);
  rows.push(row('delayed',start+8000,definition));assert.deepEqual((await trigger.poll.call(context))?.[0].map(item=>item.json.id),['delayed']);
  assert.equal(await trigger.poll.call(context),null);
 });
 it('reads same-timestamp records across pages and deduplicates all of them',async t=>{
  let now=Date.parse('2026-10-04T00:00:00Z');t.mock.method(Date,'now',()=>now);
  const definition=pollingDefinitions.find(def=>def.name==='newContact')!;
  const state:IDataObject={};const rows:Record<string,unknown>[]=[];const context=fixture(definition,state,rows);await trigger.poll.call(context);
  now+=1000;rows.push(...Array.from({length:101},(_,index)=>row(`contact-${index}`,now,definition)));
  assert.equal((await trigger.poll.call(context))?.[0].length,101);assert.equal(await trigger.poll.call(context),null);
 });
 it('prunes timestamp dedupe state outside the lookback and does not replay stale versions',async t=>{
  let now=Date.parse('2026-10-04T00:00:00Z');t.mock.method(Date,'now',()=>now);
  const definition=pollingDefinitions.find(def=>def.name==='newHistoryActivity')!;
  const state:IDataObject={};const rows:Record<string,unknown>[]=[];const context=fixture(definition,state,rows);await trigger.poll.call(context);
  now+=1000;rows.push(row('old-thread',now,definition));await trigger.poll.call(context);
  now+=1000;rows[0]=row('old-thread',now,definition);await trigger.poll.call(context);
  rows[0]=row('old-thread',now-1000,definition);assert.equal(await trigger.poll.call(context),null);
  now+=POLLING_LOOKBACK_MS+1000;rows.unshift(row('new-thread',now,definition));await trigger.poll.call(context);
  const checkpoint=state.famulorCheckpoint as unknown as {seen:Record<string,string>};assert.equal(Object.keys(checkpoint.seen).length,1);
 });
});
