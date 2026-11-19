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
  if (operation.body?.multipart && field.format === 'binary') { prop.displayName = `${title(field.name)} Input Binary Field`; prop.default = 'data'; prop.description = 'Name of the input item binary field containing the file'; }
  if (field.writeOnly && prop.type === 'string') prop.typeOptions = { ...prop.typeOptions, password: true };
  if (operation.id === 'createCarrierConnection' && ['auth_token', 'regional_auth_token'].includes(field.name)) {
    // Keep previously saved values in the collection for request assembly.
    prop.type = 'hidden';
  }
  return prop;
}

// Keep top-level parameter keys when the public API relaxes required fields.
const bookingPatchFields = new Set([
  'body_name', 'body_slug', 'body_duration_min', 'body_timezone', 'body_availability',
]);

export function isLegacyTopLevelField(operation: ApiOperation, name: string): boolean {
  return (operation.id === 'createEmailAddress' && name === 'body_domain_id')
    || (operation.id === 'updateBookingEventType' && bookingPatchFields.has(name));
}

export function operationProperties(operation: ApiOperation): INodeProperties[] {
  const fields = [...operation.parameters.map(field => ({ field, name: `${field.in}_${field.name}` })), ...(operation.body?.fields ?? []).map(field => ({ field, name: `body_${field.name}` }))];
  const show = { resource: [operation.tag], operation: [operation.id] };
  const switchOperation = operation.id === 'switchTwilioRegion';
  const visibleFields = switchOperation ? fields.filter(({ field }) => !field.writeOnly) : fields;
  const required: INodeProperties[] = visibleFields
    .filter(({ field, name }) => field.required || isLegacyTopLevelField(operation, name))
    .map(({ field, name }) => ({
      ...fieldProperty(field, name, operation),
      ...(!field.required && isLegacyTopLevelField(operation, name) ? { default: '' } : {}),
      displayOptions: { show },
    }));
  if (operation.id === 'createCarrierConnection') {
    required.push({
      displayName: 'Twilio Auth Token',
      name: 'twilioAuthToken',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Auth Token for the Twilio Voice Region selected in Optional Fields. Use US1 by default. For US1, leave this blank if the source connection already has a US1 token.',
      displayOptions: { show: { ...show, body_carrier: ['twilio'] } },
    });
  }
  if (['getCreditNotificationPreferences','updateCreditNotificationPreferences'].includes(operation.id)) required.unshift({displayName:'Personal low-credit warnings require a user-owned credential. Service-account API keys cannot read or change them. You can manage personal warnings in Famulor Settings.',name:'personalCredentialNotice',type:'notice',default:'',displayOptions:{show}});
  if (switchOperation) {
    required.push({
      displayName: 'Use SIP Login From Credential', name: 'useCredentialSipLogin', type: 'boolean', default: false,
      description: 'Whether to use the SIP username and password stored in this node’s Famulor API credential. Leave off to use the login confirmed by the preview.',
      displayOptions: { show },
    });
  }
  const optional = visibleFields.filter(({field,name}) => !field.required && !isLegacyTopLevelField(operation,name)).map(({field,name}) => fieldProperty(field,name,operation)).sort((a,b) => a.displayName.localeCompare(b.displayName));
  if (operation.body && !operation.body.fields && !operation.body.required) optional.push({displayName:'Request Body',name:'body',type:'json',default:'{}',description:operation.body.description || 'Optional JSON request body'});
  if (optional.length) required.push({ displayName: 'Optional Fields', name: 'optionalFields', type: 'collection', placeholder: 'Add Field', default: {}, displayOptions: {show}, options: optional });
  if (operation.body?.fields && !switchOperation) required.push({ displayName: 'Additional Body Fields', name: 'body_extra', type: 'json', default: '{}', displayOptions: {show}, description: 'Additional documented fields as JSON. Named fields take precedence. Use explicit null, empty arrays or empty strings to clear supported fields' });
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
