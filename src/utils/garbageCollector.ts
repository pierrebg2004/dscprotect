import { Client } from 'discord.js';
import { joinMap } from '../events/guildMemberAdd.ts';
import { voiceJoinMap } from '../events/voiceStateUpdate.ts';
import { SecurityManager } from '../modules/SecurityManager.ts';
import { roleCreateMap } from '../events/roleCreate.ts';
import { channelCreateMap } from '../events/channelCreate.ts';
import { threadMap } from '../events/threadCreate.ts';
import { reactionMap } from '../events/messageReactionAdd.ts';

/**
 * Starts the garbage collector for memory management.
 * Cleans up old entries from global maps to prevent memory leaks.
 * Monitors RAM and triggers manual GC if needed.
 * @param client Discord client for accessing guild-specific data like nukeMap
 * @param intervalMs Interval in milliseconds (default: 10 minutes)
 */
export function startGarbageCollector(client: Client, intervalMs: number = 10 * 60 * 1000) {
    console.log(`[GarbageCollector] Started with interval ${intervalMs}ms`);

    setInterval(() => {
        const now = Date.now();

        // RAM Monitoring
        const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const RAM_THRESHOLD_MB = 700;

        // If RAM > 700MB, we use a much shorter retention (1m instead of 10m)
        const isEmergency = rssMB > RAM_THRESHOLD_MB;
        const cleanupThreshold = isEmergency ? 60 * 1000 : 10 * 60 * 1000;

        if (isEmergency) {
            console.warn(`[GarbageCollector] ⚠️ High RAM usage detected: ${rssMB}MB. Triggering emergency cleanup...`);
        }

        // 1. Cleanup Join Map (Anti-Raid)
        for (const [key, timestamps] of joinMap.entries()) {
            const recent = timestamps.filter(t => now - t < cleanupThreshold);
            if (recent.length === 0) joinMap.delete(key);
            else if (recent.length !== timestamps.length) joinMap.set(key, recent);
        }

        // 2. Cleanup Voice Join Map (Anti-Voice-Raid)
        for (const [key, joins] of voiceJoinMap.entries()) {
            const recent = joins.filter(j => now - j.timestamp < cleanupThreshold);
            if (recent.length === 0) voiceJoinMap.delete(key);
            else if (recent.length !== joins.length) voiceJoinMap.set(key, recent);
        }

        // 3. Cleanup SecurityManager Maps (Anti-Spam)
        for (const [key, timestamps] of SecurityManager.messageMap.entries()) {
            const recent = timestamps.filter(t => now - t < cleanupThreshold);
            if (recent.length === 0) SecurityManager.messageMap.delete(key);
            else if (recent.length !== timestamps.length) SecurityManager.messageMap.set(key, recent);
        }

        for (const [key, msgs] of SecurityManager.duplicateMap.entries()) {
            const recent = msgs.filter(m => now - m.timestamp < cleanupThreshold);
            if (recent.length === 0) SecurityManager.duplicateMap.delete(key);
            else if (recent.length !== msgs.length) SecurityManager.duplicateMap.set(key, recent);
        }

        // 4. Cleanup Advanced Anti-Leak Maps (New)
        for (const [key, roles] of roleCreateMap.entries()) {
            const recent = roles.filter(r => now - r.timestamp < cleanupThreshold);
            if (recent.length === 0) roleCreateMap.delete(key);
            else if (recent.length !== roles.length) roleCreateMap.set(key, recent);
        }

        for (const [key, channels] of channelCreateMap.entries()) {
            const recent = channels.filter(c => now - c.timestamp < cleanupThreshold);
            if (recent.length === 0) channelCreateMap.delete(key);
            else if (recent.length !== channels.length) channelCreateMap.set(key, recent);
        }

        for (const [key, threads] of threadMap.entries()) {
            const recent = threads.filter(t => now - t.timestamp < cleanupThreshold);
            if (recent.length === 0) threadMap.delete(key);
            else if (recent.length !== threads.length) threadMap.set(key, recent);
        }

        for (const [key, timestamps] of reactionMap.entries()) {
            const recent = timestamps.filter(t => now - t < cleanupThreshold);
            if (recent.length === 0) reactionMap.delete(key);
            else if (recent.length !== timestamps.length) reactionMap.set(key, recent);
        }

        // 5. Cleanup client.nukeMap (Anti-Nuke)
        // @ts-ignore - nukeMap is attached dynamically
        if (client.nukeMap instanceof Map) {
            // @ts-ignore
            for (const [userId, data] of client.nukeMap.entries()) {
                let hasActiveData = false;

                // Cleanup nested lists
                const listKeys = ['roleDeletes', 'banAdds', 'kickAdds', 'channelDeletes'];
                for (const listKey of listKeys) {
                    if (data[listKey]) {
                        data[listKey] = data[listKey].filter((t: number) => now - t < cleanupThreshold);
                        if (data[listKey].length > 0) hasActiveData = true;
                    }
                }

                if (!hasActiveData) {
                    // @ts-ignore
                    client.nukeMap.delete(userId);
                }
            }
        }

        // 6. Disk Space Monitoring
        import('child_process').then(({ exec }) => {
            exec('df -m . | tail -1 | awk \'{print $4}\'', (err, stdout) => {
                if (err) return;
                const freeMB = parseInt(stdout.trim());
                const DISK_THRESHOLD_MB = 50;

                if (!isNaN(freeMB) && freeMB < DISK_THRESHOLD_MB) {
                    console.warn(`[GarbageCollector] 💾 Low disk space detected: ${freeMB}MB. Triggering daily cleanup...`);
                    exec('bash daily_cleanup.sh', (cleanupErr, cleanupStdout) => {
                        if (cleanupErr) console.error(`[GarbageCollector] Cleanup error: ${cleanupErr.message}`);
                        else console.log(`[GarbageCollector] Auto-cleanup finished: ${cleanupStdout.trim()}`);
                    });
                }
            });
        });

        // Force Node.js Garbage Collection if exposed
        // @ts-ignore
        if (typeof global.gc === 'function') {
            // @ts-ignore
            global.gc();
            if (isEmergency) {
                const postGcRss = Math.round(process.memoryUsage().rss / 1024 / 1024);
                console.log(`[GarbageCollector] Emergency GC completed. RAM: ${rssMB}MB -> ${postGcRss}MB`);
            }
        }

    }, intervalMs);
}
