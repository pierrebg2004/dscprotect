import { SlashCommandBuilder, CommandInteraction, Client } from 'discord.js';
import { SecurityConfig } from '../config.ts';

export type GuildConfig = SecurityConfig;

export interface Command {
    data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
    execute: (interaction: CommandInteraction, client: Client) => Promise<void>;
}

export interface Event {
    name: string;
    once?: boolean;
    execute: (...args: any[]) => Promise<void> | void;
}

export interface NukeData {
    channelDeletes?: number[];
    roleDeletes?: number[];
    banAdds?: number[];
    kickAdds?: number[];
    channelCreates?: number[];
    roleCreates?: number[];
    webhookCreates?: number[];
    [key: string]: number[] | undefined;
}
