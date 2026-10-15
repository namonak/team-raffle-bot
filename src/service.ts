import { draw, validateForm, RaffleError, type RaffleConfig } from './domain.js';
import { Store, type Draft, type Raffle } from './store.js';
import { buildCreateCard, buildRaffleCard, type Card } from './cards.js';
export type Actor = {
    conversationId: string;
    userId: string;
    messageId?: string;
};
export type Transport = {
    send(conversationId: string, card: Card): Promise<string>;
    update(conversationId: string, messageId: string, card: Card): Promise<void>;
};
function failure(error: unknown) {
    const e = error as {
        status?: number;
        statusCode?: number;
        headers?: Record<string, string> | Headers;
        response?: {
            status?: number;
            headers?: Record<string, string> | Headers;
        };
    } | undefined;
    const headers = e?.headers ?? e?.response?.headers;
    const retry = headers instanceof Headers ? headers.get('retry-after') : headers?.['retry-after'];
    return { status: e?.status ?? e?.statusCode ?? e?.response?.status, retry };
}
const permanent = (status?: number) => status !== undefined && status >= 400 && status < 500 && ![408, 412, 429].includes(status);
export class RaffleService {
    private running = false;
    constructor(private store: Store, private transport: Transport, private now = Date.now) { store.recover(now()); }
    private checkActor(a: Actor) { if (!a.conversationId || !a.userId)
        throw new RaffleError('누가 부른 건지 모르겠네. 대화방에서 다시 불러봐.'); }
    private checkRoom(id: string) { if (this.store.blocked(id))
        throw new RaffleError('지금 판 돌아가잖아. 이것부터 끝내고 가자. 게시 확인이 필요한 판은 관리자에게 알려줘.'); }
    private existing(r: Raffle): Raffle {
        if (['uncertain', 'publishing', 'attention', 'cancelled'].includes(r.status))
            throw new RaffleError(`판 상태를 확인해야겠다. 관리자에게 이 ID를 알려줘: ${r.id}`);
        return r;
    }
    async createDraft(a: Actor, requestId: string): Promise<Draft> {
        this.checkActor(a);
        if (!requestId)
            throw new RaffleError('요청 번호가 없네. 다시 불러봐.');
        const key = `form:${a.conversationId}:${requestId}`;
        const previous = this.store.draftForKey(key);
        if (previous) {
            if (previous.status !== 'ready')
                throw new RaffleError(`카드 게시 확인이 필요하다. ID: ${previous.id}`);
            return previous;
        }
        this.checkRoom(a.conversationId);
        const d = this.store.createDraft(key, a.conversationId, a.userId, this.now());
        try {
            const id = await this.transport.send(a.conversationId, buildCreateCard(d.id));
            if (!id)
                throw new Error('missing-message-id');
            d.messageId = id;
            d.status = 'ready';
            this.store.saveDraft(d);
            return d;
        }
        catch (error) {
            d.status = permanent(failure(error).status) ? 'attention' : 'uncertain';
            this.store.saveDraft(d);
            console.error('입력 카드 게시 확인 필요:', d.id);
            throw new RaffleError(`카드가 올라갔는지 확인이 필요하다. 관리자에게 이 ID를 알려줘: ${d.id}`);
        }
    }
    async startForm(a: Actor, draftId: string, input: Record<string, unknown>): Promise<Raffle> {
        this.checkActor(a);
        const d = this.store.getDraft(draftId);
        if (!d || d.ownerId !== a.userId || d.conversationId !== a.conversationId)
            throw new RaffleError('이 판 벌인 사람만 돌릴 수 있어. 네 판은 @쿠웨이트박으로 열어봐.');
        if (!a.messageId || a.messageId !== d.messageId)
            throw new RaffleError('이 카드와 판 번호가 안 맞네. 원래 카드에서 다시 눌러봐.');
        const previous = this.store.raffleForKey(`draft:${d.id}`);
        if (previous)
            return this.existing(previous);
        if (d.status !== 'ready' || !d.messageId)
            throw new RaffleError('입력 카드 게시 상태부터 확인해야겠다. 관리자에게 알려줘.');
        if (this.now() - d.createdAt >= 86400000)
            throw new RaffleError('하루 지난 판이네. @쿠웨이트박으로 새 판 열자.');
        const config = validateForm(input);
        return this.store.transaction(() => { this.checkRoom(a.conversationId); return this.store.createRaffle(this.base(a, `draft:${d.id}`, config, d.messageId)); });
    }
    private base(a: Actor, key: string, config: RaffleConfig, messageId: string | null): Omit<Raffle, 'id'> {
        return { ...config, key, conversationId: a.conversationId, ownerId: a.userId, messageId, winners: draw(config), status: messageId ? 'running' : 'publishing', stage: 0, nextAt: this.now(), failures: 0 };
    }
    async startText(a: Actor, requestId: string, config: RaffleConfig): Promise<Raffle> {
        this.checkActor(a);
        if (!requestId)
            throw new RaffleError('요청 번호가 없네. 다시 불러봐.');
        const key = `text:${a.conversationId}:${requestId}`, previous = this.store.raffleForKey(key);
        if (previous)
            return this.existing(previous);
        const r = this.store.transaction(() => { this.checkRoom(a.conversationId); return this.store.createRaffle(this.base(a, key, config, null)); });
        try {
            const id = await this.transport.send(a.conversationId, buildRaffleCard(r, 0));
            if (!id)
                throw new Error('missing-message-id');
            r.messageId = id;
            r.status = 'running';
            r.stage = 1;
            r.nextAt = this.now() + 1750;
            this.store.saveRaffle(r);
            return r;
        }
        catch (error) {
            r.status = permanent(failure(error).status) ? 'attention' : 'uncertain';
            this.store.saveRaffle(r);
            console.error('추첨 카드 게시 확인 필요:', r.id);
            throw new RaffleError(`판이 올라갔는지 확인이 필요하다. 관리자에게 이 ID를 알려줘: ${r.id}`);
        }
    }
    async runScheduledTasks() {
        if (this.running)
            return;
        this.running = true;
        try {
            for (const pending of this.store.pending()) {
                if (pending.nextAt > this.now())
                    continue;
                const r = this.store.getRaffle(pending.id)!;
                try {
                    await this.transport.update(r.conversationId, r.messageId!, buildRaffleCard(r, r.stage));
                    if (r.stage === 4) {
                        r.status = 'done';
                    }
                    else {
                        r.stage++;
                        r.nextAt = this.now() + 1750;
                    }
                    this.store.saveRaffle(r);
                }
                catch (error) {
                    const { status, retry } = failure(error);
                    r.stage = 4;
                    r.failures++;
                    r.status = permanent(status) ? 'attention' : 'retry';
                    const retryMs = retry ? (/^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - this.now())) : 0;
                    r.nextAt = this.now() + Math.max(Number.isFinite(retryMs) ? retryMs : 0, Math.min(300000, 2000 * 2 ** Math.min(r.failures, 7)) + Math.floor(Math.random() * 1000));
                    this.store.saveRaffle(r);
                    console.error('추첨 카드 갱신:', r.id, r.status, status ?? 'network');
                }
            }
        }
        finally {
            this.running = false;
        }
    }
}
