import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {demoClasses} from '../demo.js';
import {validateClass} from '../core.js';
const code=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const schema=readFileSync(new URL('../apps-script/Schema.gs',import.meta.url),'utf8');
const secret='unit-test-secret-at-least-32-characters';
function harness(){
  let content=JSON.stringify({schema:1,classes:[]}),reads=0,writes=0,services=0,locked=false;
  const cache=new Map();
  const file={getBlob:()=>{reads++;return {getDataAsString:()=>content};},setContent:text=>{writes++;content=text;}};
  const lock={tryLock:()=>{services++;assert.equal(locked,false);locked=true;return true;},releaseLock:()=>{locked=false;}};
  const ctx=vm.createContext({
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},
    DriveApp:{getFileById:()=>{services++;return file;}},
    PropertiesService:{getScriptProperties:()=>{services++;return {getProperty:()=> 'private-file'};}},
    CacheService:{getScriptCache:()=>{services++;return {get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)};}},
    LockService:{getScriptLock:()=>{services++;return lock;}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>createHash('sha256').update(s).digest(),base64Encode:b=>Buffer.from(b).toString('base64')}
  });
  vm.runInContext(schema+'\n'+code.replace("'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS'",JSON.stringify(secret)),ctx);
  return {request:(request)=>ctx.doPost({postData:{contents:JSON.stringify(request)}}),get stats(){return {reads,writes,services,locked};},raw:()=>content};
}
const value=()=>({...structuredClone(demoClasses[0]),revision:0});
const send=(h,action,data={})=>h.request({token:secret,action,...data});
test('invalid secrets and malformed input never access Google services',()=>{
  const h=harness();
  for(const token of ['',null,'wrong',42,secret+'x'])assert.equal(h.request({token,action:'list'}).error.code,'FORBIDDEN');
  assert.deepEqual(h.stats,{reads:0,writes:0,services:0,locked:false});
});
test('save, get and catalog cache; save invalidates catalog',()=>{
  const h=harness();const c=value();
  assert.equal(send(h,'list').data.length,0);
  const reads=h.stats.reads;send(h,'list');assert.equal(h.stats.reads,reads);
  const saved=send(h,'save',{value:c,requestId:'request-00000000001'});assert.equal(saved.ok,true);assert.equal(saved.data.revision,1);
  assert.equal(send(h,'list').data[0].name,c.name);
  assert.equal(send(h,'get',{id:c.id}).data.blocks.length,c.blocks.length);
  assert.equal('_lastRequestId' in saved.data,false);
  assert.equal('blocks' in send(h,'list').data[0],false);
});
test('retry after lost response is idempotent, stale edits cannot overwrite',()=>{
  const h=harness();const c=value(),req={value:c,requestId:'request-00000000001'};
  send(h,'save',req);send(h,'save',req);assert.equal(h.stats.writes,1);
  const changed=structuredClone(c);changed.name='Другой';
  assert.equal(send(h,'save',{value:changed,requestId:'request-00000000002'}).error.code,'CONFLICT');
  assert.equal(send(h,'save',{value:changed,requestId:req.requestId}).error.code,'BAD_REQUEST');
  assert.equal(send(h,'get',{id:c.id}).data.name,c.name);
  assert.equal(h.stats.locked,false);
});
test('invalid payloads and unknown IDs fail without a write',()=>{
  const h=harness();
  for(const mutate of [c=>c.name='',c=>c.blocks[0].type='script',c=>c.blocks.push(c.blocks[0]),c=>c.blocks[1].rows[0].pop(),c=>c.revision=-1,c=>c.blocks[3].level=99]){
    const c=value();mutate(c);assert.equal(send(h,'save',{value:c,requestId:'request-00000000001'}).error.code,'VALIDATION');
  }
  assert.equal(send(h,'get',{id:'missing'}).error.code,'NOT_FOUND');assert.equal(h.stats.writes,0);
});
test('frontend and standalone server apply the same class validation',()=>{
  const ctx=vm.createContext({});vm.runInContext(schema,ctx);
  const c=value();assert.equal(validateClass(c).name,c.name);assert.equal(ctx.validateClass(c).name,c.name);
  c.blocks[0].title='x'.repeat(201);assert.throws(()=>validateClass(c));assert.throws(()=>ctx.validateClass(c));
});
