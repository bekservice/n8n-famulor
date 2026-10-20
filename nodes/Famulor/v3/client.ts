import type { IExecuteFunctions, ILoadOptionsFunctions, IPollFunctions, IHookFunctions, IHttpRequestMethods, IHttpRequestOptions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { ApiField, ApiOperation } from './types';
import { resolveBaseUrl } from '../api';

type RequestContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions | IHookFunctions;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalize({ field, value, node }: { field: ApiField; value: unknown; node: INode }): unknown {
  const csvQuery = field.in === 'query' && field.type === 'array' && field.style === 'form' && field.explode === false;
  // Earlier catalogs represented these query lists as text or a saved resource locator.
  if ((field.type === 'string' || csvQuery) && isRecord(value) && 'mode' in value && 'value' in value) value=value.value;
  if (value === undefined || (value === '' && (field.required || field.type !== 'string'))) {
    if (field.required) throw new NodeOperationError(node, `${field.name} is required.`);
    return undefined;
  }
  if (value === null) { if (field.required) throw new NodeOperationError(node, `${field.name} is required.`); return value; }
  if (csvQuery && typeof value === 'string' && !value.trimStart().startsWith('[')) {
    value = value.split(',').map(item => item.trim()).filter(Boolean);
  }
  if (typeof value === 'string' && ['json', 'object', 'array', 'boolean', 'integer', 'number'].includes(field.type)) {
    try { value = JSON.parse(value); } catch { throw new NodeOperationError(node, `${field.name} must be valid ${field.type}.`); }
  }
  if (value === null) { if (field.required) throw new NodeOperationError(node, `${field.name} is required.`); return value; }
  if (field.enum && !field.enum.includes(value)) throw new NodeOperationError(node, `${field.name} must be one of: ${field.enum.join(', ')}.`);
  if (['integer', 'number'].includes(field.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value))) throw new NodeOperationError(node, `${field.name} must be a valid ${field.type}.`);
    if (field.minimum !== undefined && value < field.minimum) throw new NodeOperationError(node, `${field.name} must be at least ${field.minimum}.`);
    if (field.maximum !== undefined && value > field.maximum) throw new NodeOperationError(node, `${field.name} must be at most ${field.maximum}.`);
  }
  if (field.type === 'boolean' && typeof value !== 'boolean') throw new NodeOperationError(node, `${field.name} must be a boolean.`);
  if (field.type === 'array' && !Array.isArray(value)) throw new NodeOperationError(node, `${field.name} must be an array.`);
  if (field.type === 'object' && !isRecord(value)) throw new NodeOperationError(node, `${field.name} must be an object.`);
  if (field.type === 'string') {
    if (typeof value !== 'string') throw new NodeOperationError(node, `${field.name} must be text.`);
    if (field.minLength !== undefined && value.length < field.minLength) throw new NodeOperationError(node, `${field.name} is too short.`);
    if (field.maxLength !== undefined && value.length > field.maxLength) throw new NodeOperationError(node, `${field.name} is too long.`);
  }
  return value;
}

function scalar(value: unknown, node: INode): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new NodeOperationError(node, 'Path, query and header values must be scalar values.');
}

function pathComponent(value: unknown, node: INode): string {
  const text = scalar(value, node);
  if (!text || /[\\/]/.test(text) || text === '.' || text === '..' || /%[0-9a-f]{2}/i.test(text)) throw new NodeOperationError(node, 'Invalid resource identifier.');
  return encodeURIComponent(text);
}

function buildRequest({ operation, values, node }: { operation: ApiOperation; values: Record<string, unknown>; node: INode }) {
  let path = operation.path;
  const query = new URLSearchParams();
  const headers: Record<string, string> = {};
  for (const field of operation.parameters) {
    const raw = values[`${field.in}_${field.name}`];
    if (!field.required && (raw === null || raw === '')) continue;
    const value = normalize({ field, value: raw, node });
    if (value === undefined) continue;
    if (field.in === 'path') path = path.replace(`{${field.name}}`, pathComponent(value, node));
    if (field.in === 'header') {
      if (/^(authorization|cookie|host)$/i.test(field.name)) throw new NodeOperationError(node, 'Connection headers cannot be overridden.');
      headers[field.name] = scalar(value, node);
    }
    if (field.in === 'query') {
      if (Array.isArray(value)) {
        if (field.explode === false) query.append(field.name, value.map(item => scalar(item, node)).join(field.style === 'spaceDelimited' ? ' ' : field.style === 'pipeDelimited' ? '|' : ','));
        else for (const item of value) query.append(field.name, scalar(item, node));
      } else query.append(field.name, scalar(value, node));
    }
  }
  if (path.includes('{')) throw new NodeOperationError(node, 'A required resource identifier is missing.');
  let body: unknown;
  if (operation.body) {
    if (operation.body.fields) {
      const extra = normalize({ field: { name: 'Additional body fields', type: 'object', required: false }, value: values['body_extra'], node });
      if (extra !== undefined && !isRecord(extra)) throw new NodeOperationError(node, 'Additional body fields must be a JSON object.');
      const fields = Object.fromEntries(operation.body.fields.map((field) => {
        const named = values[`body_${field.name}`];
        const value = named === undefined ? extra?.[field.name] : named;
        return [field.name, normalize({ field, value, node })];
      }).filter(([, value]) => value !== undefined));
      body = { ...(extra ?? {}), ...fields };
      if (!operation.body.required && Object.keys(body as Record<string, unknown>).length === 0) body = undefined;
    } else body = normalize({ field: { name: 'Request body', required: operation.body.required, type: 'json' }, value: values['body'], node });
  }
  return { path: `${path}${query.size ? `?${query}` : ''}`, headers, body };
}


