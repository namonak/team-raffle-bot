import { randomInt } from 'node:crypto';
export class RaffleError extends Error {
}
export type RaffleConfig = {
    title: string;
    candidates: string[];
    count: number;
};
const length = (value: string) => [...value].length;
function checkSize(values: string[]) {
    if (length(values.join('')) > 3000)
        throw new RaffleError('판이 너무 길다. 전체 입력을 3,000자 안으로 줄여봐.');
}
function text(value: unknown): string {
    if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value))
        throw new RaffleError('입력에 이상한 게 끼었네. 글자와 숫자로 다시 적어봐.');
    return value;
}
function validate(title: string, candidates: string[], count: number): RaffleConfig {
    title = title.trim().normalize('NFC');
    candidates = candidates.map(v => v.trim().normalize('NFC'));
    if (!title || length(title) > 100)
        throw new RaffleError('뽑기 제목은 1~100자로 적어봐.');
    if (candidates.length < 2)
        throw new RaffleError('혼자 나와 놓고 뭘 뽑아. 둘은 데려와.');
    if (candidates.length > 50)
        throw new RaffleError('판이 너무 크다. 후보는 쉰까지 데려와.');
    if (candidates.some(v => !v || length(v) > 50))
        throw new RaffleError('후보 이름은 1~50자로 줄여봐.');
    if (new Set(candidates).size !== candidates.length)
        throw new RaffleError('같은 이름으로 두 번 들어왔네. 한 자리씩만 서자.');
    if (!Number.isSafeInteger(count) || count < 1)
        throw new RaffleError('몇 개 뽑을 건지 양의 정수로 딱 정해봐.');
    if (count > candidates.length)
        throw new RaffleError(`${candidates.length}개 데려와 놓고 ${count}개를 뽑으라고? 숫자부터 다시 보자.`);
    if (count === candidates.length)
        throw new RaffleError('전부 뽑으면 추첨이 아니지. 뽑을 수를 줄여봐.');
    return { title, candidates, count };
}
export function parseCommand(raw: string): 'create' | 'help' | RaffleConfig {
    const value = text(raw);
    checkSize([value]);
    const trimmed = value.trim();
    if (!trimmed)
        return 'create';
    if (trimmed === '도움말')
        return 'help';
    const candidates = trimmed.split(/\s+/u);
    const last = candidates.at(-1)!;
    let count = 1;
    if (/^\d+(?:명|개|곳)?$/u.test(last)) {
        count = Number(last.replace(/(?:명|개|곳)$/u, ''));
        candidates.pop();
    }
    else if (/^(?:[+\-−]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?(?:(?:명|개|곳)+(?:요)?)?|NaN|[+\-]?Infinity|명|개|곳)$/u.test(last))
        throw new RaffleError('마지막 개수를 확인해봐. 2 또는 2명·2개·2곳처럼 적으면 된다.');
    return validate('쿠웨이트박의 뽑기판', candidates, count);
}
export function validateForm(input: Record<string, unknown>): RaffleConfig {
    const title = text(input.title), candidates = text(input.candidates), count = typeof input.count === 'number' && Number.isSafeInteger(input.count) ? String(input.count) : text(input.count);
    checkSize([title, candidates, count]);
    if (!/^\d+$/u.test(count.trim()))
        throw new RaffleError('추첨 개수는 단위 없이 양의 정수로 적어봐.');
    return validate(title, candidates.split(/\r?\n/u).map(v => v.trim()).filter(Boolean), Number(count.trim()));
}
export function draw(config: RaffleConfig, random: (max: number) => number = randomInt): string[] {
    const candidates = [...config.candidates];
    for (let i = 0; i < config.count; i++) {
        const j = i + random(candidates.length - i);
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates.slice(0, config.count);
}
