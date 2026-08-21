import { Message, Client, TextChannel } from 'discord.js';
import path from 'path';
import isWhitelisted from '../utils/whitelistManager.ts';
import type { SecurityConfig } from '../config.ts';

interface DuplicateMessage {
    content: string;
    timestamp: number;
}

// Regex Patterns
const tokenPatterns = [
    /[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}/,  // Classic bot/user token
    /mfa\.[A-Za-z0-9_-]{84}/  // MFA token
];
const invitePattern = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
const linkPattern = /https?:\/\/[^\s]+/gi;
const spoilerPattern = /\|\|/g;

export class SecurityManager {
    // Maps
    public static messageMap = new Map<string, number[]>();
    public static duplicateMap = new Map<string, DuplicateMessage[]>();

    /**
     * Main entry point to run all security checks.
     * Returns true if a violation was handled (so the bot should stop processing).
     */
    public static async checkAll(message: Message, client: Client): Promise<boolean> {
        if (message.author.bot || !message.guild) return false;

        // Whitelist Check
        if (isWhitelisted(client, message.guild, message.member || message.author)) {
            return false; // User is safe, continue to command handling
        }

        const security = client.getGuildConfig(message.guild.id);

        // Run checks in order of priority/speed
        // 1. Anti-Spam (Burst)
        if (await this.checkAntiSpam(message, security)) return true;

        // 2. Anti-Duplicate
        if (await this.checkAntiDuplicate(message, security)) return true;

        // 3. Anti-Attachment
        if (await this.checkAntiAttachment(message, security)) return true;

        // 4. Anti-Sticker
        if (await this.checkAntiSticker(message, security)) return true;

        // 5. Anti-Mention
        if (await this.checkAntiMention(message, security)) return true;

        // 6. Antivirus
        if (await this.checkAntivirus(message, security)) return true;

        // 7. Anti-Link
        if (await this.checkAntiLink(message, security)) return true;

        // 8. Anti-Invite
        if (await this.checkAntiInvite(message, security)) return true;

        // 9. Anti-Caps
        if (await this.checkAntiCaps(message, security)) return true;

        // 10. Anti-Crash
        if (await this.checkAntiCrash(message, client, security)) return true;

        // 11. Anti-Token
        if (await this.checkAntiToken(message, security)) return true;

        // 12. Anti-Newline
        if (await this.checkAntiNewline(message, security)) return true;

        // 13. Anti-Spoiler
        if (await this.checkAntiSpoiler(message, security)) return true;

        // 14. Anti-Zalgo
        if (await this.checkAntiZalgo(message, security)) return true;

        // 15. Anti-Emoji
        if (await this.checkAntiEmoji(message, security)) return true;

        return false; // No violations found
    }

    /**
     * Consistently applies a sanction (message deletion + member timeout).
     */
    private static async applySanction(message: Message, reason: string, timeoutDuration: number = 300000): Promise<boolean> {
        try {
            // 1. Delete the message if it still exists
            if (message.deletable) {
                await message.delete();
            }

            // 2. Apply timeout to the member if possible
            const member = message.member;
            if (member && member.moderatable) {
                await member.timeout(timeoutDuration, reason);
                await (message.channel as any).send(`⚠️ ${message.author} a été mis en timeout pour **5 minutes** (Raison: ${reason}).`);
            } else {
                await (message.channel as any).send(`⚠️ Violation détectée de ${message.author} (Raison: ${reason}).`);
            }
            return true;
        } catch (error) {
            console.error(`[SecurityManager] Failed to apply sanction:`, error);
            return true;
        }
    }

    // --- Individual Checks ---

    private static async checkAntiSpam(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiSpam } = security;
        if (!antiSpam || !antiSpam.enabled) return false;

        const userId = message.author.id;
        const now = Date.now();

        if (!this.messageMap.has(userId)) {
            this.messageMap.set(userId, []);
        }

        const userMessages = this.messageMap.get(userId)!;
        userMessages.push(now);

        const recentMessages = userMessages.filter(timestamp => now - timestamp < (antiSpam.timeWindow || 5000));
        this.messageMap.set(userId, recentMessages);

