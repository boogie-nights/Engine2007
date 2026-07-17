import { ConfigType } from '#/cache/config/ConfigType.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

const STRUCT_GROUP = 26;

export default class StructType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: StructType[] = [];
    static count: number = 0;

    static get(id: number): StructType {
        return StructType.configs[id];
    }

    static getId(name: string): number {
        return StructType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): StructType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }
        return this.get(id);
    }

    static load(index: Js5Index): void {
        const groupSize = index.groupSize[STRUCT_GROUP];
        if (!groupSize) {
            StructType.count = 0;
            return;
        }

        if (!index.packed[STRUCT_GROUP] || Object.keys(index.unpacked[STRUCT_GROUP] ?? {}).length === 0) {
            if (!index.unpackGroup(STRUCT_GROUP)) {
                StructType.count = 0;
                return;
            }
        }

        StructType.configs = new Array(groupSize);
        StructType.configNames.clear();

        let loadedCount = 0;
        const fileIds = index.fileIds[STRUCT_GROUP];

        for (let i = 0; i < groupSize; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const data = index.unpacked[STRUCT_GROUP]?.[fileId];
            if (!data) continue;

            const type = new StructType(fileId);
            type.decodeType(new Packet(data));
            type.postDecode();

            StructType.configs[fileId] = type;
            loadedCount++;

            if (type.debugname) {
                StructType.configNames.set(type.debugname.toLowerCase(), fileId);
            }
        }

        StructType.count = loadedCount;
    }

    params: Map<number, number | string> | null = null;

    decode(code: number, dat: Packet): void {
        if (code === 249) {
            const count = dat.g1();
            this.params = new Map();

            for (let i = 0; i < count; i++) {
                const isString = dat.g1() === 1;
                const paramId = dat.g3();
                const value = isString ? dat.gjstr() : dat.g4();
                this.params.set(paramId, value);
            }
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized struct config code: ${code}`);
        }
    }
}
