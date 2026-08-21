import { Events, Message, Client, CommandInteraction } from 'discord.js';
import isWhitelisted from '../utils/whitelistManager.ts';
import { SecurityManager } from '../modules/SecurityManager.ts';

export default {
    name: Events.MessageCreate,
    async execute(message: Message, client: Client) {
        if (message.author.bot || !message.guild) return;

        // Optimization 1: Whitelist Check FIRST (Fail Fast)
        const whitelisted = isWhitelisted(client, message.guild, message.member || message.author);

        if (whitelisted) {
            const prefix = client.config.prefix;
            if (message.content.startsWith(prefix)) {
                await handlePrefixCommand(message, client);
            } else if (client.user && message.mentions.has(client.user) && !message.mentions.everyone && !message.reference) {
                await message.reply("👋 Coucou c'est **DSC Protect** ! Je protège votre serveur 24H/24, 7J/7 🛡️\nSi vous voulez mes commandes faites `/help`");
            }
            return;
        }

        // Delegate all security checks to SecurityManager
        // If it returns true, a violation was handled, so we stop.
        const handled = await SecurityManager.checkAll(message, client);
        if (handled) return;

        // --- Bot Mention Response (for non-whitelisted users too) ---
        if (client.user && message.mentions.has(client.user) && !message.mentions.everyone && !message.reference) {
            await message.reply("👋 Coucou c'est **DSC Protect** ! Je protège votre serveur 24H/24, 7J/7 🛡️\nSi vous voulez mes commandes faites `/help`");
        }

        // --- Prefix Command Logic (Only runs if no spam/violation detected) ---
        const prefix = client.config.prefix;
        if (message.content.startsWith(prefix)) {
            await handlePrefixCommand(message, client);
        }
    },
};

// Extracted command handler for cleaner code
async function handlePrefixCommand(message: Message, client: Client) {
    const prefix = client.config.prefix;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    const command = client.commands.get(commandName);

    if (!command) return;

    const mockInteraction = {
        user: message.author,
        member: message.member,
        guild: message.guild,
        channel: message.channel,
        client: client,
        args: args,
        replied: false,
        deferred: false,
        commandName: commandName,
        reply: async (options: any) => {
            if (typeof options === 'string') {
                return await message.reply(options);
            }
            return await message.reply({
                content: options.content,
                embeds: options.embeds,
                components: options.components,
            });
        },
        deferReply: async () => {
            // @ts-ignore
            await (message.channel as any).sendTyping();
            // @ts-ignore
            this.deferred = true;
        },
        editReply: async (options: any) => {
            return await message.reply(options);
        },
        followUp: async (options: any) => {
            return await message.reply(options);
        },
        isChatInputCommand: () => false,
        isRepliable: () => true,
        memberPermissions: message.member?.permissions
    };

    try {
        await command.execute(mockInteraction as unknown as CommandInteraction, client);
    } catch (error) {
        console.error(`Error executing prefix command ${commandName}:`, error);
        await message.reply('There was an error executing this command!');
    }
}
