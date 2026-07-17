import fs from 'fs';
import path from 'path';
import { ConfigType } from '#/cache/config/ConfigType.js';
import { ParamHelper } from '#/cache/config/ParamHelper.js';
import type { ParamMap } from '#/cache/config/ParamHelper.js';
import { BlockWalk } from '#/engine/entity/BlockWalk.js';
import { MoveRestrict } from '#/engine/entity/MoveRestrict.js';
import { NpcMode } from '#/engine/entity/NpcMode.js';
import { NpcStat } from '#/engine/entity/NpcStat.js';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';

const PACK_DIR = '../content/pack';

function loadNpcLocationsReverse(): Map<string, number> {
    const result = new Map<string, number>();
    const filePath = path.join(PACK_DIR, 'npc-locations.pack');
    if (!fs.existsSync(filePath)) return result;

    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const npcId = parseInt(trimmed.slice(0, eqIdx), 10);
        const loc = trimmed.slice(eqIdx + 1);
        if (!isNaN(npcId) && loc.includes(':')) {
            result.set(loc, npcId);
        }
    }

    return result;
}

export default class NpcType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: NpcType[] = [];
    static count: number = 0;

    static get(id: number): NpcType {
        return NpcType.configs[id];
    }

    static getId(name: string): number {
        return NpcType.configNames.get(name.toLowerCase()) ?? -1;
    }

    static getByName(name: string): NpcType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }
        return this.get(id);
    }

    static load(index: Js5Index): void {
        const groupCount = index.capacity;

        NpcType.configs = [];
        NpcType.configNames.clear();

        const locationToId = loadNpcLocationsReverse();
        if (locationToId.size === 0) {
            console.error('NpcType.load: npc-locations.pack is missing or empty — cannot resolve npc IDs.');
            return;
        }

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
                const data = index.unpacked[g]?.[fileId];
                if (!data) {
                    continue;
                }

                const npcId = locationToId.get(`${g}:${fileId}`);
                if (npcId === undefined) {
                    console.error(`No npc-locations.pack entry for archive position ${g}:${fileId} — skipping.`);
                    continue;
                }

                const type = new NpcType(npcId);
                try {
                    type.decodeType(new Packet(data));
                    type.postDecode();
                } catch (err) {
                    console.error(`Failed to decode npc ${npcId} (group ${g}, file ${fileId}):`, err);
                    continue;
                }

                NpcType.configs[npcId] = type;
                loadedCount++;

                if (type.debugname) {
                    NpcType.configNames.set(type.debugname.toLowerCase(), npcId);
                }
            }
        }

        NpcType.count = loadedCount;
    }

    models: Uint16Array | null = null;
    headModels: Uint16Array | null = null;
    name: string | null = null;
    desc: string | null = null;
    size: number = 1;
    readyanim: number = -1;
    walkanim: number = -1;
    walkanim_b: number = -1;
    walkanim_r: number = -1;
    walkanim_l: number = -1;
    turnleftanim: number = -1;
    turnrightanim: number = -1;
    hasalpha: boolean = false;
    op: (string | null)[] | null = null;
    recol_s: Uint16Array | null = null;
    recol_d: Uint16Array | null = null;
    recol_d_palette: Uint8Array | null = null;
    retex_s: Uint16Array | null = null;
    retex_d: Uint16Array | null = null;
    resizex: number = -1;
    resizey: number = -1;
    resizez: number = -1;
    minimap: boolean = true;
    vislevel: number = -1;
    resizeh: number = 128;
    resizev: number = 128;
    alwaysontop: boolean = false;
    ambient: number = 0;
    contrast: number = 0;
    headicon: number = -1;
    turnspeed: number = 32;
    multivarbit: number = -1;
    multivarp: number = -1;
    multinpc: number[] | null = null;
    multinpcdefault: number = -1;
    active: boolean = true;
    walksmoothing: boolean = true;
    spotshadow: boolean = false;
    spotshadowcolour: [number, number] | null = null;
    spotshadowtrans: [number, number] | null = null;
    field2350: number = 0;
    field2329: number = 0;
    walkflags: number = 0;
    members: boolean = false;

    // --- Server-Only Properties ---
    category: number = -1;
    stats: number[] = [1, 1, 1, 1, 1, 1];
    wanderrange: number = 5;
    maxrange: number = -1;
    huntrange: number = 0;
    timer: number = -1;
    respawnrate: number = 100;
    moverestrict: number = MoveRestrict.NORMAL;
    attackrange: number = 0;
    blockwalk: number = BlockWalk.NPC;
    huntmode: number = -1;
    defaultmode: number = NpcMode.WANDER;
    patrolCoord: number[] = [];
    patrolDelay: number[] = [];
    givechase: boolean = true;
    regenRate: number = 100;
    params: ParamMap = new Map();

    decode(code: number, dat: Packet): void {
        if (code === 1) {
            const count = dat.g1();
            this.models = new Uint16Array(count);

            for (let i = 0; i < count; i++) {
                this.models[i] = dat.g2();
            }
        } else if (code === 2) {
            this.name = dat.gjstr();
        } else if (code === 3) {
            this.desc = dat.gjstr();
        } else if (code === 12) {
            this.size = dat.g1();
        } else if (code === 13) {
            this.readyanim = dat.g2();
        } else if (code === 14) {
            this.walkanim = dat.g2();
        } else if (code === 15) {
            this.turnleftanim = dat.g2();
        } else if (code === 16) {
            this.turnrightanim = dat.g2();
        } else if (code === 17) {
            this.walkanim = dat.g2();
            this.walkanim_b = dat.g2();
            this.walkanim_r = dat.g2();
            this.walkanim_l = dat.g2();
        } else if (code === 18) {
            this.category = dat.g2();
        } else if (code === 26) {
            this.wanderrange = dat.g2();
        } else if (code === 27) {
            this.maxrange = dat.g2();
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
            const count = dat.g1();
            this.headModels = new Uint16Array(count);

            for (let i = 0; i < count; i++) {
                this.headModels[i] = dat.g2();
            }
        } else if (code === 74) {
            this.stats[NpcStat.ATTACK] = dat.g2();
        } else if (code === 75) {
            this.stats[NpcStat.DEFENCE] = dat.g2();
        } else if (code === 76) {
            this.stats[NpcStat.STRENGTH] = dat.g2();
        } else if (code === 77) {
            this.stats[NpcStat.HITPOINTS] = dat.g2();
        } else if (code === 78) {
            this.stats[NpcStat.RANGED] = dat.g2();
        } else if (code === 79) {
            this.stats[NpcStat.MAGIC] = dat.g2();
        } else if (code === 90) {
            this.resizex = dat.g2();
        } else if (code === 91) {
            this.resizey = dat.g2();
        } else if (code === 92) {
            this.resizez = dat.g2();
        } else if (code === 93) {
            this.minimap = false;
        } else if (code === 95) {
            this.vislevel = dat.g2();
        } else if (code === 97) {
            this.resizeh = dat.g2();
        } else if (code === 98) {
            this.resizev = dat.g2();
        } else if (code === 99) {
            this.alwaysontop = true;
        } else if (code === 100) {
            this.ambient = dat.g1b();
        } else if (code === 101) {
            this.contrast = dat.g1b();
        } else if (code === 102) {
            this.headicon = dat.g2();
        } else if (code === 103) {
            this.turnspeed = dat.g2();
        } else if (code === 106 || code === 118) {
            let multivarbit = dat.g2();
            if (multivarbit === 65535) multivarbit = -1;
            this.multivarbit = multivarbit;

            let multivarp = dat.g2();
            if (multivarp === 65535) multivarp = -1;
            this.multivarp = multivarp;

            if (code === 118) {
                let defaultId = dat.g2();
                if (defaultId === 65535) defaultId = -1;
                this.multinpcdefault = defaultId;
            }

            const count = dat.g1();
            this.multinpc = new Array(count + 1);
            for (let i = 0; i <= count; i++) {
                let id = dat.g2();
                if (id === 65535) {
                    id = -1;
                }
                this.multinpc[i] = id;
            }
        } else if (code === 107) {
            this.active = false;
        } else if (code === 109) {
            this.walksmoothing = false;
        } else if (code === 111) {
            this.spotshadow = true;
        } else if (code === 113) {
            this.spotshadowcolour = [dat.g2(), dat.g2()];
        } else if (code === 114) {
            this.spotshadowtrans = [dat.g1b(), dat.g1b()];
        } else if (code === 115) {
            this.field2350 = dat.g1() * 4;
            this.field2329 = dat.g1() * 4;
        } else if (code === 119) {
            this.walkflags = dat.g1b();
        } else if (code === 202) {
            this.huntrange = dat.g1();
        } else if (code === 203) {
            this.timer = dat.g2();
        } else if (code === 204) {
            this.respawnrate = dat.g2();
        } else if (code === 206) {
            this.moverestrict = dat.g1();
        } else if (code === 207) {
            this.attackrange = dat.g2();
        } else if (code === 208) {
            this.blockwalk = dat.g1();
        } else if (code === 209) {
            this.huntmode = dat.g1();
        } else if (code === 210) {
            this.defaultmode = dat.g1();
        } else if (code === 211) {
            this.members = true;
        } else if (code === 212) {
            const count = dat.g1();
            this.patrolCoord = new Array(count);
            this.patrolDelay = new Array(count);
            for (let i = 0; i < count; i++) {
                this.patrolCoord[i] = dat.g4();
                this.patrolDelay[i] = dat.g1();
            }
        } else if (code === 213) {
            this.givechase = false;
        } else if (code === 214) {
            this.regenRate = dat.g2();
        } else if (code === 249) {
            this.params = ParamHelper.decodeParams(dat);
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(
                `Unrecognized npc config opcode: ${code} (debugname=${this.debugname ?? 'unknown'}).`
            );
        }
    }

    postDecode(): void {
        if (this.maxrange === -1) {
            this.maxrange = this.wanderrange + 2;
        }

        if (this.maxrange < this.wanderrange) {
            this.maxrange = this.wanderrange;
        }
    }
}