        if (recentMessages.length >= antiSpam.messageLimit) {
            this.messageMap.delete(userId);
            try {
                const channel = message.channel as TextChannel;
                const messages = await channel.messages.fetch({ limit: 100 });
                const userSpamMessages = messages.filter(msg =>
                    msg.author.id === userId &&
                    (Date.now() - msg.createdTimestamp) < (antiSpam.timeWindow || 5000) &&
                    !msg.pinned
                );

                let deletedCount = 0;
                if (userSpamMessages.size > 0) {
                    try {
                        await channel.bulkDelete(userSpamMessages, true);
                        deletedCount = userSpamMessages.size;
                    } catch (bulkError) {
                        for (const msg of userSpamMessages.values()) {
                            try {
                                await msg.delete();
                                deletedCount++;
                            } catch (e) { }
                        }
                    }
                }

                const member = message.member;
                if (member && member.moderatable) {
                    await member.timeout(antiSpam.timeoutDuration || 300000, 'Anti-Spam: Exceeded message limit');
                    await (message.channel as any).send(`⚠️ ${message.author} a été mis en timeout pour spam (5 minutes). ${deletedCount} message(s) supprimé(s).`);
                } else if (deletedCount > 0) {
                    await (message.channel as any).send(`⚠️ Spam détecté de ${message.author}. ${deletedCount} message(s) supprimé(s).`);
                }
            } catch (error: any) {
                if (error.code !== 50013) {
                    console.error(`[Anti-Spam] Failed to handle spam from user ${userId}:`, error);
                }
            }
            return true;
        }
        return false;
    }

    private static async checkAntiDuplicate(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiDuplicateSpam } = security;
        if (!antiDuplicateSpam || !antiDuplicateSpam.enabled) return false;

        const userId = message.author.id;
        const messageContent = message.content.trim();
        const now = Date.now();

        if (!this.duplicateMap.has(userId)) {
            this.duplicateMap.set(userId, []);
        }

        const userDuplicates = this.duplicateMap.get(userId)!;
        userDuplicates.push({ content: messageContent, timestamp: now });

        const recentDuplicates = userDuplicates.filter(msg => now - msg.timestamp < (antiDuplicateSpam.timeWindow || 60000));
        this.duplicateMap.set(userId, recentDuplicates);

        const identicalCount = recentDuplicates.filter(msg => msg.content === messageContent).length;

        if (identicalCount >= antiDuplicateSpam.duplicateLimit) {
            this.duplicateMap.delete(userId);
            try {
                const channel = message.channel as TextChannel;
                const messages = await channel.messages.fetch({ limit: 100 });
                const duplicateMessages = messages.filter(msg =>
                    msg.author.id === userId &&
                    msg.content.trim() === messageContent &&
                    (Date.now() - msg.createdTimestamp) < (antiDuplicateSpam.timeWindow || 60000) &&
                    !msg.pinned
                );

                let deletedCount = 0;
                if (duplicateMessages.size > 0) {
                    try {
                        await channel.bulkDelete(duplicateMessages, true);
                        deletedCount = duplicateMessages.size;
                    } catch (bulkError) {
                        for (const msg of duplicateMessages.values()) {
                            try {
                                await msg.delete();
                                deletedCount++;
                            } catch (e) { }
                        }
                    }
                }

                const member = message.member;
                if (member && member.moderatable) {
                    await member.timeout(antiDuplicateSpam.timeoutDuration || 300000, 'Anti-Duplicate-Spam: Repeated messages');
                    await (message.channel as any).send(`⚠️ ${message.author} a été mis en timeout pour spam de messages identiques (5 minutes). ${deletedCount} message(s) supprimé(s).`);
                } else if (deletedCount > 0) {
                    await (message.channel as any).send(`⚠️ Spam de messages identiques détecté de ${message.author}. ${deletedCount} message(s) supprimé(s).`);
                }
                return true;
            } catch (error: any) {
                if (error.code !== 50013) {
                    console.error(`[Anti-Duplicate-Spam] Failed to handle spam from ${message.author.tag}:`, error);
                }
            }
            return true;
        }
        return false;
    }

    private static async checkAntiAttachment(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiAttachmentSpam } = security;
        if (antiAttachmentSpam && antiAttachmentSpam.enabled) {
            if (message.attachments.size > antiAttachmentSpam.attachmentLimit) {
                return await this.applySanction(message, `Spam de fichiers joints (${message.attachments.size})`);
            }
        }
        return false;
    }

    private static async checkAntiSticker(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiStickerSpam } = security;
        if (antiStickerSpam && antiStickerSpam.enabled) {
            if (message.stickers.size > antiStickerSpam.stickerLimit) {
                return await this.applySanction(message, `Spam de stickers (${message.stickers.size})`);
            }
        }
        return false;
    }

    private static async checkAntiMention(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiMentionSpam } = security;
        if (!antiMentionSpam || !antiMentionSpam.enabled) return false;

        if (message.mentions.everyone) {
            const isOwner = message.author.id === message.guild!.ownerId;
            const isAdmin = message.member?.permissions.has('Administrator');

            if (!isOwner && !isAdmin) {
                return await this.applySanction(message, "Usage abusif de @everyone/@here");
            }
        }

        const userMentions = message.mentions.users.size;
        const roleMentions = message.mentions.roles.size;
        const totalMentions = userMentions + roleMentions;

        if (totalMentions > antiMentionSpam.mentionLimit) {
            return await this.applySanction(message, `Spam de mentions (${totalMentions})`);
        }
        return false;
    }

    private static async checkAntivirus(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antivirus } = security;
        if (antivirus.enabled && message.attachments.size > 0) {
            const blockedExtensions: string[] = antivirus.blockedExtensions;
            const maliciousFile = message.attachments.find(attachment => {
                const fileName = attachment.name.toLowerCase();
                return blockedExtensions.some(ext => fileName.endsWith(ext));
            });

            if (maliciousFile) {
                try {
                    await message.delete();
                    await (message.channel as any).send(`⚠️ ${message.author}, les fichiers de type **${path.extname(maliciousFile.name)}** sont interdits pour des raisons de sécurité.`);
                    return true;
                } catch (e) { return true; }
            }
        }
        return false;
    }

    private static async checkAntiLink(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiLinkSpam } = security;
        if (antiLinkSpam && antiLinkSpam.enabled) {
            const links = message.content.match(linkPattern) || [];
            if (links.length > antiLinkSpam.linkLimit) {
                return await this.applySanction(message, `Spam de liens (${links.length})`);
            }
        }
        return false;
    }

    private static async checkAntiInvite(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiInviteSpam } = security;
        if (antiInviteSpam && antiInviteSpam.enabled) {
            if (invitePattern.test(message.content)) {
                return await this.applySanction(message, "Publicité (Invitation Discord)");
            }
        }
        return false;
    }

    private static async checkAntiCaps(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiCapsSpam } = security;
        if (antiCapsSpam && antiCapsSpam.enabled) {
            const text = message.content;
            if (text.length >= antiCapsSpam.minLength) {
                const letters = text.replace(/[^a-zA-Z]/g, '');
                if (letters.length > 0) {
                    const upperCount = (text.match(/[A-Z]/g) || []).length;
                    const capsPercentage = (upperCount / letters.length) * 100;
                    if (capsPercentage > antiCapsSpam.capsPercentage) {
                        return await this.applySanction(message, "Spam de MAJUSCULES");
                    }
                }
            }
        }
        return false;
    }

    private static async checkAntiCrash(message: Message, client: Client, security: SecurityConfig): Promise<boolean> {
        const antiBug = (security as any).antiBug;
        if (antiBug) {
            const content = message.content;
            const slashCrash = /^\/{2,}/.test(content);
            const rtlCrash = /[\u202E\u200F]/.test(content);
            const controlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(content);

            if (slashCrash || rtlCrash || controlChars) {
                try {
                    await message.delete();
                    let reason = "Suspected Crash Text";
                    if (slashCrash) reason = "Séquence de / abusive";
                    if (rtlCrash) reason = "Caractères RLO/Glitch détectés";
                    if (controlChars) reason = "Caractères de contrôle interdits";

                    await (message.channel as any).send(`🛡️ ${message.author}, votre message a été supprimé par l'**Anti-Crash** (Raison: ${reason}).`);
                    console.log(`[Anti-Crash] Deleted message from ${message.author.tag} (${message.author.id}). Reason: ${reason}`);

                    if (security.logs.enabled && security.logs.securityChannelId) {
                        const logChannel = message.guild!.channels.cache.get(security.logs.securityChannelId) as TextChannel;
                        if (logChannel) {
                            await logChannel.send({
                                embeds: [{
                                    title: '🛡️ Anti-Crash Triggered',
                                    description: `**User:** ${message.author} (${message.author.id})\n**Channel:** ${message.channel}\n**Reason:** ${reason}\n\n**Note:** Message content hidden to prevent crashing staff clients.`,
                                    color: 0xFF0000,
                                    timestamp: new Date().toISOString()
                                }]
                            });
                        }
                    }
                    return true;
                } catch (e) { return true; }
            }
        }
        return false;
    }

    private static async checkAntiToken(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiToken } = security;
        if (antiToken && antiToken.enabled) {
            const text = message.content;
            let tokenFound = false;
            for (const pattern of tokenPatterns) {
                if (pattern.test(text)) {
                    tokenFound = true;
                    break;
                }
            }

            if (tokenFound) {
                try {
                    await message.delete();
                    await (message.channel as any).send(`🚨 ${message.author}, **ATTENTION !** Vous avez partagé ce qui ressemble à un **token Discord**. Votre message a été supprimé pour des raisons de sécurité.\n\n⚠️ **Si c'était votre token personnel, régénérez-le IMMÉDIATEMENT depuis les paramètres de votre application Discord !**`);
                    return true;
                } catch (e) { return true; }
            }
        }
        return false;
    }

    private static async checkAntiNewline(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiNewlineSpam } = security;
        if (antiNewlineSpam && antiNewlineSpam.enabled) {
            const newlineCount = (message.content.match(/\n/g) || []).length;
            if (newlineCount > antiNewlineSpam.newlineLimit) {
                return await this.applySanction(message, `Spam de sauts de ligne (${newlineCount})`);
            }
        }
        return false;
    }

    private static async checkAntiSpoiler(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiSpoilerSpam } = security;
        if (antiSpoilerSpam && antiSpoilerSpam.enabled) {
            const spoilerMarkers = (message.content.match(spoilerPattern) || []).length;
            const spoilerCount = Math.floor(spoilerMarkers / 2);

            if (spoilerCount > antiSpoilerSpam.spoilerLimit) {
                return await this.applySanction(message, `Spam de balises spoiler (${spoilerCount})`);
            }
        }
        return false;
    }

    private static async checkAntiZalgo(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiZalgo } = security;
        if (antiZalgo && antiZalgo.enabled) {
            const text = message.content;
            const combiningChars = (text.match(/\p{M}/gu) || []).length;
            const totalChars = text.length;

            const ratio = totalChars > 0 ? combiningChars / totalChars : 0;

            if (ratio > antiZalgo.threshold) {
                return await this.applySanction(message, "Texte Zalgo / Caractères excessifs");
            }
        }
        return false;
    }

    private static async checkAntiEmoji(message: Message, security: SecurityConfig): Promise<boolean> {
        const { antiEmojiSpam } = security;
        if (antiEmojiSpam && antiEmojiSpam.enabled) {
            const customEmojiCount = (message.content.match(/<a?:\w+:\d+>/g) || []).length;
            const unicodeEmojiCount = (message.content.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
            const totalEmojis = customEmojiCount + unicodeEmojiCount;

            if (totalEmojis > antiEmojiSpam.emojiLimit) {
                return await this.applySanction(message, `Spam d'émojis (${totalEmojis})`);
            }
        }
        return false;
    }
}
