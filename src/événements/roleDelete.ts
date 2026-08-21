import { Events, AuditLogEvent, Role, Client, User, GuildMember } from 'discord.js';
import roleBackupManager from '../utils/roleBackupManager.ts';
import isWhitelisted from '../utils/whitelistManager.ts';

export default {
    name: Events.GuildRoleDelete,
    async execute(role: Role, client: Client) {
        if (!role.guild) return;
        const security = client.getGuildConfig(role.guild.id);
        const { antiNuke } = security;
        if (!antiNuke.enabled) return;

        // We need to share state. Let's attach nukeMap to client if it doesn't exist
        if (!client.nukeMap) client.nukeMap = new Map();

        // Check if guild is available
        if (!role.guild.available) return;

        let executor: User | null = null;
        try {
            console.log(`[DEBUG] Fetching audit logs for guild: ${role.guild.id} (Name: ${role.guild.name})`);
            const logs = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete });
            const entry = logs.entries.first();
            if (entry && Date.now() - entry.createdTimestamp < 5000) {
                if (entry.target?.id === role.id) {
                    executor = entry.executor as User | null;
                }
            }
        } catch (e: any) {
            if (e.code === 10004) {
                console.warn(`[WARN] Unknown Guild (${role.guild.id}) during audit log fetch. The bot might have been kicked.`);
                return;
            }
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${role.guild.name}' to detect who deleted the role.`);
                return;
            }
            console.error(e);
        }

        if (!executor) return;

        // Fetch member
        let member: GuildMember | null = null;
        try {
            member = await role.guild.members.fetch(executor.id);
        } catch (e) { }

        // Whitelist Check
        if (isWhitelisted(client, role.guild, (member || executor) as any)) return;

        const now = Date.now();
        const nukeMap = client.nukeMap;
        if (!nukeMap.has(executor.id)) {
            nukeMap.set(executor.id, { roleDeletes: [] });
        }

        const userData = nukeMap.get(executor.id)!;
        if (!userData.roleDeletes) userData.roleDeletes = [];

        userData.roleDeletes.push(now);
        userData.roleDeletes = userData.roleDeletes.filter((t: number) => now - t < (antiNuke.timeWindow || 10000));

        if (userData.roleDeletes.length > antiNuke.roleDeleteLimit) {
            console.log(`[Anti-Nuke] Role deletion limit exceeded by ${executor.tag}`);

            // RESTORE THE ROLE FIRST
            try {
                const restoredRole = await roleBackupManager.restoreRole(role.guild, role.id);
                if (restoredRole) {
                    console.log(`[Anti-Nuke] Successfully restored role: ${restoredRole.name}`);
                } else {
                    console.warn(`[Anti-Nuke] Could not restore role ${role.name} - no backup available or restoration failed`);
                }
            } catch (error) {
                console.error('[Anti-Nuke] Error during role restoration:', error);
            }

            // THEN PUNISH THE ATTACKER
            const member = role.guild.members.cache.get(executor.id);
            if (member && member.moderatable) {
                try {
                    await member.roles.set([], 'Anti-Nuke: Role deletion limit exceeded');
                    console.log(`Anti-Nuke: Action taken against ${executor.tag}`);
                } catch (e) { console.error(e); }
            }
        } else {
            // Not an attack (yet) - Schedule cleanup of the backup
            // If it remains not an attack after the window, delete the backup
            setTimeout(() => {
                const currentData = nukeMap.get(executor.id);
                const isNuker = currentData && (currentData.roleDeletes?.length ?? 0) > antiNuke.roleDeleteLimit;

                if (!isNuker) {
                    console.log(`[RoleBackup] Cleanup: Removing backup for legitimate deletion of ${role.name}`);
                    roleBackupManager.removeRole(role.guild.id, role.id).catch(console.error);
                } else {
                    console.log(`[RoleBackup] Keeping backup for ${role.name} - Deletion was part of an attack`);
                }
            }, (antiNuke.timeWindow || 10000) + 1000); // Wait slightly longer than the window
        }
    },
};
