import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import ColorConversion from '#tools/util/ColorConversion.ts';
import { MoveRestrict } from '#/engine/entity/MoveRestrict.js';
import { BlockWalk } from '#/engine/entity/BlockWalk.js';
import { NpcMode } from '#/engine/entity/NpcMode.js';
import {
    CACHE_OUT_DIR,
    CONFIG_DIR,
    PACK_DIR,
    readFlatFile,
    assembleGroupBuffer,
    loadNameToIdMap,
    readConfigFile,
    packGroupAuto,
} from '#tools/util/ConfigPackHelper.ts';

const NPC_ARCHIVE = 18;

const SERVER_ONLY_NPC_OPCODES = new Set<number>([
    18,
    74, 75, 76, 77, 78, 79,
    200, 201, 202, 203, 204, 206, 207, 208, 209, 210, 211, 212, 213, 214,
    249, 250,
]);

const MOVE_RESTRICT: Record<string, number> = {
    normal: MoveRestrict.NORMAL,
    blocked: MoveRestrict.BLOCKED,
    'blocked+normal': MoveRestrict.BLOCKED_NORMAL,
    indoors: MoveRestrict.INDOORS,
    outdoors: MoveRestrict.OUTDOORS,
    nomove: MoveRestrict.NOMOVE,
    passthru: MoveRestrict.PASSTHRU,
};

const BLOCK_WALK: Record<string, number> = {
    none: BlockWalk.NONE,
    all: BlockWalk.ALL,
    NPC: BlockWalk.NPC,
};

const DEFAULT_MODE: Record<string, number> = {
    none: NpcMode.NONE,
    wander: NpcMode.WANDER,
    patrol: NpcMode.PATROL,
};

export type NpcOpcode = {
    code: number;
    payload: any;
};

function loadNpcLocations(): Map<number, { groupId: number; fileId: number }> {
    const result = new Map<number, { groupId: number; fileId: number }>();
    const filePath = path.join(PACK_DIR, 'npc-locations.pack');
    if (!fs.existsSync(filePath)) return result;

    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const npcId = parseInt(trimmed.slice(0, eqIdx), 10);
        const [groupStr, fileStr] = trimmed.slice(eqIdx + 1).split(':');
        const groupId = parseInt(groupStr, 10);
        const fileId = parseInt(fileStr, 10);
        if (!isNaN(npcId) && !isNaN(groupId) && !isNaN(fileId)) {
            result.set(npcId, { groupId, fileId });
        }
    }

    return result;
}

function resolveNumeric(val: string, prefix: string): number {
    const m = val.match(new RegExp(`^${prefix}_(\\d+)$`));
    if (m) return parseInt(m[1], 10);
    const n = parseInt(val, 10);
    return isNaN(n) ? -1 : n;
}

function resolveByMap(val: string, map: Map<string, number>, prefix: string): number {
    const byName = map.get(val);
    if (byName !== undefined) return byName;
    return resolveNumeric(val, prefix);
}

function resolveRecolValue(val: string): number {
    if (val.startsWith('hsl:')) {
        return parseInt(val.slice(4), 10);
    }
    return ColorConversion.rgb15toHsl16(parseInt(val, 10));
}

