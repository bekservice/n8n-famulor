import type { ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { famulorV3Api as famulorApi } from './client';
import type { ApiField, ApiOperation } from './types';
import { operations } from './generated/catalog';

export function resourceFor({ field, operation }: { field: ApiField; operation: ApiOperation }): Resource | undefined {
  if (field.name === 'id' && field.in === 'path') return resources.find((resource) => operation.path.startsWith(`${resource.path}/{id}`));
  return resources.find((resource) => resource.fields.includes(field.name));
}

function resourceLabel(record: Record<string, unknown>): string {
  return String(record['name'] ?? record['number'] ?? record['phone'] ?? record['to_number'] ?? record['invitee_name'] ?? record['display_name'] ?? record['email'] ?? record['id']);
}

export async function resourceOptions({ context, resource, searchValue }: { context: ILoadOptionsFunctions; resource: Resource; searchValue?: string }) {
  const search = searchValue?.trim();
  const uuid = Boolean(search && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(search));
  const searchParam = uuid ? undefined : resource.searchParam;
  if (search && uuid && operations.some((operation) => operation.method === 'GET' && operation.path === `${resource.path}/{id}`)) {
    const response = await famulorApi.request(context, { method: 'GET', path: `${resource.path}/${search}` });
    const data = famulorApi.isRecord(response) ? response['data'] : undefined;
    const row = resource.detailKey && famulorApi.isRecord(data) ? data[resource.detailKey] : data;
    if (!famulorApi.isRecord(row) || typeof row['id'] !== 'string') throw new Error('Famulor returned an invalid resource.');
    return { options: [{ label: `${resourceLabel(row)} (${row['id']})`, value: row['id'] }] };
  }
  const matches: { label: string; value: string }[] = [];
  let capped = false;
  for (let offset = 0; offset < 50000; offset += 100) {
    const query = new URLSearchParams({ ...(resource.unpaged ? {} : { limit: '100', offset: String(offset) }), ...(search && searchParam ? { [searchParam]: search } : {}) });
    const response = await famulorApi.request(context, { method: 'GET', path: `${resource.path}${query.size ? `?${query}` : ''}` });
    if (!famulorApi.isRecord(response)) throw new Error('Famulor returned an invalid resource list.');
    const data = response['data'];
    const rows = famulorApi.isRecord(data) && resource.key ? data[resource.key] : data;
    if (!Array.isArray(rows)) throw new Error('Famulor returned an invalid resource list.');
    for (const row of rows) {
      if (!famulorApi.isRecord(row) || typeof row['id'] !== 'string') continue;
      const label = `${resourceLabel(row)} (${row['id']})`;
      if (!search || searchParam || label.toLowerCase().includes(search.toLowerCase())) matches.push({ label, value: row['id'] });
    }
    if (famulorApi.isRecord(response['meta']) && response['meta']['result_cap_reached'] === true) capped = true;
    if (resource.unpaged || rows.length < 100 || matches.length >= 100) return { options: matches.slice(0, 100), ...(capped ? { placeholder: 'The API capped these search results. Use an exact resource UUID or map it from a previous step.' } : {}) };
  }
  return { options: matches.slice(0, 100), placeholder: `Search scanned 50,000 records.${capped ? ' The API also capped these search results.' : ''} Use an exact resource UUID or map it from a previous step.` };
}

export const resources: Resource[] = [
  { path: '/assistants', label: 'Assistant', fields: ['assistant_id', 'fallback_assistant_id'] },
  { path: '/campaigns', label: 'Campaign', fields: ['campaign_id'] },
  { path: '/calls', label: 'Call', fields: ['call_id'], searchParam: 'q' },
  { path: '/leads', label: 'Contact', fields: ['lead_id', 'contact_id'], searchParam: 'search' },
  { path: '/phone-numbers', label: 'Phone Number', fields: ['phone_number_id'] },
  { path: '/knowledge-bases', label: 'Knowledge Base', fields: ['knowledge_base_id'] },
  { path: '/booking-event-types', label: 'Booking Event Type', fields: ['event_type_id'], unpaged: true },
  { path: '/bookings', label: 'Booking', fields: ['booking_id'] },
  { path: '/tools', label: 'Tool', fields: ['tool_id'], unpaged: true },
  { path: '/automations', label: 'Automation', fields: ['automation_id'], unpaged: true, key: 'automations', detailKey: 'automation' },
  { path: '/segments', label: 'Segment', fields: ['segment_id'] },
  { path: '/scheduled-callbacks', label: 'Scheduled Callback', fields: ['callback_id'], searchParam: 'search' },
  { path: '/routines', label: 'Mission', fields: ['routine_id'], unpaged: true },
];

export type Resource = { path: string; label: string; fields: string[]; unpaged?: boolean; key?: string; detailKey?: string; searchParam?: string };

export const resourceSearchMethods = Object.fromEntries(resources.map(resource => [resource.fields[0], async function(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
  const result = await resourceOptions({context:this,resource,searchValue:filter});
  return {results: result.options.map(item=>({name:item.label,value:item.value}))};
}]));
