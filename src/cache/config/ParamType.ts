import { ConfigType } from '#/cache/config/ConfigType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

const PARAM_GROUP = 11;

export default class ParamType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: ParamType[] = [];
    static count: number = 0;

    static get(id: number): ParamType {
        return ParamType.configs[id];
    }

    static getId(name: string): number {
        return ParamType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): ParamType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }
        return this.get(id);
    }

    static load(index: Js5Index): void {
        const groupSize = index.groupSize[PARAM_GROUP];
        if (!groupSize) {
            ParamType.count = 0;
            return;
        }

        if (!index.packed[PARAM_GROUP] || Object.keys(index.unpacked[PARAM_GROUP] ?? {}).length === 0) {
            if (!index.unpackGroup(PARAM_GROUP)) {
                ParamType.count = 0;
                return;
            }
        }

        ParamType.configs = new Array(groupSize);
        ParamType.configNames.clear();

        let loadedCount = 0;
        const fileIds = index.fileIds[PARAM_GROUP];

        for (let i = 0; i < groupSize; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const data = index.unpacked[PARAM_GROUP]?.[fileId];
            if (!data) continue;

            const type = new ParamType(fileId);
            type.decodeType(new Packet(data));
            type.postDecode();

            ParamType.configs[fileId] = type;
            loadedCount++;

            if (type.debugname) {
                ParamType.configNames.set(type.debugname.toLowerCase(), fileId);
            }
        }

        ParamType.count = loadedCount;
    }

    type = ScriptVarType.INT;
    defaultInt = -1;
    defaultString: string | null = null;
    autodisable = true;

    isString(): boolean {
        return this.type === ScriptVarType.STRING;
    }

    getType(): string {
        return ScriptVarType.getType(this.type);
    }

    decode(code: number, dat: Packet): void {
        if (code === 1) {
            this.type = dat.g1();
        } else if (code === 2) {
            this.defaultInt = dat.g4();
        } else if (code === 4) {
            this.autodisable = false;
        } else if (code === 5) {
            this.defaultString = dat.gjstr();
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized param config code: ${code}`);
        }
    }
}