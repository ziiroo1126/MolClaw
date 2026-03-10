import { RegisteredGroup } from './types.js';
export { escapeXml, formatMessages } from './router.js';
/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export declare function getAvailableGroups(): import('./container-runner.js').AvailableGroup[];
/** @internal - exported for testing */
export declare function _setRegisteredGroups(groups: Record<string, RegisteredGroup>): void;
//# sourceMappingURL=index.d.ts.map