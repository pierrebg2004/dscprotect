import fs from 'fs';
import path from 'path';
import { Role, Guild, Collection } from 'discord.js';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_FILE = path.join(__dirname, '..', '..', 'roleBackup.json'); // Adjusted path from src/utils/ -> root

interface RoleBackupData {
    name: string;
    color: number;
    permissions: string;
    position: number;
    hoist: boolean;
    mentionable: boolean;
    icon: string | null;
    unicodeEmoji: string | null;
    members: string[];
    tags: {
        botId: string | undefined;
        integrationId: string | undefined;
        premiumSubscriberRole: boolean | undefined;
    } | null;
    createdTimestamp: number;
}

interface BackupStorage {
    [guildId: string]: {
        [roleId: string]: RoleBackupData;
    };
}

/**
 * Role Backup Manager - Centralizes role backup and restoration operations
 */
class RoleBackupManager {
    private backups: BackupStorage;

    constructor() {
        this.backups = this.loadBackups();
    }

    /**
     * Load backups from file
     */
    private loadBackups(): BackupStorage {
        try {
            if (!fs.existsSync(BACKUP_FILE)) {
                return {};
            }
            const data = fs.readFileSync(BACKUP_FILE, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('[RoleBackup] Error loading backups:', error);
            return {};
        }
    }

    /**
     * Save backups to file (Asynchronous)
     */
    private async saveBackups(): Promise<void> {
        try {
            await fs.promises.writeFile(BACKUP_FILE, JSON.stringify(this.backups, null, 2));
        } catch (error) {
            console.error('[RoleBackup] Error saving backups:', error);
        }
    }

    /**
     * Save a role's data
     * @param {Role} role - Discord.js Role object
     */
    public async saveRole(role: Role): Promise<void> {
        try {
            if (!this.backups[role.guild.id]) {
                this.backups[role.guild.id] = {};
            }

            // Get all members with this role
            const members = role.members.map(m => m.id);

            this.backups[role.guild.id][role.id] = {
                name: role.name,
                color: role.color,
                permissions: role.permissions.bitfield.toString(),
                position: role.position,
                hoist: role.hoist,
                mentionable: role.mentionable,
                icon: role.icon,
                unicodeEmoji: role.unicodeEmoji,
                members: members,
                tags: role.tags ? {
                    botId: role.tags.botId || undefined,
                    integrationId: role.tags.integrationId || undefined,
                    premiumSubscriberRole: role.tags.premiumSubscriberRole || undefined
                } : null,
                createdTimestamp: role.createdTimestamp
            };

            await this.saveBackups();
            // console.log(`[RoleBackup] Saved role: ${role.name} (${role.id}) in guild ${role.guild.id}`);
        } catch (error) {
            console.error('[RoleBackup] Error saving role:', error);
        }
    }

    /**
     * Update a role's data
     * @param {Role} role - Discord.js Role object
     */
    public async updateRole(role: Role): Promise<void> {
        await this.saveRole(role); // Same operation for now
    }

    /**
     * Update the member list for a role
     * @param {Role} role - Discord.js Role object
     */
    public async updateRoleMembers(role: Role): Promise<void> {
        try {
            if (!this.backups[role.guild.id] || !this.backups[role.guild.id][role.id]) {
                // Role not backed up yet, save it
                await this.saveRole(role);
                return;
            }

            const members = role.members.map(m => m.id);
            this.backups[role.guild.id][role.id].members = members;
            await this.saveBackups();

            // console.log(`[RoleBackup] Updated members for role: ${role.name} (${role.id})`);
        } catch (error) {
            console.error('[RoleBackup] Error updating role members:', error);
        }
    }

    /**
     * Get backup data for a specific role
     * @param {string} guildId - Guild ID
     * @param {string} roleId - Role ID
     * @returns {Object|null} Role backup data or null if not found
     */
    public getRoleBackup(guildId: string, roleId: string): RoleBackupData | null {
        if (!this.backups[guildId] || !this.backups[guildId][roleId]) {
            return null;
        }
        return this.backups[guildId][roleId];
    }

    /**
     * Restore a deleted role
     * @param {Guild} guild - Discord.js Guild object
     * @param {string} roleId - Deleted role ID
     * @returns {Role|null} Newly created role or null if restoration failed
     */
    public async restoreRole(guild: Guild, roleId: string): Promise<Role | null> {
        try {
            const backup = this.getRoleBackup(guild.id, roleId);
            if (!backup) {
                console.warn(`[RoleBackup] No backup found for role ${roleId} in guild ${guild.id}`);
                return null;
            }

            // Check if role has special tags (bot role, integration, boost role)
            if (backup.tags && (backup.tags.botId || backup.tags.integrationId || backup.tags.premiumSubscriberRole)) {
                console.warn(`[RoleBackup] Cannot restore managed role: ${backup.name} (has special tags)`);
                return null;
            }

            console.log(`[RoleBackup] Restoring role: ${backup.name}`);

            // Create the role with all properties
            const newRole = await guild.roles.create({
                name: backup.name,
                color: backup.color,
                permissions: BigInt(backup.permissions),
                hoist: backup.hoist,
                mentionable: backup.mentionable,
                icon: backup.icon,
                unicodeEmoji: backup.unicodeEmoji,
                reason: 'Anti-Nuke: Restoring deleted role'
            });

            // Try to set the position (may fail if bot doesn't have high enough position)
            try {
                if (backup.position > 0) {
                    await newRole.setPosition(backup.position, { reason: 'Anti-Nuke: Restoring role position' });
                }
            } catch (error: any) {
                console.warn(`[RoleBackup] Could not restore position for role ${backup.name}:`, error.message);
            }

            // Reassign the role to all members who had it
            console.log(`[RoleBackup] Reassigning role to ${backup.members.length} members...`);
            let successCount = 0;
            let failCount = 0;

            for (const memberId of backup.members) {
                try {
                    const member = await guild.members.fetch(memberId);
                    if (member) {
                        await member.roles.add(newRole, 'Anti-Nuke: Restoring role membership');
                        successCount++;
                    }
                } catch (error: any) {
                    failCount++;
                    console.warn(`[RoleBackup] Could not reassign role to member ${memberId}:`, error.message);
                }
            }

            console.log(`[RoleBackup] Role restoration complete: ${backup.name}`);
            console.log(`[RoleBackup] Successfully reassigned to ${successCount}/${backup.members.length} members (${failCount} failures)`);

            // Update backup with new role ID
            this.backups[guild.id][newRole.id] = backup;
            delete this.backups[guild.id][roleId];
            await this.saveBackups();

            return newRole;
        } catch (error) {
            console.error('[RoleBackup] Error restoring role:', error);
            return null;
        }
    }

    /**
     * Remove a role from backups
     * @param {string} guildId - Guild ID
     * @param {string} roleId - Role ID
     */
    public async removeRole(guildId: string, roleId: string): Promise<void> {
        if (this.backups[guildId] && this.backups[guildId][roleId]) {
            delete this.backups[guildId][roleId];
            await this.saveBackups();
            // console.log(`[RoleBackup] Removed role ${roleId} from backups`);
        }
    }

    /**
     * Backup all roles in a guild (useful for initial setup or recovery)
     * @param {Guild} guild - Discord.js Guild object
     */
    public async backupAllRoles(guild: Guild): Promise<void> {
        try {
            console.log(`[RoleBackup] Backing up all roles for guild: ${guild.name} (${guild.id})`);
            const roles = await guild.roles.fetch();

            for (const [roleId, role] of roles) {
                if (role.id === guild.id) continue; // Skip @everyone role
                await this.saveRole(role);
            }

            console.log(`[RoleBackup] Successfully backed up ${roles.size - 1} roles`);
        } catch (error) {
            console.error('[RoleBackup] Error backing up all roles:', error);
        }
    }
}

export default new RoleBackupManager();
