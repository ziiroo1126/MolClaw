import { Channel, OnInboundMessage, OnChatMetadata, RegisteredGroup } from '../types.js';
export interface WhatsAppChannelOpts {
    onMessage: OnInboundMessage;
    onChatMetadata: OnChatMetadata;
    registeredGroups: () => Record<string, RegisteredGroup>;
}
export declare class WhatsAppChannel implements Channel {
    name: string;
    prefixAssistantName: boolean;
    private sock;
    private connected;
    private lidToPhoneMap;
    private outgoingQueue;
    private flushing;
    private groupSyncTimerStarted;
    private opts;
    constructor(opts: WhatsAppChannelOpts);
    connect(): Promise<void>;
    private connectInternal;
    sendMessage(jid: string, text: string): Promise<void>;
    isConnected(): boolean;
    ownsJid(jid: string): boolean;
    disconnect(): Promise<void>;
    sendImage(jid: string, imagePath: string, caption?: string): Promise<void>;
    setTyping(jid: string, isTyping: boolean): Promise<void>;
    /**
     * Sync group metadata from WhatsApp.
     * Fetches all participating groups and stores their names in the database.
     * Called on startup, daily, and on-demand via IPC.
     */
    syncGroupMetadata(force?: boolean): Promise<void>;
    private translateJid;
    private flushOutgoingQueue;
}
//# sourceMappingURL=whatsapp.d.ts.map