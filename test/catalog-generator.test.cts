import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';

it('scoped generation preserves saved descriptors and rejects unknown, duplicate and replacement operations', () => {
 const root=mkdtempSync(join(tmpdir(),'famulor-catalog-'));
 try {
  mkdirSync(join(root,'scripts'));
  mkdirSync(join(root,'nodes/Famulor/v3/generated'),{recursive:true});
  const script=join(root,'scripts/generate-catalog.mjs');
  copyFileSync('scripts/generate-catalog.mjs',script);
  const spec=join(root,'openapi.json');
  writeFileSync(spec,JSON.stringify({paths:{'/original':{get:{operationId:'originalOperation',summary:'Original'}},'/new':{post:{operationId:'newOperation',summary:'New'}}}}));
  const catalog=join(root,'nodes/Famulor/v3/generated/catalog.ts');
  const original={id:'originalOperation',method:'GET',path:'/original',summary:'Saved label',description:'Saved contract',tag:'Workspace',parameters:[]};
  const baseline=`export const catalogSource = {"url":"https://example.test/spec","sha256":"original-spec","count":1};\nexport const operations = [\n  ${JSON.stringify(original)},\n];\n`;
  writeFileSync(catalog,baseline);
  const run=(ids:string,check=false)=>spawnSync(process.execPath,[script,spec,'--add-operations',ids,...(check?['--check']:[])],{encoding:'utf8'});
  for(const ids of ['unknownOperation','newOperation,newOperation','originalOperation']) {
   assert.notEqual(run(ids).status,0,ids);
   assert.equal(readFileSync(catalog,'utf8'),baseline);
  }
  assert.equal(run('newOperation').status,0);
  const generated=readFileSync(catalog,'utf8');
  assert.ok(generated.includes(JSON.stringify(original)));
  assert.ok(generated.includes('"sha256":"original-spec"'));
  assert.ok(generated.includes('"operationIds":["newOperation"]'));
  assert.equal(run('newOperation',true).status,0);
 } finally { rmSync(root,{recursive:true,force:true}); }
});

it('scoped refresh adds optional fields and multipart operations while refusing saved contract changes', () => {
 const root=mkdtempSync(join(tmpdir(),'famulor-refresh-'));
 try {
  mkdirSync(join(root,'scripts'));mkdirSync(join(root,'nodes/Famulor/v3/generated'),{recursive:true});
  const script=join(root,'scripts/generate-catalog.mjs');copyFileSync('scripts/generate-catalog.mjs',script);
  const spec=join(root,'openapi.json');const catalog=join(root,'nodes/Famulor/v3/generated/catalog.ts');
  const saved={id:'sendSms',method:'POST',path:'/sms/send',summary:'Send SMS',description:'Saved',tag:'SMS',parameters:[],body:{required:true,fields:[{name:'from_number_id',required:true,type:'string'}]}};
  const unrelated={id:'oldOperation',method:'GET',path:'/old',summary:'Retain',description:'Saved unrelated',tag:'SMS',parameters:[]};
  writeFileSync(catalog,`export const catalogSource = {"sha256":"old","count":2};\nexport const operations = [\n  ${JSON.stringify(saved)},\n  ${JSON.stringify(unrelated)},\n];\n`);
  const document={paths:{'/sms/send':{post:{operationId:'sendSms',tags:['SMS'],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['from_number_id'],properties:{from_number_id:{type:'string'},delivery_mode:{type:'string'}}}}}}}},'/asset':{post:{operationId:'uploadAsset',tags:['SMS'],requestBody:{required:true,content:{'multipart/form-data':{schema:{type:'object',required:['file'],properties:{file:{type:'string',format:'binary'}}}}}}}}}};
  writeFileSync(spec,JSON.stringify(document));
  const run=(check=false)=>spawnSync(process.execPath,[script,spec,'--refresh-operations','sendSms,uploadAsset',...(check?['--check']:[])],{encoding:'utf8'});
  assert.equal(run().status,0);assert.equal(run(true).status,0);
  const generated=readFileSync(catalog,'utf8');assert.ok(generated.includes(JSON.stringify(unrelated)));assert.ok(generated.includes('"multipart":true'));assert.ok(generated.includes('"name":"delivery_mode","required":false'));
  document.paths['/sms/send'].post.requestBody.content['application/json'].schema.required=[];
  writeFileSync(spec,JSON.stringify(document));assert.notEqual(run().status,0);assert.equal(readFileSync(catalog,'utf8'),generated);
 }finally{rmSync(root,{recursive:true,force:true});}
});

