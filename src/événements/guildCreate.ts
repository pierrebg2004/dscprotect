import { EmbedBuilder, Guild } from 'discord.js';
import roleBackupManager from '../utils/roleBackupManager.ts';

export default {
    name: 'guildCreate',
    async execute(guild: Guild) {
        console.log(`[GuildCreate] Bot added to new guild: ${guild.name} (${guild.id})`);

        // Send welcome message to server owner first
        try {
            const owner = await guild.fetchOwner();

            const welcomeEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🛡️ Merci d\'avoir ajouté DSC Protect !')
                .setDescription(`Bonjour ! Je suis maintenant actif sur **${guild.name}**.`)
                .addFields(
                    {
                        name: '✅ Protections Actives',
                        value: '**Toutes les protections sont activées par défaut** pour assurer la sécurité maximale de votre serveur dès maintenant.',
                        inline: false
                    },
                    {
                        name: '🔐 SÉCURITÉ CRITIQUE - Permissions',
                        value: 'Pour une sécurité absolue :\n• **Le rôle @everyone** ne peut JAMAIS avoir de permissions dangereuses.\n• **Seul le Propriétaire (Owner)** du serveur peut accorder des droits d\'Admin/Ban/Kick aux autres rôles.\n• Les administrateurs (même whitelistés) **ne peuvent pas** modifier ces permissions critiques.',
                        inline: false
                    },
                    {
                        name: '⚠️ IMPORTANT - Whitelist',
                        value: '**Le bot fonctionne en mode Zero Trust** : seuls les utilisateurs whitelistés peuvent créer/supprimer des salons, rôles, ou effectuer des bans/kicks.\n\n**N\'oubliez pas d\'ajouter vos admins et staff de confiance dans la liste blanche** avec `/wl add @utilisateur` !',
                        inline: false
                    },
                    {
                        name: '🔧 Configuration',
                        value: 'Utilisez la commande `/config` pour personnaliser les paramètres de protection selon vos besoins.',
                        inline: false
                    },
                    {
                        name: '📋 Liste des Commandes',
                        value: 'Tapez `/help` pour voir toutes les commandes disponibles.\n*Note : La commande d\'urgence reste accessible via `!urgent`.*',
                        inline: false
                    },
                    {
                        name: '🔐 Protections Incluses',
                        value: '• Anti-raid\n• Anti-spam\n• Anti-mention spam\n• Protection des rôles\n• Protection des salons\n• Protection des webhooks\n• Et bien plus encore !',
                        inline: false
                    }
                )
                .setFooter({ text: 'DSC Protect - Protégez votre communauté avec efficacité.' })
                .setTimestamp();

            await owner.send({ embeds: [welcomeEmbed] });
            console.log(`[GuildCreate] Welcome message sent to ${owner.user.tag}`);
        } catch (error: any) {
            console.error(`[GuildCreate] Could not send welcome message: ${error.message}`);
            // Don't throw - we don't want to break the bot if DMs are disabled
        }

        // Backup all roles after sending welcome message
        console.log(`[GuildCreate] Starting role backup for ${guild.name}...`);
        await roleBackupManager.backupAllRoles(guild);
        console.log(`[GuildCreate] Role backup complete for ${guild.name}!`);
    },
};
