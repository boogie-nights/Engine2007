import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import ColorConversion from '#tools/util/ColorConversion.ts';
import {
    CACHE_OUT_DIR,
    readFlatFile,
    assembleGroupBuffer,
    packGroupAuto,
    loadNameToIdMap,
    readConfigFile,
} from '#tools/util/ConfigPackHelper.ts';

const CONFIG_ARCHIVE = 2;
const IDK_GROUP = 3;

const IDK_PART_TYPE_IDS: Record<string, number> = {
    man_hair: 0,
    man_jaw: 1,
    man_torso: 2,
    man_arms: 3,
    man_hands: 4,
    man_legs: 5,
    man_feet: 6,
    woman_hair: 7,
    woman_jaw: 8,
    woman_torso: 9,
    woman_arms: 10,
    woman_hands: 11,
    woman_legs: 12,
    woman_feet: 13,
};

type IdkOpcode = {
    code: number;
    payload: any;
};

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

function parseIdkFields(
    name: string,
    lines: string[],
    maps: { model: Map<string, number> }
): IdkOpcode[] {
    const ops: IdkOpcode[] = [];

    let pendingFamily: string | null = null;
    let b: Record<string, any> = {};

    const flushPairBlock = (code: number) => {
        const count = (b.count as number) ?? 0;
        if (count === 0) return;
        const pairs: Array<{ retex: number; recol: number }> = [];
        for (let i = 1; i <= count; i++) {
            pairs.push({
                retex: b.retex?.[i] !== undefined ? parseInt(b.retex[i], 10) : 0,
                recol: b.recol?.[i] !== undefined ? resolveRecolValue(b.recol[i]) : 0,
            });
        }
        ops.push({ code, payload: pairs });
    };

    const flush = () => {
        if (pendingFamily === 'model') {
            const count = (b.count as number) ?? 0;
            if (count > 0) {
                const models: number[] = [];
                for (let i = 1; i <= count; i++) models.push(b.list?.[i] ?? 0);
                ops.push({ code: 2, payload: models });
            }
        } else if (pendingFamily === 'dst') {
            flushPairBlock(40);
        } else if (pendingFamily === 'src') {
            flushPairBlock(41);
        }
        pendingFamily = null;
        b = {};
    };

    const enter = (family: string): Record<string, any> => {
        if (family !== pendingFamily) {
            flush();
            pendingFamily = family;
        }
        return b;
    };

    for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const rawKey = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();

        let m: RegExpMatchArray | null;

        if (rawKey === 'type') {
            flush();
            const id = IDK_PART_TYPE_IDS[val];
            ops.push({ code: 1, payload: id !== undefined ? id : parseInt(val, 10) });
        } else if ((m = rawKey.match(/^model(\d+)$/))) {
            const g = enter('model');
            const idx = parseInt(m[1], 10);
            g.list = g.list ?? {};
            g.list[idx] = resolveByMap(val, maps.model, 'model');
            g.count = Math.max(g.count ?? 0, idx);
        } else if (rawKey === 'disable') {
            flush();
            if (val === 'yes') ops.push({ code: 3, payload: null });
        } else if ((m = rawKey.match(/^retex_d(\d+)$/))) {
            const g = enter('dst');
            const idx = parseInt(m[1], 10);
            g.retex = g.retex ?? {};
            g.retex[idx] = val;
            g.count = Math.max(g.count ?? 0, idx);
        } else if ((m = rawKey.match(/^recol_d(\d+)$/))) {
            const g = enter('dst');
            const idx = parseInt(m[1], 10);
            g.recol = g.recol ?? {};
            g.recol[idx] = val;
            g.count = Math.max(g.count ?? 0, idx);
        } else if ((m = rawKey.match(/^retex_s(\d+)$/))) {
            const g = enter('src');
            const idx = parseInt(m[1], 10);
            g.retex = g.retex ?? {};
            g.retex[idx] = val;
            g.count = Math.max(g.count ?? 0, idx);
        } else if ((m = rawKey.match(/^recol_s(\d+)$/))) {
            const g = enter('src');
            const idx = parseInt(m[1], 10);
            g.recol = g.recol ?? {};
            g.recol[idx] = val;
            g.count = Math.max(g.count ?? 0, idx);
        } else if ((m = rawKey.match(/^head(\d+)$/))) {
            flush();
            const idx = parseInt(m[1], 10) - 1;
            if (idx < 0 || idx > 4) {
                throw new Error(`head index ${idx + 1} out of range (head is only 5 slots, opcodes 60-64) for [${name}]`);
            }
            ops.push({ code: 60 + idx, payload: resolveByMap(val, maps.model, 'model') });
        }
    }

    flush();

    return ops;
}

