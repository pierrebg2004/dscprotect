import { Collection } from 'discord.js';
import type { Config } from '../config.ts';
import type { GuildConfig, Command, Event, NukeData } from './index.ts';

declare module 'discord.js' {
    interface Client {
        config: Config;
        guildConfigs: { [key: string]: GuildConfig };
        commands: Collection<string, Command>;
        events: Collection<string, Event>;
        nukeMap: Map<string, NukeData>;
        getGuildConfig: (guildId: string) => GuildConfig;
        saveGuildConfigs: () => Promise<void>;
    }
}
