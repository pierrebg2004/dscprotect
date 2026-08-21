import { Events, AuditLogEvent, GuildMember, Client, User, TextChannel } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export default {
    name: Events.GuildMemberRemove,
    async execute(member: GuildMember, client: Client) {
        const security = client.getGuildConfig(member.guild.id);
        const { antiNuke } = security;
        if (!antiNuke.enabled) return;

        // Ensure client.nukeMap exists
        if (!client.nukeMap) client.nukeMap = new Map();

        // Check if guild is available
        if (!member.guild.available) return;

        let executor: User | null = null;
        try {
            // Fetch audit logs to see if this was a kick
            console.log(`[DEBUG] Fetching audit logs for guild: ${member.guild.id} (Name: ${member.guild.name})`);
            const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
            const entry = logs.entries.first();

            // Check if the log entry is recent and matches the user who left
            if (entry && Date.now() - entry.createdTimestamp < 5000) {
                if (entry.target?.id === member.id) {
                    executor = entry.executor as User | null;
                }
            }
        } catch (e: any) {
            if (e.code === 10004) {
                console.warn(`[WARN] Unknown Guild (${member.guild.id}) during audit log fetch. The bot might have been kicked.`);
                return;
            }
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${member.guild.name}' to detect if the member was kicked.`);
                return;
            }
            console.error('Failed to fetch audit logs for kick:', e);
        }

        // If no executor found, it might just be a user leaving normally
        if (!executor) return;

        // Fetch member associated with executor (to check roles)
        let executorMember: GuildMember | null = null;
        try {
            executorMember = await member.guild.members.fetch(executor.id);
        } catch (e) { }

        // Check isWhitelisted
        if (isWhitelisted(client, member.guild, (executorMember || executor) as any)) return;

        const now = Date.now();
        const nukeMap = client.nukeMap;
        if (!nukeMap.has(executor.id)) {
            nukeMap.set(executor.id, { kickAdds: [] });
        }

        const userData = nukeMap.get(executor.id)!;
        if (!userData.kickAdds) userData.kickAdds = [];

        userData.kickAdds.push(now);

        // Filter old events
        userData.kickAdds = userData.kickAdds.filter((t: number) => now - t < (antiNuke.timeWindow || 10000));
        nukeMap.set(executor.id, userData);

        if (userData.kickAdds.length > antiNuke.kickLimit) {
            // Action!
            const adminMember = member.guild.members.cache.get(executor.id);
            if (adminMember && adminMember.moderatable) {
                try {
                    await adminMember.roles.set([], 'Anti-Nuke: Kick limit exceeded');
                    const logChannelId = client.config.guildLogs?.[member.guild.id]?.securityChannelId;
                    const logChannel = logChannelId ? member.guild.channels.cache.get(logChannelId) as TextChannel : null;

                    if (logChannel) {
                        await logChannel.send(`🚨 **Anti-Nuke** : ${executor} a expulsé trop de membres. Ses rôles ont été retirés.`);
                    }
                    console.log(`Anti-Nuke: Action taken against ${executor.tag} for mass kicking`);
                } catch (e) {
                    console.error('Failed to punish mass kicker:', e);
                }
            }
        }
    },
};
