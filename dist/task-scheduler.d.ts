import { ChildProcess } from 'child_process';
import { GroupQueue } from './group-queue.js';
import { RegisteredGroup } from './types.js';
export interface SchedulerDependencies {
    registeredGroups: () => Record<string, RegisteredGroup>;
    getSessions: () => Record<string, string>;
    queue: GroupQueue;
    onProcess: (groupJid: string, proc: ChildProcess, containerName: string, groupFolder: string) => void;
    sendMessage: (jid: string, text: string) => Promise<void>;
}
export declare function startSchedulerLoop(deps: SchedulerDependencies): void;
//# sourceMappingURL=task-scheduler.d.ts.map