function encodeIdk(ops: IdkOpcode[], debugName?: string): Uint8Array {
    const buf = new Packet(new Uint8Array(1024));

    for (const { code, payload } of ops) {
        buf.p1(code);

        if (code === 1) {
            buf.p1(payload);
        } else if (code === 2) {
            const models = payload as number[];
            buf.p1(models.length);
            for (const m of models) buf.p2(m);
        } else if (code === 3) {
        } else if (code === 40 || code === 41) {
            const pairs = payload as Array<{ retex: number; recol: number }>;
            buf.p1(pairs.length);
            for (const p of pairs) {
                buf.p2(p.retex);
                buf.p2(p.recol);
            }
        } else if (code >= 60 && code < 70) {
            buf.p2(payload);
        } else {
            throw new Error(`Unrecognized idk opcode: ${code}`);
        }
    }

    if (debugName) {
        buf.p1(250);
        buf.pjstr(debugName);
    }

    buf.p1(0);
    return new Uint8Array(buf.data.subarray(0, buf.pos));
}

export function pack() {
    const idkNameToId = loadNameToIdMap('idk.pack');
    const modelNameToId = loadNameToIdMap('model.pack');
    const configBlocks = readConfigFile('.idk');

    if (configBlocks.size === 0) {
        console.error('No .idk entries found under BUILD_SRC_DIR/scripts');
        return;
    }

    const configIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, CONFIG_ARCHIVE);
    if (!indexData) {
        console.error('Failed to read Config Archive Index (255.2).');
        return;
    }
    configIndex.decode(indexData);

    const rawContainer = readFlatFile(CONFIG_ARCHIVE, IDK_GROUP);
    if (!rawContainer) {
        console.error(`Failed to read Idk group (${CONFIG_ARCHIVE}.${IDK_GROUP}).`);
        return;
    }
    configIndex.packed[IDK_GROUP] = rawContainer;
    if (!configIndex.unpackGroup(IDK_GROUP)) {
        console.error('Failed to unpack Idk group.');
        return;
    }

    const serverEncoded = new Map<number, Uint8Array>();
    const clientEncoded = new Map<number, Uint8Array>();

    for (const [name, lines] of configBlocks) {
        const idkId = idkNameToId.get(name);
        if (idkId === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            continue;
        }

        try {
            const ops = parseIdkFields(name, lines, { model: modelNameToId });
            serverEncoded.set(idkId, encodeIdk(ops, name));
            clientEncoded.set(idkId, encodeIdk(ops));
        } catch (err) {
            console.error(`Failed to encode idk [${name}]:`, err);
        }
    }

    const outDir = path.join(CACHE_OUT_DIR, String(CONFIG_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const filesCount = configIndex.groupSize[IDK_GROUP];
    const fileIds = configIndex.fileIds[IDK_GROUP];
    const orderedIds = Array.from({ length: filesCount }, (_, i) => (fileIds ? fileIds[i] : i));

    const orderedServerFiles = orderedIds.map(id => {
        const enc = serverEncoded.get(id);
        if (!enc) return configIndex.unpacked[IDK_GROUP]?.[id] ?? new Uint8Array([0x00]);
        return enc;
    });
    const serverGroupBuffer = assembleGroupBuffer(orderedServerFiles);
    const serverContainer = packGroupAuto(serverGroupBuffer, rawContainer);
    fs.writeFileSync(path.join(outDir, `${IDK_GROUP}.dat`), serverContainer);

    const orderedClientFiles = orderedIds.map(id => {
        const enc = clientEncoded.get(id);
        if (!enc) return configIndex.unpacked[IDK_GROUP]?.[id] ?? new Uint8Array([0x00]);
        return enc;
    });
    const clientGroupBuffer = assembleGroupBuffer(orderedClientFiles);
    const clientContainer = packGroupAuto(clientGroupBuffer, rawContainer);
    fs.writeFileSync(path.join(outDir, `${IDK_GROUP}.client.dat`), clientContainer);
}

pack();
