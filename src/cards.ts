import { RAFFLE_FINAL_STAGE } from './domain.js';
import type { Raffle } from './store.js';
export type Card = {
    type: 'AdaptiveCard';
    version: '1.5';
    body: Record<string, unknown>[];
    actions: Record<string, unknown>[];
};
const escape = (s: string) => s.replace(/[\\`*_{}\[\]()#+.!|~\-]/g, '\\$&').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const block = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'TextBlock', text, wrap: true, ...extra });
const card = (body: Record<string, unknown>[], actions: Record<string, unknown>[] = []): Card => ({ type: 'AdaptiveCard', version: '1.5', body, actions });
export function buildCreateCard(id: string): Card {
    return card([
        block('🎰 쿠웨이트박의 뽑기판', { weight: 'Bolder', size: 'Large', color: 'Accent' }),
        block('자, 후보 올려봐. **나머지는 내가 돌린다.**', { size: 'Medium' }),
        block('👤 이 카드를 연 사람만 돌릴 수 있어. ⏳ 이 판은 24시간 동안 열어둘게.', { isSubtle: true, size: 'Small' }),
        { type: 'Input.Text', id: 'title', label: '📝 뽑기 제목', maxLength: 100, isRequired: true, errorMessage: '무슨 판인지 제목부터 적어봐.', placeholder: '오늘 점심 운명의 한 끼' },
        { type: 'Input.Text', id: 'candidates', label: '👥 후보들 · 한 줄에 하나씩 (2~50개)', isMultiline: true, maxLength: 3000, isRequired: true, errorMessage: '후보는 한 줄에 하나씩, 둘 이상 데려와.', placeholder: '짜장면\n짬뽕\n볶음밥' },
        { type: 'Input.Number', id: 'count', label: '🎯 추첨 개수', value: 1, min: 1, max: 49, isRequired: true, errorMessage: '몇 개 뽑을 건지 양의 정수로 적어봐.' },
        block('💡 바로 돌릴 땐 @쿠웨이트박 짜장 짬뽕 볶음밥 2개. 설명은 @쿠웨이트박 도움말.', { isSubtle: true, size: 'Small' }),
    ], [{ type: 'Action.Execute', title: '좋아, 판 돌려!', verb: 'raffleStart', data: { draftId: id }, associatedInputs: 'auto' }]);
}
export function buildHelpCard(message?: string): Card {
    return card([
        block('🎰 쿠웨이트박 사용법', { weight: 'Bolder', size: 'Large', color: 'Accent' }),
        ...(message ? [block(`⚠️ ${escape(message)}`, { weight: 'Bolder', size: 'Medium', color: 'Attention' })] : []),
        block('📝 **입력 카드로 돌리기**', { weight: 'Bolder', separator: true }),
        block('@쿠웨이트박만 부르면 **제목·후보·개수** 적는 판이 열린다. 후보는 **한 줄에 하나씩** 올려.'),
        block('⚡ **바로 뽑기**', { weight: 'Bolder', separator: true }),
        block('@쿠웨이트박 홍길동 김철수 이영희'),
        block('🎯 **여럿 뽑기**', { weight: 'Bolder' }),
        block('@쿠웨이트박 홍길동 김철수 이영희 **2명**'),
        block('마지막에 **숫자 또는 숫자+명·개·곳**. 안 적으면 **하나** 뽑는다. 뽑는 수는 후보보다 적게.'),
        block('💡 바로 뽑기는 **공백**으로 나눈다. 이름에 공백이 있으면 입력 카드를 써. 마지막 숫자는 개수니까 숫자 후보는 **1번**처럼 적어.', { separator: true }),
        block('📏 후보는 **2~50개**, 이름은 **50자**까지. 같은 이름은 한 번만. 전체 입력은 **3,000자** 안으로.', { isSubtle: true, size: 'Small' }),
    ]);
}
export function buildRaffleCard(r: Raffle, stage: number): Card {
    const a = escape(r.candidates[0]), b = escape(r.candidates[1]), c = escape(r.candidates.at(-1)!);
    const scenes = [
        ['🎰 자, 판 돌린다!', '운들 챙겨왔나? 오늘 팔자 한번 뒤섞어보자.'],
        [`👀 ${a}, 기세가 좋은데?`, '슬슬 앞으로 나온다. 벌써 웃지는 말고.'],
        [`⚡ 잠깐! ${b}, 치고 올라온다!`, `${a}, 방금 표정 굳었는데? 아직 끝난 거 아니다.`],
        [`🌪️ 어허, ${c}도 붙었다!`, '판이 또 뒤집힌다. 끝난 줄 알았지?'],
        [`🔥 ${a}, 다시 앞으로 나온다!`, '이 판 쉽게 안 끝나네. 마지막까지 모르는 거다.'],
        ['🥁 이제 진짜 마지막이다…', '다들 숨 좀 참아봐. 뚜껑 연다.'],
    ];
    const final = stage >= RAFFLE_FINAL_STAGE;
    const scene = scenes[stage] ?? scenes[0];
    const filled = final ? 12 : [1, 2, 5, 6, 9, 11][stage] ?? 1;
    return card([
        block(`🎰 ${escape(r.title)}`, { weight: 'Bolder', size: 'Large', color: 'Accent' }),
        block(`👥 후보 **${r.candidates.length}개** 중 🎯 **${r.count}개** 추첨`, { isSubtle: true }),
        ...(final ? [
            block('🎊 당첨자는 바로 너다.', { weight: 'Bolder', size: 'Medium', separator: true }),
            ...r.winners.map(name => block(`🏆 ${escape(name)}`, { weight: 'Bolder', size: 'ExtraLarge', color: 'Accent' })),
            block('😎 오늘 운 좀 좋은데?', { size: 'Medium' }),
            ...(r.count > 1 ? [block('표시 순서는 순위가 아니다.', { isSubtle: true, size: 'Small' })] : []),
        ] : [
            block(scene[0], { weight: 'Bolder', size: 'Medium', color: stage >= 4 ? 'Attention' : 'Accent', separator: true }),
            block(scene[1]),
            block('앞서거니 뒤서거니는 연출이다. 모두 같은 확률로 뽑는다.', { isSubtle: true, size: 'Small' }),
        ]),
        block(final ? '🎉 오늘의 팔자, 나왔다!' : '🔥 팔자 뒤섞는 중…', { weight: 'Bolder', separator: true }),
        block('▰'.repeat(filled) + '▱'.repeat(12 - filled), { fontType: 'Monospace', color: final ? 'Good' : 'Accent', spacing: 'Small' }),
    ]);
}
