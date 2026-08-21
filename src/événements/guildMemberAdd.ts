import { Events, GuildMember, Client } from 'discord.js';

export const joinMap = new Map<string, number[]>(); // Stores timestamps of joins

export default {
    name: Events.GuildMemberAdd,
    async execute(member: GuildMember, client: Client) {
        const security = client.getGuildConfig(member.guild.id);

        // --- NEW: Anti-Bot logic ---
        if (member.user.bot) {
            const { antiBot } = security;
            if (antiBot?.enabled) {
                try {
                    // Fetch audit logs as fast as possible with specific filters
                    const logs = await member.guild.fetchAuditLogs({
                        limit: 1,
                        type: 28, // BotAdd
                    });

                    const entry = logs.entries.first();
                    if (entry && entry.target?.id === member.id) {
                        if (entry.executor && entry.executor.id !== member.guild.ownerId) {
                            // BAN IMMEDIATELY
                            await member.ban({ reason: 'Seul le propriétaire peut ajouter des bots.' });
                            console.log(`[Anti-Bot] ⚡ Fast-Banned bot ${member.user.tag} added by ${entry.executor.tag}`);

                            // Then log asynchronously to not block
                            if (security.logs?.enabled && security.logs?.securityChannelId) {
                                const logChannel = member.guild.channels.cache.get(security.logs.securityChannelId);
                                if (logChannel?.isTextBased()) {
                                    logChannel.send({
                                        content: `⚠️ **Anti-Bot** : Le bot **${member.user.tag}** a été banni instantanément. **Seul le propriétaire du serveur peut ajouter des bots.** (Ajouté par : <@${entry.executor.id}>)`
                                    }).catch(() => { });
                                }
                            }
                            return;
                        }
                    }
                } catch (error) {
                    console.error('[Anti-Bot] Speed-Check Error:', error);
                }
            }
        }

        const { antiRaid } = security;
        if (!antiRaid.enabled) return;

        const now = Date.now();
        // Removed legacy global join tracking

        const guildId = member.guild.id;

        // 1. Anti-Token (Account Age)
        const accountCreated = member.user.createdTimestamp;
        const ageInDays = (now - accountCreated) / (1000 * 60 * 60 * 24);

        if (ageInDays < antiRaid.accountAgeLimit) {
            try {
                await member.kick('Anti-Token: Account too young');
                console.log(`Kicked ${member.user.tag} (Account age: ${ageInDays.toFixed(2)} days)`);
                return; // Stop processing if kicked
            } catch (error: any) {
                if (error.code === 50013) {
                    console.warn(`[WARN] Missing Permissions: cannot kick ${member.user.tag}. Check 'Kick Members' permission.`);
                    return;
                }
                console.error(`Failed to kick ${member.user.tag}:`, error);
            }
        }

        // 2. Anti-Raid (Join Rate)
        if (!joinMap.has(guildId)) {
            joinMap.set(guildId, []);
        }

        const joins = joinMap.get(guildId)!;
        joins.push(now);

        const recentJoins = joins.filter(timestamp => now - timestamp < (antiRaid.timeWindow || 10000));
        joinMap.set(guildId, recentJoins);

        if (recentJoins.length > antiRaid.joinLimit) {
            // Mass join detected
            console.log('Mass join detected! Enabling lockdown...');
            // Here you could implement a lockdown (e.g., disable invites or change verification level)
            // For now, we'll kick the user who triggered it and maybe others
            try {
                await member.kick('Anti-Raid: Mass join detected');
            } catch (error: any) {
                if (error.code === 50013) {
                    console.warn(`[WARN] Missing Permissions: cannot kick raid member ${member.user.tag}. Check 'Kick Members' permission.`);
                    return;
                }
                console.error('Failed to kick during raid:', error);
            }
        }

        // Welcome Message
    },
};