function splitOcc(key: string): { base: string; occ: number } {
    const m = key.match(/^(.*?)#(\d+)$/);
    if (m) return { base: m[1], occ: parseInt(m[2], 10) };
    return { base: key, occ: 1 };
}

function buildOp(
    family: string,
    b: Record<string, any>,
    maps: {
        seq: Map<string, number>;
        texture: Map<string, number>;
        varbit: Map<string, number>;
        varp: Map<string, number>;
        npc: Map<string, number>;
        category: Map<string, number>;
        hunt: Map<string, number>;
        param: Map<string, number>;
    }
): NpcOpcode | null {
    switch (family) {
        case 'models':
            return { code: 1, payload: b.list as number[] };
        case 'name':
            return { code: 2, payload: b.value };
        case 'desc':
            return { code: 3, payload: b.value };
        case 'size':
            return { code: 12, payload: b.value };
        case 'readyanim':
            return { code: 13, payload: resolveByMap(b.value, maps.seq, 'seq') };
        case 'walk': {
            if (b.walkanim_b !== undefined || b.walkanim_r !== undefined || b.walkanim_l !== undefined) {
                return {
                    code: 17,
                    payload: {
                        walk: resolveByMap(b.walkanim ?? 'seq_-1', maps.seq, 'seq'),
                        walk_b: resolveByMap(b.walkanim_b ?? 'seq_-1', maps.seq, 'seq'),
                        walk_r: resolveByMap(b.walkanim_r ?? 'seq_-1', maps.seq, 'seq'),
                        walk_l: resolveByMap(b.walkanim_l ?? 'seq_-1', maps.seq, 'seq'),
                    },
                };
            }
            if (b.walkanim === undefined) return null;
            return { code: 14, payload: resolveByMap(b.walkanim, maps.seq, 'seq') };
        }
        case 'turnleftanim':
            return { code: 15, payload: resolveByMap(b.value, maps.seq, 'seq') };
        case 'turnrightanim':
            return { code: 16, payload: resolveByMap(b.value, maps.seq, 'seq') };
        case 'category':
            return { code: 18, payload: resolveByMap(b.value, maps.category, 'category') };
        case 'wanderrange':
            return { code: 26, payload: b.value };
        case 'maxrange':
            return { code: 27, payload: b.value };
        case 'op1': case 'op2': case 'op3': case 'op4': case 'op5': {
            const idx = Number(family.slice(2));
            return { code: 29 + idx, payload: b.value };
        }
        case 'recol': {
            const count = b.count as number;
            const pairs: Array<{ src: number; dst: number }> = [];
            for (let i = 1; i <= count; i++) {
                pairs.push({
                    src: resolveRecolValue(b.s?.[i] ?? '0'),
                    dst: resolveRecolValue(b.d?.[i] ?? '0'),
                });
            }
            return { code: 40, payload: pairs };
        }
        case 'retex': {
            const count = b.count as number;
            const pairs: Array<{ src: number; dst: number }> = [];
            for (let i = 1; i <= count; i++) {
                pairs.push({
                    src: resolveByMap(b.s?.[i] ?? 'texture_0', maps.texture, 'texture'),
                    dst: resolveByMap(b.d?.[i] ?? 'texture_0', maps.texture, 'texture'),
                });
            }
            return { code: 41, payload: pairs };
        }
        case 'recolpalette': {
            const count = b.count as number;
            const bytes: number[] = [];
            for (let i = 1; i <= count; i++) bytes.push(b.vals?.[i] ?? 0);
            return { code: 42, payload: bytes };
        }
        case 'heads':
            return { code: 60, payload: b.list as number[] };
        case 'minimap':
            return b.no ? { code: 93, payload: null } : null;
        case 'vislevel': {
            const v = b.value === 'hide' ? 0 : parseInt(b.value, 10);
            return { code: 95, payload: v };
        }
        case 'resizeh':
            return { code: 97, payload: b.value };
        case 'resizev':
            return { code: 98, payload: b.value };
        case 'alwaysontop':
            return b.value ? { code: 99, payload: null } : null;
        case 'ambient':
            return { code: 100, payload: b.value };
        case 'contrast':
            return { code: 101, payload: Math.trunc(b.value / 5) };
        case 'headicon':
            return { code: 102, payload: b.value };
        case 'turnspeed':
            return { code: 103, payload: b.value };
        case 'multinpc': {
            const code = b.def !== undefined ? 118 : 106;
            const varbitId = b.varbit !== undefined ? resolveByMap(b.varbit, maps.varbit, 'varbit') : -1;
            const varpId = b.varp !== undefined ? resolveByMap(b.varp, maps.varp, 'varp') : -1;
            const npcCount = (b.npcCount as number) ?? 0;
            const npcIds: number[] = [];
            for (let i = 1; i <= npcCount; i++) {
                const v = b.npcs?.[i];
                npcIds.push(v === undefined || v === 'null' ? -1 : resolveByMap(v, maps.npc, 'npc'));
            }
            const defaultId = code === 118
                ? (b.def !== undefined ? (b.def === 'null' ? -1 : resolveByMap(b.def, maps.npc, 'npc')) : -1)
                : -1;
            return { code, payload: { varbitId, varpId, npcIds, defaultId } };
        }
        case 'active':
            return b.no ? { code: 107, payload: null } : null;
        case 'walksmoothing':
            return b.no ? { code: 109, payload: null } : null;
        case 'spotshadow':
            return b.value ? { code: 111, payload: null } : null;
        case 'spotshadowcolour':
            return { code: 113, payload: b.value };
        case 'spotshadowtrans':
            return { code: 114, payload: b.value };
        case 'field2350':
            return { code: 115, payload: [Math.trunc((b.f2350 ?? 0) / 4), Math.trunc((b.f2329 ?? 0) / 4)] };
        case 'walkflags':
            return { code: 119, payload: b.value };
        case 'attack':
            return { code: 74, payload: b.value };
        case 'defence':
            return { code: 75, payload: b.value };
        case 'strength':
            return { code: 76, payload: b.value };
        case 'hitpoints':
            return { code: 77, payload: b.value };
        case 'ranged':
            return { code: 78, payload: b.value };
        case 'magic':
            return { code: 79, payload: b.value };
        case 'huntrange':
            return { code: 202, payload: b.value };
        case 'timer':
            return { code: 203, payload: b.value };
        case 'respawnrate':
            return { code: 204, payload: b.value };
        case 'moverestrict': {
            const id = MOVE_RESTRICT[b.value];
            if (id === undefined) throw new Error(`Unknown moverestrict: ${b.value}`);
            return { code: 206, payload: id };
        }
        case 'attackrange':
            return { code: 207, payload: b.value };
        case 'blockwalk': {
            const id = BLOCK_WALK[b.value];
            if (id === undefined) throw new Error(`Unknown blockwalk: ${b.value}`);
            return { code: 208, payload: id };
        }
        case 'huntmode':
            return { code: 209, payload: resolveByMap(b.value, maps.hunt, 'hunt') };
        case 'defaultmode': {
            const id = DEFAULT_MODE[b.value];
            if (id === undefined) throw new Error(`Unknown defaultmode: ${b.value}`);
            return { code: 210, payload: id };
        }
        case 'members':
            return b.value ? { code: 211, payload: null } : null;
        case 'patrol': {
            const count = b.count as number;
            const points: Array<[number, number]> = [];
            for (let i = 1; i <= count; i++) {
                const raw = b.points?.[i];
                if (raw === undefined) continue;
                const [coordPart, delayPart] = raw.split(',');
                const [levelStr, mXStr, mZStr, lXStr, lZStr] = coordPart.split('_');
                const level = parseInt(levelStr, 10);
                const mX = parseInt(mXStr, 10);
                const mZ = parseInt(mZStr, 10);
                const lX = parseInt(lXStr, 10);
                const lZ = parseInt(lZStr, 10);
                const delay = delayPart !== undefined ? parseInt(delayPart, 10) : 0;
                const x = (mX << 6) + lX;
                const z = (mZ << 6) + lZ;
                const coord = (z & 0x3fff) | ((x & 0x3fff) << 14) | ((level & 0x3) << 28);
                points.push([coord, isNaN(delay) ? 0 : delay]);
            }
            return { code: 212, payload: points };
        }
        case 'givechase':
            return b.no ? { code: 213, payload: null } : null;
        case 'regenrate':
            return { code: 214, payload: b.value };
        case 'params':
            return { code: 249, payload: b.list };
        default:
            return null;
    }
}

function parseNpcOps(
    lines: string[],
    debugName: string,
    maps: {
        seq: Map<string, number>;
        texture: Map<string, number>;
        varbit: Map<string, number>;
        varp: Map<string, number>;
        npc: Map<string, number>;
        category: Map<string, number>;
        hunt: Map<string, number>;
        param: Map<string, number>;
    }
): NpcOpcode[] {
    const ops: NpcOpcode[] = [];

    let pendingFamily: string | null = null;
    let pendingOcc = -1;
    let b: Record<string, any> = {};

    const flush = () => {
        if (pendingFamily === null) return;
        const op = buildOp(pendingFamily, b, maps);
        if (op) ops.push(op);
    };

    const enter = (family: string, occ: number): Record<string, any> => {
        if (family !== pendingFamily || occ !== pendingOcc) {
            flush();
            pendingFamily = family;
            pendingOcc = occ;
            b = {};
        }
        return b;
    };

    for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const rawKey = line.slice(0, eqIdx).trim();
        const rawVal = line.slice(eqIdx + 1);
        const val = rawVal.trim();

        const { base: key, occ } = splitOcc(rawKey);
        let m: RegExpMatchArray | null;

        if ((m = key.match(/^model(\d+)$/))) {
            const g = enter('models', occ);
            g.list = g.list ?? [];
            g.list.push(resolveNumeric(val, 'model'));
        } else if (key === 'name') {
            enter('name', occ).value = rawVal;
        } else if (key === 'desc') {
            enter('desc', occ).value = rawVal;
        } else if (key === 'size') {
            enter('size', occ).value = parseInt(val, 10);
        } else if (key === 'readyanim') {
            enter('readyanim', occ).value = val;
        } else if (key === 'walkanim') {
            enter('walk', occ).walkanim = val;
        } else if (key === 'walkanim_b') {
            enter('walk', occ).walkanim_b = val;
        } else if (key === 'walkanim_r') {
            enter('walk', occ).walkanim_r = val;
        } else if (key === 'walkanim_l') {
            enter('walk', occ).walkanim_l = val;
        } else if (key === 'turnleftanim') {
            enter('turnleftanim', occ).value = val;
        } else if (key === 'turnrightanim') {
            enter('turnrightanim', occ).value = val;
        } else if (key === 'category') {
            enter('category', occ).value = val;
        } else if ((m = key.match(/^op([1-5])$/))) {
            enter(`op${m[1]}`, occ).value = rawVal;
        } else if ((m = key.match(/^recol(\d+)s$/))) {
            const idx = parseInt(m[1], 10);
            const g = enter('recol', occ);
            g.s = g.s ?? {}; g.s[idx] = val;
            g.count = Math.max(g.count ?? 0, idx);
        } else if ((m = key.match(/^recol(\d+)d$/))) {
            const idx = parseInt(m[1], 10);
            const g = enter('recol', occ);
            g.d = g.d ?? {}; g.d[idx] = val;
            g.count = Math.max(g.count ?? 0, idx);
        } else if ((m = key.match(/^retex(\d+)s$/))) {
            const idx = parseInt(m[1], 10);
            const g = enter('retex', occ);
            g.s = g.s ?? {}; g.s[idx] = val;
            g.count = Math.max(g.count ?? 0, idx);
        } else if ((m = key.match(/^retex(\d+)d$/))) {
            const idx = parseInt(m[1], 10);
            const g = enter('retex', occ);
            g.d = g.d ?? {}; g.d[idx] = val;
            g.count = Math.max(g.count ?? 0, idx);
        } else if ((m = key.match(/^recol(\d+)d_palette$/))) {
            const idx = parseInt(m[1], 10);
            const g = enter('recolpalette', occ);
            g.vals = g.vals ?? {}; g.vals[idx] = parseInt(val, 10);
            g.count = Math.max(g.count ?? 0, idx);
        } else if ((m = key.match(/^head(\d+)$/))) {
            const g = enter('heads', occ);
            g.list = g.list ?? [];
            g.list.push(resolveNumeric(val, 'model'));
        } else if (key === 'minimap') {
            enter('minimap', occ).no = val === 'no';
        } else if (key === 'vislevel') {
            enter('vislevel', occ).value = val;
        } else if (key === 'resizeh') {
            enter('resizeh', occ).value = parseInt(val, 10);
        } else if (key === 'resizev') {
            enter('resizev', occ).value = parseInt(val, 10);
        } else if (key === 'alwaysontop') {
            enter('alwaysontop', occ).value = val === 'yes';
        } else if (key === 'ambient') {
            enter('ambient', occ).value = parseInt(val, 10);
        } else if (key === 'contrast') {
            enter('contrast', occ).value = parseInt(val, 10);
        } else if (key === 'headicon') {
            enter('headicon', occ).value = parseInt(val, 10);
        } else if (key === 'turnspeed') {
            enter('turnspeed', occ).value = parseInt(val, 10);
        } else if (key === 'multivarbit') {
            enter('multinpc', occ).varbit = val;
        } else if (key === 'multivarp') {
            enter('multinpc', occ).varp = val;
        } else if ((m = key.match(/^multinpc(\d+)$/))) {
            const idx = parseInt(m[1], 10);
            const g = enter('multinpc', occ);
            g.npcs = g.npcs ?? {}; g.npcs[idx] = val;
            g.npcCount = Math.max(g.npcCount ?? 0, idx);
        } else if (key === 'multinpcdefault') {
            enter('multinpc', occ).def = val;
        } else if (key === 'active') {
            enter('active', occ).no = val === 'no';
        } else if (key === 'walksmoothing') {
            enter('walksmoothing', occ).no = val === 'no';
        } else if (key === 'spotshadow') {
            enter('spotshadow', occ).value = val === 'yes';
        } else if (key === 'spotshadowcolour') {
            const [a, c] = val.split(',').map(s => parseInt(s, 10));
            enter('spotshadowcolour', occ).value = [a, c];
        } else if (key === 'spotshadowtrans') {
            const [a, c] = val.split(',').map(s => parseInt(s, 10));
            enter('spotshadowtrans', occ).value = [a, c];
        } else if (key === 'field2350') {
            enter('field2350', occ).f2350 = parseInt(val, 10);
        } else if (key === 'field2329') {
            enter('field2350', occ).f2329 = parseInt(val, 10);
        } else if (key === 'walkflags') {
            enter('walkflags', occ).value = parseInt(val, 10);
        } else if (key === 'param') {
            const firstComma = val.indexOf(',');
            const rest = val.slice(firstComma + 1);
            const secondComma = rest.indexOf(',');
            const typeToken = rest.slice(0, secondComma);
            const value = rest.slice(secondComma + 1);
            const g = enter('params', occ);
            g.list = g.list ?? [];
            g.list.push({ id: resolveByMap(val.slice(0, firstComma), maps.param, 'param'), isString: typeToken === 's', value });
        } else if (key === 'attack') {
            enter('attack', occ).value = parseInt(val, 10);
        } else if (key === 'defence') {
            enter('defence', occ).value = parseInt(val, 10);
        } else if (key === 'strength') {
            enter('strength', occ).value = parseInt(val, 10);
        } else if (key === 'hitpoints') {
            enter('hitpoints', occ).value = parseInt(val, 10);
        } else if (key === 'ranged') {
            enter('ranged', occ).value = parseInt(val, 10);
        } else if (key === 'magic') {
            enter('magic', occ).value = parseInt(val, 10);
        } else if (key === 'wanderrange') {
            enter('wanderrange', occ).value = parseInt(val, 10);
        } else if (key === 'maxrange') {
            enter('maxrange', occ).value = parseInt(val, 10);
        } else if (key === 'huntrange') {
            enter('huntrange', occ).value = parseInt(val, 10);
        } else if (key === 'timer') {
            enter('timer', occ).value = parseInt(val, 10);
        } else if (key === 'respawnrate') {
            enter('respawnrate', occ).value = parseInt(val, 10);
        } else if (key === 'moverestrict') {
            enter('moverestrict', occ).value = val;
        } else if (key === 'attackrange') {
            enter('attackrange', occ).value = parseInt(val, 10);
        } else if (key === 'blockwalk') {
            enter('blockwalk', occ).value = val;
        } else if (key === 'huntmode') {
            enter('huntmode', occ).value = val;
        } else if (key === 'defaultmode') {
            enter('defaultmode', occ).value = val;
        } else if (key === 'members') {
            enter('members', occ).value = val === 'yes';
        } else if ((m = key.match(/^patrol(\d+)$/))) {
            const idx = parseInt(m[1], 10);
            const g = enter('patrol', occ);
            g.points = g.points ?? {}; g.points[idx] = val;
            g.count = Math.max(g.count ?? 0, idx);
        } else if (key === 'givechase') {
            enter('givechase', occ).no = val === 'no';
        } else if (key === 'regenrate') {
            enter('regenrate', occ).value = parseInt(val, 10);
        }
    }

    flush();

    ops.push({ code: 250, payload: debugName });

    return ops;
}

