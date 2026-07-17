import { ConfigType } from '#/cache/config/ConfigType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

const VARN_GROUP = 6;

export default class VarNpcType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: VarNpcType[] = [];
    static count: number = 0;

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

    static load(index: Js5Index): void {
        const groupSize = index.groupSize[VARN_GROUP];
        if (!groupSize) {
            VarNpcType.count = 0;
            return;
        }

        if (!index.packed[VARN_GROUP] || Object.keys(index.unpacked[VARN_GROUP] ?? {}).length === 0) {
            if (!index.unpackGroup(VARN_GROUP)) {
                VarNpcType.count = 0;
                return;
            }
        }

        VarNpcType.configs = new Array(groupSize);
        VarNpcType.configNames.clear();

        let loadedCount = 0;
        const fileIds = index.fileIds[VARN_GROUP];

        for (let i = 0; i < groupSize; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const data = index.unpacked[VARN_GROUP]?.[fileId];
            if (!data) continue;

            const type = new VarNpcType(fileId);
            type.decodeType(new Packet(data));
            type.postDecode();

            VarNpcType.configs[fileId] = type;
            loadedCount++;

            if (type.debugname) {
                VarNpcType.configNames.set(type.debugname.toLowerCase(), fileId);
            }
        }

        VarNpcType.count = loadedCount;
    }

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
