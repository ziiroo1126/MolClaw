/**
 * Container Runner for BioClaw
 * Spawns agent execution in Docker container and handles IPC
 */
import { ChildProcess } from 'child_process';
import { RegisteredGroup } from './types.js';
export interface ContainerInput {
    prompt: string;
    sessionId?: string;
    groupFolder: string;
    chatJid: string;
    isMain: boolean;
    isScheduledTask?: boolean;
    secrets?: Record<string, string>;
}
export interface ContainerOutput {
    status: 'success' | 'error';
    result: string | null;
    newSessionId?: string;
    error?: string;
}
export declare function runContainerAgent(group: RegisteredGroup, input: ContainerInput, onProcess: (proc: ChildProcess, containerName: string) => void, onOutput?: (output: ContainerOutput) => Promise<void>): Promise<ContainerOutput>;
export declare function writeTasksSnapshot(groupFolder: string, isMain: boolean, tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
}>): void;
export interface AvailableGroup {
    jid: string;
    name: string;
    lastActivity: string;
    isRegistered: boolean;
}
/**
 * Write available groups snapshot for the container to read.
 * Only main group can see all available groups (for activation).
 * Non-main groups only see their own registration status.
 */
export declare function writeGroupsSnapshot(groupFolder: string, isMain: boolean, groups: AvailableGroup[], registeredJids: Set<string>): void;
//# sourceMappingURL=container-runner.d.ts.map