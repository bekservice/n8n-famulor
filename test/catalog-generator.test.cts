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
  // Updating one body field retains the other released inputs even if the
  // new source changes them or adds conditional requirements.
  const stored=JSON.parse(generated.split('\n').find(line=>line.includes('"id":"newOperation"'))!.trim().replace(/,$/,''));
  const savedFields=[{name:'type',type:'string',required:false},{name:'prefix',type:'string',required:true}];
  const saved={...stored,body:{required:true,fields:savedFields}};
  writeFileSync(catalog,generated.replace(JSON.stringify(stored),JSON.stringify(saved)));
  const conditional={type:'object',properties:{type:{type:'string',description:'Unrelated change'},prefix:{type:'string'}},
   allOf:[{if:{properties:{type:{const:'local'}}},then:{required:['prefix']}}]};
  writeFileSync(spec,JSON.stringify({paths:{'/original':{get:{operationId:'originalOperation',summary:'Unrelated edit'}},
   '/new':{post:{operationId:'newOperation',summary:'New',requestBody:{content:{'application/json':{schema:conditional}}}}}}}));
  const update=(field:string,check=false)=>spawnSync(process.execPath,[script,spec,'--update-body-field',field,...(check?['--check']:[])],{encoding:'utf8'});
  assert.notEqual(update('newOperation.unknown').status,0);
  assert.equal(update('newOperation.prefix').status,0);
  const updated=readFileSync(catalog,'utf8');
  assert.ok(updated.includes(JSON.stringify(original)));
  assert.ok(updated.includes(JSON.stringify(savedFields[0])));
  assert.ok(updated.includes('"name":"prefix","required":false,"type":"string"'));
  assert.ok(updated.includes('"fieldUpdates":{"newOperation.prefix":'));
  assert.equal(update('newOperation.prefix',true).status,0);

 } finally { rmSync(root,{recursive:true,force:true}); }
});
