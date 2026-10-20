import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const specPath = process.argv[2];
if (!specPath) throw new Error('Usage: node scripts/generate-catalog.mjs <openapi.json> [--check] [--add-operations operationId,...]');
const source = readFileSync(specPath, 'utf8');
const spec = JSON.parse(source);

function dereference(value) {
  if (!value?.$ref) return value;
  if (!value.$ref.startsWith('#/')) throw new Error('Only local schema references are supported');
  return dereference(value.$ref.slice(2).split('/').reduce((node, key) => node[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec));
}

function field(schemaInput) {
  const schema = dereference(schemaInput) ?? {};
  const types = Array.isArray(schema.type) ? schema.type.filter((type) => type !== 'null') : [schema.type];
  const type = schema.oneOf || schema.anyOf || schema.allOf ? 'json' : types[0] ?? (schema.properties ? 'object' : 'json');
  return Object.fromEntries(Object.entries({
    type, description: schema.description, format: schema.format, enum: schema.enum,
    minimum: schema.minimum, maximum: schema.maximum, minLength: schema.minLength,
    maxLength: schema.maxLength, readOnly: schema.readOnly, writeOnly: schema.writeOnly,
    default: schema.default, items: schema.items ? field(schema.items) : undefined,
  }).filter(([, value]) => value !== undefined));
}

function bodyFields(input) {
  const schema = dereference(input) ?? {};
  if (schema.oneOf || schema.anyOf || schema.allOf || !schema.properties) return undefined;
  return Object.entries(schema.properties).filter(([, value]) => !dereference(value).readOnly).map(([name, value]) => ({
    name, required: (schema.required ?? []).includes(name), ...field(value),
  }));
}

let operations = Object.entries(spec.paths).flatMap(([path, pathItem]) =>
  ['get', 'post', 'put', 'patch', 'delete'].filter((method) => pathItem[method]).map((method) => {
    const operation = pathItem[method];
    if (typeof operation.operationId !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(operation.operationId)) throw new Error(`Invalid operationId: ${method} ${path}. Use a camelCase identifier containing only letters and numbers.`);
    if (new Set(['await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements', 'interface', 'package', 'private', 'protected', 'public']).has(operation.operationId)) throw new Error('Operation IDs must not be reserved JavaScript identifiers.');
    const requestBody = dereference(operation.requestBody);
    const jsonSchema = requestBody?.content?.['application/json']?.schema;
    const responseFormats = Object.entries(operation.responses ?? {}).filter(([status]) => /^2/.test(status)).flatMap(([, response]) => Object.keys(dereference(response).content ?? {}));
    return {
      id: operation.operationId, method: method.toUpperCase(), path,
      summary: operation.summary ?? operation.operationId,
      description: operation.description ?? operation.summary ?? operation.operationId,
      tag: operation.tags?.[0] ?? 'Workspace',
      parameters: [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])].map(dereference).map((parameter) => ({
        name: parameter.name, in: parameter.in, required: parameter.required === true,
        ...field(parameter.schema), description: parameter.description ?? parameter.schema?.description,
        style: parameter.style, explode: parameter.explode,
      })),
      ...(requestBody ? { body: {
        required: requestBody.required === true, description: dereference(jsonSchema)?.description,
        fields: bodyFields(jsonSchema),
      } } : {}),
      ...(responseFormats.some((format) => format.startsWith('audio/') || format.startsWith('video/')) ? { binary: true, binaryContentType: responseFormats.find(format => format.startsWith('audio/') || format.startsWith('video/')) } : {}),
    };
  }),
).sort((a, b) => a.id.localeCompare(b.id));
if (new Set(operations.map((operation) => operation.id)).size !== operations.length) throw new Error('Duplicate operationId');
const target = fileURLToPath(new URL('../nodes/Famulor/v3/generated/catalog.ts', import.meta.url));
let catalogSource = { url: 'https://docs.famulor.io/api-reference/openapi.json', sha256: createHash('sha256').update(source).digest('hex'), count: operations.length };
const addIndex = process.argv.indexOf('--add-operations');
if (addIndex !== -1) {
  const requested = process.argv[addIndex + 1]?.split(',') ?? [];
  if (!requested.length || requested.some((id) => !id || id.startsWith('--')) || new Set(requested).size !== requested.length) throw new Error('Provide unique operation IDs after --add-operations');
  const selected = requested.map((id) => {
    const operation = operations.find((item) => item.id === id);
    if (!operation) throw new Error(`Unknown additive operation: ${id}`);
    return operation;
  });
  const previous = readFileSync(target, 'utf8');
  const previousSource = JSON.parse(previous.match(/export const catalogSource = (.+);/)[1]);
  const existing = previous.split('\n').filter((line) => line.startsWith('  {')).map((line) => JSON.parse(line.trim().replace(/,$/, '')));
  if (new Set(existing.map((operation) => operation.id)).size !== existing.length) throw new Error('Duplicate operationId in existing catalog');
  for (const operation of selected) {
    const prior = existing.find((item) => item.id === operation.id);
    const wasAdded = previousSource.additions?.some((entry) => entry.operationIds.includes(operation.id));
    if (prior && (!wasAdded || JSON.stringify(prior) !== JSON.stringify(operation))) throw new Error(`Additive mode cannot replace existing operation: ${operation.id}`);
  }
  operations = [...existing.filter((item) => !requested.includes(item.id)), ...selected].sort((a, b) => a.id.localeCompare(b.id));
  const additions = (previousSource.additions ?? []).map((entry) => ({ ...entry, operationIds: entry.operationIds.filter((id) => !requested.includes(id)) })).filter((entry) => entry.operationIds.length);
  additions.push({ sha256: catalogSource.sha256, operationIds: [...requested].sort() });
  catalogSource = { ...previousSource, count: operations.length, additions };
}
const output = `import type { ApiOperation } from '../types';\n\nexport const catalogSource = ${JSON.stringify(catalogSource)};\n\nexport const operations: ApiOperation[] = [\n${operations.map((operation) => `  ${JSON.stringify(operation)},`).join('\n')}\n];\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('Generated catalog is stale');
} else {
  mkdirSync(fileURLToPath(new URL('../nodes/Famulor/v3/generated/', import.meta.url)), { recursive: true });
  writeFileSync(target, output);
}
console.log(`${operations.length} public API operations ${process.argv.includes('--check') ? 'verified' : 'generated'}`);
