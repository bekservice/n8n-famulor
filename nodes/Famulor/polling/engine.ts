import { createHash } from 'node:crypto';
import type { IDataObject, IPollFunctions, INodeExecutionData } from 'n8n-workflow';
import { famulorV3Api } from '../v3/client';
import type { PollDefinition } from './definitions';

type Item = {record:Record<string,unknown>; key:string; time:number};
type Checkpoint = {identity:string;started:number;time:number;seen:Record<string,string>};

// Re-read a bounded window for records committed or indexed after an earlier poll.
export const POLLING_LOOKBACK_MS = 10 * 60 * 1000;

function timestamp(record: Record<string,unknown>,field?:string):number {
  if (!field) return 0;
  const time = typeof record[field] === 'string' ? Date.parse(record[field]) : NaN;
  if (!Number.isFinite(time)) throw new Error(`Invalid ${field}. Polling state was preserved.`);
  return time;
}

export async function readItems(context:IPollFunctions,definition:PollDefinition,since:number,campaignId:string,manual=false):Promise<Item[]> {
  if(definition.campaign && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(campaignId)) throw new Error('Select a valid campaign UUID.');
  const path=definition.campaign?`/campaigns/${campaignId}/leads`:definition.path;
  const items:Item[]=[];
  const now=Date.now();
  for(let offset=0;offset<50000;offset+=100) {
    const query=new URLSearchParams({...definition.query,...(!definition.unpaged?{limit:'100',offset:String(offset)}:{}),...(path==='/leads'&&since>0?{created_from:new Date(since).toISOString()}:{})});
    const response=await famulorV3Api.request(context,{method:'GET',path:`${path}${query.size?`?${query}`:''}`});
    if(!famulorV3Api.isRecord(response)) throw new Error('Invalid list response. Polling state was preserved.');
    if(famulorV3Api.isRecord(response.meta)&&response.meta.result_cap_reached===true) throw new Error('Famulor capped this result set. Narrow the source data before enabling this trigger. Polling state was preserved.');
    const rows=definition.dataKey&&famulorV3Api.isRecord(response.data)?response.data[definition.dataKey]:response.data;
    if(!Array.isArray(rows)) throw new Error('Invalid list response. Polling state was preserved.');
    const page=rows.map((record:unknown)=>{
      if(!famulorV3Api.isRecord(record)||typeof record.id!=='string'||!record.id) throw new Error('Invalid record ID. Polling state was preserved.');
      return {record,key:`${record.channel??definition.name}:${record.id}`,time:timestamp(record,definition.timeField)};
    });
    items.push(...page.filter(item=>item.time<=now&&(definition.snapshot||definition.campaign||item.time>=since)&&(!definition.messaging||!['call','avatar','live_chat','whatsapp_voice'].includes(String(item.record.channel)))));
    if(manual||definition.unpaged||page.length<100||(definition.ordered!==false&&!definition.snapshot&&!definition.campaign&&page.some(item=>item.time<since))) return items;
  }
  throw new Error('The polling scan exceeded 50,000 records. Polling state was preserved.');
}

export async function poll(context:IPollFunctions,definition:PollDefinition,campaignId=''):Promise<INodeExecutionData[][]|null> {
  const manual=context.getMode()==='manual';
  const state=context.getWorkflowStaticData('node');
  const credentials=await context.getCredentials('famulorApi');
  const identity=JSON.stringify([definition.name,campaignId,context.getNode().credentials?.famulorApi?.id??'',credentials.baseUrl??'',createHash('sha256').update(String(credentials.apiKey??'')).digest('hex')]);
  const old=state.famulorCheckpoint as Checkpoint|undefined;
  if(manual) return [(await readItems(context,definition,0,campaignId,true)).slice(0,5).map(item=>({json:item.record as IDataObject}))];
  const now=Date.now();
  if(!old||old.identity!==identity) {
    const baseline=definition.snapshot||definition.campaign?await readItems(context,definition,0,campaignId):[];
    state.famulorCheckpoint={identity,started:now,time:now,seen:Object.fromEntries(baseline.map(item=>[item.key,definition.once?'once':String(item.time)]))};
    return null;
  }
  const since = Math.max(old.started, old.time - POLLING_LOOKBACK_MS);
  const batch=await readItems(context,definition,since,campaignId);
  const seen={...old.seen};
  const events:Item[]=[];
  for(const item of batch) {
    const version=definition.once?'once':String(item.time);
    if((definition.once?seen[item.key]===version:Number(seen[item.key])>=item.time)||definition.completed&&timestamp(item.record,'ended_at')<old.started) continue;
    events.push(item); seen[item.key]=version;
  }
  const time=definition.snapshot||definition.campaign?old.time:Math.max(old.time,...batch.map(item=>item.time));
  if(!definition.once&&!definition.snapshot&&!definition.campaign) {
    for(const [key,version] of Object.entries(seen)) if(Number(version)<Math.max(old.started,time-POLLING_LOOKBACK_MS)) delete seen[key];
  }
  if(Object.keys(seen).length>50000) throw new Error('The trigger state reached 50,000 resource IDs. Polling state was preserved; create a new trigger with a narrower source.');
  state.famulorCheckpoint={...old,time,seen};
  return events.length?[events.sort((a,b)=>a.time-b.time).map(item=>({json:item.record as IDataObject}))]:null;
}
