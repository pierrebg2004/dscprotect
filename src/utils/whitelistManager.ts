import { Client, Guild, GuildMember, User, Collection } from 'discord.js';
import config from '../config.ts';
import type { Config } from '../config.ts';

// Extended client type to include config
interface CustomClient extends Client {
    config: Config;
}

/**
 * Checks if a user or member is whitelisted (Specific User ID, Role, or Guild Owner).
 */
export default function isWhitelisted(client: CustomClient | Client, guild: Guild, memberOrId: string | GuildMember | User): boolean {
    if (!guild) return false;

    let userId: string;
    let member: GuildMember | null = null;

    if (typeof memberOrId === 'string') {
        userId = memberOrId;
        member = guild.members.cache.get(userId) || null;
    } else {
        userId = memberOrId.id;
        // If it's a GuildMember, use it. If it's a User, try to find the member.
        if ('roles' in memberOrId) { // Check if it's a GuildMember
            member = memberOrId as GuildMember;
        } else {
            member = guild.members.cache.get(userId) || null;
        }
    }

    // 1. Owner Bypass (Global Override)
    if (userId === guild.ownerId) return true;

    // Load Whitelist
    const configClient = client as CustomClient;
    // Cast config.whitelist to any to handle both array and object potential structures safely or check type
    const whitelistConfig = configClient.config?.whitelist;

    let guildWhitelist: string[] = [];
    if (Array.isArray(whitelistConfig)) {
        guildWhitelist = whitelistConfig;
    } else if (whitelistConfig && typeof whitelistConfig === 'object') {
        guildWhitelist = (whitelistConfig as any)[guild.id] || [];
    }

    if (!Array.isArray(guildWhitelist) || guildWhitelist.length === 0) return false;

    // 2. User ID Whitelist
    if (guildWhitelist.includes(userId)) return true;

    // 3. Role Whitelist
    if (member) {
        // Check if the member has any role that is in the whitelist
        const hasWhitelistedRole = member.roles.cache.some(role => guildWhitelist.includes(role.id));
        if (hasWhitelistedRole) return true;
    }

    return false;
}
