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
 for(let stage=0;stage<=6;stage++){
  const c=buildRaffleCard(r,stage);assert.equal(c.actions.length,0);assert.ok(c.body.every(v=>v.type==='TextBlock'));
  assert.ok(!JSON.stringify(c).includes('<at>'));assert.ok(JSON.stringify(c).includes('\\\\['));
 }
 assert.match(JSON.stringify(buildRaffleCard(r,6)),/당첨/);
});
test('6개 중계 장면은 게이지가 불규칙하게 차고 마지막에만 당첨자를 공개한다',()=>{
 const r={title:'점심',candidates:['A','B','C'],count:1,winners:['C']} as Raffle;
 const fills:number[]=[];
 for(let stage=0;stage<=6;stage++){
  const c=buildRaffleCard(r,stage);const meter=c.body.find(v=>typeof v.text==='string'&&/^[▰▱]+$/u.test(v.text));
  assert.ok(meter,`stage ${stage}: 게이지 필요`);
  const text=meter.text as string;assert.equal([...text].length,12);fills.push([...text].filter(v=>v==='▰').length);
  assert.equal(c.actions.length,0);
  if(stage<6){assert.match(JSON.stringify(c),/🔥 팔자 뒤섞는 중…/);assert.doesNotMatch(JSON.stringify(c),/당첨자는 바로 너다/);}
 }
 assert.ok(fills.slice(1).every((v,i)=>v>fills[i]));assert.equal(fills[6],12);
 assert.ok(new Set(fills.slice(1).map((v,i)=>v-fills[i])).size>1);
 const final=buildRaffleCard(r,6);assert.ok(final.body.some(v=>v.size==='ExtraLarge'&&v.color==='Accent'&&String(v.text).includes('C')));
});
test('도움말과 오류의 핵심 문구는 크기·굵기·색으로 구분한다',()=>{
 const help=buildHelpCard('숫자부터 다시 보자.');
 assert.ok(help.body.some(v=>v.color==='Attention'&&v.weight==='Bolder'&&String(v.text).includes('숫자')));
 assert.ok(help.body.some(v=>v.size==='Large'&&String(v.text).includes('🎰')));
});
