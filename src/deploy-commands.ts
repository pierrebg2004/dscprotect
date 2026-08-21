import { REST, Routes, Client, GatewayIntentBits, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
const commandsPath = path.join(__dirname, 'commands');

// In TypeScript/build environment, we might be running from src or dist.
// If running with ts-node, we see .ts files. If running in dist, we see .js files.
// We should check for both or ensure we're looking at the right place.
// For now, let's allow both extensions but prefer .ts if in development.

if (fs.existsSync(commandsPath)) {
    const commandFolders = fs.readdirSync(commandsPath);

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
            const commandFiles = fs.readdirSync(folderPath).filter((file: string) => file.endsWith('.ts') || file.endsWith('.js'));
            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                // Use dynamic import for ESM
                // await at top-level is supported in ESM modules
                const commandModule = await import(`file://${filePath}`);
                const command = commandModule.default || commandModule;

                if ('data' in command && 'execute' in command) {
                    // Check if data is a builder or plain object
                    const commandData = command.data.toJSON ? command.data.toJSON() : command.data;
                    commands.push(commandData);
                } else {
                    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            }
        }
    }
} else {
    console.error(`[ERROR] Commands directory not found at ${commandsPath}`);
}

// Dynamically fetch Client ID
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
    if (!client.user) return;
    const CLIENT_ID = client.user.id;
    console.log(`Logged in as ${client.user.tag} (ID: ${CLIENT_ID})`);

    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Guild-specific deployment (instant) - for testing
        const TEST_GUILD_ID = '1072935678020681778';
        const guildData = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, TEST_GUILD_ID),
            { body: [] },
        ) as unknown[];
        console.log(`✅ Guild ${TEST_GUILD_ID}: ${guildData.length} commands deployed (instant).`);

        // Global registration (takes up to 1 hour to propagate)
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        ) as unknown[];

        console.log(`✅ Global: ${data.length} commands deployed (may take up to 1h to propagate).`);
    } catch (error) {
        console.error(error);
    } finally {
        client.destroy();
    }
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('Failed to login to fetch Client ID. Check your token.', err);
});