export function safeBaseUrl(node: INode, input?: string): string {
  let url: URL;
  try { url = new URL((input || 'https://app.famulor.io').trim()); } catch { throw new NodeOperationError(node, 'Use a valid HTTPS Famulor origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/','/api/v1','/api/v1/'].includes(url.pathname) || url.port) throw new NodeOperationError(node, 'Use an HTTPS Famulor origin without credentials, paths or a custom port.');
  return resolveBaseUrl(node, url.origin);
}

function httpStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const response = isRecord(error.response) ? error.response : {};
  for (const value of [response.status, response.statusCode, error.statusCode, error.httpCode]) {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d{3}$/.test(value))) continue;
    const status = Number(value);
    if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
  }
  return undefined;
}

function failureHint(status: number | undefined, path: string): string {
  if (status === 403 && path.split('?')[0] === '/me/credit-notifications') {
    return 'Personal low-credit warning preferences require a user-owned credential with the settings scope. Service-account keys cannot access these preferences. Manage personal warnings in Famulor Settings.';
  }
  if (status === 401) return 'Check that the saved API key is valid and has not expired or been revoked.';
  if (status === 402) return 'Check workspace credits and plan access.';
  if (status === 403) return 'Check the API key scopes, workspace permissions and feature access.';
  if (status === 404) return 'Check the resource ID and that it belongs to the connected workspace.';
  if (status === 429) return 'The request rate limit was reached. Wait before executing again.';
  if (status !== undefined && status >= 300 && status < 400) return 'A redirect was blocked. Check the saved Famulor connection.';
  return 'Check inputs, workspace permissions, scopes and credit limits.';
}

export async function request(context: RequestContext, options: { method: IHttpRequestMethods; path: string; body?: unknown; headers?: Record<string, string>; binary?: boolean; credentialType?: string; allowNotFound?: boolean }): Promise<unknown> {
  const node = context.getNode();
  if (!/^\/[a-z0-9]/i.test(options.path) || /[\\#]/.test(options.path) || options.path.split('?')[0].split('/').some(part => part === '.' || part === '..')) throw new NodeOperationError(node, 'Invalid public API path.');
  const credentials = await context.getCredentials(options.credentialType ?? 'famulorApi');
  const url = `${safeBaseUrl(node, typeof credentials.baseUrl === 'string' ? credentials.baseUrl : undefined)}/api/v1${options.path}`;
  const requestOptions: IHttpRequestOptions = {
    url, method: options.method, headers: options.headers, body: options.body as IHttpRequestOptions['body'],
    disableFollowRedirect: true, timeout: 60000, returnFullResponse: true,
    json: !options.binary, encoding: options.binary ? 'arraybuffer' : 'json',
  };
  try {
    const response: unknown = await context.helpers.httpRequestWithAuthentication.call(context, options.credentialType ?? 'famulorApi', requestOptions);
    if (!isRecord(response) || typeof response.statusCode !== 'number') throw new NodeOperationError(node, 'Famulor returned an invalid HTTP response.');
    if (response.statusCode === 404 && options.allowNotFound) return null;
    if (response.statusCode < 200 || response.statusCode >= 300) throw new NodeOperationError(node, `HTTP ${response.statusCode}`, { description: failureHint(response.statusCode, options.path) });
    return options.binary ? response : response.body;
  } catch (error: unknown) {
    if (options.allowNotFound && httpStatus(error) === 404) return null;
    const status = httpStatus(error) ?? (error instanceof NodeOperationError ? Number(error.message.match(/^HTTP (\d{3})$/)?.[1]) || undefined : undefined);
    throw new NodeOperationError(context.getNode(), `Famulor request failed${status !== undefined ? ` (HTTP ${status})` : ''}. ${failureHint(status, options.path)} No automatic retry was made.`);
  }
}

export const famulorV3Api = { isRecord, buildRequest, request };
