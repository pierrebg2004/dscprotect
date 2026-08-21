import { Events, AuditLogEvent, GuildChannel, Client, User, TextChannel, Webhook, GuildMember } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export default {
    name: Events.WebhooksUpdate,
    async execute(channel: GuildChannel, client: Client) {
        const security = client.getGuildConfig(channel.guild.id);
        const { antiWebhook } = security;
        if (!antiWebhook || !antiWebhook.enabled) return;

        // Fetch audit logs to see if a webhook was created
        let executor: User | null = null;
        let target: Webhook | any = null;
        try {
            const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.WebhookCreate });
            const entry = logs.entries.first();
            // Check if this log entry is recent and related to this channel
            if (entry && Date.now() - entry.createdTimestamp < 5000 && (entry.target as any).channelId === channel.id) {
                executor = entry.executor as User | null;
                target = entry.target;
            }
        } catch (e: any) {
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${channel.guild.name}' to detect who created the webhook.`);
                return;
            }
            console.error('Failed to fetch audit logs for webhook:', e);
        }

        if (!executor || executor.id === client.user?.id) return;

        // Fetch member
        let member: GuildMember | null = null;
        try {
            member = await channel.guild.members.fetch(executor.id);
        } catch (e) { }

        // Check whitelist
        if (isWhitelisted(client, channel.guild, (member || executor) as any)) return;

        // Delete webhook
        try {
            // If target is available from audit log (it's a Webhook object usually)
            if (target) {
                // We might need to fetch it to be sure we can delete it, or just try deleting the target if it has the method
                // Audit log target for WebhookCreate is a Webhook object
                await target.delete('Security: Anti-Webhook (Unauthorized creation)');

                const logChannelId = client.config.guildLogs?.[channel.guild.id]?.securityChannelId;
                const logChannel = logChannelId ? channel.guild.channels.cache.get(logChannelId) as TextChannel : null;

                if (logChannel) {
                    await logChannel.send(`🛡️ **Sécurité** : Webhook créé par ${executor} dans ${channel} a été supprimé (Anti-Webhook).`);
                }
                console.log(`[Anti-Webhook] Deleted webhook created by ${executor.tag}`);
            }
        } catch (error) {
            console.error('Failed to delete webhook:', error);
        }
    },
};
