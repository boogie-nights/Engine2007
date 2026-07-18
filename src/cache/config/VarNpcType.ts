import fs from 'fs';
import { ConfigType } from '#/cache/config/ConfigType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import Packet from '#/io/Packet.js';

export default class VarNpcType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: VarNpcType[] = [];

    static load(dir: string): void {
        if (!fs.existsSync(`${dir}/server/varn.dat`)) {
            return;
        }

        const dat = Packet.load(`${dir}/server/varn.dat`);
        this.parse(dat);
    }

    static parse(dat: Packet): void {
        VarNpcType.configNames = new Map();
        VarNpcType.configs = [];

        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new VarNpcType(id);
            config.decodeType(dat);

            VarNpcType.configs[id] = config;

            if (config.debugname) {
                VarNpcType.configNames.set(config.debugname.toLowerCase(), id);
            }
        }
    }

    static get(id: number): VarNpcType {
        return VarNpcType.configs[id];
    }

    static getId(name: string): number {
        return VarNpcType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): VarNpcType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }
        return this.get(id);
    }

    static get count(): number {
        return this.configs.length;
    }

    // ----

    type: number = ScriptVarType.INT;

    decode(code: number, dat: Packet): void {
        if (code === 1) {
            this.type = dat.g1();
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized varn config code: ${code}`);
        }
    }
}