it('offers replacement by payment ID on the existing custom-payment action', () => {
 const source=readFileSync(join(process.cwd(),'nodes/Famulor/v3/generated/catalog.ts'),'utf8');
 const line=source.split('\n').find((entry)=>entry.startsWith('  {"id":"createPlatformCustomPayment"'));
 assert.ok(line);
 const operation=JSON.parse(line.trim().replace(/,$/,''));
 const field=operation.body.fields.find((item:{name:string})=>item.name==='replace_payment_id');
 assert.ok(field);
 assert.equal(field.required,false);
 assert.equal(field.format,'uuid');
});

it('refreshes the Twilio switch union and preserves saved existing-trunk fields', () => {
 const root = mkdtempSync(join(tmpdir(), 'famulor-twilio-catalog-'));
 try {
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'nodes/Famulor/v3/generated'), { recursive: true });
  const script = join(root, 'scripts/generate-catalog.mjs');
  copyFileSync('scripts/generate-catalog.mjs', script);
  const spec = join(root, 'openapi.json');
  const catalog = join(root, 'nodes/Famulor/v3/generated/catalog.ts');
  const operationId = 'switchTwilioRegion';
  const path = '/carrier-connections/{id}/numbers/{numberId}/region-switch';
  const baseline = {
   id: operationId, method: 'POST', path, summary: 'Switch Twilio region', description: 'Saved', tag: 'Carrier Connections', parameters: [],
   body: { required: true, fields: [
    { name: 'direction', required: true, type: 'string', enum: ['outbound_only', 'bidirectional'] },
    { name: 'trunk_token', required: true, type: 'string' },
   ] },
  };
  writeFileSync(catalog, "export const catalogSource = {\"sha256\":\"old\",\"count\":1};\nexport const operations = [\n  " + JSON.stringify(baseline) + ",\n];\n");
  const managed = {
   required: ['mode', 'direction', 'managed_token'],
   properties: {
    mode: { type: 'string', enum: ['managed'] },
    direction: { type: 'string', enum: ['bidirectional'] },
    managed_token: { type: 'string', minLength: 1, maxLength: 4096 },
   },
  };
  const schema = {
   oneOf: [{
    required: ['direction', 'trunk_token'],
    properties: {
     mode: { type: 'string', enum: ['existing'] },
     direction: { type: 'string', enum: ['outbound_only', 'bidirectional'] },
     trunk_token: { type: 'string' },
    },
   }, managed],
  };
  const document = { paths: { [path]: { post: {
   operationId, tags: ['Carrier Connections'],
   requestBody: { required: true, content: { 'application/json': { schema } } },
  } } } };
  writeFileSync(spec, JSON.stringify(document));
  const run = () => spawnSync(process.execPath, [script, spec, '--refresh-operations', operationId], { encoding: 'utf8' });
  const generation = run();
  assert.equal(generation.status, 0, generation.stderr);
  const generated = readFileSync(catalog, 'utf8');
  assert.match(generated, /"name":"mode","required":false,"type":"string","enum":\["existing","managed"\],"default":"existing"/);
  assert.match(generated, /"name":"managed_token","required":false,"type":"string","minLength":1,"maxLength":4096/);
  assert.match(generated, /"name":"trunk_token","required":true/);
  managed.properties.direction.enum = ['outbound_only'];
  writeFileSync(spec, JSON.stringify(document));
  assert.notEqual(run().status, 0);
  assert.equal(readFileSync(catalog, 'utf8'), generated);
 } finally {
  rmSync(root, { recursive: true, force: true });
 }
});
