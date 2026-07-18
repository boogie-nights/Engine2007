import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import {
    CACHE_OUT_DIR,
    loadNameToIdMap,
    assembleGroupBuffer,
    packGroupAuto,
    readFlatFile,
    findConfigFiles,
} from '#tools/util/ConfigPackHelper.ts'
import ColorConversion from '#tools/util/ColorConversion.ts';
import ObjType from '#/cache/config/ObjType.js';

const OBJ_ARCHIVE = 19;
const SERVER_ONLY_OBJ_OPCODES = new Set<number>([3, 9, 10, 13, 14, 15, 27, 75, 94, 123, 201]);

export type ObjOpcode = {
    code: number;
    payload: any;
};

type ObjSourceField = {
    key: string;
    value: string;
    line: number;
};

type ObjSourceSection = {
    name: string;
    line: number;
    fields: ObjSourceField[];
};

function parseObjSourceSections(content: string): ObjSourceSection[] {
    const lines = content.split('\n');
    const sections: ObjSourceSection[] = [];
    let current: ObjSourceSection | null = null;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
        const trimmed = line.trim();

        if (trimmed.length === 0 || trimmed.startsWith('//')) {
            continue;
        }

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            current = {
                name: trimmed.substring(1, trimmed.length - 1),
                line: i + 1,
                fields: []
            };
            sections.push(current);
            continue;
        }

        if (!current) continue;

        const eq = line.indexOf('=');
        if (eq === -1) continue;

        const key = line.substring(0, eq).trim();
        const value = line.substring(eq + 1);
        if (key.length === 0) continue;

        current.fields.push({ key, value, line: i + 1 });
    }

    return sections;
}

function parseInt2(value: string, context: string): number {
    const stripped = value.trim()
        .replace(/^model_/, '')
        .replace(/^seq_/, '')
        .replace(/^obj_/, '');
    const n = Number(stripped);
    if (!Number.isFinite(n)) {
        throw new Error(`Invalid number for ${context}: ${value}`);
    }
    return n;
}

