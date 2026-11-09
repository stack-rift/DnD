import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoStore,RemoteStore,newClass} from '../core.js';
test('demo roundtrip persists edits and detects revision conflict',async()=>{
  const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
  const store=new DemoStore([]);const c=newClass();
  const saved=await store.save(c,'request-one');assert.equal(saved.revision,1);
  assert.equal((await store.save(c,'request-one')).revision,1);
  assert.equal((await store.list()).length,1);
  assert.equal((await store.get(c.id)).blocks[1].rows.length,20);
  await assert.rejects(()=>store.save(c,'request-two'),{code:'CONFLICT'});
});
test('remote sends token in text/plain POST body and checks JSON confirmation',async()=>{
  let request;globalThis.fetch=async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({ok:true,data:[]})};};
  const store=new RemoteStore('https://example.test/exec',()=> 'not-in-query');await store.list();
  assert.equal(request.url,'https://example.test/exec');assert.equal(request.method,'POST');assert.equal(request.credentials,'omit');assert.equal(request.headers['Content-Type'],'text/plain;charset=utf-8');assert.equal(JSON.parse(request.body).token,'not-in-query');
  globalThis.fetch=async()=>({ok:true,json:async()=>({ok:false,error:{code:'FORBIDDEN',message:'Нет доступа'}})});
  await assert.rejects(()=>store.list(),{code:'FORBIDDEN'});
});
test('missing secret does not send a network request',async()=>{
  globalThis.fetch=()=>{throw Error('Network should not be called');};
  await assert.rejects(()=>new RemoteStore('https://example.test',()=> '').list(),/Нет кода доступа/);
});
