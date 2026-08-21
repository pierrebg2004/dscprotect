import { Events, AuditLogEvent, GuildChannel, Client, User, GuildMember, TextChannel } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export default {
    name: Events.ChannelDelete,
    async execute(channel: GuildChannel, client: Client) {
        if (!channel.guild) return;
        const security = client.getGuildConfig(channel.guild.id);
        const { antiNuke } = security;
        if (!antiNuke.enabled) return;

        // Ensure client.nukeMap exists
        if (!client.nukeMap) client.nukeMap = new Map();

        // Fetch executor
        let executor: User | null = null;
        try {
            const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
            const entry = logs.entries.first();
            if (entry && Date.now() - entry.createdTimestamp < 5000) {
                // Check if the target matches the deleted channel
                if (entry.target?.id === channel.id) {
                    executor = entry.executor as User | null;
                }
            }
        } catch (e: any) {
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${channel.guild.name}' to detect who deleted the channel.`);
                return;
            }
            console.error('Failed to fetch audit logs:', e);
        }

        if (!executor) return; // Can't identify who did it

        // Fetch Member for Role checks
        let member: GuildMember | null = null;
        try {
            member = await channel.guild.members.fetch(executor.id);
        } catch (e) { }

        // Whitelist Check
        // Pass member if available, otherwise just executor (User)
        if (isWhitelisted(client, channel.guild, (member || executor) as any)) return;

        const now = Date.now();
        const nukeMap = client.nukeMap;
        if (!nukeMap.has(executor.id)) {
            nukeMap.set(executor.id, { channelDeletes: [] });
        }

        const userData = nukeMap.get(executor.id)!;
        if (!userData.channelDeletes) userData.channelDeletes = [];

        userData.channelDeletes.push(now);

        // Filter old events
        userData.channelDeletes = userData.channelDeletes.filter((t: number) => now - t < (antiNuke.timeWindow || 10000));
        nukeMap.set(executor.id, userData);

        if (userData.channelDeletes.length > antiNuke.channelDeleteLimit) {
            // Action!
            const member = channel.guild.members.cache.get(executor.id);
            if (member && member.moderatable) {
                try {
                    // Remove all roles (dangerous but effective for anti-nuke)
                    await member.roles.set([], 'Anti-Nuke: Channel deletion limit exceeded');

                    // Restore the channel
                    await channel.clone({
                        name: channel.name,
                        reason: 'Anti-Nuke: Restoring deleted channel'
                    });

                    const logChannelId = client.config.guildLogs?.[channel.guild.id]?.securityChannelId;
                    const logChannel = logChannelId ? channel.guild.channels.cache.get(logChannelId) as TextChannel : null;

                    if (logChannel) {
                        await logChannel.send(`🚨 **Anti-Nuke** : ${executor} a supprimé trop de salons. Ses rôles ont été retirés et le salon restauré.`);
                    }
                    console.log(`Anti-Nuke: Action taken against ${executor.tag} and channel restored.`);
                } catch (e) {
                    console.error('Failed to punish nuker:', e);
                }
            }
        }
    },
};
