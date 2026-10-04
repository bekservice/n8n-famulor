import type { IExecuteFunctions, ILoadOptionsFunctions, IPollFunctions, IHttpRequestMethods, IHttpRequestOptions } from 'n8n-workflow';
import type { ApiField, ApiOperation } from './types';
import { resolveBaseUrl } from '../api';

type RequestContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalize({ field, value }: { field: ApiField; value: unknown }): unknown {
  if (field.type === 'string' && isRecord(value) && 'mode' in value && 'value' in value) value=value.value;
  if (value === undefined || (value === '' && (field.required || field.type !== 'string'))) {
    if (field.required) throw new Error(`${field.name} is required.`);
    return undefined;
  }
  if (value === null) { if (field.required) throw new Error(`${field.name} is required.`); return value; }
  if (typeof value === 'string' && ['json', 'object', 'array', 'boolean', 'integer', 'number'].includes(field.type)) {
    try { value = JSON.parse(value); } catch { throw new Error(`${field.name} must be valid ${field.type}.`); }
  }
  if (value === null) { if (field.required) throw new Error(`${field.name} is required.`); return value; }
  if (field.enum && !field.enum.includes(value)) throw new Error(`${field.name} must be one of: ${field.enum.join(', ')}.`);
  if (['integer', 'number'].includes(field.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value))) throw new Error(`${field.name} must be a valid ${field.type}.`);
    if (field.minimum !== undefined && value < field.minimum) throw new Error(`${field.name} must be at least ${field.minimum}.`);
    if (field.maximum !== undefined && value > field.maximum) throw new Error(`${field.name} must be at most ${field.maximum}.`);
  }
  if (field.type === 'boolean' && typeof value !== 'boolean') throw new Error(`${field.name} must be a boolean.`);
  if (field.type === 'array' && !Array.isArray(value)) throw new Error(`${field.name} must be an array.`);
  if (field.type === 'object' && !isRecord(value)) throw new Error(`${field.name} must be an object.`);
  if (field.type === 'string') {
    if (typeof value !== 'string') throw new Error(`${field.name} must be text.`);
    if (field.minLength !== undefined && value.length < field.minLength) throw new Error(`${field.name} is too short.`);
    if (field.maxLength !== undefined && value.length > field.maxLength) throw new Error(`${field.name} is too long.`);
  }
  return value;
}

function scalar(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new Error('Path, query and header values must be scalar values.');
}

function pathComponent(value: unknown): string {
  const text = scalar(value);
  if (!text || /[\\/]/.test(text) || text === '.' || text === '..' || /%[0-9a-f]{2}/i.test(text)) throw new Error('Invalid resource identifier.');
  return encodeURIComponent(text);
}

function buildRequest({ operation, values }: { operation: ApiOperation; values: Record<string, unknown> }) {
  let path = operation.path;
  const query = new URLSearchParams();
  const headers: Record<string, string> = {};
  for (const field of operation.parameters) {
    const raw = values[`${field.in}_${field.name}`];
    if (!field.required && (raw === null || raw === '')) continue;
    const value = normalize({ field, value: raw });
    if (value === undefined) continue;
    if (field.in === 'path') path = path.replace(`{${field.name}}`, pathComponent(value));
    if (field.in === 'header') {
      if (/^(authorization|cookie|host)$/i.test(field.name)) throw new Error('Connection headers cannot be overridden.');
      headers[field.name] = scalar(value);
    }
    if (field.in === 'query') {
      if (Array.isArray(value)) {
        if (field.explode === false) query.append(field.name, value.map(scalar).join(field.style === 'spaceDelimited' ? ' ' : field.style === 'pipeDelimited' ? '|' : ','));
        else for (const item of value) query.append(field.name, scalar(item));
      } else query.append(field.name, scalar(value));
    }
  }
  if (path.includes('{')) throw new Error('A required resource identifier is missing.');
  let body: unknown;
  if (operation.body) {
    if (operation.body.fields) {
      const extra = normalize({ field: { name: 'Additional body fields', type: 'object', required: false }, value: values['body_extra'] });
      if (extra !== undefined && !isRecord(extra)) throw new Error('Additional body fields must be a JSON object.');
      const fields = Object.fromEntries(operation.body.fields.map((field) => {
        const named = values[`body_${field.name}`];
        const value = named === undefined ? extra?.[field.name] : named;
        return [field.name, normalize({ field, value })];
      }).filter(([, value]) => value !== undefined));
      body = { ...(extra ?? {}), ...fields };
      if (!operation.body.required && Object.keys(body as Record<string, unknown>).length === 0) body = undefined;
    } else body = normalize({ field: { name: 'Request body', required: operation.body.required, type: 'json' }, value: values['body'] });
  }
  return { path: `${path}${query.size ? `?${query}` : ''}`, headers, body };
}


export function safeBaseUrl(input?: string): string {
  const url = new URL((input || 'https://app.famulor.io').trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/','/api/v1','/api/v1/'].includes(url.pathname) || url.port) throw new Error('Use an HTTPS Famulor origin without credentials, paths or a custom port.');
  return resolveBaseUrl(url.origin);
}

export async function request(context: RequestContext, options: { method: IHttpRequestMethods; path: string; body?: unknown; headers?: Record<string, string>; binary?: boolean }): Promise<unknown> {
  if (!/^\/[a-z0-9]/i.test(options.path) || /[\\#]/.test(options.path) || options.path.split('?')[0].split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid public API path.');
  const credentials = await context.getCredentials('famulorApi');
  const url = `${safeBaseUrl(typeof credentials.baseUrl === 'string' ? credentials.baseUrl : undefined)}/api/v1${options.path}`;
  const requestOptions: IHttpRequestOptions = {
    url, method: options.method, headers: options.headers, body: options.body as IHttpRequestOptions['body'],
    disableFollowRedirect: true, timeout: 60000, returnFullResponse: true,
    json: !options.binary, encoding: options.binary ? 'arraybuffer' : 'json',
  };
  try {
    const response: unknown = await context.helpers.httpRequestWithAuthentication.call(context, 'famulorApi', requestOptions);
    if (!isRecord(response) || typeof response.statusCode !== 'number') throw new Error('Famulor returned an invalid HTTP response.');
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`Famulor returned HTTP ${response.statusCode}.`);
    return options.binary ? response : response.body;
  } catch (error: unknown) {
    const record = isRecord(error) ? error : {};
    const response = isRecord(record.response) ? record.response : {};
    const status = response.status ?? response.statusCode ?? record.statusCode;
    throw new Error(`Famulor request failed${typeof status === 'number' ? ` (HTTP ${status})` : ''}. Check inputs, workspace permissions, scopes and credit limits. No automatic retry was made.`);
  }
}

export const famulorV3Api = { isRecord, buildRequest, request };
