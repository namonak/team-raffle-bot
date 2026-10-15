import express from 'express';
import { pathToFileURL } from 'node:url';
import { ActivityHandler, CardFactory, MessageFactory, CloudAdapter, authorizeJWT, getAuthConfigWithDefaults, type TurnContext, type AdaptiveCardInvokeValue, type AdaptiveCardInvokeResponse } from '@microsoft/agents-hosting';
import { parseCommand, RaffleError } from './domain.js';
import { buildHelpCard } from './cards.js';
import { Store } from './store.js';
import { RaffleService, type Actor, type Transport } from './service.js';
import { startScheduler } from './scheduler.js';
export async function dispatchAction(service: RaffleService, actor: Actor, action: unknown): Promise<string> {
    if (!action || typeof action !== 'object')
        throw new RaffleError('버튼 정보가 이상하네. 새 판에서 다시 눌러봐.');
    const { verb, data } = action as {
        verb?: unknown;
        data?: unknown;
    };
    if (verb !== 'raffleStart' || !data || typeof data !== 'object' || Array.isArray(data))
        throw new RaffleError('모르는 버튼이네. @쿠웨이트박으로 새 판 열어봐.');
    const fields = data as Record<string, unknown>;
    if (typeof fields.draftId !== 'string' || fields.draftId.length > 100 || !fields.draftId)
        throw new RaffleError('어느 판인지 모르겠네. 새 판에서 다시 눌러봐.');
    await service.startForm(actor, fields.draftId, fields);
    return '좋아, 판 돌아간다. 이 카드에서 기다려봐.';
}
export class RaffleBot extends ActivityHandler {
    constructor(private service: RaffleService, private store: Store) {
        super();
        this.onMessage(async (context, next) => {
            try {
                const actor = this.remember(context);
                context.activity.removeRecipientMention();
                const command = parseCommand(context.activity.text ?? '');
                const requestId = context.activity.id;
                if (!requestId)
                    throw new RaffleError('요청 번호가 없네. 다시 불러봐.');
                if (command === 'create')
                    await service.createDraft(actor, requestId);
                else if (command === 'help')
                    await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(buildHelpCard())));
                else
                    await service.startText(actor, requestId, command);
            }
            catch (error) {
                if (!(error instanceof RaffleError))
                    console.error('추첨 요청 처리 실패');
                await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(buildHelpCard(error instanceof RaffleError ? error.message : '판을 못 열었네. 잠시 뒤 다시 불러봐.'))));
            }
            await next();
        });
    }
    private remember(context: TurnContext): Actor {
        const a = context.activity;
        if (a.channelId !== 'msteams' || a.conversation?.conversationType !== 'groupChat' || !a.conversation.id || !a.from?.id)
            throw new RaffleError('난 Teams 단체 대화방에서 판 돌린다. 거기서 불러봐.');
        this.store.activateConversation(a.conversation.id, a.getConversationReference());
        return { conversationId: a.conversation.id, userId: a.from.id, messageId: a.replyToId };
    }
    protected override async onAdaptiveCardInvoke(context: TurnContext, invoke: AdaptiveCardInvokeValue): Promise<AdaptiveCardInvokeResponse> {
        try {
            return { statusCode: 200, type: 'application/vnd.microsoft.activity.message', value: await dispatchAction(this.service, this.remember(context), invoke.action) } as unknown as AdaptiveCardInvokeResponse;
        }
        catch (error) {
            if (!(error instanceof RaffleError))
                console.error('추첨 카드 동작 실패');
            return { statusCode: 400, type: 'application/vnd.microsoft.error', value: { code: 'BadRequest', message: error instanceof RaffleError ? error.message : '판을 못 돌렸네. 잠시 뒤 다시 눌러봐.' } } as AdaptiveCardInvokeResponse;
        }
    }
}
export function createTeamsTransport(adapter: CloudAdapter, appId: string, store: Store): Transport {
    // SDK 기본 처리기는 오류를 삼키므로 카드 갱신 재시도를 위해 호출자까지 전파한다.
    adapter.onTurnError = async (_context, error) => { throw error; };
    const withConversation = async <T>(conversationId: string, work: (context: TurnContext) => Promise<T>): Promise<T> => {
        const reference = store.conversationReference(conversationId);
        if (!reference)
            throw new Error('missing-conversation-reference');
        let result: T;
        await adapter.continueConversation(appId, reference as Parameters<CloudAdapter['continueConversation']>[1], async (context) => { result = await work(context); });
        return result!;
    };
    return {
        async send(id, card) { return withConversation(id, async (context) => { const sent = await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(card))); if (!sent?.id)
            throw new Error('missing-message-id'); return sent.id; }); },
        async update(id, messageId, card) { await withConversation(id, async (context) => { const message = MessageFactory.attachment(CardFactory.adaptiveCard(card)); message.id = messageId; message.conversation = context.activity.conversation; await context.updateActivity(message); }); },
    };
}
export function createApp(env: NodeJS.ProcessEnv = process.env) {
    for (const key of ['MicrosoftAppId', 'MicrosoftAppPassword', 'MicrosoftAppTenantId'])
        if (!env[key]?.trim())
            throw new Error(`.env에 ${key} 설정이 필요하다`);
    const auth = getAuthConfigWithDefaults({ clientId: env.MicrosoftAppId!, clientSecret: env.MicrosoftAppPassword, tenantId: env.MicrosoftAppTenantId });
    const adapter = new CloudAdapter(auth);
    const store = Store.open(env.DATABASE_PATH ?? './data/team-raffle-bot.sqlite');
    const service = new RaffleService(store, createTeamsTransport(adapter, env.MicrosoftAppId!, store));
    const bot = new RaffleBot(service, store);
    const stop = startScheduler(service);
    const app = express();
    app.locals.dispose = async () => { await stop(); store.close(); };
    app.get('/healthz', (_req, res) => res.json({ ok: true }));
    app.post('/api/messages', authorizeJWT(auth), express.json({ limit: '64kb' }), async (req, res) => { await adapter.process(req, res, context => bot.run(context)); });
    app.use((error: {
        status?: number;
    }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500; res.status(status).json({ error: '요청을 처리하지 못했다.' }); });
    return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const app = createApp();
    const port = Number(process.env.PORT ?? 3978);
    const server = app.listen(port, () => console.log(`쿠웨이트박이 ${port}번 문을 열었다!`));
    for (const signal of ['SIGINT', 'SIGTERM'])
        process.once(signal, () => server.close(() => { void app.locals.dispose().then(() => process.exit(0)); }));
}
