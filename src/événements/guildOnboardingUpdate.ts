import { Events, AuditLogEvent, Guild, Client, User, TextChannel } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export default {
    name: 'guildOnboardingUpdate', // Events.GuildOnboardingUpdate is not available in all versions, using string
    async execute(oldOnboarding: any, newOnboarding: any, client: Client) {
        const guild = newOnboarding.guild as Guild;
        const security = client.getGuildConfig(guild.id);
        const { identityProtection } = security;

        // Check if protection is enabled
        if (!identityProtection || !identityProtection.enabled) return;

        // Fetch audit logs to find who did it
        let executor: User | null = null;
        try {
            const logs = await guild.fetchAuditLogs({ limit: 1, type: (AuditLogEvent as any).GuildOnboardingUpdate });
            const entry = logs.entries.first();
            if (entry && Date.now() - entry.createdTimestamp < 5000) {
                executor = entry.executor as User | null;
            }
        } catch (e: any) {
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${guild.name}' to detect who updated the onboarding.`);
                return;
            }
            console.error('Failed to fetch audit logs for onboarding update:', e);
        }

        // If we can't find who did it, or if it's the bot itself, ignore
        if (!executor || executor.id === client.user?.id) return;

        // Check whitelist
        if (isWhitelisted(client, guild, executor as any)) return;

        const reason = 'Security Protection: Unauthorized onboarding change detected';

        // Revert changes
        try {
            // We can't easily "revert" to the exact old state object directly, 
            // but we can try to set the new onboarding to match the old one's properties.
            // Note: This is a best-effort reversion as the API might require specific formatting.

            // For now, we will just alert and try to disable it if it was enabled, or re-enable if disabled, 
            // or just warn that we can't fully revert complex onboarding structures easily without a backup.
            // However, we can try to set the basic properties back.

            /* 
               Reverting full onboarding is complex because `oldOnboarding` is a structure.
               We will try to edit the guild's onboarding with the old values.
            */

            await (guild as any).onboarding.edit({
                enabled: oldOnboarding.enabled,
                mode: oldOnboarding.mode,
                defaultChannelIds: oldOnboarding.defaultChannelIds,
                prompts: oldOnboarding.prompts, // This might need mapping
                reason: reason
            });

            // Notify
            const logChannelId = client.config.guildLogs?.[guild.id]?.securityChannelId;
            const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) as TextChannel : null;

            if (logChannel) {
                await logChannel.send(`🛡️ **Sécurité** : Les modifications du **Processus d'accueil** par ${executor} ont été annulées car il n'est pas whitelisté.`);
            }
            console.log(`Security: Reverted onboarding changes by ${executor.tag}`);

        } catch (error) {
            console.error('Failed to revert onboarding changes:', error);
            // Fallback alert if revert fails
            const fallbackLogChannelId = client.config.guildLogs?.[guild.id]?.securityChannelId;
            const fallbackLogChannel = fallbackLogChannelId ? guild.channels.cache.get(fallbackLogChannelId) as TextChannel : null;

            if (fallbackLogChannel) {
                await fallbackLogChannel.send(`⚠️ **Sécurité** : Tentative de modification du **Processus d'accueil** par ${executor} détectée (Échec de la restauration automatique).`);
            }
        }
    },
};
