import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, SlashCommandBuilder, ChannelType, PermissionsBitField, ChatInputCommandInteraction, ButtonInteraction, Client, Guild, TextChannel, StringSelectMenuInteraction, ChannelSelectMenuBuilder, ChannelSelectMenuInteraction, MessageFlags } from 'discord.js';
import fs from 'fs';
import path from 'path';

export default {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configurez les modules de sécurité (Admin uniquement).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    /** Send the configuration panel (works for both slash and prefix commands) */
    async execute(interaction: ChatInputCommandInteraction | any, client: Client) {
        // Check if command is used in a guild
        if (!interaction.guild) {
            return interaction.reply({ content: '⚠️ Cette commande doit être utilisée dans un serveur, pas en message privé.', flags: MessageFlags.Ephemeral });
        }

        // Permission check: Only Guild Owner
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ Seul le **propriétaire du serveur** peut utiliser cette commande.', flags: MessageFlags.Ephemeral });
        }
        // Initialize/Update defaults and migrate legacy values
        this.ensureDefaults(client, interaction.guild.id);
        await client.saveGuildConfigs();

        // Send the main menu
        await this.sendMainMenu(interaction, client);
    },

    /** Handle button interactions */
    async handleButton(interaction: ButtonInteraction, client: Client) {
        // Permission check: Only Guild Owner
        if (interaction.user.id !== interaction.guild!.ownerId) {
            return interaction.reply({ content: '❌ Seul le **propriétaire du serveur** peut modifier la configuration.', flags: MessageFlags.Ephemeral });
        }

        const customId = interaction.customId;

        // Main menu navigation
        if (customId === 'config_main_menu') {
            return interaction.update(this.getMainMenuPayload(client, interaction));
        }

        // Category navigation
        if (customId.startsWith('config_category_')) {
            const category = customId.replace('config_category_', '');
            return interaction.update(this.getCategoryPayload(client, category, interaction));
        }

        // Toggle actions
        if (customId.startsWith('config_toggle_')) {
            return this.handleToggle(interaction, client);
        }

        // Action: Create Log Channel (Legacy fallback or manual creation if needed)
        if (customId === 'config_action_create_log_channel') {
            return this.handleCreateLogChannel(interaction, client);
        }

        return interaction.reply({ content: '⚠️ Action inconnue.', flags: MessageFlags.Ephemeral });
    },

    /** Handle Select Menu Interactions */
    async handleSelectMenu(interaction: ChannelSelectMenuInteraction, client: Client) {
        // Permission check: Only Guild Owner
        if (interaction.user.id !== interaction.guild!.ownerId) {
            return interaction.reply({ content: '❌ Seul le **propriétaire du serveur** peut modifier la configuration.', flags: MessageFlags.Ephemeral });
        }

        const customId = interaction.customId;

        if (customId === 'config_select_log_channel') {
            const selectedChannelId = interaction.values[0];
            const guildId = interaction.guild!.id;
            const security = client.getGuildConfig(guildId);

            if (!security.logs) security.logs = { enabled: false, securityChannelId: null };
            security.logs.securityChannelId = selectedChannelId;

            await client.saveGuildConfigs();

            // Refresh the view
            // @ts-ignore
            await interaction.update(this.getCategoryPayload(client, 'logs', interaction));
            await interaction.followUp({ content: `✅ Salon de logs défini sur <#${selectedChannelId}>.` });
        }
    },

    /** Handle toggle actions */
    async handleToggle(interaction: ButtonInteraction, client: Client) {
        const action = interaction.customId.replace('config_toggle_', '');
        const guildId = interaction.guild!.id;
        const security = client.getGuildConfig(guildId);
        let updated = false;
        let message = '';
        let currentCategory: string | null = null;

        // Helper to ensure a config object exists
        const ensure = (key: string, defaults: any) => {
            if (!security[key]) security[key] = defaults;
        };

        // Toggle logic for each feature
        switch (action) {
            // Anti-raid category
            case 'raid':
                ensure('antiRaid', { enabled: true, joinLimit: 1, timeWindow: 10000, action: 'kick', accountAgeLimit: 3 });
                security.antiRaid.enabled = !security.antiRaid.enabled;
                message = `Anti‑Raid ${security.antiRaid.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antiraid';
                updated = true;
                break;
            case 'voice_raid':
                ensure('antiVoiceRaid', { enabled: true, joinLimit: 2, timeWindow: 5000, action: 'disconnect' });
                security.antiVoiceRaid.enabled = !security.antiVoiceRaid.enabled;
                message = `Anti‑Raid‑Vocal ${security.antiVoiceRaid.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antiraid';
                updated = true;
                break;
            case 'nuke':
                ensure('antiNuke', { enabled: true, channelDeleteLimit: 2, roleDeleteLimit: 2, banLimit: 2, kickLimit: 2, timeWindow: 10000, action: 'removeRoles' });
                security.antiNuke.enabled = !security.antiNuke.enabled;
                message = `Anti‑Nuke ${security.antiNuke.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antiraid';
                updated = true;
                break;
            case 'mass_reactions':
                ensure('antiMassReactions', { enabled: true, reactionLimit: 5, timeWindow: 5000, action: 'timeout', timeoutDuration: 300000 });
                security.antiMassReactions.enabled = !security.antiMassReactions.enabled;
                message = `Anti‑Mass‑Reactions ${security.antiMassReactions.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antiraid';
                updated = true;
                break;
            case 'mass_roles':
                ensure('antiMassRoles', { enabled: true, roleLimit: 1, timeWindow: 10000, action: 'removeRoles' });
                security.antiMassRoles.enabled = !security.antiMassRoles.enabled;
                message = `Anti‑Mass‑Roles ${security.antiMassRoles.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antiraid';
                updated = true;
                break;
            case 'mass_channels':
                ensure('antiMassChannels', { enabled: true, channelLimit: 1, timeWindow: 10000, action: 'removeRoles' });
                security.antiMassChannels.enabled = !security.antiMassChannels.enabled;
                message = `Anti‑Mass‑Channels ${security.antiMassChannels.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antiraid';
                updated = true;
                break;

            // Anti-spam category
            case 'spam':
                ensure('antiSpam', { enabled: true, messageLimit: 3, timeWindow: 5000, action: 'timeout', timeoutDuration: 300000 });
                security.antiSpam.enabled = !security.antiSpam.enabled;
                message = `Anti‑Spam ${security.antiSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;
            case 'emoji_spam':
                ensure('antiEmojiSpam', { enabled: true, emojiLimit: 5, action: 'delete' });
                security.antiEmojiSpam.enabled = !security.antiEmojiSpam.enabled;
                message = `Anti‑Emoji‑Spam ${security.antiEmojiSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;
            case 'sticker_spam':
                ensure('antiStickerSpam', { enabled: true, stickerLimit: 3, action: 'delete' });
                security.antiStickerSpam.enabled = !security.antiStickerSpam.enabled;
                message = `Anti‑Sticker‑Spam ${security.antiStickerSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;
            case 'invite_spam':
                ensure('antiInviteSpam', { enabled: true, action: 'delete' });
                security.antiInviteSpam.enabled = !security.antiInviteSpam.enabled;
                message = `Anti‑Invite‑Spam ${security.antiInviteSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;
            case 'link_spam':
                ensure('antiLinkSpam', { enabled: true, linkLimit: 3, action: 'delete' });
                security.antiLinkSpam.enabled = !security.antiLinkSpam.enabled;
                message = `Anti‑Link‑Spam ${security.antiLinkSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;
            case 'caps_spam':
                ensure('antiCapsSpam', { enabled: true, capsPercentage: 70, minLength: 10, action: 'delete' });
                security.antiCapsSpam.enabled = !security.antiCapsSpam.enabled;
                message = `Anti‑Caps‑Spam ${security.antiCapsSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;
            case 'duplicate_spam':
                ensure('antiDuplicateSpam', { enabled: true, duplicateLimit: 2, timeWindow: 10000, action: 'timeout', timeoutDuration: 300000 });
                security.antiDuplicateSpam.enabled = !security.antiDuplicateSpam.enabled;
                message = `Anti‑Duplicate‑Spam ${security.antiDuplicateSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;
            case 'attachment_spam':
                ensure('antiAttachmentSpam', { enabled: true, attachmentLimit: 5, action: 'delete' });
                security.antiAttachmentSpam.enabled = !security.antiAttachmentSpam.enabled;
                message = `Anti‑Attachment‑Spam ${security.antiAttachmentSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;
            case 'mention_spam':
                ensure('antiMentionSpam', { enabled: true, mentionLimit: 3, action: 'delete' });
                security.antiMentionSpam.enabled = !security.antiMentionSpam.enabled;
                message = `Anti‑Mentions ${security.antiMentionSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;
            case 'newline_spam':
                ensure('antiNewlineSpam', { enabled: true, newlineLimit: 2, action: 'delete' });
                security.antiNewlineSpam.enabled = !security.antiNewlineSpam.enabled;
                message = `Anti‑Newline‑Spam ${security.antiNewlineSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;
            case 'spoiler_spam':
                ensure('antiSpoilerSpam', { enabled: true, spoilerLimit: 5, action: 'delete' });
                security.antiSpoilerSpam.enabled = !security.antiSpoilerSpam.enabled;
                message = `Anti‑Spoiler‑Spam ${security.antiSpoilerSpam.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'antispam';
                updated = true;
                break;

            // Moderation category
            case 'identity':
                ensure('identityProtection', { enabled: true });
                security.identityProtection.enabled = !security.identityProtection.enabled;
                message = `Protection d\'Identité ${security.identityProtection.enabled ? 'activée' : 'désactivée'}.`;
                currentCategory = 'moderation';
                updated = true;
                break;
            case 'hack':
                ensure('antiHack', { enabled: true, action: 'revert' });
                security.antiHack.enabled = !security.antiHack.enabled;
                message = `Anti‑Hack ${security.antiHack.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'moderation';
                updated = true;
                break;
            case 'webhook':
                ensure('antiWebhook', { enabled: true, action: 'delete' });
                security.antiWebhook.enabled = !security.antiWebhook.enabled;
                message = `Anti‑Webhook ${security.antiWebhook.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'moderation';
                updated = true;
                break;
            case 'anti_bot':
                return interaction.reply({ content: "🛡️ L'Anti-Bot est désormais permanent pour garantir que seul le propriétaire puisse ajouter des bots.", flags: MessageFlags.Ephemeral });
            case 'thread':
                ensure('antiThread', { enabled: true, threadLimit: 1, timeWindow: 5000, action: 'timeout' });
                security.antiThread.enabled = !security.antiThread.enabled;
                message = `Anti‑Mass‑Threads ${security.antiThread.enabled ? 'activé' : 'désactivé'}.`;
                currentCategory = 'moderation';
                updated = true;
                break;

            // Logs category
            case 'logs':
                if (!security.logs) security.logs = { enabled: false, securityChannelId: null };
                const guild = interaction.guild!;

                if (security.logs.securityChannelId) {
                    // Disable: Delete channel
                    const chan = guild.channels.cache.get(security.logs.securityChannelId);
                    if (chan) {
                        try {
                            await chan.delete('Logs désactivés par config');
                        } catch (e) {
                            console.error('Failed to delete log channel:', e);
                        }
                    }
                    security.logs.securityChannelId = null;
                    security.logs.enabled = false;

                    message = 'Logs désactivés et salon supprimé.';
                    currentCategory = 'logs';
                    updated = true;
                } else {
                    // Enable: Create/Find channel
                    let targetChannel = guild.channels.cache.find(c => c.name === 'logs-sécurité' && c.type === ChannelType.GuildText);

                    if (!targetChannel) {
                        try {
                            targetChannel = await guild.channels.create({
                                name: 'logs-sécurité',
                                type: ChannelType.GuildText,
                                permissionOverwrites: [
                                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                                    { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
                                ],
                                reason: 'Auto-enable logs from config'
                            });
                        } catch (e) {
                            console.error(e);
                            return interaction.reply({ content: '❌ Impossible de créer le salon de logs automatiquement.', flags: MessageFlags.Ephemeral });
                        }
                    }

                    security.logs.securityChannelId = targetChannel.id;
                    // security.logs.enabled is redundant

                    message = `Logs activés dans <#${targetChannel.id}>.`;
                    currentCategory = 'logs';
                    updated = true;
                }
                break;

            default:
                return interaction.reply({ content: '⚠️ Action inconnue.', flags: MessageFlags.Ephemeral });
        }

        if (updated) {
            // Save guild config
            await client.saveGuildConfigs();

            // Update to current category view
            // @ts-ignore
            await interaction.update(this.getCategoryPayload(client, currentCategory!, interaction));
            await interaction.followUp({ content: message });
        }
    },

    /** Handle Create Log Channel */
    async handleCreateLogChannel(interaction: ButtonInteraction, client: Client) {
        const guild = interaction.guild!;
        const guildId = guild.id;
        const security = client.getGuildConfig(guildId) || {};

        if (security.logs && security.logs.securityChannelId) {
            // Already exists check
            const chan = guild.channels.cache.get(security.logs.securityChannelId);
            if (chan) {
                return interaction.reply({ content: `✅ Le salon de logs existe déjà : ${chan}`, flags: MessageFlags.Ephemeral });
            }
        }

        try {
            const channelName = 'logs-sécurité';
            const newChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: client.user!.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
                    }
                ],
                reason: 'Création manuelle du salon de logs de sécurité'
            });

            if (!security.logs) security.logs = { enabled: false, securityChannelId: null };
            security.logs.securityChannelId = newChannel.id;
            await client.saveGuildConfigs();

            return interaction.reply({ content: `✅ Salon de logs créé avec succès : ${newChannel}`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error('Erreur création salon logs:', error);
            return interaction.reply({ content: '❌ Erreur lors de la création du salon de logs.', flags: MessageFlags.Ephemeral });
        }
    },

    async sendMainMenu(interaction: ChatInputCommandInteraction | ButtonInteraction | any, client: Client) {
        await interaction.reply(this.getMainMenuPayload(client, interaction));
    },

    getMainMenuPayload(client: Client, interaction: any) {
        const guildId = interaction.guild.id;
        const security = client.getGuildConfig(guildId);

        const embed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle('🛡️ Configuration de Sécurité')
            .setDescription('Sélectionnez une catégorie pour configurer les modules de protection.\n\n' +
                '**Catégories disponibles :**\n' +
                '• 🚀 **Anti-Raid** : Protection contre les attaques massives (Joins, Voice, Nuke)\n' +
                '• 📨 **Anti-Spam** : Protection contre le spam (Messages, Emojis, Majs, etc.)\n' +
                '• 🛡️ **Modération** : Protections diverses (Hack, Webhooks, Threads)\n' +
                '• 📝 **Logs** : Journalisation des actions de sécurité')
            .setFooter({ text: 'DSC Protect • Votre sécurité, notre priorité' });

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config_category_antiraid')
                    .setLabel('Anti-Raid')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🚀'),
                new ButtonBuilder()
                    .setCustomId('config_category_antispam')
                    .setLabel('Anti-Spam')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📨'),
                new ButtonBuilder()
                    .setCustomId('config_category_moderation')
                    .setLabel('Modération')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🛡️'),
                new ButtonBuilder()
                    .setCustomId('config_category_logs')
                    .setLabel('Logs')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📝'),
            );

        return { embeds: [embed], components: [row] };
    },

    getCategoryPayload(client: Client, category: string, interaction: ChatInputCommandInteraction | ButtonInteraction): { embeds: EmbedBuilder[], components: ActionRowBuilder<ButtonBuilder>[] } {
        const guildId = interaction.guild!.id;
        const security = client.getGuildConfig(guildId);
        const embed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTimestamp();

        const rows: ActionRowBuilder<ButtonBuilder>[] = [];

        // Helper to create toggle button
        const createToggleButton = (id: string, label: string, isEnabled: boolean): ButtonBuilder => {
            return new ButtonBuilder()
                .setCustomId(`config_toggle_${id}`)
                .setLabel(label)
                .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
                .setEmoji(isEnabled ? '✅' : '❌');
        };

        const createNavigationButton = (): ButtonBuilder => {
            return new ButtonBuilder()
                .setCustomId('config_main_menu')
                .setLabel('Retour Menu Principal')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🏠');
        };

        if (category === 'antiraid') {
            const ar = security.antiRaid || {};
            const avr = security.antiVoiceRaid || {};
            const an = security.antiNuke || {};
            const amreact = security.antiMassReactions || {};
            const amrole = security.antiMassRoles || {};
            const amchan = security.antiMassChannels || {};

            embed.setTitle('🚀 Configuration Anti-Raid')
                .setDescription('Configurez les protections contre les raids et attaques massives.\n' +
                    'ℹ️ **Comprendre les limites :** La limite indique ce qui est autorisé.\n' +
                    '*(Exemple : "Autorise 1" → 1ère fois OK, 2ème fois = Sanction)*\n\n' +
                    `**🛡️ Tolérances actuelles :**\n` +
                    `• **Anti-Raid (Arrivées)** : Autorise ${ar.joinLimit || 1} arrivées / ${(ar.timeWindow || 10000) / 1000}s\n` +
                    `• **Anti-Raid Vocal** : Autorise ${avr.joinLimit || 2} connexions / ${(avr.timeWindow || 5000) / 1000}s\n` +
                    `• **Anti-Nuke** : Autorise ${an.banLimit || 2} bannissements, ${an.kickLimit || 2} expulsions, ${an.channelDeleteLimit || 2} suppr. salons, ${an.roleDeleteLimit || 2} suppr. rôles / ${(an.timeWindow || 10000) / 1000}s\n` +
                    `• **Anti-Réactions Masse** : Autorise ${amreact.reactionLimit || 5} réactions / ${(amreact.timeWindow || 5000) / 1000}s\n` +
                    `• **Anti-Rôles Masse** : Autorise ${amrole.roleLimit || 1} créations rôles / ${(amrole.timeWindow || 10000) / 1000}s\n` +
                    `• **Anti-Salons Masse** : Autorise ${amchan.channelLimit || 1} créations salons / ${(amchan.timeWindow || 10000) / 1000}s`
                );

            const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                createToggleButton('raid', 'Anti-Raid (Arrivées)', security.antiRaid?.enabled),
                createToggleButton('voice_raid', 'Anti-Raid Vocal', security.antiVoiceRaid?.enabled),
                createToggleButton('nuke', 'Anti-Nuke', security.antiNuke?.enabled)
            );
            const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                createToggleButton('mass_reactions', 'Anti-Réactions Masse', security.antiMassReactions?.enabled),
                createToggleButton('mass_roles', 'Anti-Rôles Masse', security.antiMassRoles?.enabled),
                createToggleButton('mass_channels', 'Anti-Salons Masse', security.antiMassChannels?.enabled)
            );
            const rowNav = new ActionRowBuilder<ButtonBuilder>().addComponents(createNavigationButton());

            rows.push(row1, row2, rowNav);
        } else if (category === 'antispam') {
            const as = security.antiSpam || {};
            const ads = security.antiDuplicateSpam || {};
            const acs = security.antiCapsSpam || {};
            const ans = security.antiNewlineSpam || {};
            const als = security.antiLinkSpam || {};
            const ams = security.antiMentionSpam || {};
            const ass = security.antiSpoilerSpam || {};
            const aas = security.antiAttachmentSpam || {};
            const aes = security.antiEmojiSpam || {};
            const asts = security.antiStickerSpam || {};

            embed.setTitle('📨 Configuration Anti-Spam')
                .setDescription('Configurez les filtres anti-spam pour le chat textuel.\n' +
                    'ℹ️ **Comprendre les limites :** La limite indique ce qui est autorisé.\n' +
                    '*(Exemple : "Autorise 1" → 1ère fois OK, 2ème fois = Sanction)*\n\n' +
                    `**🛡️ Tolérances actuelles :**\n` +
                    `• **Anti-Spam** : Autorise ${as.messageLimit || 3} messages / ${(as.timeWindow || 5000) / 1000}s\n` +
                    `• **Anti-Doublons** : Autorise ${ads.duplicateLimit || 2} messages identiques / ${(ads.timeWindow || 10000) / 1000}s\n` +
                    `• **Anti-Majuscules** : Autorise ${acs.capsPercentage || 70}% MAJ (Min ${acs.minLength || 10} car.)\n` +
                    `• **Anti-Sauts de ligne** : Autorise ${ans.newlineLimit || 2} sauts de ligne\n` +
                    `• **Anti-Liens** : Autorise ${als.linkLimit || 3} liens\n` +
                    `• **Anti-Mentions** : Autorise ${ams.mentionLimit || 3} mentions\n` +
                    `• **Anti-Spoilers** : Autorise ${ass.spoilerLimit || 5} spoilers\n` +
                    `• **Anti-Fichiers** : Autorise ${aas.attachmentLimit || 5} pièces jointes\n` +
                    `• **Anti-Emojis** : Autorise ${aes.emojiLimit || 5} émojis\n` +
                    `• **Anti-Stickers** : Autorise ${asts.stickerLimit || 3} stickers`
                );

            const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                createToggleButton('spam', 'Anti-Spam (Global)', security.antiSpam?.enabled),
                createToggleButton('duplicate_spam', 'Anti-Doublons', security.antiDuplicateSpam?.enabled),
                createToggleButton('caps_spam', 'Anti-Majuscules', security.antiCapsSpam?.enabled),
                createToggleButton('newline_spam', 'Anti-Sauts de ligne', security.antiNewlineSpam?.enabled)
            );
            const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                createToggleButton('link_spam', 'Anti-Liens', security.antiLinkSpam?.enabled),
                createToggleButton('invite_spam', 'Anti-Pub (Discord)', security.antiInviteSpam?.enabled),
                createToggleButton('mention_spam', 'Anti-Mentions', security.antiMentionSpam?.enabled),
                createToggleButton('spoiler_spam', 'Anti-Spoilers', security.antiSpoilerSpam?.enabled)
            );
            const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                createToggleButton('attachment_spam', 'Anti-Fichiers', security.antiAttachmentSpam?.enabled),
                createToggleButton('emoji_spam', 'Anti-Emojis', security.antiEmojiSpam?.enabled),
                createToggleButton('sticker_spam', 'Anti-Stickers', security.antiStickerSpam?.enabled)
            );
            const rowNav = new ActionRowBuilder<ButtonBuilder>().addComponents(createNavigationButton());

            rows.push(row1, row2, row3, rowNav);
        } else if (category === 'moderation') {
            const az = security.antiZalgo || {};
            const at = security.antiThread || {};

            embed.setTitle('🛡️ Configuration Modération')
                .setDescription('Configurez les modules de protection divers et de modération.\n' +
                    'ℹ️ **Comprendre les limites :** La limite indique ce qui est autorisé.\n' +
                    '*(Exemple : "Autorise 1" → 1ère fois OK, 2ème fois = Sanction)*\n\n' +
                    `**🛡️ Infos & Tolérances :**\n` +
                    `• **Anti-Zalgo** : Seuil ${az.threshold || 0.5}\n` +
                    `• **Anti-Fils Masse** : 1 fil / 5s (Le 2ème est bloqué)\n` +
                    `• **Anti-Virus** : Bloque .exe, .bat, .sh, .vbs...\n` +
                    `• **Anti-Bot** : Seul le propriétaire peut ajouter des bots.`
                );

            const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                createToggleButton('hack', 'Anti-Piratage (Admin)', security.antiHack?.enabled),
                createToggleButton('webhook', 'Anti-Webhook', security.antiWebhook?.enabled),
                createToggleButton('antivirus', 'Anti-Virus', true).setDisabled(true),
                createToggleButton('bug', 'Anti-Crash', true).setDisabled(true),
                createToggleButton('anti_bot', 'Anti-Bot', true).setDisabled(true)
            );
            const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
                createToggleButton('token', 'Anti-Token', security.antiToken?.enabled || false),
                createToggleButton('zalgo', 'Anti-Zalgo', security.antiZalgo?.enabled || false),
                createToggleButton('identity', 'Protection Identité', security.identityProtection?.enabled),
                createToggleButton('thread', 'Anti-Fils Masse', security.antiThread?.enabled)
            );
            const rowNav = new ActionRowBuilder<ButtonBuilder>().addComponents(createNavigationButton());

            rows.push(row1, row2, rowNav);
        } else if (category === 'logs') {
            const logChannelId = security.logs?.securityChannelId;
            const logsEnabled = !!logChannelId; // Enabled if ID exists
            const logChannel = logsEnabled ? `<#${logChannelId}>` : 'Non défini';

            embed.setTitle('📝 Configuration Logs')
                .setDescription(`Configurez le salon de logs pour les alertes de sécurité.\n\n**État actuel :** ${logsEnabled ? '✅ Activé' : '❌ Désactivé'}\n**Salon :** ${logChannel}`);

            const row1 = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_toggle_logs')
                        .setLabel(logsEnabled ? 'Désactiver les logs' : 'Activer les logs')
                        .setStyle(logsEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
                        .setEmoji(logsEnabled ? '🔕' : '🔔'),
                    createNavigationButton()
                );

            rows.push(row1);
        }

        return { embeds: [embed], components: rows };
    },

    /** Ensure all security defaults exist for a guild */
    ensureDefaults(client: Client, guildId: string) {
        const security = client.getGuildConfig(guildId);

        const defaults = {
            antiSpam: { enabled: true, messageLimit: 3, timeWindow: 5000, action: 'timeout', timeoutDuration: 300000 },
            antiRaid: { enabled: true, joinLimit: 1, timeWindow: 10000, action: 'kick', accountAgeLimit: 3 },
            antiVoiceRaid: { enabled: true, joinLimit: 2, timeWindow: 5000, action: 'disconnect' },
            antiNuke: { enabled: true, channelDeleteLimit: 2, roleDeleteLimit: 2, banLimit: 2, kickLimit: 2, timeWindow: 10000, action: 'removeRoles' },
            identityProtection: { enabled: true },
            antiZalgo: { enabled: true, threshold: 0.5, action: 'delete' },
            antiToken: { enabled: true, action: 'delete' },
            antiThread: { enabled: true, threadLimit: 1, timeWindow: 5000, action: 'timeout' },
            antiEmojiSpam: { enabled: true, emojiLimit: 5, action: 'delete' },
            antiStickerSpam: { enabled: true, stickerLimit: 3, action: 'delete' },
            antiInviteSpam: { enabled: true, action: 'delete' },
            antiMassReactions: { enabled: true, reactionLimit: 5, timeWindow: 5000, action: 'timeout', timeoutDuration: 300000 },
            antiMassRoles: { enabled: true, roleLimit: 1, timeWindow: 10000, action: 'removeRoles' },
            antiMassChannels: { enabled: true, channelLimit: 1, timeWindow: 10000, action: 'removeRoles' },
            antiLinkSpam: { enabled: true, linkLimit: 3, action: 'delete' },
            antiCapsSpam: { enabled: true, capsPercentage: 70, minLength: 10, action: 'delete' },
            antiDuplicateSpam: { enabled: true, duplicateLimit: 2, timeWindow: 10000, action: 'timeout', timeoutDuration: 300000 },
            antiAttachmentSpam: { enabled: true, attachmentLimit: 5, action: 'delete' },
            antiMentionSpam: { enabled: true, mentionLimit: 3, action: 'delete' },
            antiNewlineSpam: { enabled: true, newlineLimit: 2, action: 'delete' },
            antiSpoilerSpam: { enabled: true, spoilerLimit: 5, action: 'delete' },
            antiWebhook: { enabled: true, action: 'delete' },
            antiHack: { enabled: true, action: 'revert' },
            antiBot: { enabled: true, action: 'ban' },
            antiBug: { enabled: true, action: 'delete' },
            antivirus: { enabled: true, blockedExtensions: ['.exe', '.bat', '.cmd', '.msi', '.vbs', '.js', '.jar', '.sh', '.apk', '.com', '.scr'] },
            logs: { enabled: false, securityChannelId: null, dangerousPerms: false }
        };

        for (const [key, def] of Object.entries(defaults)) {
            if (!security[key]) security[key] = def;
        }

        // MIGRATION: Fix legacy default values if they match old defaults
        // 1. Anti-Newlines: 15 -> 2
        if (security.antiNewlineSpam && security.antiNewlineSpam.newlineLimit === 15) {
            security.antiNewlineSpam.newlineLimit = 2;
        }
        // 2. Anti-Spam: 5 -> 3
        if (security.antiSpam && security.antiSpam.messageLimit === 5) {
            security.antiSpam.messageLimit = 3;
        }
        // 3. Anti-Mass-Roles: 2 -> 1
        if (security.antiMassRoles && security.antiMassRoles.roleLimit === 2) {
            security.antiMassRoles.roleLimit = 1;
        }
        // 4. Anti-Mass-Channels: 2 -> 1
        if (security.antiMassChannels && security.antiMassChannels.channelLimit === 2) {
            security.antiMassChannels.channelLimit = 1;
        }
        // 5. Anti-Voice-Raid: 5 -> 2
        if (security.antiVoiceRaid && security.antiVoiceRaid.joinLimit === 5) {
            security.antiVoiceRaid.joinLimit = 2;
        }
        // 6. Anti-Duplicate: 3/60s -> 2/10s
        if (security.antiDuplicateSpam && (security.antiDuplicateSpam.duplicateLimit === 3 || security.antiDuplicateSpam.timeWindow === 60000)) {
            security.antiDuplicateSpam.duplicateLimit = 2;
            security.antiDuplicateSpam.timeWindow = 10000;
        }
        // 7. Anti-Nuke: 3 -> 2
        if (security.antiNuke && (security.antiNuke.banLimit === 3 || security.antiNuke.kickLimit === 3)) {
            security.antiNuke.banLimit = 2;
            security.antiNuke.kickLimit = 2;
        }
        // 9. Anti-Thread: Force 1 / 5s
        if (security.antiThread && (security.antiThread.threadLimit !== 1 || security.antiThread.timeWindow !== 5000)) {
            security.antiThread.threadLimit = 1;
            security.antiThread.timeWindow = 5000;
        }
        // 8. Anti-Spam/Duplicate: 1min -> 5min
        if (security.antiSpam && security.antiSpam.timeoutDuration === 60000) {
            security.antiSpam.timeoutDuration = 300000;
        }
        if (security.antiDuplicateSpam && security.antiDuplicateSpam.timeoutDuration === 60000) {
            security.antiDuplicateSpam.timeoutDuration = 300000;
        }
    }
};
