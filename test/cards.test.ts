import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCreateCard, buildHelpCard, buildRaffleCard } from '../src/cards.js';
import type { Raffle } from '../src/store.js';
test('입력 카드는 필드 3개와 시작 버튼을 가진다',()=>{
 const c=buildCreateCard('id');assert.deepEqual(c.body.filter(v=>String(v.type).startsWith('Input.')).map(v=>v.id),['title','candidates','count']);
 assert.equal(c.actions[0].title,'좋아, 판 돌려!');assert.equal(c.actions[0].verb,'raffleStart');
 assert.equal(c.actions[0].associatedInputs,'auto');assert.match(JSON.stringify(buildHelpCard()),/2명/);
});
test('중계와 결과는 텍스트만 쓰고 사용자 문구를 이스케이프한다',()=>{
 const r={id:'r',title:'[눌러](https://evil.test)',candidates:['*A*','<at>B</at>'],count:1,winners:['*A*']} as Raffle;
 for(let stage=0;stage<=4;stage++){
  const c=buildRaffleCard(r,stage);assert.equal(c.actions.length,0);assert.ok(c.body.every(v=>v.type==='TextBlock'));
  assert.ok(!JSON.stringify(c).includes('<at>'));assert.ok(JSON.stringify(c).includes('\\\\['));
 }
 assert.match(JSON.stringify(buildRaffleCard(r,4)),/당첨/);
});
