import { Events, AuditLogEvent, PermissionFlagsBits, GuildMember, Client, User, TextChannel, Collection, Role } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export default {
    name: Events.GuildMemberUpdate,
    async execute(oldMember: GuildMember | Partial<GuildMember>, newMember: GuildMember, client: Client) {
        const security = client.getGuildConfig(newMember.guild.id);
        const { antiHack } = security;
        if (!antiHack || !antiHack.enabled) return;

        const oldRoles = oldMember.roles?.cache || new Collection<string, Role>();
        // Check if roles were added
        const addedRoles = newMember.roles.cache.filter(role => !oldRoles.has(role.id));
        if (addedRoles.size === 0) return;

        // Check if any added role has dangerous permissions
        const dangerousPerms = [
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageWebhooks
        ];

        const dangerousRole = addedRoles.find(role => {
            return dangerousPerms.some(perm => role.permissions.has(perm));
        });

        if (!dangerousRole) return;

        // Fetch audit logs
        let executor: User | null = null;
        try {
            const logs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberRoleUpdate });
            const entry = logs.entries.first();
            if (entry && entry.target?.id === newMember.id && Date.now() - entry.createdTimestamp < 5000) {
                executor = entry.executor as User | null;
            }
        } catch (e: any) {
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${newMember.guild.name}' to detect who updated the member.`);
                return;
            }
            console.error('Failed to fetch audit logs for member update:', e);
        }

        if (!executor || executor.id === client.user?.id) return;

        // Fetch executor member
        let executorMember: GuildMember | null = null;
        try {
            executorMember = await newMember.guild.members.fetch(executor.id);
        } catch (e) { }

        // Check whitelist
        if (isWhitelisted(client, newMember.guild as any, (executorMember || executor) as any)) return;

        // Remove the role
        try {
            await newMember.roles.remove(dangerousRole, 'Security: Anti-Hack (Unauthorized role assignment)');
            // Check if logging is enabled for dangerous perms
            if (security.logs && security.logs.dangerousPerms) {
                const logChannelId = security.logs.securityChannelId;
                const logChannel = logChannelId ? newMember.guild.channels.cache.get(logChannelId) as TextChannel : null;

                if (logChannel) {
                    await logChannel.send(`🛡️ **Sécurité** : Le rôle **${dangerousRole.name}** (dangereux) donné à ${newMember} par ${executor} a été retiré.`);
                }
            }
            console.log(`[Anti-Hack] Removed dangerous role ${dangerousRole.name} from ${newMember.user.tag} given by ${executor.tag}`);
        } catch (error) {
            console.error('Failed to remove dangerous role:', error);
        }
    },
};
