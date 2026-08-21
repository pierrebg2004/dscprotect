export interface SecurityModule {
    enabled: boolean;
    action?: 'timeout' | 'kick' | 'ban' | 'disconnect' | 'lock' | 'delete' | 'removeRoles' | 'revert';
    timeWindow?: number;
    timeoutDuration?: number;
    [key: string]: any;
}

export interface LockedChannel {
    channelId: string;
    endTime: number;
}

export interface SecurityConfig {
    antiSpam: SecurityModule & { messageLimit: number };
    // ... (other properties are fine)
    antiRaid: SecurityModule & { joinLimit: number; accountAgeLimit: number };
    antiVoiceRaid: SecurityModule & { joinLimit: number };
    antiThread: SecurityModule & { threadLimit: number };
    antiNuke: SecurityModule & { channelDeleteLimit: number; roleDeleteLimit: number; banLimit: number; kickLimit: number };
    antiEmojiSpam: SecurityModule & { emojiLimit: number };
    antiStickerSpam: SecurityModule & { stickerLimit: number };
    antiInviteSpam: SecurityModule;
    antiMassReactions: SecurityModule & { reactionLimit: number };
    antiMassRoles: SecurityModule & { roleLimit: number };
    antiMassChannels: SecurityModule & { channelLimit: number };
    antiLinkSpam: SecurityModule & { linkLimit: number };
    antiCapsSpam: SecurityModule & { capsPercentage: number; minLength: number };
    antiDuplicateSpam: SecurityModule & { duplicateLimit: number };
    antiAttachmentSpam: SecurityModule & { attachmentLimit: number };
    antiMentionSpam: SecurityModule & { mentionLimit: number };
    antiNewlineSpam: SecurityModule & { newlineLimit: number };
    antiSpoilerSpam: SecurityModule & { spoilerLimit: number };
    antiWebhook: SecurityModule;
    antiBot: SecurityModule;
    antivirus: SecurityModule & { blockedExtensions: string[] };
    antiHack: SecurityModule;
    antiZalgo: SecurityModule & { threshold: number };
    antiToken: SecurityModule;
    antiBug: SecurityModule;
    identityProtection: { enabled: boolean };
    vanityProtection: { enabled: boolean };
    logs: { enabled: boolean; securityChannelId: string | null; dangerousPerms?: boolean };
    activeLocks?: LockedChannel[]; // Per-guild active locks
    [key: string]: any;
}

export interface Config {
    prefix: string;
    security: SecurityConfig;
    whitelist: string[] | { [guildId: string]: string[] };
    guildLogs?: { [guildId: string]: { securityChannelId: string } };
}

