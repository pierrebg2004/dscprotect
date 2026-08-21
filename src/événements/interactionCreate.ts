import { Events, BaseInteraction, Client, ButtonInteraction, Collection, MessageFlags } from 'discord.js';

const cooldowns = new Map<string, number>();
const COOLDOWN_DURATION = 3000; // 3 seconds

interface CustomClient extends Client {
    commands: Collection<string, any>;
}

export default {
    name: Events.InteractionCreate,
    async execute(interaction: BaseInteraction, client: Client) {
        // Handle Chat Input Commands
        if (interaction.isChatInputCommand()) {
            const userId = interaction.user.id;
            const now = Date.now();
            const expirationTime = (cooldowns.get(userId) || 0) + COOLDOWN_DURATION;

            if (now < expirationTime) {
                return interaction.reply({
                    content: `⏱️ Doucement ! Attends un peu.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            cooldowns.set(userId, now);
            const command = (client as CustomClient).commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'Une erreur est survenue lors de l\'exécution de cette commande !', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: 'Une erreur est survenue lors de l\'exécution de cette commande !', flags: MessageFlags.Ephemeral });
                }
            }
        }
        // Handle Buttons (for /config)
        else if (interaction.isButton()) {
            // We can handle specific button logic here or delegate to the command if it has a button handler
            // For the config command, we'll handle it here or check if the command has a 'handleButton' method.
            // A simple way is to check the customId prefix.

            if (interaction.customId.startsWith('config_')) {
                const configCommand = (client as CustomClient).commands.get('config');
                if (configCommand && configCommand.handleButton) {
                    try {
                        await configCommand.handleButton(interaction as ButtonInteraction, client);
                    } catch (error) {
                        console.error(error);
                        await interaction.reply({ content: 'Erreur lors du traitement du bouton.', flags: MessageFlags.Ephemeral });
                    }
                }
            }
        }
        // Handle Select Menus (for /config logs)
        else if (interaction.isAnySelectMenu()) {
            if (interaction.customId.startsWith('config_')) {
                const configCommand = (client as CustomClient).commands.get('config');
                if (configCommand && configCommand.handleSelectMenu) {
                    try {
                        await configCommand.handleSelectMenu(interaction, client);
                    } catch (error) {
                        console.error(error);
                        // Try to reply if not already replied
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ content: 'Erreur lors du traitement du menu.', flags: MessageFlags.Ephemeral });
                        }
                    }
                }
            }
        }
    },
};
