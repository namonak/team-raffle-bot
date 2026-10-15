import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RAFFLE_FINAL_STAGE, type RaffleConfig } from './domain.js';
export type Draft = {
    id: string;
    key: string;
    conversationId: string;
    ownerId: string;
    messageId: string | null;
    createdAt: number;
    status: 'publishing' | 'ready' | 'uncertain' | 'attention' | 'cancelled';
};
export type Raffle = RaffleConfig & {
    id: string;
    key: string;
    conversationId: string;
    ownerId: string;
    messageId: string | null;
    winners: string[];
    status: 'publishing' | 'running' | 'retry' | 'done' | 'uncertain' | 'attention' | 'cancelled';
    stage: number;
    nextAt: number;
    failures: number;
};
export class Store {
    private constructor(private db: DatabaseSync) {
        db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS conversation(id TEXT PRIMARY KEY, reference_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS draft(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, conversation_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
      CREATE TABLE IF NOT EXISTS raffle(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, conversation_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));`);
    }
    static open(path: string) { if (path !== ':memory:')
        mkdirSync(dirname(path), { recursive: true }); return new Store(new DatabaseSync(path)); }
    close() { this.db.close(); }
    transaction<T>(work: () => T): T {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const value = work();
            this.db.exec('COMMIT');
            return value;
        }
        catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }
    activateConversation(id: string, reference: unknown) { this.db.prepare('INSERT INTO conversation VALUES (?,?) ON CONFLICT(id) DO UPDATE SET reference_json=excluded.reference_json').run(id, JSON.stringify(reference)); }
    conversationReference(id: string): unknown { const row = this.db.prepare('SELECT reference_json FROM conversation WHERE id=?').get(id); return row ? JSON.parse(String(row.reference_json)) : undefined; }
    getDraft(id: string): Draft | undefined { const row = this.db.prepare('SELECT data FROM draft WHERE id=?').get(id); return row ? JSON.parse(String(row.data)) : undefined; }
    draftForKey(key: string): Draft | undefined { const row = this.db.prepare('SELECT data FROM draft WHERE request_key=?').get(key); return row ? JSON.parse(String(row.data)) : undefined; }
    createDraft(key: string, conversationId: string, ownerId: string, now: number): Draft {
        const d: Draft = { id: randomUUID(), key, conversationId, ownerId, messageId: null, createdAt: now, status: 'publishing' };
        this.db.prepare('INSERT INTO draft VALUES (?,?,?,?,?)').run(d.id, key, conversationId, d.status, JSON.stringify(d));
        return d;
    }
    saveDraft(d: Draft) { this.db.prepare('UPDATE draft SET status=?,data=? WHERE id=?').run(d.status, JSON.stringify(d), d.id); }
    getRaffle(id: string): Raffle | undefined { const row = this.db.prepare('SELECT data FROM raffle WHERE id=?').get(id); return row ? JSON.parse(String(row.data)) : undefined; }
    raffleForKey(key: string): Raffle | undefined { const row = this.db.prepare('SELECT data FROM raffle WHERE request_key=?').get(key); return row ? JSON.parse(String(row.data)) : undefined; }
    createRaffle(data: Omit<Raffle, 'id'>): Raffle {
        const r = { ...data, id: randomUUID() };
        this.db.prepare('INSERT INTO raffle VALUES (?,?,?,?,?)').run(r.id, r.key, r.conversationId, r.status, JSON.stringify(r));
        return r;
    }
    saveRaffle(r: Raffle) { this.db.prepare('UPDATE raffle SET status=?,data=? WHERE id=?').run(r.status, JSON.stringify(r), r.id); }
    blocked(conversationId: string): boolean {
        return !!this.db.prepare("SELECT 1 FROM raffle WHERE conversation_id=? AND status IN ('publishing','running','uncertain') LIMIT 1").get(conversationId)
            || !!this.db.prepare("SELECT 1 FROM draft WHERE conversation_id=? AND status='uncertain' LIMIT 1").get(conversationId);
    }
    pending(): Raffle[] { return this.db.prepare("SELECT data FROM raffle WHERE status IN ('running','retry')").all().map(row => JSON.parse(String(row.data))); }
    recover(now: number) {
        this.transaction(() => {
            for (const row of this.db.prepare("SELECT data FROM raffle WHERE status IN ('running','publishing')").all()) {
                const r: Raffle = JSON.parse(String(row.data));
                r.status = r.messageId ? 'retry' : 'uncertain';
                r.stage = RAFFLE_FINAL_STAGE;
                r.nextAt = now;
                this.saveRaffle(r);
            }
            for (const row of this.db.prepare("SELECT data FROM draft WHERE status='publishing'").all()) {
                const d: Draft = JSON.parse(String(row.data));
                d.status = 'uncertain';
                this.saveDraft(d);
            }
        });
    }
}
