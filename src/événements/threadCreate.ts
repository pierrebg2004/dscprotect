import { Events, ThreadChannel, Client, User, GuildMember } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';

export const threadMap = new Map<string, { timestamp: number, threadId: string }[]>();

export default {
    name: Events.ThreadCreate,
    async execute(thread: ThreadChannel, newlyCreated: boolean, client: Client) {
        // Only process newly created threads
        if (!newlyCreated) return;
        if (!thread.guild) return;
        const security = client.getGuildConfig(thread.guild.id);
        const { antiThread } = security || {};
        if (!antiThread || !antiThread.enabled) return;

        // Get the creator from audit logs
        let creator: User | null = null;
        try {
            const logs = await thread.guild.fetchAuditLogs({
                limit: 1,
                type: 110 // ThreadCreate (Use integer if enum not available or problematic)
            });
            const entry = logs.entries.first();
            if (entry && Date.now() - entry.createdTimestamp < 5000) {
                creator = entry.executor as User | null;
            }
        } catch (e: any) {
            if (e.code === 50013) {
                console.warn(`[WARN] Missing Permissions: The bot needs 'View Audit Log' permission in server '${thread.guild.name}' to detect who created the thread.`);
                return;
            }
            console.error('Failed to fetch audit logs for thread creation:', e);
            return;
        }

        if (!creator) return;

        // Fetch member
        let member: GuildMember | null = null;
        try {
            member = await thread.guild.members.fetch(creator.id);
        } catch (e) { }

        // Check whitelist
        if (isWhitelisted(client, thread.guild, (member || creator) as any)) return;

        const now = Date.now();
        const userId = creator.id;

        if (!threadMap.has(userId)) {
            threadMap.set(userId, []);
        }

        const userThreads = threadMap.get(userId)!;
        userThreads.push({ timestamp: now, threadId: thread.id });

        // Filter old threads
        const recentThreads = userThreads.filter(t => now - t.timestamp < (antiThread.timeWindow || 5000));
        threadMap.set(userId, recentThreads);

        if (recentThreads.length > antiThread.threadLimit) {
            console.log(`[Anti-Thread] 🚨 Mass thread creation detected by ${creator.tag}`);

            try {
                // Delete the spam threads
                for (const threadData of recentThreads) {
                    const spamThread = thread.guild.channels.cache.get(threadData.threadId);
                    if (spamThread) {
                        await spamThread.delete('Anti-Mass-Threads: Spam detected');
                    }
                }

                // Get member and apply action
                const member = thread.guild.members.cache.get(creator.id);
                if (member && member.moderatable) {
                    if (antiThread.action === 'timeout') {
                        await member.timeout(antiThread.timeoutDuration || 60000, 'Anti-Mass-Threads: Thread spam'); // Added default to timeoutDuration
                        console.log(`[Anti-Thread] Timed out ${creator.tag} for ${(antiThread.timeoutDuration || 60000) / 1000}s`);
                    } else if (antiThread.action === 'kick') {
                        await member.kick('Anti-Mass-Threads: Thread spam');
                        console.log(`[Anti-Thread] Kicked ${creator.tag}`);
                    }
                }

                // Send notification in parent channel
                const parentChannel = thread.parent;
                if (parentChannel && parentChannel.isTextBased()) {
                    await (parentChannel as any).send(`🚨 **Anti-Mass-Threads** : ${creator} a été sanctionné pour création massive de fils.`);
                }

                // Clear map
                threadMap.delete(userId);

            } catch (error) {
                console.error('[Anti-Thread] Failed to handle thread spam:', error);
            }
        }
    },
};
