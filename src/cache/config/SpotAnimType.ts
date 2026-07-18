import { ConfigType } from '#/cache/config/ConfigType.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

const SPOTANIM_ARCHIVE = 21;

export default class SpotAnimType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: SpotAnimType[] = [];
    static count: number = 0;

    static get(id: number): SpotAnimType {
        return SpotAnimType.configs[id];
    }

    static getId(name: string): number {
        return SpotAnimType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): SpotAnimType | null {
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
            SpotAnimType.count = 0;
            return;
        }

        SpotAnimType.configs = new Array(totalSlots);
        SpotAnimType.configNames.clear();

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

                const type = new SpotAnimType(id);
                type.decodeType(new Packet(data));
                type.postDecode();

                SpotAnimType.configs[id] = type;
                loadedCount++;

                if (type.debugname) {
                    SpotAnimType.configNames.set(type.debugname.toLowerCase(), id);
                }
            }
        }

        SpotAnimType.count = loadedCount;
    }

    // ----

    model: number = 0;
    anim: number = -1;
    recol_s: Int16Array | null = null;
    recol_d: Int16Array | null = null;
    retex_s: Int16Array | null = null;
    retex_d: Int16Array | null = null;
    resizeh: number = 128;
    resizev: number = 128;
    angle: number = 0;
    ambient: number = 0;
    contrast: number = 0;
    hillskew: boolean = false;

    decode(code: number, dat: Packet): void {
        if (code === 1) {
            this.model = dat.g2();
        } else if (code === 2) {
            this.anim = dat.g2();
        } else if (code === 4) {
            this.resizeh = dat.g2();
        } else if (code === 5) {
            this.resizev = dat.g2();
        } else if (code === 6) {
            this.angle = dat.g2();
        } else if (code === 7) {
            this.ambient = dat.g1();
        } else if (code === 8) {
            this.contrast = dat.g1();
        } else if (code === 9) {
            this.hillskew = true;
        } else if (code === 40) {
            const count = dat.g1();
            this.recol_s = new Int16Array(count);
            this.recol_d = new Int16Array(count);
            for (let i = 0; i < count; i++) {
                this.recol_s[i] = dat.g2();
                this.recol_d[i] = dat.g2();
            }
        } else if (code === 41) {
            const count = dat.g1();
            this.retex_s = new Int16Array(count);
            this.retex_d = new Int16Array(count);
            for (let i = 0; i < count; i++) {
                this.retex_s[i] = dat.g2();
                this.retex_d[i] = dat.g2();
            }
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized spotanim config code: ${code}`);
        }
    }
}
