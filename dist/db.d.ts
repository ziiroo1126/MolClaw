import { NewMessage, RegisteredGroup, ScheduledTask, TaskRunLog } from './types.js';
export declare function initDatabase(): void;
/** @internal - for tests only. Creates a fresh in-memory database. */
export declare function _initTestDatabase(): void;
/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export declare function storeChatMetadata(chatJid: string, timestamp: string, name?: string): void;
/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export declare function updateChatName(chatJid: string, name: string): void;
export interface ChatInfo {
    jid: string;
    name: string;
    last_message_time: string;
}
/**
 * Get all known chats, ordered by most recent activity.
 */
export declare function getAllChats(): ChatInfo[];
/**
 * Get timestamp of last group metadata sync.
 */
export declare function getLastGroupSync(): string | null;
/**
 * Record that group metadata was synced.
 */
export declare function setLastGroupSync(): void;
/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export declare function storeMessage(msg: NewMessage): void;
/**
 * Store a message directly (for non-WhatsApp channels that don't use Baileys proto).
 */
export declare function storeMessageDirect(msg: {
    id: string;
    chat_jid: string;
    sender: string;
    sender_name: string;
    content: string;
    timestamp: string;
    is_from_me: boolean;
}): void;
export declare function getNewMessages(jids: string[], lastTimestamp: string, botPrefix: string): {
    messages: NewMessage[];
    newTimestamp: string;
};
export declare function getMessagesSince(chatJid: string, sinceTimestamp: string, botPrefix: string): NewMessage[];
export declare function createTask(task: Omit<ScheduledTask, 'last_run' | 'last_result'>): void;
export declare function getTaskById(id: string): ScheduledTask | undefined;
export declare function getTasksForGroup(groupFolder: string): ScheduledTask[];
export declare function getAllTasks(): ScheduledTask[];
export declare function updateTask(id: string, updates: Partial<Pick<ScheduledTask, 'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status'>>): void;
export declare function deleteTask(id: string): void;
export declare function getDueTasks(): ScheduledTask[];
export declare function updateTaskAfterRun(id: string, nextRun: string | null, lastResult: string): void;
export declare function logTaskRun(log: TaskRunLog): void;
export declare function getRouterState(key: string): string | undefined;
export declare function setRouterState(key: string, value: string): void;
export declare function getSession(groupFolder: string): string | undefined;
export declare function setSession(groupFolder: string, sessionId: string): void;
export declare function getAllSessions(): Record<string, string>;
export declare function getRegisteredGroup(jid: string): (RegisteredGroup & {
    jid: string;
}) | undefined;
export declare function setRegisteredGroup(jid: string, group: RegisteredGroup): void;
export declare function getAllRegisteredGroups(): Record<string, RegisteredGroup>;
//# sourceMappingURL=db.d.ts.map