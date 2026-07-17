import { ConfigType } from '#/cache/config/ConfigType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

const VARS_GROUP = 7;

export default class VarSharedType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: VarSharedType[] = [];
    static count: number = 0;

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

    static load(index: Js5Index): void {
        const groupSize = index.groupSize[VARS_GROUP];
        if (!groupSize) {
            VarSharedType.count = 0;
            return;
        }

        if (!index.packed[VARS_GROUP] || Object.keys(index.unpacked[VARS_GROUP] ?? {}).length === 0) {
            if (!index.unpackGroup(VARS_GROUP)) {
                VarSharedType.count = 0;
                return;
            }
        }

        VarSharedType.configs = new Array(groupSize);
        VarSharedType.configNames.clear();

        let loadedCount = 0;
        const fileIds = index.fileIds[VARS_GROUP];

        for (let i = 0; i < groupSize; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const data = index.unpacked[VARS_GROUP]?.[fileId];
            if (!data) continue;

            const type = new VarSharedType(fileId);
            type.decodeType(new Packet(data));
            type.postDecode();

            VarSharedType.configs[fileId] = type;
            loadedCount++;

            if (type.debugname) {
                VarSharedType.configNames.set(type.debugname.toLowerCase(), fileId);
            }
        }

        VarSharedType.count = loadedCount;
    }

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
