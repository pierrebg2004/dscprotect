import { Events, MessageReaction, User, Client, GuildMember, TextChannel } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export const reactionMap = new Map<string, number[]>();

export default {
    name: Events.MessageReactionAdd,
    async execute(reaction: MessageReaction, user: User, client: Client) {
        // Ignore bot reactions
        if (user.bot) return;
        if (!reaction.message.guild) return;
        const security = client.getGuildConfig(reaction.message.guild.id);
        const { antiMassReactions } = security || {};
        if (!antiMassReactions || !antiMassReactions.enabled) return;
        // Fetch member
        let member: GuildMember | null = null;
        try {
            member = await reaction.message.guild.members.fetch(user.id);
        } catch (e) { }

        // Check whitelist
        if (isWhitelisted(client, reaction.message.guild, (member || user) as any)) return;

        const now = Date.now();
        const userId = user.id;

        if (!reactionMap.has(userId)) {
            reactionMap.set(userId, []);
        }

        const userReactions = reactionMap.get(userId)!;
        userReactions.push(now);

        // Filter old reactions
        const recentReactions = userReactions.filter(t => now - t < (antiMassReactions.timeWindow || 5000));
        reactionMap.set(userId, recentReactions);

        if (recentReactions.length > antiMassReactions.reactionLimit) {
            console.log(`[Anti-Mass-Reactions] 🚨 Mass reactions detected by ${user.tag}`);

            try {
                if (member && member.moderatable) {
                    await member.timeout(antiMassReactions.timeoutDuration || 60000, 'Anti-Mass-Reactions: Reaction spam');

                    const channel = reaction.message.channel as TextChannel;
                    await channel.send(`⚠️ **Anti-Mass-Reactions** : ${user} a été mis en timeout pour spam de réactions.`);
                    console.log(`[Anti-Mass-Reactions] Timed out ${user.tag}`);
                }

                // Clear map
                reactionMap.delete(userId);

            } catch (error) {
                console.error('[Anti-Mass-Reactions] Failed to handle reaction spam:', error);
            }
        }
    },
};