const config: Config = {
    // Bot Configurationj
    prefix: '!',

    // Security Settings
    security: {
        // Anti-Spam
        antiSpam: {
            enabled: true,
            messageLimit: 3, // Messages allowed
            timeWindow: 5000, // Time window in ms (5 seconds)
            action: 'timeout', // 'timeout' or 'kick' or 'ban'
            timeoutDuration: 300000, // 5 minutes
        },

        // Anti-Raid (Join Gate)
        antiRaid: {
            enabled: true,
            joinLimit: 1, // Max joins
            timeWindow: 5000, // Time window in ms (5 seconds)
            action: 'kick', // 'kick' or 'ban'
            accountAgeLimit: 3, // Minimum account age in days (Anti-Token)
        },

        // Anti-Voice-Raid (Mass Voice Join)
        antiVoiceRaid: {
            enabled: true,
            joinLimit: 2, // Max voice joins
            timeWindow: 5000, // Time window in ms (5 seconds)
            action: 'disconnect', // 'lock' (deny connect) or 'disconnect'
        },

        // Anti-Thread (Mass Thread Create)
        antiThread: {
            enabled: true,
            threadLimit: 1, // Max threads created
            timeWindow: 5000, // Time window in ms
            action: 'timeout', // 'timeout' or 'kick'
        },

        // Anti-Nuke (Mode: Admins Surveillés)
        antiNuke: {
            enabled: true,
            // Limits per user within timeWindow (If exceeded, user is sanctioned)
            channelDeleteLimit: 2, // Autorise 2 suppressions par 10s
            roleDeleteLimit: 2, // Autorise 2 suppressions par 10s
            banLimit: 2, // Autorise 2 bans par 10s (Au 3ème c'est STOP)
            kickLimit: 2, // Autorise 2 kicks par 10s
            timeWindow: 10000, // 10 seconds checking window
            action: 'removeRoles', // 'removeRoles' or 'ban'
        },

        // Anti-Emoji-Spam
        antiEmojiSpam: {
            enabled: true,
            emojiLimit: 5, // Max emojis per message
            action: 'delete',
        },

        // Anti-Sticker-Spam
        antiStickerSpam: {
            enabled: true,
            stickerLimit: 3, // Max stickers per message
            action: 'delete',
        },

        // Anti-Invite-Spam
        antiInviteSpam: {
            enabled: true,
            action: 'delete', // Delete messages with Discord invites
        },

        // Anti-Mass-Reactions
        antiMassReactions: {
            enabled: true,
            reactionLimit: 5, // Max reactions added
            timeWindow: 5000, // Time window in ms (5 seconds)
            action: 'timeout',
            timeoutDuration: 300000, // 5 minutes
        },

        // Anti-Mass-Roles (Zero Trust: whitelist only)
        antiMassRoles: {
            enabled: true,
            roleLimit: 1, // Bloque toute création si pas whitelisté
            timeWindow: 10000, // Time window in ms (10 seconds)
            action: 'removeRoles',
        },

        // Anti-Mass-Channels (Zero Trust: whitelist only)
        antiMassChannels: {
            enabled: true,
            channelLimit: 1, // Bloque toute création si pas whitelisté
            timeWindow: 10000, // Time window in ms (10 seconds)
            action: 'removeRoles',
        },

        // Anti-Link-Spam
        antiLinkSpam: {
            enabled: true,
            linkLimit: 3, // Max links per message
            action: 'delete',
        },

        // Anti-Caps-Spam
        antiCapsSpam: {
            enabled: true,
            capsPercentage: 70, // % of uppercase characters
            minLength: 10, // Minimum message length to check
            action: 'delete',
        },

        // Anti-Duplicate (Repeated Messages)
        antiDuplicateSpam: {
            enabled: true,
            duplicateLimit: 2, // Max identical messages
            timeWindow: 10000, // Time window in ms (10 seconds)
            action: 'timeout',
            timeoutDuration: 300000, // 5 minutes
        },

        // Anti-Attachment-Spam
        antiAttachmentSpam: {
            enabled: true,
            attachmentLimit: 5, // Max attachments per message
            action: 'delete',
        },

        // Anti-Mention-Spam
        antiMentionSpam: {
            enabled: true,
            mentionLimit: 3, // Max mentions (users + roles + everyone)
            action: 'delete',
        },

        // Anti-Newline-Spam
        antiNewlineSpam: {
            enabled: true,
            newlineLimit: 2, // Max newlines
            action: 'delete',
        },

        // Anti-Spoiler-Spam
        antiSpoilerSpam: {
            enabled: true,
            spoilerLimit: 5, // Max spoiler tags
            action: 'delete',
        },

        // Anti-Webhook
        antiWebhook: {
            enabled: true,
            action: 'delete',
        },

        // Anti-Bot (Only Owner can add bots)
        antiBot: {
            enabled: true,
            action: 'ban',
        },

        // Anti-Virus
        antivirus: {
            enabled: true,
            blockedExtensions: ['.exe', '.bat', '.cmd', '.sh', '.vbs', '.js', '.jar', '.msi', '.apk', '.scr', '.pif', '.com'],
            action: 'delete',
        },

        // Anti-Hack (Permissions)
        antiHack: {
            enabled: true,
            action: 'revert',
        },

        // Anti-Zalgo
        antiZalgo: {
            enabled: true,
            threshold: 0.5,
            action: 'delete'
        },

        // Anti-Token
        antiToken: {
            enabled: true,
            action: 'delete'
        },

        // Anti-Crash (Protection contre les crashs discord)
        antiBug: {
            enabled: true,
            action: 'delete'
        },

        // Server Protection
        identityProtection: {
            enabled: true, // Prevent name/icon changes
        },
        vanityProtection: {
            enabled: true, // Prevent vanity URL changes
        },
        logs: {
            enabled: false,
            securityChannelId: null,
            dangerousPerms: false
        }
    },

    // Whitelist (IDs of trusted users/bots)
    // Note: The logic in whitelistManager seems to expect a structure like { guildId: [ids] } per some event analysis
    // But keeping this default for now.
    whitelist: [
        'YOUR_USER_ID_HERE'
    ]
};

export default config;