function resolveObjRef(value: string, nameToId: Map<string, number>): number {
    const trimmed = value.trim();

    const fromMap = nameToId.get(trimmed);
    if (fromMap !== undefined) return fromMap;

    if (trimmed === 'null') return 65535;

    return parseInt2(trimmed, 'obj ref');
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

function resolveParamId(name: string, paramNameToId: Map<string, number>): number {
    const id = paramNameToId.get(name.trim());
    if (id !== undefined) return id;
    const numeric = Number(name.trim());
    if (Number.isInteger(numeric) && numeric >= 0) return numeric;
    throw new Error(`Unknown param name: ${name}`);
}

export function parseSourceObjs(
    content: string,
    nameToId: Map<string, number>,
    paramNameToId: Map<string, number>,
    categoryNameToId: Map<string, number>
): Map<number, ObjOpcode[]> {
    const sections = parseObjSourceSections(content);
    const byId = new Map<number, ObjOpcode[]>();

    for (const section of sections) {
        let id: number;
        const fromMap = nameToId.get(section.name);
        if (fromMap !== undefined) {
            id = fromMap;
        } else if (section.name.startsWith('obj_')) {
            id = parseInt2(section.name.slice(4), section.name);
        } else {
            throw new Error(`Unknown obj name: ${section.name} at line ${section.line}`);
        }

        const ops: ObjOpcode[] = [];
        const fields = section.fields;

        for (let i = 0; i < fields.length; i++) {
            const { key, value, line } = fields[i];
            const vt = value.trim();

            if (/^op[1-5]$/.test(key)) {
                const idx = Number(key[2]);
                ops.push({ code: 29 + idx, payload: vt });
                continue;
            }

            if (/^iop[1-5]$/.test(key)) {
                const idx = Number(key[3]);
                ops.push({ code: 34 + idx, payload: vt });
                continue;
            }

            if (key === 'model') {
                ops.push({ code: 1, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'name') {
                ops.push({ code: 2, payload: vt });
                continue;
            }

            if (key === 'desc') {
                ops.push({ code: 3, payload: vt });
                continue;
            }

            if (key === '2dzoom' || key === 'zoom2d') {
                ops.push({ code: 4, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === '2dxan' || key === 'xan2d') {
                ops.push({ code: 5, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === '2dyan' || key === 'yan2d') {
                ops.push({ code: 6, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === '2dxof' || key === 'xof2d') {
                ops.push({ code: 7, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === '2dyof' || key === 'yof2d') {
                ops.push({ code: 8, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'tradeable' && vt === 'no') {
                ops.push({ code: 9, payload: false });
                continue;
            }

            if (key === 'code10') {
                ops.push({ code: 10, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'stackable' && vt === 'yes') {
                ops.push({ code: 11, payload: true });
                continue;
            }

            if (key === 'cost') {
                ops.push({ code: 12, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'wearpos') {
                const resolved = ObjType.getWearPosId(vt);
                ops.push({ code: 13, payload: resolved !== -1 ? resolved : parseInt2(vt, key) });
                continue;
            }

            if (key === 'wearpos2') {
                const resolved = ObjType.getWearPosId(vt);
                ops.push({ code: 14, payload: resolved !== -1 ? resolved : parseInt2(vt, key) });
                continue;
            }

            if (key === 'wearpos3') {
                const resolved = ObjType.getWearPosId(vt);
                ops.push({ code: 15, payload: resolved !== -1 ? resolved : parseInt2(vt, key) });
                continue;
            }

            if (key === 'members' && vt === 'yes') {
                ops.push({ code: 16, payload: true });
                continue;
            }

            if (key === 'manwear') {
                const comma = vt.indexOf(',');
                const model = parseInt2(comma === -1 ? vt : vt.slice(0, comma), key);
                const offset = comma === -1 ? 0 : parseInt2(vt.slice(comma + 1), key + '.offset');
                ops.push({ code: 23, payload: { model, offset } });
                continue;
            }

            if (key === 'manwear2') {
                ops.push({ code: 24, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'womanwear') {
                const comma = vt.indexOf(',');
                const model = parseInt2(comma === -1 ? vt : vt.slice(0, comma), key);
                const offset = comma === -1 ? 0 : parseInt2(vt.slice(comma + 1), key + '.offset');
                ops.push({ code: 25, payload: { model, offset } });
                continue;
            }

            if (key === 'womanwear2') {
                ops.push({ code: 26, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'weaponanimset') {
                ops.push({ code: 27, payload: parseInt2(vt, key) });
                continue;
            }

            if (/^recol\d+s$/.test(key)) {
                const pairs: Array<{ from: number; to: number }> = [];
                let j = i;
                while (j < fields.length) {
                    const sf = fields[j];
                    const df = fields[j + 1];
                    if (!sf || !df || !/^recol\d+s$/.test(sf.key) || !/^recol\d+d$/.test(df.key)) {
                        break;
                    }
                    pairs.push({
                        from: ColorConversion.rgb15toHsl16(parseInt(sf.value.trim())),
                        to:   ColorConversion.rgb15toHsl16(parseInt(df.value.trim()))
                    });
                    j += 2;
                }
                if (pairs.length > 0) {
                    ops.push({ code: 40, payload: pairs });
                    i = j - 1;
                }
                continue;
            }

            if (/^retex\d+s$/.test(key)) {
                const pairs: Array<{ from: number; to: number }> = [];
                let j = i;
                while (j < fields.length) {
                    const sf = fields[j];
                    const df = fields[j + 1];
                    if (!sf || !df || !/^retex\d+s$/.test(sf.key) || !/^retex\d+d$/.test(df.key)) {
                        break;
                    }
                    pairs.push({
                        from: parseInt2(sf.value.trim(), sf.key),
                        to:   parseInt2(df.value.trim(), df.key)
                    });
                    j += 2;
                }
                if (pairs.length > 0) {
                    ops.push({ code: 41, payload: pairs });
                    i = j - 1;
                }
                continue;
            }

            if (/^recol\d+d_palette$/.test(key)) {
                const values: number[] = [parseInt2(vt, key)];
                while (
                    i + 1 < fields.length &&
                    /^recol\d+d_palette$/.test(fields[i + 1].key)
                ) {
                    i++;
                    values.push(parseInt2(fields[i].value.trim(), fields[i].key));
                }
                ops.push({ code: 42, payload: values });
                continue;
            }

            if (key === 'stockmarket' && vt === 'yes') {
                ops.push({ code: 65, payload: true });
                continue;
            }

            if (key === 'weight') {
                ops.push({ code: 75, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'manwear3') {
                ops.push({ code: 78, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'womanwear3') {
                ops.push({ code: 79, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'manhead') {
                ops.push({ code: 90, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'womanhead') {
                ops.push({ code: 91, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'manhead2') {
                ops.push({ code: 92, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'womanhead2') {
                ops.push({ code: 93, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'category') {
                ops.push({ code: 94, payload: resolveByMap(vt, categoryNameToId, 'category') });
                continue;
            }

            if (key === '2dzan' || key === 'zan2d') {
                ops.push({ code: 95, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'dummyitem') {
                const normalized = vt.toLowerCase();
                if (normalized === 'graphic_only') {
                    ops.push({ code: 96, payload: 1 });
                } else if (normalized === 'inv_only') {
                    ops.push({ code: 96, payload: 2 });
                } else {
                    ops.push({ code: 96, payload: parseInt2(vt, key) });
                }
                continue;
            }

            if (key === 'certlink') {
                ops.push({ code: 97, payload: resolveObjRef(vt, nameToId) });
                continue;
            }

            if (key === 'certtemplate') {
                ops.push({ code: 98, payload: resolveObjRef(vt, nameToId) });
                continue;
            }

            const countObjMatch = /^count(\d+)$/.exec(key);
            if (countObjMatch) {
                const comma = vt.indexOf(',');
                if (comma === -1) {
                    throw new Error(`Expected comma in ${key} at line ${line}: ${vt}`);
                }
                const objRef = resolveObjRef(vt.slice(0, comma), nameToId);
                const count  = parseInt2(vt.slice(comma + 1), key + '.count');
                const idx    = Number(countObjMatch[1]) - 1;
                ops.push({ code: 100 + idx, payload: { obj: objRef, count } });
                continue;
            }

            if (key === 'resizex') {
                ops.push({ code: 110, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'resizey') {
                ops.push({ code: 111, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'resizez') {
                ops.push({ code: 112, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'ambient') {
                ops.push({ code: 113, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'contrast') {
                const raw = Math.round(parseInt2(vt, key) / 5);
                ops.push({ code: 114, payload: raw });
                continue;
            }

            if (key === 'team') {
                ops.push({ code: 115, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'lentlink') {
                ops.push({ code: 121, payload: resolveObjRef(vt, nameToId) });
                continue;
            }

            if (key === 'lenttemplate') {
                ops.push({ code: 122, payload: resolveObjRef(vt, nameToId) });
                continue;
            }

            if (key === 'questreq') {
                ops.push({ code: 123, payload: parseInt2(vt, key) });
                continue;
            }

            const offsetsMatch = /^offsets(\d+)$/.exec(key);
            if (offsetsMatch) {
                const index = Number(offsetsMatch[1]);
                const parts = vt.split(',').map(s => parseInt2(s, key));
                if (parts.length !== 6) {
                    throw new Error(`Expected 6 values for ${key} at line ${line}`);
                }
                ops.push({ code: 124, payload: { index, vals: parts } });
                continue;
            }

            if (key === 'respawnrate') {
                ops.push({ code: 201, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'param') {
                const params: Array<{ string: boolean; key: number; value: number | string }> = [];
                let j = i;
                while (j < fields.length && fields[j].key === 'param') {
                    const pf = fields[j];
                    const comma = pf.value.indexOf(',');
                    if (comma === -1) {
                        throw new Error(`Expected comma in param at line ${pf.line}`);
                    }
                    const paramKey = pf.value.slice(0, comma).trim();
                    const paramVal = pf.value.slice(comma + 1).trim();
                    const isString = isNaN(Number(paramVal));
                    params.push({
                        string: isString,
                        key: resolveParamId(paramKey, paramNameToId),
                        value: isString ? paramVal : Number(paramVal)
                    });
                    j++;
                }
                ops.push({ code: 249, payload: params });
                i = j - 1;
                continue;
            }
        }

        byId.set(id, ops);
    }

    return byId;
}

export function encodeObjOps(ops: ObjOpcode[]): Uint8Array {
    const buf = new Packet(new Uint8Array(4096));

    for (const { code, payload } of ops) {
        buf.p1(code);

        if (code === 1) {
            buf.p2(Number(payload));
        } else if (code === 2) {
            buf.pjstr(String(payload ?? ''));
        } else if (code === 3) {
            buf.pjstr(String(payload ?? ''));
        } else if (code === 4 || code === 5 || code === 6) {
            buf.p2(Number(payload));
        } else if (code === 7 || code === 8) {
            buf.p2(Number(payload) & 0xffff);
        } else if (code === 9) {
        } else if (code === 10) {
            buf.p2(Number(payload));
        } else if (code === 11) {
        } else if (code === 12) {
            buf.p4(Number(payload));
        } else if (code === 13 || code === 14 || code === 15 || code === 27) {
            buf.p1(Number(payload) & 0xff);
        } else if (code === 16) {
        } else if (code === 23) {
            buf.p2(Number(payload.model));
            buf.p1(Number(payload.offset) & 0xff);
        } else if (code === 24) {
            buf.p2(Number(payload));
        } else if (code === 25) {
            buf.p2(Number(payload.model));
            buf.p1(Number(payload.offset) & 0xff);
        } else if (code === 26) {
            buf.p2(Number(payload));
        } else if (code >= 30 && code < 40) {
            buf.pjstr(String(payload ?? ''));
        } else if (code === 40 || code === 41) {
            const pairs = (payload ?? []) as Array<{ from: number; to: number }>;
            buf.p1(pairs.length);
            for (const pair of pairs) {
                buf.p2(Number(pair.from));
                buf.p2(Number(pair.to));
            }
        } else if (code === 42) {
            const values = (payload ?? []) as number[];
            buf.p1(values.length);
            for (const v of values) {
                buf.p1(Number(v) & 0xff);
            }
        } else if (code === 65) {
        } else if (code === 75) {
            buf.p2(Number(payload) & 0xffff);
        } else if (code === 78 || code === 79 ||
                   code === 90 || code === 91 || code === 92 || code === 93 || code === 95) {
            buf.p2(Number(payload));
        } else if (code === 94) {
            buf.p2(Number(payload) & 0xffff);
        } else if (code === 96) {
            buf.p1(Number(payload) & 0xff);
        } else if (code === 97 || code === 98) {
            buf.p2(Number(payload));
        } else if (code >= 100 && code < 110) {
            buf.p2(Number(payload.obj));
            buf.p2(Number(payload.count));
        } else if (code === 110 || code === 111 || code === 112) {
            buf.p2(Number(payload));
        } else if (code === 113 || code === 114) {
            buf.p1(Number(payload) & 0xff);
        } else if (code === 115) {
            buf.p1(Number(payload) & 0xff);
        } else if (code === 121 || code === 122) {
            buf.p2(Number(payload));
        } else if (code === 123) {
            buf.p2(Number(payload) & 0xffff);
        } else if (code === 124) {
            buf.p1(Number(payload.index) & 0xff);
            const vals = payload.vals as number[];
            for (let i = 0; i < 6; i++) {
                buf.p2(Number(vals[i] ?? 0) & 0xffff);
            }
        } else if (code === 201) {
            buf.p2(Number(payload) & 0xffff);
        } else if (code === 249) {
            const params = (payload ?? []) as Array<{
                string: boolean;
                key: number;
                value: number | string;
            }>;
            buf.p1(params.length);
            for (const p of params) {
                buf.p1(p.string ? 1 : 0);
                buf.p3(p.key);
                if (p.string) {
                    buf.pjstr(String(p.value));
                } else {
                    buf.p4(Number(p.value));
                }
            }
        } else {
            throw new Error(`Unrecognized obj opcode: ${code}`);
        }
    }

    buf.p1(0);
    return new Uint8Array(buf.data.subarray(0, buf.pos));
}

export function pack() {
    const objNameToId    = loadNameToIdMap('obj.pack');
    const paramNameToId  = loadNameToIdMap('param.pack');
    const categoryNameToId = loadNameToIdMap('category.pack');

    const files = findConfigFiles('.obj');
    if (files.size === 0) {
        console.error('No .obj entries found.');
        return;
    }

    const objOpsById = new Map<number, ObjOpcode[]>();

    for (const file of files) {
        const sourceContent = fs.readFileSync(file, 'utf-8');
        const fileOpsById = parseSourceObjs(sourceContent, objNameToId, paramNameToId, categoryNameToId);

        for (const [id, ops] of fileOpsById) {
            if (objOpsById.has(id)) {
                throw new Error(`Duplicate obj config for id ${id} — also found in ${file}`);
            }
            objOpsById.set(id, ops);
        }
    }

    const serverOpsById = objOpsById;
    const clientOpsById = new Map(
        [...objOpsById.entries()].map(([id, ops]) => [
            id,
            ops.filter(op => !SERVER_ONLY_OBJ_OPCODES.has(op.code))
        ])
    );

    try {
        const objIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, OBJ_ARCHIVE);
        if (!indexData) {
            console.error('Failed to read Obj Archive Index (255.19).');
            return;
        }
        objIndex.decode(indexData);

        const groupCount = objIndex.capacity;

        for (let g = 0; g < groupCount; g++) {
            if (objIndex.groupSize[g] === 0) continue;
            const raw = readFlatFile(OBJ_ARCHIVE, g);
            if (!raw) continue;
            objIndex.packed[g] = raw;
            objIndex.unpackGroup(g);
        }

        const outDir = path.join(CACHE_OUT_DIR, String(OBJ_ARCHIVE));
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        let totalEncoded = 0;

        for (const [label, opsById] of [['server', serverOpsById], ['client', clientOpsById]] as const) {
            for (let g = 0; g < groupCount; g++) {
                const filesCount = objIndex.groupSize[g];
                if (filesCount === 0) continue;

                const rawContainer = objIndex.packed[g];
                if (!rawContainer) continue;

                const fileIds = objIndex.fileIds[g];
                const orderedIds = Array.from(
                    { length: filesCount },
                    (_, i) => fileIds ? fileIds[i] : i
                );

                const orderedFiles = orderedIds.map(fileId => {
                    const objId = (g << 8) | fileId;
                    const ops = opsById.get(objId);

                    if (ops !== undefined) {
                        return encodeObjOps(ops);
                    }

                    const orig = objIndex.unpacked[g]?.[fileId];
                    if (!orig) {
                        return new Uint8Array([0x00]);
                    }
                    return orig;
                });

                const groupBuffer = assembleGroupBuffer(orderedFiles);
                const container = packGroupAuto(groupBuffer, rawContainer);

                const suffix = label === 'server' ? '' : '.client';
                const outPath = path.join(outDir, `${g}${suffix}.dat`);
                fs.writeFileSync(outPath, container);

                if (label === 'server') totalEncoded += orderedFiles.length;
            }
        }

    } catch {}
}

pack();