function encodeNpcOps(ops: NpcOpcode[]): Uint8Array {
    const buf = new Packet(new Uint8Array(4096));

    for (const { code, payload } of ops) {
        buf.p1(code);

        switch (code) {
            case 1:
            case 60: {
                const models = payload as number[];
                buf.p1(models.length);
                for (const model of models) buf.p2(model);
                break;
            }
            case 2:
            case 3:
                buf.pjstr(payload as string);
                break;
            case 12:
                buf.p1(payload as number);
                break;
            case 13:
            case 15:
            case 16:
                buf.p2(payload as number);
                break;
            case 14:
                buf.p2(payload as number);
                break;
            case 17: {
                const p = payload as { walk: number; walk_b: number; walk_r: number; walk_l: number };
                buf.p2(p.walk);
                buf.p2(p.walk_b);
                buf.p2(p.walk_r);
                buf.p2(p.walk_l);
                break;
            }
            case 18:
                buf.p2(payload as number);
                break;
            case 30:
            case 31:
            case 32:
            case 33:
            case 34:
                buf.pjstr(payload as string);
                break;
            case 40: {
                const pairs = payload as Array<{ src: number; dst: number }>;
                buf.p1(pairs.length);
                for (const p of pairs) {
                    buf.p2(p.src);
                    buf.p2(p.dst);
                }
                break;
            }
            case 41: {
                const pairs = payload as Array<{ src: number; dst: number }>;
                buf.p1(pairs.length);
                for (const p of pairs) {
                    buf.p2(p.src);
                    buf.p2(p.dst);
                }
                break;
            }
            case 42: {
                const bytes = payload as number[];
                buf.p1(bytes.length);
                for (const b of bytes) buf.p1(b);
                break;
            }
            case 93:
                break;
            case 95:
                buf.p2(payload as number);
                break;
            case 97:
            case 98:
                buf.p2(payload as number);
                break;
            case 99:
                break;
            case 100:
            case 101:
                buf.p1(payload as number);
                break;
            case 102:
            case 103:
                buf.p2(payload as number);
                break;
            case 106:
            case 118: {
                const p = payload as { varbitId: number; varpId: number; npcIds: number[]; defaultId: number };
                buf.p2(p.varbitId === -1 ? 65535 : p.varbitId);
                buf.p2(p.varpId === -1 ? 65535 : p.varpId);
                if (code === 118) {
                    buf.p2(p.defaultId === -1 ? 65535 : p.defaultId);
                }
                buf.p1(Math.max(p.npcIds.length - 1, 0));
                for (const id of p.npcIds) buf.p2(id === -1 ? 65535 : id);
                break;
            }
            case 107:
            case 109:
            case 111:
                break;
            case 113: {
                const [a, b] = payload as [number, number];
                buf.p2(a);
                buf.p2(b);
                break;
            }
            case 114: {
                const [a, b] = payload as [number, number];
                buf.p1(a);
                buf.p1(b);
                break;
            }
            case 115: {
                const [a, b] = payload as [number, number];
                buf.p1(a);
                buf.p1(b);
                break;
            }
            case 119:
                buf.p1(payload as number);
                break;
            case 74:
            case 75:
            case 76:
            case 77:
            case 78:
            case 79:
                buf.p2(payload as number);
                break;
            case 200:
            case 201:
                buf.p2(payload as number);
                break;
            case 202:
                buf.p1(payload as number);
                break;
            case 203:
            case 204:
                buf.p2(payload as number);
                break;
            case 206:
                buf.p1(payload as number);
                break;
            case 207:
                buf.p2(payload as number);
                break;
            case 208:
            case 209:
            case 210:
                buf.p1(payload as number);
                break;
            case 211:
                break;
            case 212: {
                const points = payload as Array<[number, number]>;
                buf.p1(points.length);
                for (const [coord, delay] of points) {
                    buf.p4(coord);
                    buf.p1(delay);
                }
                break;
            }
            case 213:
                break;
            case 214:
                buf.p2(payload as number);
                break;
            case 249: {
                const params = payload as Array<{ id: number; isString: boolean; value: string }>;
                buf.p1(params.length);
                for (const param of params) {
                    buf.p1(param.isString ? 1 : 0);
                    buf.p3(param.id);
                    if (param.isString) {
                        buf.pjstr(param.value);
                    } else {
                        buf.p4(parseInt(param.value, 10));
                    }
                }
                break;
            }
            case 250:
                buf.pjstr(payload as string);
                break;
            default:
                throw new Error(`Unrecognized npc opcode: ${code}`);
        }
    }

    buf.p1(0);
    return buf.data.subarray(0, buf.pos);
}

