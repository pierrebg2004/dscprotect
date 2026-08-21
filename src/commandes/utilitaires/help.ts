import { SlashCommandBuilder, EmbedBuilder, CommandInteraction, Client, MessageFlags } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche la liste des commandes disponibles.'),
    async execute(interaction: CommandInteraction, client: Client) {
        try {
            const commands = client.commands;
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('DSC Protect - Aide')
                .setDescription('Voici la liste de toutes les commandes disponibles :\n\n**📌 Note :** Toutes les protections sont activées par default.\n\n**⚠️ IMPORTANT - SÉCURITÉ :**\n• **Zero Trust :** Seuls les utilisateurs whitelistés peuvent gérer le serveur.\n• **Permissions Dangereuses :** Seul le **Propriétaire (Owner)** du serveur peut accorder des permissions critiques (Admin, Ban, etc.). Même les administrateurs ne peuvent pas le faire.\n\nPensez à ajouter vos admins de confiance avec `/wl add @utilisateur` !')
                .setFooter({ text: 'Protégez votre communauté avec efficacité.' });

            const fields: { name: string, value: string }[] = [];
            commands.forEach((command: any) => {
                if (!command || !command.data) return;

                let description = command.data.description || 'Aucune description disponible.';
                const name = command.data.name || 'Inconnu';
                let prefix = '/';

                if (name === 'urgent') {
                    prefix = '/';
                    description = 'Verrouille ou déverrouille le serveur en cas d\'urgence.\n\n**Commandes principales :**\n`/urgent` : Verrouiller le serveur (bloque envoi messages/connexion vocale).\n`/urgent fin` : Déverrouiller le serveur.\n\n**Gestion des exceptions (réservée aux owners) :**\n`/urgent add <ID>` : Ajouter un salon/catégorie aux exceptions.\n`/urgent remove <ID>` : Retirer un salon/catégorie des exceptions.\n`/urgent list` : Afficher la liste des exceptions.';
                }

                fields.push({
                    name: `\`${prefix}${name}\``,
                    value: description
                });
            });

            // Sort fields alphabetically by command name
            fields.sort((a, b) => a.name.localeCompare(b.name));

            embed.addFields(fields);

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in help command:', error);
            await interaction.reply({ content: '❌ Une erreur est survenue lors de l\'affichage de l\'aide.', flags: MessageFlags.Ephemeral });
        }
    },
};
