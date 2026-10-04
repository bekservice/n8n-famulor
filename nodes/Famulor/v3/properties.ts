import type { INodeProperties, INodePropertyMode } from 'n8n-workflow';
import type { ApiField, ApiOperation } from './types';
import { operations } from './generated/catalog';
import { resourceFor } from './resources';

function title(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldProperty(field: ApiField, name: string, operation: ApiOperation): INodeProperties {
  const prop: INodeProperties = { displayName: title(field.name), name, type: 'string', default: '', required: field.required || undefined, description: field.description || `Value for ${field.name}` };
  if (field.enum && field.enum.every(value => typeof value === 'string' || typeof value === 'number')) {
    prop.type = 'options';
    prop.options = field.enum.map(value => ({ name: title(String(value)), value: value as string | number })).sort((a,b) => a.name.localeCompare(b.name));
    prop.default = (field.default ?? field.enum[0]) as string | number;
  } else if (field.type === 'boolean') { prop.type = 'boolean'; prop.default = typeof field.default === 'boolean' ? field.default : false; }
  else if (['integer','number'].includes(field.type)) { prop.type = 'number'; prop.default = typeof field.default === 'number' ? field.default : field.minimum ?? 0; prop.typeOptions = { minValue: field.minimum, maxValue: field.maximum, numberPrecision: field.type === 'integer' ? 0 : undefined }; }
  else if (['object','array','json'].includes(field.type)) { prop.type = 'json'; prop.default = field.type === 'array' ? '[]' : '{}'; }
  const resource = resourceFor({field,operation});
  if (resource && field.type === 'string') {
    prop.type='resourceLocator'; prop.default={mode:'list',value:''};
    const locator: {modes: INodePropertyMode[]} = {modes:[{displayName:'From List',name:'list',type:'list',typeOptions:{searchListMethod:resource.fields[0],searchable:true}},{displayName:'By ID',name:'id',type:'string'}]};
    prop.modes=locator.modes;
  }
  if (field.writeOnly) prop.typeOptions = { ...prop.typeOptions, password: true };
  return prop;
}

export function operationProperties(operation: ApiOperation): INodeProperties[] {
  const fields = [...operation.parameters.map(field => ({ field, name: `${field.in}_${field.name}` })), ...(operation.body?.fields ?? []).map(field => ({ field, name: `body_${field.name}` }))];
  const show = { resource: [operation.tag], operation: [operation.id] };
  const required = fields.filter(({field}) => field.required).map(({field,name}) => ({ ...fieldProperty(field,name,operation), displayOptions: {show} }));
  const optional = fields.filter(({field}) => !field.required).map(({field,name}) => fieldProperty(field,name,operation)).sort((a,b) => a.displayName.localeCompare(b.displayName));
  if (operation.body && !operation.body.fields && !operation.body.required) optional.push({displayName:'Request Body',name:'body',type:'json',default:'{}',description:operation.body.description || 'Optional JSON request body'});
  if (optional.length) required.push({ displayName: 'Optional Fields', name: 'optionalFields', type: 'collection', placeholder: 'Add Field', default: {}, displayOptions: {show}, options: optional });
  if (operation.body?.fields) required.push({ displayName: 'Additional Body Fields', name: 'body_extra', type: 'json', default: '{}', displayOptions: {show}, description: 'Additional documented fields as JSON. Named fields take precedence. Use explicit null, empty arrays or empty strings to clear supported fields' });
  if (operation.body?.required && !operation.body.fields) required.push({ displayName: 'Request Body', name: 'body', type: 'json', default: '{}', required: operation.body.required || undefined, displayOptions: {show}, description: operation.body.description || 'JSON request body. Upload operations accept the documented URL or base64 alternatives' });
  return required;
}

export function nativeProperties(): INodeProperties[] {
  const tags = [...new Set(operations.map(operation => operation.tag))].sort();
  return [
    { displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true, default: '', options: tags.map(tag => ({name: tag, value: tag})) },
    ...tags.map(tag => ({ displayName: 'Operation', name: 'operation', type: 'options' as const, noDataExpression: true, displayOptions: {show: {resource: [tag]}}, default: operations.find(operation => operation.tag === tag)!.id, options: operations.filter(operation => operation.tag === tag).map(operation => ({name: operation.summary, value: operation.id, description: operation.description, action: operation.summary})).sort((a,b) => a.name.localeCompare(b.name)) })),
    ...operations.flatMap(operationProperties),
  ];
}
