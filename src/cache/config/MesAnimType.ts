import { ConfigType } from '#/cache/config/ConfigType.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

const MESANIM_GROUP = 7;

export default class MesanimType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: MesanimType[] = [];
    static count: number = 0;

    static get(id: number): MesanimType {
        return MesanimType.configs[id];
    }

    static getId(name: string): number {
        return MesanimType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): MesanimType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }
        return this.get(id);
    }

    static load(index: Js5Index): void {
        const groupSize = index.groupSize[MESANIM_GROUP];
        if (!groupSize) {
            MesanimType.count = 0;
            return;
        }

        if (!index.packed[MESANIM_GROUP] || Object.keys(index.unpacked[MESANIM_GROUP] ?? {}).length === 0) {
            if (!index.unpackGroup(MESANIM_GROUP)) {
                MesanimType.count = 0;
                return;
            }
        }

        MesanimType.configs = new Array(groupSize);
        MesanimType.configNames.clear();

        let loadedCount = 0;
        const fileIds = index.fileIds[MESANIM_GROUP];

        for (let i = 0; i < groupSize; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const data = index.unpacked[MESANIM_GROUP]?.[fileId];
            if (!data) continue;

            const type = new MesanimType(fileId);
            type.decodeType(new Packet(data));
            type.postDecode();

            MesanimType.configs[fileId] = type;
            loadedCount++;

            if (type.debugname) {
                MesanimType.configNames.set(type.debugname.toLowerCase(), fileId);
            }
        }

        MesanimType.count = loadedCount;
    }

    // ----

    len: number[] = new Array(4).fill(-1);

    decode(code: number, dat: Packet): void {
        if (code >= 1 && code < 5) {
            this.len[code - 1] = dat.g2();
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized mesanim config code: ${code}`);
        }
    }
}
