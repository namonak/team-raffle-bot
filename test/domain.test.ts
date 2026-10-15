import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCommand, validateForm, draw } from '../src/domain.js';

test('멘션만 호출·도움말과 기본·단위 개수를 해석한다', () => {
  assert.equal(parseCommand('  '), 'create');
  assert.equal(parseCommand('도움말'), 'help');
  for (const suffix of ['', ' 1', ' 1명', ' 1개', ' 1곳']) {
    assert.deepEqual(parseCommand(`A  B\tC${suffix}`), { title: '쿠웨이트박의 뽑기판', candidates: ['A','B','C'], count: 1 });
  }
  assert.equal((parseCommand('A B C 2') as any).count, 2);
});
test('숫자처럼 보이는 잘못된 개수는 후보로 취급하지 않는다', () => {
  for (const suffix of ['0', '-1', '1.5', '1e2', 'NaN', 'Infinity', '2 명', '9007199254740993', '2명명', '+1', '2개요'])
    assert.throws(() => parseCommand(`A B C ${suffix}`), suffix);
  for (const text of ['A', 'A B 2', 'A B 3', 'A A B']) assert.throws(() => parseCommand(text));
});
test('카드는 줄별 후보의 내부 공백과 숫자 이름을 보존한다', () => {
  assert.deepEqual(validateForm({ title:' 점심 ', candidates:' 김 철수\r\n\n회사 앞 식당\n3 ', count:'1' }), {title:'점심', candidates:['김 철수','회사 앞 식당','3'],count:1});
  assert.throws(() => validateForm({title:'제목', candidates:'A\nB', count:'1명'}));
});
test('공통 입력 상한·타입·NFC 중복·제어 문자를 검증한다', () => {
  const good = {title:'x', candidates:'A\nB', count:'1'};
  for (const input of [{...good,title:''},{...good,title:'x'.repeat(101)}, {...good,candidates:'A'.repeat(51)+'\nB'}, {...good,candidates:'é\ne\u0301'}, {...good,candidates:'A\u0000\nB'}, {...good,count:[]}, {...good,title:4}]) assert.throws(() => validateForm(input));
  assert.equal(validateForm({...good,candidates:Array.from({length:50},(_,i)=>`후보${i}`).join('\n')}).candidates.length,50);
  assert.throws(() => validateForm({...good,candidates:Array.from({length:51},(_,i)=>`후보${i}`).join('\n')}));
  assert.equal(validateForm({...good,candidates:'😀'.repeat(50)+'\nB'}).candidates[0].length,100);
  assert.throws(() => validateForm({...good,candidates:' '.repeat(3001)+'A\nB'}));
});
test('추첨은 지정 개수만 원래 후보에서 중복 없이 뽑는다', () => {
  const config={title:'판',candidates:['A','B','C'],count:2};
  assert.deepEqual(draw(config, () => 0),['A','B']);
  assert.deepEqual(draw(config, n => n-1),['C','A']);
  const winners=draw(config);
  assert.equal(winners.length,2);assert.equal(new Set(winners).size,2);
  assert.ok(winners.every(v=>config.candidates.includes(v)));
});
test('Teams 숫자 입력의 number 값과 문자열 값을 모두 받는다',()=>{
 assert.equal(validateForm({title:'판',candidates:'A\nB',count:1}).count,1);
 for(const count of [1.5,NaN,Infinity])assert.throws(()=>validateForm({title:'판',candidates:'A\nB',count}));
});
test('숫자로 시작하는 일반 후보명도 마지막 자리에 올 수 있다',()=>{
 for(const name of ['3M','24시식당','-후보','.후보','3번']){
  const result=parseCommand(`A B ${name}`);assert.notEqual(typeof result,'string');assert.deepEqual((result as any).candidates,['A','B',name]);
 }
});
