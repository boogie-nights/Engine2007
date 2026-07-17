import { ConfigType } from '#/cache/config/ConfigType.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

export default class EnumType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: EnumType[] = [];
    static count: number = 0;

    static get(id: number): EnumType {
        return EnumType.configs[id];
    }

    static getId(name: string): number {
        return EnumType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): EnumType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }
        return this.get(id);
    }

    static load(index: Js5Index): void {
        const groupCount = index.capacity;

        let totalSlots = 0;
        for (let g = 0; g < groupCount; g++) {
            totalSlots += index.groupSize[g] ?? 0;
        }

        if (totalSlots === 0) {
            EnumType.count = 0;
            return;
        }

        EnumType.configs = new Array(totalSlots);
        EnumType.configNames.clear();

        let nextId = 0;
        let loadedCount = 0;

        for (let g = 0; g < groupCount; g++) {
            const groupSize = index.groupSize[g];
            if (groupSize === 0) continue;

            if (!index.packed[g] || Object.keys(index.unpacked[g] ?? {}).length === 0) {
                if (!index.unpackGroup(g)) {
                    continue;
                }
            }

            const fileIds = index.fileIds[g];

            for (let i = 0; i < groupSize; i++) {
                const fileId = fileIds ? fileIds[i] : i;

                const id = nextId++;

                const data = index.unpacked[g]?.[fileId];
                if (!data) continue;

                const type = new EnumType(id);
                type.decodeType(new Packet(data));
                type.postDecode();

                EnumType.configs[id] = type;
                loadedCount++;

                if (type.debugname) {
                    EnumType.configNames.set(type.debugname.toLowerCase(), id);
                }
            }
        }

        EnumType.count = loadedCount;
    }

    inputtype: number = -1;
    outputtype: number = -1;

    defaultInt: number = -1;
    defaultString: string | null = null;

    keyCount: number = 0;
    values: Map<number, number | string> = new Map();

    decode(code: number, dat: Packet): void {
        if (code === 1) {
            this.inputtype = dat.g1();
        } else if (code === 2) {
            this.outputtype = dat.g1();
        } else if (code === 3) {
            this.defaultString = dat.gjstr();
        } else if (code === 4) {
            this.defaultInt = dat.g4();
        } else if (code === 5) {
            const count = dat.g2();
            this.keyCount = count;
            for (let j = 0; j < count; j++) {
                this.values.set(dat.g4(), dat.gjstr());
            }
        } else if (code === 6) {
            const count = dat.g2();
            this.keyCount = count;
            for (let j = 0; j < count; j++) {
                this.values.set(dat.g4(), dat.g4());
            }
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized enum config code: ${code}`);
        }
    }

    postDecode(): void {
    }

    size(): number {
        return this.keyCount;
    }

    hasKey(key: number): boolean {
        return this.values.has(key);
    }

    getIntValue(key: number): number {
        const value = this.values.get(key);
        return typeof value === 'number' ? value : this.defaultInt;
    }

    getStringValue(key: number): string | null {
        const value = this.values.get(key);
        return typeof value === 'string' ? value : this.defaultString;
    }
}