export function pack() {
    const maps = {
        seq: loadNameToIdMap('seq.pack'),
        texture: loadNameToIdMap('texture.pack'),
        varbit: loadNameToIdMap('varbit.pack'),
        varp: loadNameToIdMap('varp.pack'),
        npc: loadNameToIdMap('npc.pack'),
        category: loadNameToIdMap('category.pack'),
        hunt: loadNameToIdMap('hunt.pack'),
        param: loadNameToIdMap('param.pack'),
    };

    const npcLocations = loadNpcLocations();
    const configBlocks = readConfigFile('all.npc');

    if (configBlocks.size === 0) {
        console.error(`No entries found in ${path.join(CONFIG_DIR, 'all.npc')}`);
        return;
    }

    const configIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, NPC_ARCHIVE);
    if (!indexData) {
        console.error(`Failed to read Npcs Archive Index (255.${NPC_ARCHIVE}) from cache.`);
        return;
    }
    configIndex.decode(indexData);

    const serverEncodedGroups = new Map<number, Map<number, Uint8Array>>();
    const clientEncodedGroups = new Map<number, Map<number, Uint8Array>>();

    for (const [name, lines] of configBlocks) {
        const npcId = maps.npc.get(name);
        if (npcId === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            continue;
        }

        const loc = npcLocations.get(npcId);
        if (!loc) {
            console.warn(`No archive location for entry [${name}] (npcId ${npcId}) — skipping.`);
            continue;
        }

        const { groupId, fileId } = loc;

        if (!serverEncodedGroups.has(groupId)) serverEncodedGroups.set(groupId, new Map());
        if (!clientEncodedGroups.has(groupId)) clientEncodedGroups.set(groupId, new Map());

        let allOps: NpcOpcode[];
        try {
            allOps = parseNpcOps(lines, name, maps);
        } catch (err) {
            console.error(`Failed to parse entry [${name}] (npcId ${npcId}):`, err);
            continue;
        }

        const clientOps = allOps.filter(op => !SERVER_ONLY_NPC_OPCODES.has(op.code));

        try {
            serverEncodedGroups.get(groupId)!.set(fileId, encodeNpcOps(allOps));
            clientEncodedGroups.get(groupId)!.set(fileId, encodeNpcOps(clientOps));
        } catch (err) {
            console.error(`Failed to encode entry [${name}] (npcId ${npcId}):`, err);
        }
    }

    const outDir = path.join(CACHE_OUT_DIR, String(NPC_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const [label, encodedGroups] of [['server', serverEncodedGroups], ['client', clientEncodedGroups]] as const) {
        for (const groupId of configIndex.groupIds) {
            const rawContainer = readFlatFile(NPC_ARCHIVE, groupId);
            configIndex.packed[groupId] = rawContainer;

            if (!configIndex.unpackGroup(groupId)) {
                console.error(`Failed to unpack Npc group ${groupId}.`);
                continue;
            }

            const filesCount = configIndex.groupSize[groupId];
            const fileIds = configIndex.fileIds[groupId];

            const encodedMap = encodedGroups.get(groupId) ?? new Map<number, Uint8Array>();

            const orderedIds = Array.from({ length: filesCount }, (_, i) => (fileIds ? fileIds[i] : i));
            const orderedFiles = orderedIds.map(id => {
                const enc = encodedMap.get(id);
                if (!enc) {
                    return configIndex.unpacked[groupId]?.[id] ?? new Uint8Array([0x00]);
                }
                return enc;
            });

            const groupBuffer = assembleGroupBuffer(orderedFiles);
            const container = packGroupAuto(groupBuffer, rawContainer);

            const suffix = label === 'server' ? '' : '.client';
            const outPath = path.join(outDir, `${groupId}${suffix}.dat`);
            fs.writeFileSync(outPath, container);
        }
    }
}

pack();
