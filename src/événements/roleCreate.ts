import { Events, AuditLogEvent, Role, Client, User, GuildMember, TextChannel } from 'discord.js';
import roleBackupManager from '../utils/roleBackupManager.ts';
import isWhitelisted from '../utils/whitelistManager.ts';

export const roleCreateMap = new Map<string, { timestamp: number, roleId: string }[]>();

export default {
    name: Events.GuildRoleCreate,
    async execute(role: Role, client: Client) {
        try {
            // Skip @everyone role
            if (role.id === role.guild.id) return;

            console.log(`[RoleCreate] New role created: ${role.name} (${role.id})`);

            // Save the role to backup
            await roleBackupManager.saveRole(role);

            if (!role.guild) return;
            const security = client.getGuildConfig(role.guild.id);
            const { antiMassRoles } = security || {};
            if (!antiMassRoles || !antiMassRoles.enabled) return;
            // Get executor from audit logs
            let executor: User | null = null;
            try {
                const logs = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleCreate });
                const entry = logs.entries.first();
                if (entry && Date.now() - entry.createdTimestamp < 5000) {
                    executor = entry.executor as User | null;
                }
            } catch (e: any) {
                if (e.code === 50013) {
                    console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${role.guild.name}' to detect who created the role.`);
                    return;
                }
                console.error('Failed to fetch audit logs for role creation:', e);
                return;
            }

            if (!executor || executor.id === client.user?.id) return;

            // Fetch member
            let member: GuildMember | null = null;
            try {
                member = await role.guild.members.fetch(executor.id);
            } catch (e) { }

            // Check whitelist
            if (isWhitelisted(client, role.guild, (member || executor) as any)) return;

            const now = Date.now();
            const userId = executor.id;

            if (!roleCreateMap.has(userId)) {
                roleCreateMap.set(userId, []);
            }

            const userRoles = roleCreateMap.get(userId)!;
            userRoles.push({ timestamp: now, roleId: role.id });

            // Filter old role creations
            const recentRoles = userRoles.filter(r => now - r.timestamp < (antiMassRoles.timeWindow || 5000));
            roleCreateMap.set(userId, recentRoles);

            if (recentRoles.length > antiMassRoles.roleLimit) {
                console.log(`[Anti-Mass-Roles] 🚨 Mass role creation detected by ${executor.tag}`);

                try {
                    // Delete the spam roles
                    for (const roleData of recentRoles) {
                        const spamRole = role.guild.roles.cache.get(roleData.roleId);
                        if (spamRole && spamRole.id !== role.guild.id) {
                            await spamRole.delete('Anti-Mass-Roles: Spam detected');
                        }
                    }

                    // Remove roles from executor
                    if (member && member.moderatable) {
                        await member.roles.set([], 'Anti-Mass-Roles: Role creation spam');
                        console.log(`[Anti-Mass-Roles] Removed roles from ${executor.tag}`);
                    }

                    // Send notification
                    const logChannelId = client.config.guildLogs?.[role.guild.id]?.securityChannelId;
                    const logChannel = logChannelId ? role.guild.channels.cache.get(logChannelId) as TextChannel : null;

                    if (logChannel) {
                        await logChannel.send(`🚨 **Anti-Mass-Roles** : ${executor} a été sanctionné pour création massive de rôles.`);
                    }

                    // Clear map
                    roleCreateMap.delete(userId);

                } catch (error) {
                    console.error('[Anti-Mass-Roles] Failed to handle role spam:', error);
                }
            }

        } catch (error) {
            console.error('[RoleCreate] Error handling role creation:', error);
        }
    },
};
