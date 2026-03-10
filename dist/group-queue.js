import fs from 'fs';
import path from 'path';
import { DATA_DIR, MAX_CONCURRENT_CONTAINERS } from './config.js';
import { logger } from './logger.js';
const MAX_RETRIES = 5;
const BASE_RETRY_MS = 5000;
export class GroupQueue {
    groups = new Map();
    activeCount = 0;
    waitingGroups = [];
    processMessagesFn = null;
    shuttingDown = false;
    getGroup(groupJid) {
        let state = this.groups.get(groupJid);
        if (!state) {
            state = {
                active: false,
                pendingMessages: false,
                pendingTasks: [],
                process: null,
                containerName: null,
                groupFolder: null,
                retryCount: 0,
            };
            this.groups.set(groupJid, state);
        }
        return state;
    }
    setProcessMessagesFn(fn) {
        this.processMessagesFn = fn;
    }
    enqueueMessageCheck(groupJid) {
        if (this.shuttingDown)
            return;
        const state = this.getGroup(groupJid);
        if (state.active) {
            state.pendingMessages = true;
            logger.debug({ groupJid }, 'Container active, message queued');
            return;
        }
        if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
            state.pendingMessages = true;
            if (!this.waitingGroups.includes(groupJid)) {
                this.waitingGroups.push(groupJid);
            }
            logger.debug({ groupJid, activeCount: this.activeCount }, 'At concurrency limit, message queued');
            return;
        }
        this.runForGroup(groupJid, 'messages');
    }
    enqueueTask(groupJid, taskId, fn) {
        if (this.shuttingDown)
            return;
        const state = this.getGroup(groupJid);
        // Prevent double-queuing of the same task
        if (state.pendingTasks.some((t) => t.id === taskId)) {
            logger.debug({ groupJid, taskId }, 'Task already queued, skipping');
            return;
        }
        if (state.active) {
            state.pendingTasks.push({ id: taskId, groupJid, fn });
            logger.debug({ groupJid, taskId }, 'Container active, task queued');
            return;
        }
        if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
            state.pendingTasks.push({ id: taskId, groupJid, fn });
            if (!this.waitingGroups.includes(groupJid)) {
                this.waitingGroups.push(groupJid);
            }
            logger.debug({ groupJid, taskId, activeCount: this.activeCount }, 'At concurrency limit, task queued');
            return;
        }
        // Run immediately
        this.runTask(groupJid, { id: taskId, groupJid, fn });
    }
    registerProcess(groupJid, proc, containerName, groupFolder) {
        const state = this.getGroup(groupJid);
        state.process = proc;
        state.containerName = containerName;
        if (groupFolder)
            state.groupFolder = groupFolder;
    }
    /**
     * Send a follow-up message to the active container via IPC file.
     * Returns true if the message was written, false if no active container.
     */
    sendMessage(groupJid, text) {
        const state = this.getGroup(groupJid);
        if (!state.active || !state.groupFolder)
            return false;
        const inputDir = path.join(DATA_DIR, 'ipc', state.groupFolder, 'input');
        try {
            fs.mkdirSync(inputDir, { recursive: true });
            const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
            const filepath = path.join(inputDir, filename);
            const tempPath = `${filepath}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify({ type: 'message', text }));
            fs.renameSync(tempPath, filepath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Signal the active container to wind down by writing a close sentinel.
     */
    closeStdin(groupJid) {
        const state = this.getGroup(groupJid);
        if (!state.active || !state.groupFolder)
            return;
        const inputDir = path.join(DATA_DIR, 'ipc', state.groupFolder, 'input');
        try {
            fs.mkdirSync(inputDir, { recursive: true });
            fs.writeFileSync(path.join(inputDir, '_close'), '');
        }
        catch {
            // ignore
        }
    }
    async runForGroup(groupJid, reason) {
        const state = this.getGroup(groupJid);
        state.active = true;
        state.pendingMessages = false;
        this.activeCount++;
        logger.debug({ groupJid, reason, activeCount: this.activeCount }, 'Starting container for group');
        try {
            if (this.processMessagesFn) {
                const success = await this.processMessagesFn(groupJid);
                if (success) {
                    state.retryCount = 0;
                }
                else {
                    this.scheduleRetry(groupJid, state);
                }
            }
        }
        catch (err) {
            logger.error({ groupJid, err }, 'Error processing messages for group');
            this.scheduleRetry(groupJid, state);
        }
        finally {
            state.active = false;
            state.process = null;
            state.containerName = null;
            state.groupFolder = null;
            this.activeCount--;
            this.drainGroup(groupJid);
        }
    }
    async runTask(groupJid, task) {
        const state = this.getGroup(groupJid);
        state.active = true;
        this.activeCount++;
        logger.debug({ groupJid, taskId: task.id, activeCount: this.activeCount }, 'Running queued task');
        try {
            await task.fn();
        }
        catch (err) {
            logger.error({ groupJid, taskId: task.id, err }, 'Error running task');
        }
        finally {
            state.active = false;
            state.process = null;
            state.containerName = null;
            state.groupFolder = null;
            this.activeCount--;
            this.drainGroup(groupJid);
        }
    }
    scheduleRetry(groupJid, state) {
        state.retryCount++;
        if (state.retryCount > MAX_RETRIES) {
            logger.error({ groupJid, retryCount: state.retryCount }, 'Max retries exceeded, dropping messages (will retry on next incoming message)');
            state.retryCount = 0;
            return;
        }
        const delayMs = BASE_RETRY_MS * Math.pow(2, state.retryCount - 1);
        logger.info({ groupJid, retryCount: state.retryCount, delayMs }, 'Scheduling retry with backoff');
        setTimeout(() => {
            if (!this.shuttingDown) {
                this.enqueueMessageCheck(groupJid);
            }
        }, delayMs);
    }
    drainGroup(groupJid) {
        if (this.shuttingDown)
            return;
        const state = this.getGroup(groupJid);
        // Tasks first (they won't be re-discovered from SQLite like messages)
        if (state.pendingTasks.length > 0) {
            const task = state.pendingTasks.shift();
            this.runTask(groupJid, task);
            return;
        }
        // Then pending messages
        if (state.pendingMessages) {
            this.runForGroup(groupJid, 'drain');
            return;
        }
        // Nothing pending for this group; check if other groups are waiting for a slot
        this.drainWaiting();
    }
    drainWaiting() {
        while (this.waitingGroups.length > 0 &&
            this.activeCount < MAX_CONCURRENT_CONTAINERS) {
            const nextJid = this.waitingGroups.shift();
            const state = this.getGroup(nextJid);
            // Prioritize tasks over messages
            if (state.pendingTasks.length > 0) {
                const task = state.pendingTasks.shift();
                this.runTask(nextJid, task);
            }
            else if (state.pendingMessages) {
                this.runForGroup(nextJid, 'drain');
            }
            // If neither pending, skip this group
        }
    }
    async shutdown(_gracePeriodMs) {
        this.shuttingDown = true;
        // Count active containers but don't kill them — they'll finish on their own
        // via idle timeout or container timeout. The --rm flag cleans them up on exit.
        // This prevents WhatsApp reconnection restarts from killing working agents.
        const activeContainers = [];
        for (const [jid, state] of this.groups) {
            if (state.process && !state.process.killed && state.containerName) {
                activeContainers.push(state.containerName);
            }
        }
        logger.info({ activeCount: this.activeCount, detachedContainers: activeContainers }, 'GroupQueue shutting down (containers detached, not killed)');
    }
}
//# sourceMappingURL=group-queue.js.map