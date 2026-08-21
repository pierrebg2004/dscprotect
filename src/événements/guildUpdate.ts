import { Events, AuditLogEvent, Guild, Client, User, GuildMember, TextChannel } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export default {
    name: Events.GuildUpdate,
    async execute(oldGuild: Guild, newGuild: Guild, client: Client) {
        const security = client.getGuildConfig(newGuild.id);
        const { identityProtection, vanityProtection } = security;

        // Check what changed
        // Check what changed (Basic + Settings)
        const nameChanged = oldGuild.name !== newGuild.name;
        const iconChanged = oldGuild.icon !== newGuild.icon;
        const bannerChanged = oldGuild.banner !== newGuild.banner;
        const vanityChanged = oldGuild.vanityURLCode !== newGuild.vanityURLCode;

        const settingsChanged =
            oldGuild.verificationLevel !== newGuild.verificationLevel ||
            oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications ||
            oldGuild.explicitContentFilter !== newGuild.explicitContentFilter ||
            oldGuild.afkChannelId !== newGuild.afkChannelId ||
            oldGuild.afkTimeout !== newGuild.afkTimeout ||
            oldGuild.systemChannelId !== newGuild.systemChannelId ||
            oldGuild.rulesChannelId !== newGuild.rulesChannelId ||
            oldGuild.publicUpdatesChannelId !== newGuild.publicUpdatesChannelId ||
            oldGuild.preferredLocale !== newGuild.preferredLocale;

        if (!nameChanged && !iconChanged && !bannerChanged && !vanityChanged && !settingsChanged) return;

        // Fetch audit logs to find who did it
        let executor: User | null = null;
        try {
            const logs = await newGuild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.GuildUpdate });
            const entry = logs.entries.first();
            if (entry && Date.now() - entry.createdTimestamp < 5000) {
                executor = entry.executor as User | null;
            }
        } catch (e: any) {
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${newGuild.name}' to detect who updated the server.`);
                return;
            }
            console.error('Failed to fetch audit logs:', e);
        }

        // If we can't find who did it, or if it's the bot itself, ignore
        if (!executor || executor.id === client.user?.id) return;

        // Fetch member
        let member: GuildMember | null = null;
        try {
            member = await newGuild.members.fetch(executor.id);
        } catch (e) { }

        // Check whitelist
        if (isWhitelisted(client, newGuild, (member || executor) as any)) return;

        const reason = 'Security Protection: Unauthorized change detected';
        let actionTaken = false;

        // Identity Protection (Name, Icon, Banner, and ALL Settings)
        if (identityProtection && identityProtection.enabled) {
            try {
                const changes: any = {};
                if (nameChanged) changes.name = oldGuild.name;
                if (iconChanged) changes.icon = oldGuild.iconURL();
                if (bannerChanged) changes.banner = oldGuild.bannerURL();

                // Check other settings
                if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.verificationLevel = oldGuild.verificationLevel;
                if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) changes.defaultMessageNotifications = oldGuild.defaultMessageNotifications;
                if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) changes.explicitContentFilter = oldGuild.explicitContentFilter;
                if (oldGuild.afkChannelId !== newGuild.afkChannelId) changes.afkChannel = oldGuild.afkChannelId;
                if (oldGuild.afkTimeout !== newGuild.afkTimeout) changes.afkTimeout = oldGuild.afkTimeout;
                if (oldGuild.systemChannelId !== newGuild.systemChannelId) changes.systemChannel = oldGuild.systemChannelId;
                if (oldGuild.rulesChannelId !== newGuild.rulesChannelId) changes.rulesChannel = oldGuild.rulesChannelId;
                if (oldGuild.publicUpdatesChannelId !== newGuild.publicUpdatesChannelId) changes.publicUpdatesChannel = oldGuild.publicUpdatesChannelId;
                if (oldGuild.preferredLocale !== newGuild.preferredLocale) changes.preferredLocale = oldGuild.preferredLocale;

                if (Object.keys(changes).length > 0) {
                    await newGuild.edit({ ...changes, reason });
                    actionTaken = true;
                }

            } catch (error) {
                console.error('Failed to revert identity/settings changes:', error);
            }
        }

        // Vanity Protection
        if (vanityProtection && vanityProtection.enabled && vanityChanged) {
            try {
                // Only try to revert if there was an old vanity code
                if (oldGuild.vanityURLCode) {
                    await newGuild.edit({ vanityCode: oldGuild.vanityURLCode, reason } as any);
                    actionTaken = true;
                }
            } catch (error) {
                console.error('Failed to revert vanity URL:', error);
            }
        }

        if (actionTaken) {
            // Notify in the system channel or first available channel
            const logChannelId = client.config.guildLogs?.[newGuild.id]?.securityChannelId;
            const logChannel = logChannelId ? newGuild.channels.cache.get(logChannelId) as TextChannel : null;

            if (logChannel) {
                await logChannel.send(`🛡️ **Sécurité** : Les modifications du serveur (Identité/Vanity) par ${executor} ont été annulées car il n'est pas whitelisté.`);
            }
            console.log(`Security: Reverted changes by ${executor.tag}`);
        }
    },
};
