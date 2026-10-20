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
