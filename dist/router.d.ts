import { Channel, NewMessage } from './types.js';
export declare function escapeXml(s: string): string;
export declare function formatMessages(messages: NewMessage[]): string;
export declare function stripInternalTags(text: string): string;
export declare function formatOutbound(channel: Channel, rawText: string): string;
export declare function routeOutbound(channels: Channel[], jid: string, text: string): Promise<void>;
export declare function findChannel(channels: Channel[], jid: string): Channel | undefined;
//# sourceMappingURL=router.d.ts.map