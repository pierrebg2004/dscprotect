import { Events, AuditLogEvent, PermissionFlagsBits, Role, Client, User, GuildMember, TextChannel } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';
import roleBackupManager from '../utils/roleBackupManager.ts';

export default {
    name: Events.GuildRoleUpdate,
    async execute(oldRole: Role, newRole: Role, client: Client) {
        // Backup the updated role immediately, BUT SKIP @everyone
        if (newRole.id !== newRole.guild.id) {
            await roleBackupManager.updateRole(newRole);
        }

        const security = client.getGuildConfig(newRole.guild.id);
        const { antiHack } = security || {}; // Safe access
        if (!antiHack || !antiHack.enabled) return;

        // Fetch audit logs early to identify executor
        let executor: User | null = null;
        try {
            const logs = await newRole.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleUpdate });
            const entry = logs.entries.first();
            if (entry && entry.target?.id === newRole.id && Date.now() - entry.createdTimestamp < 5000) {
                executor = entry.executor as User | null;
            }
        } catch (e: any) {
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${newRole.guild.name}' to detect who updated the role.`);
                // We proceed without executor (might be limited in actions but won't crash)
            } else {
                console.error('Failed to fetch audit logs for role update:', e);
            }
        }

        // If we can't identify the executor, we proceed with checks (safe default)
        // Dangerous permissions definitions
        const dangerousPerms = [
            // Admin / Server Management
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageWebhooks,
            PermissionFlagsBits.ViewAuditLog,

            // Member Moderation (Ban/Kick/Timeout)
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.ModerateMembers, // Timeouts

            // Chat Moderation
            PermissionFlagsBits.ManageMessages, // Delete messages, Pin messages
            PermissionFlagsBits.ManageThreads,
            PermissionFlagsBits.MentionEveryone,
            PermissionFlagsBits.ManageNicknames,
            PermissionFlagsBits.ManageEmojisAndStickers,

            // Voice Moderation
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers,
            PermissionFlagsBits.MoveMembers
        ];

        // ⚠️ SPECIAL PROTECTION: @everyone role NEVER gets ANY dangerous permission
        const isEveryoneRole = newRole.id === newRole.guild.id;

        if (isEveryoneRole) {
            const dangerousAdded = dangerousPerms.some(perm => !oldRole.permissions.has(perm) && newRole.permissions.has(perm));

            if (dangerousAdded) { // Action only if something was just added
                try {
                    // Remove ALL dangerous permissions
                    const newPerms = newRole.permissions.remove(dangerousPerms);
                    await newRole.setPermissions(newPerms, 'Sécurité: Les permissions dangereuses sont INTERDITES sur @everyone');

                    // Log this critical action
                    const logChannelId = security.logs?.securityChannelId;
                    const logChannel = logChannelId ? newRole.guild.channels.cache.get(logChannelId) as TextChannel : null;

                    if (logChannel) {
                        const actor = executor ? executor : 'Inconnu';
                        await logChannel.send(`🚨 **CRITIQUE** : Tentative d'ajout de permissions dangereuses sur @everyone par ${actor} BLOQUÉE. Le rôle @everyone ne doit avoir aucun pouvoir.`);
                    }
                    console.log(`[Anti-Hack] ⚠️ BLOCKED dangerous permissions on @everyone role in ${newRole.guild.name}`);
                } catch (error) {
                    console.error('[Anti-Hack] Failed to remove dangerous permissions from @everyone:', error);
                }
                return; // Already handled
            }
        }

        // Check Owner Bypass (Moved AFTER @everyone check)
        if (executor && executor.id === newRole.guild.ownerId) {
            // Owner bypasses everything ELSE
            return;
        }

        // Whitelist Bypass REMOVED for Anti-Hack as per user request.
        // Only Owner can modify dangerous permissions.
        // if (executor && isWhitelisted(...)) { return; }

        // Check if any dangerous perm was ADDED
        let dangerousAdded = false;
        for (const perm of dangerousPerms) {
            if (!oldRole.permissions.has(perm) && newRole.permissions.has(perm)) {
                dangerousAdded = true;
                break;
            }
        }

        if (!dangerousAdded) return;

        // If we are here, it means:
        // 1. Not Owner
        // 2. Not @everyone protection (or it didn't trigger)
        // 3. Not Whitelisted
        // 4. Dangerous perm added
        // => REVERT

        if (!executor || executor.id === client.user?.id) return;

        try {
            await newRole.setPermissions(oldRole.permissions, 'Sécurité: Seul le propriétaire ou whitelisté peut modifier les permissions dangereuses');

            const logChannelId = security.logs?.securityChannelId;
            const logChannel = logChannelId ? newRole.guild.channels.cache.get(logChannelId) as TextChannel : null;

            if (logChannel) {
                await logChannel.send(`🛡️ **Sécurité** : ${executor} a tenté d'ajouter des permissions dangereuses au rôle **${newRole.name}**. Action bloquée.`);
            }
            console.log(`[Anti-Hack] Blocked dangerous permissions on ${newRole.name} - Unauthorized (attempted by ${executor.tag})`);
        } catch (error) {
            console.error('[Anti-Hack] Failed to revert permissions:', error);
        }
    },
};
