import { ConfigType } from '#/cache/config/ConfigType.js';
import { ParamHelper } from '#/cache/config/ParamHelper.js';
import type { ParamMap } from '#/cache/config/ParamHelper.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

export default class LocType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: LocType[] = [];
    static count: number = 0;

    static get(id: number): LocType {
        return LocType.configs[id];
    }

    static getId(name: string): number {
        return LocType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): LocType | null {
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
            LocType.count = 0;
            return;
        }

        LocType.configs = new Array(totalSlots);
        LocType.configNames.clear();

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
                const locId = nextId++;

                const data = index.unpacked[g]?.[fileId];
                if (!data) {
                    continue;
                }

                const type = new LocType(locId);
                try {
                    type.decodeType(new Packet(data));
                    type.postDecode();
                } catch (err) {
                    console.error(`Failed to decode loc ${locId} (group ${g}, file ${fileId}):`, err);
                    continue;
                }

                LocType.configs[locId] = type;
                loadedCount++;

                if (type.debugname) {
                    LocType.configNames.set(type.debugname.toLowerCase(), locId);
                }
            }
        }

        LocType.count = loadedCount;
    }

    models: Uint16Array | null = null;
    shapes: Uint8Array | null = null;
    name: string | null = null;
    desc: string | null = null;
    width: number = 1;
    length: number = 1;
    blockwalk: boolean = true;
    blockrange: boolean = true;
    active: number = -1;
    hillskew: boolean = false;
    skewtype: number = 0;
    skewamount: number = 0;
    sharelight: boolean = false;
    occlude: boolean = false;
    anim: number = -1;
    hasalpha: boolean = false;
    wallwidth: number = 16;
    ambient: number = 0;
    contrast: number = 0;
    op: (string | null)[] | null = null;
    recol_s: Uint16Array | null = null;
    recol_d: Uint16Array | null = null;
    recol_d_palette: Uint8Array | null = null;
    retex_s: Uint16Array | null = null;
    retex_d: Uint16Array | null = null;
    mapfunction: number = -1;
    mirror: boolean = false;
    shadow: boolean = true;
    resizex: number = 128;
    resizey: number = 128;
    resizez: number = 128;
    mapscene: number = -1;
    forceapproach: number = 0;
    offsetx: number = 0;
    offsety: number = 0;
    offsetz: number = 0;
    forcedecor: boolean = false;
    breakroutefinding: boolean = false;
    raiseobject: number = -1;
    multivarbit: number = -1;
    multivarp: number = -1;
    multiloc: number[] | null = null;
    multilocdefault: number = -1;
    bgsound: number = -1;
    bgsoundrange: number = 0;
    bgsoundmindelay: number = 0;
    bgsoundmaxdelay: number = 0;
    bgsoundrandom: number[] | null = null;
    unknown82: boolean = false;
    unknown88: boolean = false;
    randomanimframe: boolean = true;
    field2799: boolean = false;
    members: boolean = false;

    // --- Server-Only Properties ---
    category: number = -1;
    params: ParamMap = new Map();

    decode(code: number, dat: Packet): void {
        if (code === 1) {
            const count = dat.g1();
            this.models = new Uint16Array(count);
            this.shapes = new Uint8Array(count);

            for (let i = 0; i < count; i++) {
                this.models[i] = dat.g2();
                this.shapes[i] = dat.g1();
            }
        } else if (code === 2) {
            this.name = dat.gjstr();
        } else if (code === 3) {
            this.desc = dat.gjstr();
        } else if (code === 5) {
            const count = dat.g1();
            this.models = new Uint16Array(count);
            this.shapes = null;

            for (let i = 0; i < count; i++) {
                this.models[i] = dat.g2();
            }
        } else if (code === 14) {
            this.width = dat.g1();
        } else if (code === 15) {
            this.length = dat.g1();
        } else if (code === 17) {
            this.blockrange = false;
            this.blockwalk = false;
        } else if (code === 18) {
            this.blockrange = false;
        } else if (code === 19) {
            this.active = dat.g1();
        } else if (code === 21) {
            this.hillskew = true;
        } else if (code === 22) {
            this.sharelight = true;
        } else if (code === 23) {
            this.occlude = true;
        } else if (code === 24) {
            this.anim = dat.g2();
            if (this.anim === 65535) {
                this.anim = -1;
            }
        } else if (code === 25) {
            this.hasalpha = true;
        } else if (code === 27) {
            this.blockwalk = true;
        } else if (code === 28) {
            this.wallwidth = dat.g1();
        } else if (code === 29) {
            this.ambient = dat.g1b();
        } else if (code === 39) {
            this.contrast = dat.g1b();
        } else if (code >= 30 && code < 35) {
            if (!this.op) {
                this.op = new Array(5).fill(null);
            }
            this.op[code - 30] = dat.gjstr();
        } else if (code === 40) {
            const count = dat.g1();
            this.recol_s = new Uint16Array(count);
            this.recol_d = new Uint16Array(count);

            for (let i = 0; i < count; i++) {
                this.recol_s[i] = dat.g2();
                this.recol_d[i] = dat.g2();
            }
        } else if (code === 41) {
            const count = dat.g1();
            this.retex_s = new Uint16Array(count);
            this.retex_d = new Uint16Array(count);

            for (let i = 0; i < count; i++) {
                this.retex_s[i] = dat.g2();
                this.retex_d[i] = dat.g2();
            }
        } else if (code === 42) {
            const count = dat.g1();
            this.recol_d_palette = new Uint8Array(count);

            for (let i = 0; i < count; i++) {
                this.recol_d_palette[i] = dat.g1b();
            }
        } else if (code === 60) {
            this.mapfunction = dat.g2();
        } else if (code === 61) {
            this.category = dat.g2();
        } else if (code === 62) {
            this.mirror = true;
        } else if (code === 64) {
            this.shadow = false;
        } else if (code === 65) {
            this.resizex = dat.g2();
        } else if (code === 66) {
            this.resizey = dat.g2();
        } else if (code === 67) {
            this.resizez = dat.g2();
        } else if (code === 68) {
            this.mapscene = dat.g2();
        } else if (code === 69) {
            this.forceapproach = dat.g1();
        } else if (code === 70) {
            this.offsetx = dat.g2s();
        } else if (code === 71) {
            this.offsety = dat.g2s();
        } else if (code === 72) {
            this.offsetz = dat.g2s();
        } else if (code === 73) {
            this.forcedecor = true;
        } else if (code === 74) {
            this.breakroutefinding = true;
        } else if (code === 75) {
            this.raiseobject = dat.g1();
        } else if (code === 77 || code === 92) {
            this.multivarbit = dat.g2();
            if (this.multivarbit === 65535) {
                this.multivarbit = -1;
            }
            this.multivarp = dat.g2();
            if (this.multivarp === 65535) {
                this.multivarp = -1;
            }
            if (code === 92) {
                this.multilocdefault = dat.g2();
                if (this.multilocdefault === 65535) {
                    this.multilocdefault = -1;
                }
            }
            const count = dat.g1();
            this.multiloc = new Array(count + 1);
            for (let i = 0; i <= count; i++) {
                let id = dat.g2();
                if (id === 65535) {
                    id = -1;
                }
                this.multiloc[i] = id;
            }
        } else if (code === 78) {
            this.bgsound = dat.g2();
            if (this.bgsound === 65535) {
                this.bgsound = -1;
            }
            this.bgsoundrange = dat.g1();
        } else if (code === 79) {
            this.bgsoundmindelay = dat.g2();
            this.bgsoundmaxdelay = dat.g2();
            this.bgsoundrange = dat.g1();
            const count = dat.g1();
            this.bgsoundrandom = new Array(count);
            for (let i = 0; i < count; i++) {
                this.bgsoundrandom[i] = dat.g2();
            }
        } else if (code === 81) {
            this.skewtype = 2;
            this.skewamount = ((dat.g1() * 256) << 16) >> 16;
        } else if (code === 82) {
            this.unknown82 = true;
        } else if (code === 88) {
            this.unknown88 = true;
        } else if (code === 89) {
            this.randomanimframe = false;
        } else if (code === 90) {
            this.field2799 = true;
        } else if (code === 91) {
            this.members = true;
        } else if (code === 93) {
            this.skewtype = 3;
            this.skewamount = dat.g2s();
        } else if (code === 94) {
            this.skewtype = 4;
        } else if (code === 95) {
            this.skewtype = 5;
        } else if (code === 249) {
            this.params = ParamHelper.decodeParams(dat);
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(
                `Unrecognized loc config opcode: ${code} (debugname=${this.debugname ?? 'unknown'}).`
            );
        }
    }

    postDecode(): void {
        if (this.active === -1) {
            this.active = 0;

            if (this.models && (!this.shapes || (this.shapes && this.shapes[0] === 10))) {
                this.active = 1;
            }

            if (this.op !== null) {
                this.active = 1;
            }
        }
    }
}
