import fs from 'fs';
import { ConfigType } from '#/cache/config/ConfigType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import Packet from '#/io/Packet.js';

export default class VarSharedType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: VarSharedType[] = [];

    static load(dir: string): void {
        if (!fs.existsSync(`${dir}/server/vars.dat`)) {
            return;
        }

        const dat = Packet.load(`${dir}/server/vars.dat`);
        this.parse(dat);
    }

    static parse(dat: Packet): void {
        VarSharedType.configNames = new Map();
        VarSharedType.configs = [];

        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new VarSharedType(id);
            config.decodeType(dat);

            VarSharedType.configs[id] = config;

            if (config.debugname) {
                VarSharedType.configNames.set(config.debugname.toLowerCase(), id);
            }
        }
    }

    static get(id: number): VarSharedType {
        return VarSharedType.configs[id];
    }

    static getId(name: string): number {
        return VarSharedType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): VarSharedType | null {
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
            throw new Error(`Unrecognized vars config code: ${code}`);
        }
    }
}
