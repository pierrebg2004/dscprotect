import { Events, AuditLogEvent, PermissionFlagsBits, GuildChannel, Client, User, TextChannel, PermissionsBitField } from 'discord.js';

export default {
    name: Events.ChannelUpdate,
    async execute(oldChannel: GuildChannel, newChannel: GuildChannel, client: Client) {
        if (!newChannel.guild) return;

        const security = client.getGuildConfig(newChannel.guild.id);
        const { antiHack } = security || {};
        if (!antiHack || !antiHack.enabled) return;

        // Dangerous permissions NOT allowed for @everyone on a channel
        const dangerousPerms = [
            // Management
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageWebhooks,
            PermissionFlagsBits.ManageThreads, // Threads can be spammy

            // Chat Moderation
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.MentionEveryone,

            // Voice Moderation (Crucial for Anti-Raid)
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers,
            PermissionFlagsBits.MoveMembers,
        ];

        // Ensure we are checking permission overwrites for @everyone
        const everyoneId = newChannel.guild.id;
        const oldOverwrite = oldChannel.permissionOverwrites.cache.get(everyoneId);
        const newOverwrite = newChannel.permissionOverwrites.cache.get(everyoneId);

        // If no change in @everyone overwrites, ignore
        // We compare allowing bits.
        const oldAllow = oldOverwrite ? oldOverwrite.allow : new PermissionsBitField(0n);
        const newAllow = newOverwrite ? newOverwrite.allow : new PermissionsBitField(0n);

        if (oldAllow.equals(newAllow)) return;

        // Check if any DANGEROUS permission was ADDED to allowed bits
        const addedDangerous = dangerousPerms.filter(perm => !oldAllow.has(perm) && newAllow.has(perm));

        if (addedDangerous.length === 0) return;

        // --- DANGER DETECTED ---

        // Fetch Audit Log to see WHO did it
        let executor: User | null = null;
        try {
            const logs = await newChannel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelOverwriteUpdate });
            const entry = logs.entries.first();
            // ChannelUpdate or ChannelOverwriteUpdate? Usually ChannelOverwriteUpdate for permissions.
            // But sometimes generic ChannelUpdate. Let's check ChannelOverwriteUpdate first.
            if (entry && entry.target?.id === newChannel.id && Date.now() - entry.createdTimestamp < 5000) {
                executor = entry.executor as User;
            } else {
                // Fallback to generic ChannelUpdate if Overwrite update not found
                const logsUpdate = await newChannel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelUpdate });
                const entryUpdate = logsUpdate.entries.first();
                if (entryUpdate && entryUpdate.target?.id === newChannel.id && Date.now() - entryUpdate.createdTimestamp < 5000) {
                    executor = entryUpdate.executor as User;
                }
            }
        } catch (e: any) {
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${newChannel.guild.name}' to detect who updated the channel.`);
                return;
            }
            console.error('[Anti-Hack] Failed to fetch audit logs for channel update:', e);
        }

        // Owner Bypass REMOVED as per user request ("tout le monde même protections")
        // if (executor && executor.id === newChannel.guild.ownerId) return;

        if (!executor || executor.id === client.user?.id) return; // Ignore self or unknown

        // REVERT ACTION
        try {
            console.log(`[Anti-Hack] 🛡️ Blocked dangerous permitted overwrites for @everyone in ${newChannel.name} by ${executor.tag}`);

            // Revert strict: Set back to oldAllow/oldDeny from oldChannel
            // We need to construct a PermissionOverwriteOptions object
            const options: any = {};

            if (oldOverwrite) {
                const allowed = oldOverwrite.allow.serialize();
                const denied = oldOverwrite.deny.serialize();

                for (const [perm, val] of Object.entries(allowed)) {
                    if (val) options[perm] = true;
                }
                for (const [perm, val] of Object.entries(denied)) {
                    if (val) options[perm] = false;
                }
            }
            // If oldOverwrite is undefined, options remains {}, which resets to neutral (inherit)

            await newChannel.permissionOverwrites.create(everyoneId, options, { reason: 'Sécurité: Action bloquée (Permissions dangereuses)' });

            const logChannelId = security.logs?.securityChannelId;
            const logChannel = logChannelId ? newChannel.guild.channels.cache.get(logChannelId) as TextChannel : null;

            if (logChannel) {
                await logChannel.send(`🛡️ **Sécurité** : ${executor} a tenté de donner des permissions dangereuses à @everyone sur le salon ${newChannel}. Action annulée.`);
            }

        } catch (error) {
            console.error('[Anti-Hack] Failed to revert channel permissions:', error);
        }
    },
};
