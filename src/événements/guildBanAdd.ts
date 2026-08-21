import { Events, AuditLogEvent, GuildBan, Client, User, GuildMember, TextChannel } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export default {
    name: Events.GuildBanAdd,
    async execute(ban: GuildBan, client: Client) {
        if (!ban.guild) return;
        const security = client.getGuildConfig(ban.guild.id);
        const { antiNuke } = security;
        if (!antiNuke.enabled) return;

        if (!client.nukeMap) client.nukeMap = new Map();

        let executor: User | null = null;
        try {
            const logs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd });
            const entry = logs.entries.first();
            if (entry && Date.now() - entry.createdTimestamp < 5000) {
                if (entry.target?.id === ban.user.id) {
                    executor = entry.executor as User | null;
                }
            }
        } catch (e: any) {
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${ban.guild.name}' to detect who banned the member.`);
                return;
            }
            console.error(e);
        }

        if (!executor) return;

        // Fetch member
        let member: GuildMember | null = null;
        try {
            member = await ban.guild.members.fetch(executor.id);
        } catch (e) { }

        // Whitelist Check
        if (isWhitelisted(client, ban.guild, (member || executor) as any)) return;

        const now = Date.now();
        const nukeMap = client.nukeMap;
        if (!nukeMap.has(executor.id)) {
            nukeMap.set(executor.id, { banAdds: [] });
        }

        const userData = nukeMap.get(executor.id)!;
        if (!userData.banAdds) userData.banAdds = [];

        userData.banAdds.push(now);
        userData.banAdds = userData.banAdds.filter((t: number) => now - t < (antiNuke.timeWindow || 10000));

        if (userData.banAdds.length > antiNuke.banLimit) {
            const member = ban.guild.members.cache.get(executor.id);
            if (member && member.moderatable) {
                try {
                    await member.roles.set([], 'Anti-Nuke: Ban limit exceeded');
                    const logChannelId = client.config.guildLogs?.[ban.guild.id]?.securityChannelId;
                    const logChannel = logChannelId ? ban.guild.channels.cache.get(logChannelId) as TextChannel : null;

                    if (logChannel) {
                        await logChannel.send(`🚨 **Anti-Nuke** : ${executor} a banni trop de membres. Ses rôles ont été retirés.`);
                    }
                    console.log(`Anti-Nuke: Action taken against ${executor.tag}`);
                } catch (e) { console.error(e); }
            }
        }
    },
};
