import type { RaffleService } from './service.js';
export function startScheduler(service: RaffleService) {
    let pending: Promise<void> | undefined;
    const timer = setInterval(() => {
        if (pending)
            return;
        pending = service.runScheduledTasks().catch(() => { console.error('추첨 주기 작업 실패'); }).finally(() => { pending = undefined; });
    }, 250);
    timer.unref();
    return async () => { clearInterval(timer); await pending; };
}
