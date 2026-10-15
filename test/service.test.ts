import assert from 'node:assert/strict';
import test from 'node:test';
import { Store } from '../src/store.js';
import { RaffleService, type Transport } from '../src/service.js';
const actor={conversationId:'room',userId:'owner',messageId:'m1'};
const input={title:'점심',candidates:'A\nB\nC',count:'1'};
function setup() {
 const store=Store.open(':memory:');let clock=1_000;const sent:any[]=[];const updates:any[]=[];
 const transport:Transport={async send(room,card){sent.push({room,card});return `m${sent.length}`;},async update(room,id,card){updates.push({room,id,card});}};
 const service=new RaffleService(store,transport,()=>clock);
 return {store,service,transport,sent,updates,tick:(n=2_000)=>clock+=n};
}
test('입력 카드는 같은 메시지에서만 추첨하며 중복 클릭은 결과를 유지한다',async()=>{
 const s=setup(); const draft=await s.service.createDraft(actor,'request');
 assert.equal((await s.service.createDraft(actor,'request')).id,draft.id);
 const raffle=await s.service.startForm(actor,draft.id,input);
 assert.equal(s.sent.length,1);assert.equal(s.updates.length,0);
 assert.deepEqual((await s.service.startForm(actor,draft.id,{...input,count:'2'})).winners,raffle.winners);
 for(let i=0;i<5;i++){await s.service.runScheduledTasks();s.tick();}
 assert.equal(s.sent.length,1);assert.ok(s.updates.length>=4);
 assert.ok(s.updates.every(v=>v.id===draft.messageId));
 assert.equal(s.store.getRaffle(raffle.id)?.status,'done');s.store.close();
});
test('타인·다른 방·만료 카드는 거절하고 오류 입력은 추첨을 만들지 않는다',async()=>{
 const s=setup();const d=await s.service.createDraft(actor,'request');
 for(const a of [{...actor,userId:'other'},{...actor,conversationId:'other'}]) await assert.rejects(s.service.startForm(a,d.id,input));
 await assert.rejects(s.service.startForm(actor,d.id,{...input,count:'9'}));
 assert.equal(s.store.raffleForKey(`draft:${d.id}`),undefined);
 s.tick(86_400_000); await assert.rejects(s.service.startForm(actor,d.id,input));s.store.close();
});
test('동시 요청은 같은 방에서 한 판만 시작하고 다른 방은 독립적이다',async()=>{
 const s=setup();const config={title:'판',candidates:['A','B','C'],count:1};
 const results=await Promise.allSettled([s.service.startText(actor,'r1',config),s.service.startText(actor,'r2',config)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const r=await s.service.startText(actor,'r1',config);assert.deepEqual((await s.service.startText(actor,'r1',config)).winners,r.winners);
 await s.service.startText({...actor,conversationId:'room2'},'r2',config);s.store.close();
});
test('갱신 실패는 결과를 재추첨하지 않고 최종 결과만 재시도한다',async()=>{
 const s=setup();const d=await s.service.createDraft(actor,'r');const r=await s.service.startForm(actor,d.id,input);
 s.transport.update=async()=>{throw {statusCode:429,headers:{'retry-after':'10'}};};
 await s.service.runScheduledTasks();const failed=s.store.getRaffle(r.id)!;
 assert.equal(failed.stage,4);assert.ok(failed.nextAt>=11_000);
 s.tick(2_000);let calls=0;s.transport.update=async()=>{calls++;};await s.service.runScheduledTasks();assert.equal(calls,0);
 s.tick(10_000);await s.service.runScheduledTasks();assert.equal(calls,1);assert.deepEqual(s.store.getRaffle(r.id)?.winners,r.winners);assert.equal(s.store.getRaffle(r.id)?.status,'done');s.store.close();
});
test('최초 게시 응답 유실은 자동 재게시하지 않는다',async()=>{
 const s=setup();s.transport.send=async()=>{throw new Error('lost response');};
 await assert.rejects(s.service.startText(actor,'r',{title:'판',candidates:['A','B'],count:1}));
 assert.equal(s.store.raffleForKey('text:room:r')?.status,'uncertain');
 await assert.rejects(s.service.startText(actor,'r',{title:'판',candidates:['A','B'],count:1}));
 await s.service.runScheduledTasks();assert.equal(s.updates.length,0);s.store.close();
});
test('영구 갱신 오류는 반복하지 않고 운영 확인 상태를 남긴다',async()=>{
 const s=setup();const d=await s.service.createDraft(actor,'r');const r=await s.service.startForm(actor,d.id,input);
 s.transport.update=async()=>{throw {statusCode:403};};await s.service.runScheduledTasks();
 assert.equal(s.store.getRaffle(r.id)?.status,'attention');s.store.close();
});
test('다른 입력 카드나 원본 메시지 ID 없는 요청으로 판을 바꿀 수 없다',async()=>{
 const s=setup();const a=await s.service.createDraft(actor,'a');const b=await s.service.createDraft(actor,'b');
 await assert.rejects(s.service.startForm({...actor,messageId:a.messageId!},b.id,input));
 await assert.rejects(s.service.startForm({...actor,messageId:undefined},a.id,input));s.store.close();
});
