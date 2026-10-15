import assert from 'node:assert/strict';
import test from 'node:test';
import { Store } from '../src/store.js';
import { RaffleService } from '../src/service.js';
import { startScheduler } from '../src/scheduler.js';

test('종료는 진행 중 갱신을 기다리며 주기 작업을 겹쳐 실행하지 않는다',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const store=Store.open(':memory:');let calls=0;let finish!:()=>void;
 const transport={async send(){return 'message';},async update(){calls++;await new Promise<void>(resolve=>{finish=resolve;});}};
 const service=new RaffleService(store,transport,()=>1_000);
 const actor={conversationId:'r',userId:'u',messageId:'message'};
 const draft=await service.createDraft(actor,'request');await service.startForm(actor,draft.id,{title:'판',candidates:'A\nB',count:'1'});
 const stop=startScheduler(service);
 t.mock.timers.tick(250);assert.equal(calls,1);
 t.mock.timers.tick(1_000);assert.equal(calls,1);
 let stopped=false;const stopping=stop().then(()=>{stopped=true;});
 await Promise.resolve();assert.equal(stopped,false);
 finish();await stopping;assert.equal(stopped,true);
 t.mock.timers.tick(1_000);assert.equal(calls,1);store.close();
});
