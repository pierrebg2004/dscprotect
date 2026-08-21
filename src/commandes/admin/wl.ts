import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Client, Role, GuildMember, MessageFlags } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // ESM shim for __dirname

export default {
    data: new SlashCommandBuilder()
        .setName('wl')
        .setDescription('Gérer la whitelist (Owner uniquement).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Ajouter un utilisateur ou un rôle à la whitelist')
                .addStringOption(option =>
                    option.setName('user_id')
                        .setDescription('L\'utilisateur, le rôle ou l\'ID à ajouter')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Retirer un utilisateur de la whitelist')
                .addStringOption(option =>
                    option.setName('user_id')
                        .setDescription('L\'ID de l\'utilisateur ou du rôle')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Afficher la whitelist'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Vider la whitelist')),

    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        // Check if command is used in a guild
        if (!interaction.guild) {
            return interaction.reply({ content: '⚠️ Cette commande doit être utilisée dans un serveur, pas en message privé.', flags: MessageFlags.Ephemeral });
        }

        // Check permissions (Owner only)
        if (interaction.guild.ownerId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Seul le propriétaire du serveur peut utiliser cette commande.', flags: MessageFlags.Ephemeral });
        }

        let subCommand: string | null = null;
        let targetId: string | null = null;

        if (interaction.isChatInputCommand()) {
            subCommand = interaction.options.getSubcommand();
            targetId = interaction.options.getString('user_id');
        } else {
            // Fallback for prefix command emulator if any
            const args = (interaction as any).args || [];
            subCommand = args[0];
            targetId = args[1];
        }

        if (targetId) {
            // Clean ID (remove mention characters <@!&>)
            targetId = targetId.replace(/[^0-9]/g, '');
        }

        if (!subCommand) {
            return interaction.reply('Usage: `!wl add <ID>`, `!wl remove <ID>`, `!wl list`, `!wl clear`');
        }

        const whitelistPath = path.join(__dirname, '../../../whitelist.json');

        // Reload whitelist from file to ensure we have the latest data
        let fullWhitelist: Record<string, string[]> = {};
        try {
            const fileContent = fs.readFileSync(whitelistPath, 'utf8');
            fullWhitelist = JSON.parse(fileContent);
        } catch (err) {
            console.error("Error reading whitelist file:", err);
            fullWhitelist = {};
        }

        const guildId = interaction.guild.id;
        if (!fullWhitelist[guildId]) {
            fullWhitelist[guildId] = [];
        }
        const guildWhitelist = fullWhitelist[guildId];

        switch (subCommand.toLowerCase()) {
            case 'add':
                if (!targetId) return interaction.reply('Veuillez spécifier un ID ou une mention (Utilisateur ou Rôle).');
                if (!/^\d{17,19}$/.test(targetId)) return interaction.reply('ID invalide. Veuillez entrer un ID valide (17-19 chiffres) ou mentionner un utilisateur/rôle.');
                if (guildWhitelist.includes(targetId)) return interaction.reply('Cet ID est déjà dans la whitelist de ce serveur.');

                guildWhitelist.push(targetId);
                saveWhitelist(whitelistPath, fullWhitelist);
                // Update client config cache
                if (!client.config.whitelist || Array.isArray(client.config.whitelist)) client.config.whitelist = {};
                (client.config.whitelist as Record<string, string[]>)[guildId] = guildWhitelist;

                // Try to resolve what it is for better feedback
                let typeName = "ID";
                try {
                    const role = interaction.guild.roles.cache.get(targetId);
                    const user = await interaction.guild.members.fetch(targetId).catch(() => null);

                    if (role) typeName = `Le rôle **${role.name}**`;
                    else if (user) typeName = `L'utilisateur **${user.user.tag}**`;
                } catch (e) {
                    // Ignore resolution errors
                }

                return interaction.reply(`✅ ${typeName} (${targetId}) a été ajouté à la whitelist de ce serveur.`);

            case 'remove':
                if (!targetId) return interaction.reply('Veuillez spécifier un ID.');
                const index = guildWhitelist.indexOf(targetId);
                if (index === -1) return interaction.reply('Cet ID n\'est pas dans la whitelist de ce serveur.');

                guildWhitelist.splice(index, 1);
                saveWhitelist(whitelistPath, fullWhitelist);
                // Update client config cache
                if (!client.config.whitelist || Array.isArray(client.config.whitelist)) client.config.whitelist = {};
                (client.config.whitelist as Record<string, string[]>)[guildId] = guildWhitelist;

                return interaction.reply(`✅ L'ID ${targetId} a été retiré de la whitelist de ce serveur.`);

            case 'list':
                if (guildWhitelist.length === 0) return interaction.reply('La whitelist de ce serveur est vide.');
                const validWhitelist = guildWhitelist.filter(id => /^\d{17,19}$/.test(id));

                if (validWhitelist.length === 0) {
                    return interaction.reply('La whitelist de ce serveur est vide (ou ne contient que des IDs invalides).');
                }

                const listContent = validWhitelist.map(id => {
                    const role = interaction.guild!.roles.cache.get(id);
                    const member = interaction.guild!.members.cache.get(id);
                    if (role) return `- 🛡️ Rôle: **${role.name}** (${id})`;
                    if (member) return `- 👤 Utilisateur: <@${id}> (${id})`;
                    return `- ❓ ID: ${id}`;
                }).join('\n');

                return interaction.reply(`📋 **Whitelist (Serveur) :**\n${listContent}`);

            case 'clear':
                if (guildWhitelist.length === 0) return interaction.reply('La whitelist de ce serveur est déjà vide.');
                fullWhitelist[guildId] = [];
                saveWhitelist(whitelistPath, fullWhitelist);
                // Update client config cache
                if (!client.config.whitelist || Array.isArray(client.config.whitelist)) client.config.whitelist = {};
                (client.config.whitelist as Record<string, string[]>)[guildId] = [];

                return interaction.reply('🗑️ La whitelist de ce serveur a été entièrement vidée.');

            default:
                return interaction.reply('Sous-commande invalide. Utilisez `add`, `remove`, `list` ou `clear`.');
        }
    }
};

function saveWhitelist(filePath: string, data: any) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la whitelist:', error);
    }
}
