import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Client, GuildMember, MessageFlags } from 'discord.js';
import isWhitelisted from '../../utils/whitelistManager.ts';

export default {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un utilisateur du serveur.')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('L\'utilisateur à bannir (Mention ou ID)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('La raison du bannissement'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        if (!interaction.guild) return;

        // Whitelist check
        if (!isWhitelisted(client, interaction.guild, interaction.member as GuildMember || interaction.user)) {
            return interaction.reply({ content: '❌ Vous n\'êtes pas dans la whitelist. Cette commande est restreinte.', flags: MessageFlags.Ephemeral });
        }

        const targetInput = (interaction.options as any).getString('target');
        const reason = (interaction.options as any).getString('reason') || 'Aucune raison fournie';

        // Nettoyage de l'ID (suppression des <, @, !, >)
        const targetId = targetInput.replace(/[<@!>]/g, '');

        if (!/^\d{17,19}$/.test(targetId)) {
            return interaction.reply({ content: '❌ ID utilisateur invalide.', flags: MessageFlags.Ephemeral });
        }


        await interaction.deferReply();

        let user;
        try {
            // On essaie de récupérer l'objet User via l'API (utile si pas dans le serveur / cache)
            user = await interaction.client.users.fetch(targetId);
        } catch (error) {
            return interaction.editReply({ content: '❌ Impossible de trouver cet utilisateur (ID invalide ou inconnu de Discord).' });
        }

        // Tentative de récupération du membre (optionnel, juste pour vérifier bannable si présent)
        let member: GuildMember | null = null;
        try {
            member = await interaction.guild.members.fetch(targetId);
        } catch (e) {
            // Membre pas sur le serveur, c'est pas grave, on forceban
        }

        // Si le membre est présent, on vérifie si on peut le bannir
        if (member && !member.bannable) {
            return interaction.editReply({ content: 'Je ne peux pas bannir cet utilisateur. Vérifiez mes permissions et la hiérarchie des rôles.' });
        }

        try {
            await interaction.guild.members.ban(targetId, { reason: reason });

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription(`:white_check_mark: ${user} a été banni du serveur.`)
                .setImage('https://i.imgur.com/fDDm3xE.png');

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Une erreur est survenue lors du bannissement.' });
        }
    },
};