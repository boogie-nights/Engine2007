import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import ColorConversion from '#tools/util/ColorConversion.ts';
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

const LOC_ARCHIVE = 16;
const SERVER_ONLY_LOC_OPCODES = new Set<number>([61, 249, 250]);

export type LocOpcode = {
    code: number;
    payload: any;
};

function loadLocLocations(): Map<number, { groupId: number; fileId: number }> {
    const result = new Map<number, { groupId: number; fileId: number }>();
    const filePath = path.join(PACK_DIR, 'loc-locations.pack');
    if (!fs.existsSync(filePath)) return result;

    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const locId = parseInt(trimmed.slice(0, eqIdx), 10);
        const [groupStr, fileStr] = trimmed.slice(eqIdx + 1).split(':');
        const groupId = parseInt(groupStr, 10);
        const fileId = parseInt(fileStr, 10);
        if (!isNaN(locId) && !isNaN(groupId) && !isNaN(fileId)) {
            result.set(locId, { groupId, fileId });
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

function sortedOccs<T>(m: Map<number, T>): number[] {
    return Array.from(m.keys()).sort((a, b) => a - b);
}

function parseLocOps(
    lines: string[],
    debugName: string,
    maps: {
        seq: Map<string, number>;
        texture: Map<string, number>;
        varbit: Map<string, number>;
        varp: Map<string, number>;
        loc: Map<string, number>;
        category: Map<string, number>;
        param: Map<string, number>;
        model: Map<string, number>;
    }
): LocOpcode[] {
    const ops: LocOpcode[] = [];

    type Bag = Record<string, any>;
    const families = new Map<string, Map<number, Bag>>();
    const bag = (family: string, occ: number): Bag => {
        let m = families.get(family);
        if (!m) { m = new Map(); families.set(family, m); }
        let b = m.get(occ);
        if (!b) { b = {}; m.set(occ, b); }
        return b;
    };
    const famMap = (family: string): Map<number, Bag> => families.get(family) ?? new Map();

    for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const rawKey = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();

        const { base: key, occ } = splitOcc(rawKey);
        let m: RegExpMatchArray | null;

        if ((m = key.match(/^model(\d+)$/))) {
            const parts = val.split(',');
            const modelId = resolveByMap(parts[0], maps.model, 'model');
            const shapeToken = parts[1] !== undefined ? parts[1].trim() : '0';
            const compact = shapeToken === 'default';
            const shape = compact ? 10 : parseInt(shapeToken, 10);
            const b = bag('models', occ);
            b.list = b.list ?? [];
            b.list.push({ model: modelId, shape, compact });
        } else if (key === 'name') {
            bag('name', occ).value = val;
        } else if (key === 'desc') {
            bag('desc', occ).value = val;
        } else if (key === 'hasalpha') {
            bag('hasalpha', occ).value = val === 'yes';
        } else if (key === 'width') {
            bag('width', occ).value = parseInt(val, 10);
        } else if (key === 'length') {
            bag('length', occ).value = parseInt(val, 10);
        } else if (key === 'blockrange') {
            bag('blockflags', occ).rangeNo = val === 'no';
        } else if (key === 'blockwalk') {
            bag('blockflags', occ).walkVal = val;
        } else if (key === 'active') {
            bag('active', occ).value = val;
        } else if (key === 'skewType') {
            bag('skew', occ).type = parseInt(val, 10);
        } else if (key === 'skewAmount') {
            bag('skew', occ).amount = parseInt(val, 10);
        } else if (key === 'sharelight') {
            bag('sharelight', occ).value = val === 'yes';
        } else if (key === 'occlude') {
            bag('occlude', occ).value = val === 'yes';
        } else if (key === 'anim') {
            bag('anim', occ).value = val;
        } else if (key === 'wallwidth') {
            bag('wallwidth', occ).value = parseInt(val, 10);
        } else if (key === 'ambient') {
            bag('ambient', occ).value = parseInt(val, 10);
        } else if (key === 'contrast') {
            bag('contrast', occ).value = parseInt(val, 10);
        } else if ((m = key.match(/^op([1-5])$/))) {
            bag(`op${m[1]}`, occ).value = val;
        } else if ((m = key.match(/^recol(\d+)s$/))) {
            const idx = parseInt(m[1], 10);
            const b = bag('recol', occ);
            b.s = b.s ?? {}; b.s[idx] = val;
            b.count = Math.max(b.count ?? 0, idx);
        } else if ((m = key.match(/^recol(\d+)d$/))) {
            const idx = parseInt(m[1], 10);
            const b = bag('recol', occ);
            b.d = b.d ?? {}; b.d[idx] = val;
            b.count = Math.max(b.count ?? 0, idx);
        } else if ((m = key.match(/^retex(\d+)s$/))) {
            const idx = parseInt(m[1], 10);
            const b = bag('retex', occ);
            b.s = b.s ?? {}; b.s[idx] = resolveByMap(val, maps.texture, 'texture');
            b.count = Math.max(b.count ?? 0, idx);
        } else if ((m = key.match(/^retex(\d+)d$/))) {
            const idx = parseInt(m[1], 10);
            const b = bag('retex', occ);
            b.d = b.d ?? {}; b.d[idx] = resolveByMap(val, maps.texture, 'texture');
            b.count = Math.max(b.count ?? 0, idx);
        } else if ((m = key.match(/^recol(\d+)d_palette$/))) {
            const idx = parseInt(m[1], 10);
            const b = bag('recolpalette', occ);
            b.vals = b.vals ?? {}; b.vals[idx] = parseInt(val, 10);
            b.count = Math.max(b.count ?? 0, idx);
        } else if (key === 'mapfunction') {
            bag('mapfunction', occ).value = parseInt(val, 10);
        } else if (key === 'category') {
            bag('category', occ).value = val;
        } else if (key === 'mirror') {
            bag('mirror', occ).value = val === 'yes';
        } else if (key === 'shadow') {
            bag('shadow', occ).value = val === 'no';
        } else if (key === 'resizex') {
            bag('resizex', occ).value = parseInt(val, 10);
        } else if (key === 'resizey') {
            bag('resizey', occ).value = parseInt(val, 10);
        } else if (key === 'resizez') {
            bag('resizez', occ).value = parseInt(val, 10);
        } else if (key === 'mapscene') {
            bag('mapscene', occ).value = parseInt(val, 10);
        } else if (key === 'forceapproach') {
            bag('forceapproach', occ).value = val;
        } else if (key === 'offsetx') {
            bag('offsetx', occ).value = parseInt(val, 10);
        } else if (key === 'offsety') {
            bag('offsety', occ).value = parseInt(val, 10);
        } else if (key === 'offsetz') {
            bag('offsetz', occ).value = parseInt(val, 10);
        } else if (key === 'forcedecor') {
            bag('forcedecor', occ).value = val === 'yes';
        } else if (key === 'breakroutefinding') {
            bag('breakroutefinding', occ).value = val === 'yes';
        } else if (key === 'raiseobject') {
            bag('raiseobject', occ).value = val;
        } else if (key === 'multivarbit') {
            bag('multiloc', occ).varbit = val;
        } else if (key === 'multivarp') {
            bag('multiloc', occ).varp = val;
        } else if ((m = key.match(/^multiloc(\d+)$/))) {
            const idx = parseInt(m[1], 10);
            const b = bag('multiloc', occ);
            b.locs = b.locs ?? {}; b.locs[idx] = val;
            b.locCount = Math.max(b.locCount ?? 0, idx);
        } else if (key === 'multilocdefault') {
            bag('multiloc', occ).def = val;
        } else if (key === 'bgsound_sound') {
            bag('bgsound', occ).sound = parseInt(val, 10);
        } else if (key === 'bgsound_range') {
            bag('bgsound', occ).range = parseInt(val, 10);
        } else if (key === 'bgsound_mindelay') {
            bag('bgsound', occ).mindelay = parseInt(val, 10);
        } else if (key === 'bgsound_maxdelay') {
            bag('bgsound', occ).maxdelay = parseInt(val, 10);
        } else if (key === 'bgsound_random') {
            bag('bgsound', occ).random = val.split(',').filter(s => s.length > 0).map(s => parseInt(s, 10));
        } else if (key === 'unknown82') {
            bag('unknown82', occ).value = val === 'yes';
        } else if (key === 'unknown88') {
            bag('unknown88', occ).value = val === 'yes';
        } else if (key === 'randomanimframe') {
            bag('randomanimframe', occ).value = val === 'no';
        } else if (key === 'field2799') {
            bag('field2799', occ).value = val === 'yes';
        } else if (key === 'members') {
            bag('members', occ).value = val === 'yes';
        } else if (key === 'param') {
            const firstComma = val.indexOf(',');
            const idStr = val.slice(0, firstComma);
            const rest = val.slice(firstComma + 1);
            const secondComma = rest.indexOf(',');
            const typeToken = rest.slice(0, secondComma);
            const value = rest.slice(secondComma + 1);
            const id = resolveByMap(idStr, maps.param, 'param');
            const isString = typeToken === 's';
            const b = bag('params', occ);
            b.list = b.list ?? [];
            b.list.push({ id, isString, value });
        }
    }

    for (const occ of sortedOccs(famMap('models'))) {
        const list = famMap('models').get(occ)!.list as Array<{ model: number; shape: number; compact: boolean }>;
        const allCompact = list.every(m => m.compact);
        if (allCompact) {
            ops.push({ code: 5, payload: list.map(m => m.model) });
        } else {
            ops.push({ code: 1, payload: list.map(m => ({ model: m.model, shape: m.shape })) });
        }
    }

    for (const occ of sortedOccs(famMap('name'))) {
        ops.push({ code: 2, payload: famMap('name').get(occ)!.value });
    }

    for (const occ of sortedOccs(famMap('desc'))) {
        ops.push({ code: 3, payload: famMap('desc').get(occ)!.value });
    }

    for (const occ of sortedOccs(famMap('hasalpha'))) {
        if (famMap('hasalpha').get(occ)!.value) ops.push({ code: 25, payload: null });
    }

    for (const occ of sortedOccs(famMap('width'))) {
        ops.push({ code: 14, payload: famMap('width').get(occ)!.value });
    }

    for (const occ of sortedOccs(famMap('length'))) {
        ops.push({ code: 15, payload: famMap('length').get(occ)!.value });
    }

    for (const occ of sortedOccs(famMap('blockflags'))) {
        const b = famMap('blockflags').get(occ)!;
        if (b.rangeNo && b.walkVal === '0') {
            ops.push({ code: 17, payload: null });
        } else {
            if (b.rangeNo) ops.push({ code: 18, payload: null });
            if (b.walkVal === '1') ops.push({ code: 27, payload: null });
        }
    }

    for (const occ of sortedOccs(famMap('active'))) {
        ops.push({ code: 19, payload: famMap('active').get(occ)!.value === 'yes' });
    }

    for (const occ of sortedOccs(famMap('skew'))) {
        const b = famMap('skew').get(occ)!;
        if (b.type === 1) {
            ops.push({ code: 21, payload: null });
        } else if (b.type === 2) {
            const xSigned = Math.trunc((b.amount ?? 0) / 256);
            ops.push({ code: 81, payload: xSigned });
        } else if (b.type === 3) {
            ops.push({ code: 93, payload: b.amount ?? 0 });
        } else if (b.type === 4) {
            ops.push({ code: 94, payload: null });
        } else if (b.type === 5) {
            ops.push({ code: 95, payload: null });
        }
    }

    for (const occ of sortedOccs(famMap('sharelight'))) {
        if (famMap('sharelight').get(occ)!.value) ops.push({ code: 22, payload: null });
    }

    for (const occ of sortedOccs(famMap('occlude'))) {
        if (famMap('occlude').get(occ)!.value) ops.push({ code: 23, payload: null });
    }

    for (const occ of sortedOccs(famMap('anim'))) {
        const val = famMap('anim').get(occ)!.value as string;
        const id = val === 'null' ? -1 : resolveByMap(val, maps.seq, 'seq');
        ops.push({ code: 24, payload: id });
    }

    for (const occ of sortedOccs(famMap('wallwidth'))) {
        ops.push({ code: 28, payload: famMap('wallwidth').get(occ)!.value });
    }

    for (const occ of sortedOccs(famMap('ambient'))) {
        ops.push({ code: 29, payload: famMap('ambient').get(occ)!.value });
    }

    for (const occ of sortedOccs(famMap('contrast'))) {
        ops.push({ code: 39, payload: Math.trunc(famMap('contrast').get(occ)!.value / 5) });
    }

    for (let idx = 1; idx <= 5; idx++) {
        for (const occ of sortedOccs(famMap(`op${idx}`))) {
            ops.push({ code: 30 + (idx - 1), payload: famMap(`op${idx}`).get(occ)!.value });
        }
    }

    for (const occ of sortedOccs(famMap('recol'))) {
        const b = famMap('recol').get(occ)!;
        const count = b.count as number;
        const pairs: Array<{ src: number; dst: number }> = [];
        for (let i = 1; i <= count; i++) {
            const srcVal = b.s?.[i] ?? '0';
            const dstVal = b.d?.[i] ?? '0';
            pairs.push({
                src: resolveRecolValue(srcVal),
                dst: resolveRecolValue(dstVal),
            });
        }
        ops.push({ code: 40, payload: pairs });
    }

    for (const occ of sortedOccs(famMap('retex'))) {
        const b = famMap('retex').get(occ)!;
        const count = b.count as number;
        const pairs: Array<{ src: number; dst: number }> = [];
        for (let i = 1; i <= count; i++) {
            pairs.push({ src: b.s?.[i] ?? 0, dst: b.d?.[i] ?? 0 });
        }
        ops.push({ code: 41, payload: pairs });
    }

    for (const occ of sortedOccs(famMap('recolpalette'))) {
        const b = famMap('recolpalette').get(occ)!;
        const count = b.count as number;
        const bytes: number[] = [];
        for (let i = 1; i <= count; i++) bytes.push(b.vals?.[i] ?? 0);
        ops.push({ code: 42, payload: bytes });
    }

    for (const occ of sortedOccs(famMap('mapfunction'))) {
        ops.push({ code: 60, payload: famMap('mapfunction').get(occ)!.value });
    }

    for (const occ of sortedOccs(famMap('category'))) {
        const val = famMap('category').get(occ)!.value as string;
        ops.push({ code: 61, payload: resolveByMap(val, maps.category, 'category') });
    }

    for (const occ of sortedOccs(famMap('mirror'))) {
        if (famMap('mirror').get(occ)!.value) ops.push({ code: 62, payload: null });
    }

    for (const occ of sortedOccs(famMap('shadow'))) {
        if (famMap('shadow').get(occ)!.value) ops.push({ code: 64, payload: null });
    }

    for (const occ of sortedOccs(famMap('resizex'))) {
        ops.push({ code: 65, payload: famMap('resizex').get(occ)!.value });
    }
    for (const occ of sortedOccs(famMap('resizey'))) {
        ops.push({ code: 66, payload: famMap('resizey').get(occ)!.value });
    }
    for (const occ of sortedOccs(famMap('resizez'))) {
        ops.push({ code: 67, payload: famMap('resizez').get(occ)!.value });
    }

    for (const occ of sortedOccs(famMap('mapscene'))) {
        ops.push({ code: 68, payload: famMap('mapscene').get(occ)!.value });
    }

    for (const occ of sortedOccs(famMap('forceapproach'))) {
        const val = famMap('forceapproach').get(occ)!.value as string;
        let flags = 0b1111;
        switch (val) {
            case 'north': flags &= ~0b0001; break;
            case 'east': flags &= ~0b0010; break;
            case 'south': flags &= ~0b0100; break;
            case 'west': flags &= ~0b1000; break;
        }
        ops.push({ code: 69, payload: flags });
    }

    for (const occ of sortedOccs(famMap('offsetx'))) {
        ops.push({ code: 70, payload: famMap('offsetx').get(occ)!.value });
    }
    for (const occ of sortedOccs(famMap('offsety'))) {
        ops.push({ code: 71, payload: famMap('offsety').get(occ)!.value });
    }
    for (const occ of sortedOccs(famMap('offsetz'))) {
        ops.push({ code: 72, payload: famMap('offsetz').get(occ)!.value });
    }

    for (const occ of sortedOccs(famMap('forcedecor'))) {
        if (famMap('forcedecor').get(occ)!.value) ops.push({ code: 73, payload: null });
    }
    for (const occ of sortedOccs(famMap('breakroutefinding'))) {
        if (famMap('breakroutefinding').get(occ)!.value) ops.push({ code: 74, payload: null });
    }
    for (const occ of sortedOccs(famMap('raiseobject'))) {
        ops.push({ code: 75, payload: famMap('raiseobject').get(occ)!.value === 'yes' });
    }

    for (const occ of sortedOccs(famMap('multiloc'))) {
        const b = famMap('multiloc').get(occ)!;
        const varbitId = b.varbit !== undefined ? resolveByMap(b.varbit, maps.varbit, 'varbit') : -1;
        const varpId = b.varp !== undefined ? resolveByMap(b.varp, maps.varp, 'varp') : -1;
        const locCount = (b.locCount as number) ?? 0;
        const locIds: number[] = [];
        for (let i = 1; i <= locCount; i++) {
            const v = b.locs?.[i];
            locIds.push(v === undefined ? -1 : (v === 'null' ? -1 : resolveByMap(v, maps.loc, 'loc')));
        }
        const defaultId = b.def !== undefined
            ? (b.def === 'null' ? -1 : resolveByMap(b.def, maps.loc, 'loc'))
            : -1;

        ops.push({
            code: b.def !== undefined ? 92 : 77,
            payload: { varbitId, varpId, locIds, defaultId },
        });
    }

    for (const occ of sortedOccs(famMap('bgsound'))) {
        const b = famMap('bgsound').get(occ)!;
        if (b.random !== undefined || b.mindelay !== undefined) {
            ops.push({
                code: 79,
                payload: {
                    mindelay: b.mindelay ?? 0,
                    maxdelay: b.maxdelay ?? 0,
                    range: b.range ?? 0,
                    sounds: b.random ?? [],
                },
            });
        } else if (b.sound !== undefined) {
            ops.push({ code: 78, payload: { sound: b.sound, range: b.range ?? 0 } });
        }
    }

    for (const occ of sortedOccs(famMap('unknown82'))) {
        if (famMap('unknown82').get(occ)!.value) ops.push({ code: 82, payload: null });
    }
    for (const occ of sortedOccs(famMap('unknown88'))) {
        if (famMap('unknown88').get(occ)!.value) ops.push({ code: 88, payload: null });
    }
    for (const occ of sortedOccs(famMap('randomanimframe'))) {
        if (famMap('randomanimframe').get(occ)!.value) ops.push({ code: 89, payload: null });
    }
    for (const occ of sortedOccs(famMap('field2799'))) {
        if (famMap('field2799').get(occ)!.value) ops.push({ code: 90, payload: null });
    }
    for (const occ of sortedOccs(famMap('members'))) {
        if (famMap('members').get(occ)!.value) ops.push({ code: 91, payload: null });
    }

    for (const occ of sortedOccs(famMap('params'))) {
        ops.push({ code: 249, payload: famMap('params').get(occ)!.list });
    }

    ops.push({ code: 250, payload: debugName });

    return ops;
}

function encodeLocOps(ops: LocOpcode[]): Uint8Array {
    const buf = new Packet(new Uint8Array(4096));

    for (const { code, payload } of ops) {
        buf.p1(code);

        switch (code) {
            case 1: {
                const models = payload as Array<{ model: number; shape: number }>;
                buf.p1(models.length);
                for (const m of models) {
                    buf.p2(m.model);
                    buf.p1(m.shape);
                }
                break;
            }
            case 5: {
                const models = payload as number[];
                buf.p1(models.length);
                for (const model of models) buf.p2(model);
                break;
            }
            case 2:
            case 3:
                buf.pjstr(payload as string);
                break;
            case 14:
            case 15:
            case 28:
                buf.p1(payload as number);
                break;
            case 17:
            case 18:
            case 21:
            case 22:
            case 25:
            case 23:
            case 27:
            case 62:
            case 64:
            case 73:
            case 74:
            case 82:
            case 88:
            case 89:
            case 90:
            case 91:
            case 94:
            case 95:
                break;
            case 19:
            case 75:
                buf.p1(payload ? 1 : 0);
                break;
            case 24:
                buf.p2(payload as number);
                break;
            case 29:
            case 39:
            case 81:
                buf.p1(payload as number);
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
            case 60:
            case 65:
            case 66:
            case 67:
            case 68:
                buf.p2(payload as number);
                break;
            case 61:
                buf.p2(payload as number);
                break;
            case 69:
                buf.p1(payload as number);
                break;
            case 70:
            case 71:
            case 72:
                buf.p2(payload as number);
                break;
            case 77:
            case 92: {
                const p = payload as { varbitId: number; varpId: number; locIds: number[]; defaultId: number };
                buf.p2(p.varbitId === -1 ? 65535 : p.varbitId);
                buf.p2(p.varpId === -1 ? 65535 : p.varpId);
                buf.p1(Math.max(p.locIds.length - 1, 0));
                for (const id of p.locIds) buf.p2(id === -1 ? 65535 : id);
                if (code === 92) {
                    buf.p2(p.defaultId === -1 ? 65535 : p.defaultId);
                }
                break;
            }
            case 78: {
                const p = payload as { sound: number; range: number };
                buf.p2(p.sound);
                buf.p1(p.range);
                break;
            }
            case 79: {
                const p = payload as { mindelay: number; maxdelay: number; range: number; sounds: number[] };
                buf.p2(p.mindelay);
                buf.p2(p.maxdelay);
                buf.p1(p.range);
                buf.p1(p.sounds.length);
                for (const s of p.sounds) buf.p2(s);
                break;
            }
            case 93:
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
                throw new Error(`Unrecognized loc opcode: ${code}`);
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
        loc: loadNameToIdMap('loc.pack'),
        category: loadNameToIdMap('category.pack'),
        param: loadNameToIdMap('param.pack'),
        model: loadNameToIdMap('model.pack'),
    };

    const locLocations = loadLocLocations();
    const configBlocks    = readConfigFile('.loc');

    if (configBlocks.size === 0) {
        console.error('No .loc entries found');
        return;
    }

    const configIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, LOC_ARCHIVE);
    if (!indexData) {
        console.error(`Failed to read Locs Archive Index (255.${LOC_ARCHIVE}) from cache.`);
        return;
    }
    configIndex.decode(indexData);

    const serverEncodedGroups = new Map<number, Map<number, Uint8Array>>();
    const clientEncodedGroups = new Map<number, Map<number, Uint8Array>>();

    for (const [name, lines] of configBlocks) {
        const locId = maps.loc.get(name);
        if (locId === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            continue;
        }

        const loc = locLocations.get(locId);
        if (!loc) {
            console.warn(`No archive location for entry [${name}] (locId ${locId}) — skipping.`);
            continue;
        }

        const { groupId, fileId } = loc;

        if (!serverEncodedGroups.has(groupId)) serverEncodedGroups.set(groupId, new Map());
        if (!clientEncodedGroups.has(groupId)) clientEncodedGroups.set(groupId, new Map());

        let allOps: LocOpcode[];
        try {
            allOps = parseLocOps(lines, name, maps);
        } catch (err) {
            console.error(`Failed to parse entry [${name}] (locId ${locId}):`, err);
            continue;
        }

        const clientOps = allOps.filter(op => !SERVER_ONLY_LOC_OPCODES.has(op.code));

        try {
            serverEncodedGroups.get(groupId)!.set(fileId, encodeLocOps(allOps));
            clientEncodedGroups.get(groupId)!.set(fileId, encodeLocOps(clientOps));
        } catch (err) {
            console.error(`Failed to encode entry [${name}] (locId ${locId}):`, err);
        }
    }

    const outDir = path.join(CACHE_OUT_DIR, String(LOC_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const [label, encodedGroups] of [['server', serverEncodedGroups], ['client', clientEncodedGroups]] as const) {
        for (const groupId of configIndex.groupIds) {
            const rawContainer = readFlatFile(LOC_ARCHIVE, groupId);
            configIndex.packed[groupId] = rawContainer;

            if (!configIndex.unpackGroup(groupId)) {
                console.error(`Failed to unpack Loc group ${groupId}.`);
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
