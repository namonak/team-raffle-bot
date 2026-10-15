import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { RaffleService } from '../src/service.js';
test('재시작은 미완료 중계 대신 같은 메시지에 저장 결과를 표시한다',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'raffle-'));const path=join(dir,'test.sqlite');
 let store=Store.open(path);let updates=0;
 const transport={async send(){return 'message';},async update(){updates++;}};
 try {
  const service=new RaffleService(store,transport,()=>1_000);
  const actor={conversationId:'r',userId:'u',messageId:'message'}; const d=await service.createDraft(actor,'request');
  const r=await service.startForm(actor,d.id,{title:'판',candidates:'A\nB\nC',count:'1'});
  store.close();store=Store.open(path);const resumed=new RaffleService(store,transport,()=>2_000);
  await resumed.runScheduledTasks();assert.equal(updates,1);assert.equal(store.getRaffle(r.id)?.status,'done');assert.deepEqual(store.getRaffle(r.id)?.winners,r.winners);
 } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
