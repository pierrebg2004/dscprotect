import { Events, AuditLogEvent, GuildChannel, Client, GuildMember, TextChannel } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export const channelCreateMap = new Map<string, { timestamp: number, channelId: string }[]>();

export default {
    name: Events.ChannelCreate,
    async execute(channel: GuildChannel, client: Client) {
        if (!channel.guild) return;
        const security = client.getGuildConfig(channel.guild.id);
        const { antiMassChannels } = security || {};
        if (!antiMassChannels || !antiMassChannels.enabled) return;

        // Get executor from audit logs
        let executor = null;
        try {
            const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate });
            const entry = logs.entries.first();
            if (entry && Date.now() - entry.createdTimestamp < 5000) {
                executor = entry.executor;
            }
        } catch (e: any) {
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${channel.guild.name}' to detect who created the channel.`);
                return;
            }
            console.error('Failed to fetch audit logs for channel creation:', e);
            return;
        }

        if (!executor || executor.id === client.user?.id) return;

        // Check whitelist
        // We need to fetch the member here because Audit Log provides a User, not a Member.
        // And we need the Member object to check roles.
        let member: GuildMember | null = null;
        try {
            member = await channel.guild.members.fetch(executor.id);
        } catch (e) {
            // Member might have left, in that case Role check is impossible
        }

        if (isWhitelisted(client, channel.guild, (member || executor) as any)) return;

        const now = Date.now();
        const userId = executor.id;

        if (!channelCreateMap.has(userId)) {
            channelCreateMap.set(userId, []);
        }

        const userChannels = channelCreateMap.get(userId)!;
        userChannels.push({ timestamp: now, channelId: channel.id });

        // Filter old channel creations
        const recentChannels = userChannels.filter(c => now - c.timestamp < (antiMassChannels.timeWindow || 5000));
        channelCreateMap.set(userId, recentChannels);

        if (recentChannels.length > antiMassChannels.channelLimit) {
            console.log(`[Anti-Mass-Channels] 🚨 Mass channel creation detected by ${executor.tag}`);

            try {
                // Delete the spam channels
                for (const channelData of recentChannels) {
                    const spamChannel = channel.guild.channels.cache.get(channelData.channelId);
                    if (spamChannel) {
                        await spamChannel.delete('Anti-Mass-Channels: Spam detected');
                    }
                }

                // Remove roles from executor
                if (member && member.moderatable) {
                    try {
                        const rolesToRemove = member.roles.cache.filter(role =>
                            role.id !== channel.guild.id && // Don't try to remove @everyone
                            role.editable &&               // Bot must be able to manage this role (hierarchy check)
                            !role.managed                  // Role is not managed by an integration (e.g. Server Booster)
                        );

                        if (rolesToRemove.size > 0) {
                            await member.roles.remove(rolesToRemove, 'Anti-Mass-Channels: Channel creation spam');
                            console.log(`[Anti-Mass-Channels] Removed ${rolesToRemove.size} roles from ${executor.tag}`);
                        }
                    } catch (roleError) {
                        console.error(`[Anti-Mass-Channels] Failed to remove roles from ${executor.tag}:`, roleError);
                        // Continue execution - failure to strip roles shouldn't prevent notification
                    }
                }

                // Send notification
                const logChannelId = client.config.guildLogs?.[channel.guild.id]?.securityChannelId;
                const logChannel = logChannelId ? channel.guild.channels.cache.get(logChannelId) as TextChannel : null;

                if (logChannel) {
                    await logChannel.send(`🚨 **Anti-Mass-Channels** : ${executor} a été sanctionné pour création massive de salons.`);
                }

                // Clear map
                channelCreateMap.delete(userId);

            } catch (error) {
                console.error('[Anti-Mass-Channels] Failed to handle channel spam:', error);
            }
        }
    },
};
