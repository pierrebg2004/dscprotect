import { SlashCommandBuilder, EmbedBuilder, version as djsVersion, CommandInteraction, Client } from 'discord.js';
import os from 'os';
import fs from 'fs';

export default {
    data: new SlashCommandBuilder()
        .setName('bot')
        .setDescription('Affiche les informations et statistiques du bot.'),
    async execute(interaction: CommandInteraction, client: Client) {
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor(uptime / 3600) % 24;
        const minutes = Math.floor(uptime / 60) % 60;
        const seconds = Math.floor(uptime % 60);

        // Using RSS (Resident Set Size) for more accurate total memory reporting
        const memoryUsage = process.memoryUsage().rss / 1024 / 1024;
        const totalMemory = os.totalmem() / 1024 / 1024 / 1024;

        let osInfo = `${os.type()} ${os.release()}`;
        if (os.platform() === 'linux') {
            try {
                const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
                const lines = osRelease.split('\n');
                const prettyNameLine = lines.find(line => line.startsWith('PRETTY_NAME='));
                if (prettyNameLine) {
                    osInfo = prettyNameLine.split('=')[1].replace(/"/g, '');
                }
            } catch (e) {
                // Ignore error, fallback to default
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🤖 Informations du Bot')
            .addFields(
                { name: 'Latence API', value: `${client.ws.ping}ms`, inline: true },
                { name: 'Uptime', value: `${days}j ${hours}h ${minutes}m ${seconds}s`, inline: true },
                { name: 'RAM Utilisée', value: `${memoryUsage.toFixed(2)} MB`, inline: true },
                { name: 'RAM Totale Système', value: `${totalMemory.toFixed(2)} GB`, inline: true },
                { name: 'Système', value: osInfo, inline: true },
                { name: 'Kernel', value: os.release(), inline: true },
                { name: 'Version Node.js', value: process.version, inline: true },
                { name: 'Version Discord.js', value: `v${djsVersion}`, inline: true },
                { name: 'Nombre de serveurs', value: `${client.guilds.cache.size}`, inline: true },
                { name: 'Nombre d\'utilisateurs', value: `${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`, inline: true },
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
