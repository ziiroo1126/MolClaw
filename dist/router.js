import { ASSISTANT_NAME } from './config.js';
export function escapeXml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
export function formatMessages(messages) {
    const lines = messages.map((m) => `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`);
    return `<messages>\n${lines.join('\n')}\n</messages>`;
}
export function stripInternalTags(text) {
    return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}
export function formatOutbound(channel, rawText) {
    const text = stripInternalTags(rawText);
    if (!text)
        return '';
    const prefix = channel.prefixAssistantName !== false ? `${ASSISTANT_NAME}: ` : '';
    return `${prefix}${text}`;
}
export function routeOutbound(channels, jid, text) {
    const channel = channels.find((c) => c.ownsJid(jid) && c.isConnected());
    if (!channel)
        throw new Error(`No channel for JID: ${jid}`);
    return channel.sendMessage(jid, text);
}
export function findChannel(channels, jid) {
    return channels.find((c) => c.ownsJid(jid));
}
//# sourceMappingURL=router.js.map