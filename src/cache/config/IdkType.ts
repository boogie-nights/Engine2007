import { ConfigType } from '#/cache/config/ConfigType.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

const IDK_GROUP = 3;

export default class IdkType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: IdkType[] = [];

    static get(id: number): IdkType {
        return IdkType.configs[id];
    }

    static getId(name: string): number {
        return IdkType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): IdkType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }
        return this.get(id);
    }

    static get count(): number {
        return this.configs.length;
    }

    static load(index: Js5Index): void {
        const groupSize = index.groupSize[IDK_GROUP];
        if (!groupSize) {
            IdkType.configs = [];
            return;
        }

        if (!index.packed[IDK_GROUP] || Object.keys(index.unpacked[IDK_GROUP] ?? {}).length === 0) {
            if (!index.unpackGroup(IDK_GROUP)) {
                IdkType.configs = [];
                return;
            }
        }

        IdkType.configs = new Array(groupSize);
        IdkType.configNames.clear();

        const fileIds = index.fileIds[IDK_GROUP];

        for (let i = 0; i < groupSize; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const data = index.unpacked[IDK_GROUP]?.[fileId];
            if (!data) continue;

            const type = new IdkType(fileId);
            type.decodeType(new Packet(data));
            type.postDecode();

            IdkType.configs[fileId] = type;

            if (type.debugname) {
                IdkType.configNames.set(type.debugname.toLowerCase(), fileId);
            }
        }
    }

    // ----

    type: number = -1;
    models: Uint16Array | null = null;
    readonly head: Int32Array = new Int32Array(5).fill(-1);
    retex_d: Int16Array | null = null;
    recol_d: Int16Array | null = null;
    retex_s: Int16Array | null = null;
    recol_s: Int16Array | null = null;
    disable: boolean = false;

    decode(code: number, dat: Packet): void {
        if (code === 1) {
            this.type = dat.g1();
        } else if (code === 2) {
            const count = dat.g1();
            this.models = new Uint16Array(count);
            for (let i = 0; i < count; i++) {
                this.models[i] = dat.g2();
            }
        } else if (code === 3) {
            this.disable = true;
        } else if (code === 40) {
            const count = dat.g1();
            this.retex_d = new Int16Array(count);
            this.recol_d = new Int16Array(count);
            for (let i = 0; i < count; i++) {
                this.retex_d[i] = dat.g2();
                this.recol_d[i] = dat.g2();
            }
        } else if (code === 41) {
            const count = dat.g1();
            this.retex_s = new Int16Array(count);
            this.recol_s = new Int16Array(count);
            for (let i = 0; i < count; i++) {
                this.retex_s[i] = dat.g2();
                this.recol_s[i] = dat.g2();
            }
        } else if (code >= 60 && code < 70) {
            const index = code - 60;
            if (index < 5) {
                this.head[index] = dat.g2();
            } else {
                dat.g2();
            }
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized idk config code: ${code}`);
        }
    }
}
