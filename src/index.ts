import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import dns from 'node:dns';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.ts';
import type { Config } from './config.ts';

// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force Node.js to use Control D DNS (Social & Ads)
dns.setServers([
    '76.76.2.3',      // IPv4 Primary
    '76.76.10.3',     // IPv4 Secondary
    '2606:1a40::3',   // IPv6 Primary
    '2606:1a40:1::3'  // IPv6 Secondary
]);

// Anti-Crash & Console Logging
function logError(title: string, error: any) {
    console.error(`❌ [${title}]`, error);
}

process.on('unhandledRejection', (reason, promise) => logError('Unhandled Rejection', reason));
process.on('uncaughtException', (err, origin) => logError('Uncaught Exception', err));
process.on('warning', (warning) => logError('Process Warning', warning));


// Extend Discord Client type


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildModeration, // For audit logs
        GatewayIntentBits.GuildVoiceStates // Required for Anti-Voice-Raid detection
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    rest: {
        timeout: 15000, // Reduced from default 15s
        retries: 3
    },

    // Sweep settings to optimize cache and memory
    sweepers: {
        messages: {
            interval: 3600, // Check every hour
            lifetime: 1800  // Delete messages older than 30 minutes
        }
    }
});

client.config = config;

// Load guildConfigs
const guildConfigsPath = path.join(__dirname, 'guildConfigs.json');
if (fs.existsSync(guildConfigsPath)) {
    try {
        const guildConfigsData = fs.readFileSync(guildConfigsPath, 'utf8');
        client.guildConfigs = JSON.parse(guildConfigsData);
    } catch (err) {
        console.error('❌ Failed to load guild configs:', err);
        client.guildConfigs = {};
    }
} else {
    client.guildConfigs = {};
    fs.writeFileSync(guildConfigsPath, '{}');
    console.log('Created guildConfigs.json.');
}

// Load Whitelist
const whitelistPath = path.join(__dirname, '../whitelist.json');
if (fs.existsSync(whitelistPath)) {
    try {
        const whitelistData = fs.readFileSync(whitelistPath, 'utf8');
        client.config.whitelist = JSON.parse(whitelistData);
    } catch (err) {
        console.error('❌ Failed to load whitelist:', err);
        client.config.whitelist = {};
    }
} else {
    // Initialize if not exists, or keep default from config.ts if that's preferred.
    // Given the dynamic nature, we probably want to respect the file if it exists, or start empty map if we want to move to per-guild.
    // check if config.ts default is array.
    if (Array.isArray(client.config.whitelist)) {
        // Keep default from config.ts
    } else {
        client.config.whitelist = {};
    }
}

// Helper to get guild config with defaults
client.getGuildConfig = (guildId: string) => {
    if (!client.guildConfigs[guildId]) {
        // Initialize with defaults from global config if available, or hardcoded defaults
        client.guildConfigs[guildId] = JSON.parse(JSON.stringify(client.config.security || {}));
        // Ensure logs object exists
        if (!client.guildConfigs[guildId].logs) {
            client.guildConfigs[guildId].logs = { enabled: false, securityChannelId: null };
        }
    }
    return client.guildConfigs[guildId];
};

// Helper to save guild configs
client.saveGuildConfigs = async () => {
    try {
        await fs.promises.writeFile(guildConfigsPath, JSON.stringify(client.guildConfigs, null, 4));
    } catch (err) {
        console.error('❌ Failed to save guild configs:', err);
    }
};

// FORCE ANTIVIRUS CONFIGURATION - ALWAYS ENABLED
if (!client.config.security) {
    // @ts-ignore
    client.config.security = {};
}

if (!client.config.security.antivirus) {
    client.config.security.antivirus = {
        enabled: true,
        blockedExtensions: ['.exe', '.bat', '.cmd', '.msi', '.vbs', '.js', '.jar', '.sh', '.apk', '.com', '.scr'],
        action: 'delete'
    };
    try {
        fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(client.config, null, 4));
    } catch (e) { }
} else if (!client.config.security.antivirus.enabled) {
    client.config.security.antivirus.enabled = true;
    try {
        fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(client.config, null, 4));
    } catch (e) { }
}

client.events = new Collection();
client.commands = new Collection();

// Load Events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter((file: string) => file.endsWith('.ts') || file.endsWith('.js'));

    await Promise.all(eventFiles.map(async (file) => {
        const filePath = path.join(eventsPath, file);
        const eventModule = await import(`file://${filePath}`);
        const event = eventModule.default || eventModule;

        if (event.name) {
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
            }
        }
    }));
}

// Load Commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFolders = fs.readdirSync(commandsPath);

    await Promise.all(commandFolders.map(async (folder) => {
        const folderPath = path.join(commandsPath, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
            const commandFiles = fs.readdirSync(folderPath).filter((file: string) => file.endsWith('.ts') || file.endsWith('.js'));
            await Promise.all(commandFiles.map(async (file) => {
                const filePath = path.join(folderPath, file);
                const commandModule = await import(`file://${filePath}`);
                const command = commandModule.default || commandModule;

                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
                }
            }));
        }
    }));
}

client.login(process.env.DISCORD_TOKEN);
