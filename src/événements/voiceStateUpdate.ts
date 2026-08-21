import { PermissionFlagsBits, VoiceState, Client, GuildChannel } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export const voiceJoinMap = new Map<string, { timestamp: number, userId: string, channelId: string }[]>();

export default {
    name: 'voiceStateUpdate',
    async execute(oldState: VoiceState, newState: VoiceState, client: Client) {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        // Fast exit if no relevant changes
        if (!newState.channelId || oldState.channelId === newState.channelId) return;

        const security = client.getGuildConfig(member.guild.id);
        const { antiVoiceRaid } = security || {};
        if (!antiVoiceRaid || !antiVoiceRaid.enabled) return;

        const guildId = newState.guild.id;
        const userId = member.id;
        const channelId = newState.channelId;

        // Check whitelist using centralized manager
        if (isWhitelisted(client, newState.guild, member)) return;

        const now = Date.now();

        // Key by Guild
        if (!voiceJoinMap.has(guildId)) {
            voiceJoinMap.set(guildId, []);
        }

        const joins = voiceJoinMap.get(guildId)!;
        joins.push({ timestamp: now, userId: userId, channelId: channelId });

        // Filter old joins
        const recentJoins = joins.filter(j => now - j.timestamp < (antiVoiceRaid.timeWindow || 60000));
        voiceJoinMap.set(guildId, recentJoins);

        if (recentJoins.length > antiVoiceRaid.joinLimit) {
            console.log(`[Anti-Voice-Raid] 🚨 Mass join detected in guild ${guildId}`);

            // Action: Lock the channel(s) targeted
            const targetedChannelIds = [...new Set(recentJoins.map(j => j.channelId))];

            // Parallelize Channel Locking
            const lockDuration = 5 * 60 * 1000;
            const unlockTime = Date.now() + lockDuration;

            if (!security.activeLocks) security.activeLocks = [];

            const lockPromises = targetedChannelIds.map(async (targetChannelId) => {
                const channel = newState.guild.channels.cache.get(targetChannelId) as GuildChannel;
                if (!channel) return;

                try {
                    // Deny Connect permission for everyone
                    await channel.permissionOverwrites.edit(newState.guild.roles.everyone, { Connect: false });

                    // Record Lock
                    security.activeLocks?.push({ channelId: targetChannelId, endTime: unlockTime });

                    // Send alert
                    if (channel.isTextBased()) {
                        channel.send(`🚨 **Anti-Voice-Raid** : Ce salon a été verrouillé suite à une arrivée massive de membres.\n🔓 *Déverrouillage automatique dans 5 minutes.*`).catch(console.error);
                    }

                    // Auto-Unlock after 5 minutes
                    setTimeout(async () => {
                        try {
                            // Reset permission to default (null removes the override)
                            await channel.permissionOverwrites.edit(newState.guild.roles.everyone, { Connect: null });
                            if (channel.isTextBased()) {
                                await channel.send(`🔓 **Anti-Voice-Raid** : Le salon a été déverrouillé automatiquement.`);
                            }
                            console.log(`[Anti-Voice-Raid] Auto-unlocked channel ${channel.name}`);

                            // Remove lock from persistence
                            if (security.activeLocks) {
                                security.activeLocks = security.activeLocks.filter(l => l.channelId !== targetChannelId);
                                await client.saveGuildConfigs();
                            }

                        } catch (err) {
                            console.error(`[Anti-Voice-Raid] Failed to auto-unlock channel ${channel.name}:`, err);
                        }
                    }, lockDuration);

                } catch (error: any) {
                    if (error.code === 50013) {
                        console.warn(`[WARN] Missing Permissions: cannot lock channel ${channel.name} (Anti-Voice-Raid). Check 'Manage Channels' or 'Manage Roles' permission.`);
                    } else {
                        console.error(`[Anti-Voice-Raid] Failed to lock channel ${channel.name}:`, error);
                    }
                }
            });

            await Promise.all(lockPromises);
            await client.saveGuildConfigs(); // Save initial locks

            // Optional: Disconnect the raiders (Parallelized)
            if (antiVoiceRaid.action === 'disconnect') {
                const disconnectPromises = recentJoins.map(async (raider) => {
                    const raiderMember = newState.guild.members.cache.get(raider.userId);
                    if (raiderMember && raiderMember.voice.channel) {
                        try {
                            await raiderMember.voice.disconnect('Anti-Voice-Raid');
                        } catch (e) {
                            // Ignore disconnect errors (user might have left)
                        }
                    }
                });
                await Promise.all(disconnectPromises);
            }

            // Clear map to prevent spamming actions
            voiceJoinMap.set(guildId, []);
        }
    },
};
