import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ChatInputCommandInteraction, Client, GuildChannel, TextChannel, VoiceChannel, bold, MessageFlags } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // ESM shim for __dirname

export default {
    data: new SlashCommandBuilder()
        .setName('urgent')
        .setDescription('🚨 URGENCE : Verrouille le serveur entier (Entrée pour valider)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('option')
                .setDescription('Laisser vide pour VERROUILLER. Sinon choisir : fin, list...')
                .setRequired(false)
                .addChoices(
                    { name: '🟢 FIN (Déverrouiller)', value: 'fin' },
                    { name: '📋 Liste (Owner)', value: 'list' },
                    { name: '➕ Ajouter (Owner)', value: 'add' },
                    { name: '➖ Retirer (Owner)', value: 'remove' }
                ))
        .addStringOption(option =>
            option.setName('target')
                .setDescription('ID du salon/catégorie pour add/remove')
                .setRequired(false)),

    async execute(interaction: ChatInputCommandInteraction | any, client: Client) {
        // Check if command is used in a guild
        if (!interaction.guild) {
            return interaction.reply({ content: '⚠️ Cette commande doit être utilisée dans un serveur, pas en message privé.', flags: MessageFlags.Ephemeral });
        }

        // --- Permission Checks ---
        // Basic Administrator check is handled by Discord for Slash Commands via setDefaultMemberPermissions
        // But for prefix commands or double check:
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.', flags: MessageFlags.Ephemeral });
        }

        const isOwner = interaction.guild.ownerId === interaction.user.id;

        // --- Determine Args ---
        let action = '';
        let targetId = '';

        if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
            // Fallback to 'action' for stale global command cache
            action = interaction.options.getString('option') || interaction.options.getString('action') || '';
            targetId = interaction.options.getString('target') || '';
        } else {
            // Support Legacy Prefix Command
            const args = (interaction as any).args || [];
            action = args[0] ? args[0].toLowerCase() : '';
            targetId = args[1] || '';

            // Remap legacy args if necessary (e.g. 'off' -> 'fin')
            if (action === 'off') action = 'fin';
            if (action === 'ignore') action = 'toggle_legacy';
        }

        // --- Data Persistence Paths ---
        const ignorePath = path.join(__dirname, '../../../urgent_ignore.json');
        const statePath = path.join(__dirname, '../../../urgent_state.json');

        // Load Ignore List
        let ignoredIds: string[] = [];
        try {
            ignoredIds = JSON.parse(fs.readFileSync(ignorePath, 'utf8'));
        } catch (e) { ignoredIds = []; }

        // Load State
        let state = { locked: false };
        try {
            state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        } catch (e) { }

        // Helper to check if channel is ignored
        const isIgnored = (channel: GuildChannel) => {
            if (ignoredIds.includes(channel.id)) return true;
            if (channel.parentId && ignoredIds.includes(channel.parentId)) return true;
            return false;
        };

        // --- Default Behavior (Empty Action -> Lock) ---
        if (action === '') {
            // LOCK (old 'on')
            if (state.locked) return interaction.reply('⚠️ Le serveur est déjà en mode urgence.');

            await interaction.reply('🚨 **URGENCE DÉCLENCHÉE** : Verrouillage du serveur en cours...');
            let lockedCount = 0;
            const channels = interaction.guild.channels.cache.filter((c: any) =>
                (c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice) && !isIgnored(c)
            );

            for (const [, c] of channels) {
                const channel = c as TextChannel | VoiceChannel;
                try {
                    const permissions: any = {};
                    if (channel.type === ChannelType.GuildText) permissions.SendMessages = false;
                    else if (channel.type === ChannelType.GuildVoice) permissions.Connect = false;

                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, permissions);
                    lockedCount++;
                } catch (e) { }
            }

            state.locked = true;
            fs.writeFileSync(statePath, JSON.stringify(state, null, 4));

            const msg = `🔒 **Serveur verrouillé.** ${lockedCount} salons ont été fermés (Exceptions respectées).`;
            if (interaction.isRepliable()) await interaction.editReply(msg);

            return;
        }

        // --- UNLOCK (fin) ---
        if (action === 'fin') {
            if (!state.locked) return interaction.reply('⚠️ Le serveur n\'est pas en mode urgence.');

            await interaction.reply('🔓 Déverrouillage du serveur en cours...');
            let unlockedCount = 0;
            const channels = interaction.guild.channels.cache.filter((c: any) =>
                (c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice) && !isIgnored(c)
            );

            for (const [, c] of channels) {
                const channel = c as TextChannel | VoiceChannel;
                try {
                    const permissions: any = {};
                    if (channel.type === ChannelType.GuildText) permissions.SendMessages = null; // Reset
                    else if (channel.type === ChannelType.GuildVoice) permissions.Connect = null; // Reset

                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, permissions);
                    unlockedCount++;
                } catch (e) { }
            }

            state.locked = false;
            fs.writeFileSync(statePath, JSON.stringify(state, null, 4));

            const msg = `✅ **Urgence terminée.** Le serveur a été déverrouillé (${unlockedCount} salons).`;
            if (interaction.isRepliable()) await interaction.editReply(msg);

            return;
        }

        // --- EXCEPTION MANAGEMENT (list, add, remove) ---
        if (['list', 'add', 'remove', 'toggle_legacy'].includes(action)) {
            // OWNER ONLY CHECK
            if (!isOwner) {
                return interaction.reply({ content: '❌ Seul le propriétaire du serveur peut gérer les exceptions.', flags: MessageFlags.Ephemeral });
            }

            if (action === 'list') {
                if (ignoredIds.length === 0) {
                    return interaction.reply('ℹ️ Aucun salon ou catégorie n\'est ignoré pour le moment.');
                }
                const list = ignoredIds.map(id => `- <#${id}> (${id})`).join('\n');
                return interaction.reply(`📋 **Liste des exceptions (${ignoredIds.length}) :**\n${list}`);
            }

            if (action === 'add') {
                if (!targetId) return interaction.reply('❌ ID manquant. Utilisez `/urgent action:add target:<ID>`');
                targetId = targetId.replace(/[^0-9]/g, '');
                if (!/^\d{17,19}$/.test(targetId)) return interaction.reply('❌ ID invalide.');

                if (ignoredIds.includes(targetId)) return interaction.reply('⚠️ Cet ID est déjà dans les exceptions.');
                ignoredIds.push(targetId);
                fs.writeFileSync(ignorePath, JSON.stringify(ignoredIds, null, 4));
                return interaction.reply(`✅ L'ID ${bold(targetId)} a été ajouté aux exceptions.`);
            }

            if (action === 'remove') {
                if (!targetId) return interaction.reply('❌ ID manquant. Utilisez `/urgent action:remove target:<ID>`');
                targetId = targetId.replace(/[^0-9]/g, '');

                if (!ignoredIds.includes(targetId)) return interaction.reply('⚠️ Cet ID n\'est pas dans les exceptions.');
                ignoredIds = ignoredIds.filter(id => id !== targetId);
                fs.writeFileSync(ignorePath, JSON.stringify(ignoredIds, null, 4));
                return interaction.reply(`✅ L'ID ${bold(targetId)} a été retiré des exceptions.`);
            }

            // Legacy toggle support 
            if (action === 'toggle_legacy') {
                if (!targetId) return interaction.reply('❌ ID manquant.');
                targetId = targetId.replace(/[^0-9]/g, '');

                if (ignoredIds.includes(targetId)) {
                    ignoredIds = ignoredIds.filter(id => id !== targetId);
                    fs.writeFileSync(ignorePath, JSON.stringify(ignoredIds, null, 4));
                    return interaction.reply(`✅ L'ID ${bold(targetId)} a été retiré des exceptions.`);
                } else {
                    ignoredIds.push(targetId);
                    fs.writeFileSync(ignorePath, JSON.stringify(ignoredIds, null, 4));
                    return interaction.reply(`✅ L'ID ${bold(targetId)} a été ajouté aux exceptions.`);
                }
            }
            return;
        }

        // Fallback or Unknown action
        return interaction.reply('❌ Action inconnue.');
    }
};
