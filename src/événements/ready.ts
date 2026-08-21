import { ActivityType, Client, Events } from 'discord.js';
import { startGarbageCollector } from '../utils/garbageCollector.ts';
import roleBackupManager from '../utils/roleBackupManager.ts';
import { exec } from 'child_process';


export default {
    name: Events.ClientReady,
    once: true,
    async execute(client: Client) {
        if (!client.user) return;



        // 🧹 Daily Cleanup Scheduler (Run on start + every 24h)
        const runCleanup = () => {
            console.log('[Scheduler] Running daily cleanup script...');
            exec('bash daily_cleanup.sh', (error: any, stdout: any, stderr: any) => {
                if (error) {
                    console.error(`[Scheduler] Cleanup error: ${error.message}`);
                    return;
                }
                if (stdout) console.log(`[Scheduler] Cleanup output: ${stdout.trim()}`);
                if (stderr) console.error(`[Scheduler] Cleanup stderr: ${stderr.trim()}`);
            });
        };

        setInterval(runCleanup, 86_400_000); // 24 hours in ms

        // 0. Affichage des logs de démarrage instantanés
        console.log(`
  🛡️  DSC Protect - Anti-Raid & Security
  🚀 Lancement en cours...
`);
        console.log(`✅ ${client.events.size || 20} événements et ${client.commands.size} commandes chargés.`);
        console.log(`Ready! Logged in as ${client.user.tag}`);

        // 🛡️ Tâches de maintenance en arrière-plan (Après 3s)
        setTimeout(async () => {
            // 1. Démarrage du Garbage Collector
            startGarbageCollector(client);

            // 2. Vérification des verrous actifs (Anti-Voice-Raid)
            console.log('[Startup] Checking for active locks...');
            for (const [guildId, guild] of client.guilds.cache) {
                const security = client.getGuildConfig(guildId);
                if (security.activeLocks && security.activeLocks.length > 0) {
                    const now = Date.now();
                    for (const lock of [...security.activeLocks]) {
                        const channel = guild.channels.cache.get(lock.channelId) as any;
                        if (!channel) continue;
                        if (now >= lock.endTime) {
                            try { await channel.permissionOverwrites.edit(guild.roles.everyone, { Connect: null }); } catch { }
                            security.activeLocks = security.activeLocks.filter(l => l.channelId !== lock.channelId);
                        }
                    }
                    await client.saveGuildConfigs();
                }
            }

            // 3. Sauvegarde des rôles
            console.log('[Startup] Starting background role backup...');
            for (const guild of client.guilds.cache.values()) {
                await roleBackupManager.backupAllRoles(guild).catch(() => { });
            }
            console.log('[Startup] Background maintenance complete!');
        }, 3000);



        const activities = [
            { name: '⚙️ Chargement [░░░]', type: ActivityType.Streaming, url: 'https://www.twitch.tv/discord', duration: 2000 },
            { name: '⚙️ Chargement [██░]', type: ActivityType.Streaming, url: 'https://www.twitch.tv/discord', duration: 2000 },
            { name: '⚙️ Chargement [███]', type: ActivityType.Streaming, url: 'https://www.twitch.tv/discord', duration: 2000 },
            { name: `🛡️ Protège ${client.guilds.cache.size} serveurs`, type: ActivityType.Streaming, url: 'https://www.twitch.tv/discord', duration: 10000 },
            { name: '💻 /help pour les commandes', type: ActivityType.Streaming, url: 'https://www.twitch.tv/discord', duration: 10000 },
            { name: '🎆 Bonne Année 2026 !', type: ActivityType.Streaming, url: 'https://www.twitch.tv/discord', duration: 10000 }
        ];

        let i = 0;
        const updateStatus = () => {
            // Update server count dynamically if it's the "Protège" status
            if (activities[i].name.startsWith('🛡️ Protège')) {
                activities[i].name = `🛡️ Protège ${client.guilds.cache.size} serveurs`;
            }

            if (client.user) {
                client.user.setActivity(activities[i].name, { type: activities[i].type as any, url: activities[i].url });
            }

            const duration = activities[i].duration;
            i = ++i % activities.length;

            setTimeout(updateStatus, duration);
        };

        updateStatus();


    },
};
