import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import ColorConversion from '#tools/util/ColorConversion.ts';
import {
    CACHE_OUT_DIR,
    PACK_DIR,
    readFlatFile,
    assembleGroupBuffer,
    packGroupAuto,
    loadNameToIdMap,
    readConfigFile,
} from '#tools/util/ConfigPackHelper.ts';

const SPOTANIM_ARCHIVE = 21;

type SpotanimOpcode = {
    code: number;
    payload: any;
};

function loadSpotanimLocations(): Map<number, { groupId: number; fileId: number }> {
    const result = new Map<number, { groupId: number; fileId: number }>();
    const filePath = path.join(PACK_DIR, 'spotanim-locations.pack');
    if (!fs.existsSync(filePath)) return result;

    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const spotId = parseInt(trimmed.slice(0, eqIdx), 10);
        const [groupStr, fileStr] = trimmed.slice(eqIdx + 1).split(':');
        const groupId = parseInt(groupStr, 10);
        const fileId = parseInt(fileStr, 10);
        if (!isNaN(spotId) && !isNaN(groupId) && !isNaN(fileId)) {
            result.set(spotId, { groupId, fileId });
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

function parseSpotanimFields(
    name: string,
    lines: string[],
    maps: { seq: Map<string, number>; texture: Map<string, number>; model: Map<string, number> }
): SpotanimOpcode[] {
    const ops: SpotanimOpcode[] = [];

    type Bag = Record<string, any>;
    const recol: Bag = {};
    const retex: Bag = {};
    let recolCount = 0;
    let retexCount = 0;

    for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const rawKey = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();

        let m: RegExpMatchArray | null;

        if (rawKey === 'model') {
            ops.push({ code: 1, payload: resolveByMap(val, maps.model, 'model') });
        } else if (rawKey === 'anim') {
            if (val !== 'null') {
                ops.push({ code: 2, payload: resolveByMap(val, maps.seq, 'seq') });
            }
        } else if (rawKey === 'resizeh') {
            ops.push({ code: 4, payload: parseInt(val, 10) });
        } else if (rawKey === 'resizev') {
            ops.push({ code: 5, payload: parseInt(val, 10) });
        } else if (rawKey === 'angle') {
            ops.push({ code: 6, payload: parseInt(val, 10) });
        } else if (rawKey === 'ambient') {
            ops.push({ code: 7, payload: parseInt(val, 10) & 0xff });
        } else if (rawKey === 'contrast') {
            ops.push({ code: 8, payload: parseInt(val, 10) & 0xff });
        } else if (rawKey === 'hillskew') {
            if (val === 'yes') ops.push({ code: 9, payload: null });
        } else if ((m = rawKey.match(/^recol(\d+)s$/))) {
            const idx = parseInt(m[1], 10);
            recol.s = recol.s ?? {};
            recol.s[idx] = val;
            recolCount = Math.max(recolCount, idx);
        } else if ((m = rawKey.match(/^recol(\d+)d$/))) {
            const idx = parseInt(m[1], 10);
            recol.d = recol.d ?? {};
            recol.d[idx] = val;
            recolCount = Math.max(recolCount, idx);
        } else if ((m = rawKey.match(/^retex(\d+)s$/))) {
            const idx = parseInt(m[1], 10);
            retex.s = retex.s ?? {};
            retex.s[idx] = val;
            retexCount = Math.max(retexCount, idx);
        } else if ((m = rawKey.match(/^retex(\d+)d$/))) {
            const idx = parseInt(m[1], 10);
            retex.d = retex.d ?? {};
            retex.d[idx] = val;
            retexCount = Math.max(retexCount, idx);
        }
    }

    if (recolCount > 0) {
        const pairs: Array<{ src: number; dst: number }> = [];
        for (let i = 1; i <= recolCount; i++) {
            pairs.push({
                src: resolveRecolValue(recol.s?.[i] ?? '0'),
                dst: resolveRecolValue(recol.d?.[i] ?? '0'),
            });
        }
        ops.push({ code: 40, payload: pairs });
    }

    if (retexCount > 0) {
        const pairs: Array<{ src: number; dst: number }> = [];
        for (let i = 1; i <= retexCount; i++) {
            pairs.push({
                src: resolveByMap(retex.s?.[i] ?? 'texture_0', maps.texture, 'texture'),
                dst: resolveByMap(retex.d?.[i] ?? 'texture_0', maps.texture, 'texture'),
            });
        }
        ops.push({ code: 41, payload: pairs });
    }

    return ops;
}

function encodeSpotanim(ops: SpotanimOpcode[], debugName?: string): Uint8Array {
    const buf = new Packet(new Uint8Array(1024));

    for (const { code, payload } of ops) {
        buf.p1(code);

        if (code === 1 || code === 2 || code === 4 || code === 5 || code === 6) {
            buf.p2(payload);
        } else if (code === 7 || code === 8) {
            buf.p1(payload);
        } else if (code === 9) {
            // no payload
        } else if (code === 40 || code === 41) {
            const pairs = payload as Array<{ src: number; dst: number }>;
            buf.p1(pairs.length);
            for (const p of pairs) {
                buf.p2(p.src);
                buf.p2(p.dst);
            }
        } else {
            throw new Error(`Unrecognized spotanim opcode: ${code}`);
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
    const spotanimNameToId = loadNameToIdMap('spotanim.pack');
    const seqNameToId = loadNameToIdMap('seq.pack');
    const textureNameToId = loadNameToIdMap('texture.pack');
    const modelNameToId = loadNameToIdMap('model.pack');
    const spotanimLocations = loadSpotanimLocations();
    const configBlocks = readConfigFile('.spotanim');

    if (configBlocks.size === 0) {
        console.error('No .spotanim entries found under BUILD_SRC_DIR/scripts');
        return;
    }

    const configIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, SPOTANIM_ARCHIVE);
    if (!indexData) {
        console.error(`Failed to read Spotanim Archive Index (255.${SPOTANIM_ARCHIVE}).`);
        return;
    }
    configIndex.decode(indexData);

    const serverEncodedGroups = new Map<number, Map<number, Uint8Array>>();
    const clientEncodedGroups = new Map<number, Map<number, Uint8Array>>();

    for (const [name, lines] of configBlocks) {
        const spotId = spotanimNameToId.get(name);
        if (spotId === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            continue;
        }

        const loc = spotanimLocations.get(spotId);
        if (!loc) {
            console.warn(`No archive location for entry [${name}] (spotId ${spotId}) — skipping.`);
            continue;
        }

        const { groupId, fileId } = loc;
        if (!serverEncodedGroups.has(groupId)) serverEncodedGroups.set(groupId, new Map());
        if (!clientEncodedGroups.has(groupId)) clientEncodedGroups.set(groupId, new Map());

        try {
            const ops = parseSpotanimFields(name, lines, { seq: seqNameToId, texture: textureNameToId, model: modelNameToId });
            serverEncodedGroups.get(groupId)!.set(fileId, encodeSpotanim(ops, name));
            clientEncodedGroups.get(groupId)!.set(fileId, encodeSpotanim(ops));
        } catch (err) {
            console.error(`Failed to encode spotanim [${name}]:`, err);
        }
    }

    const outDir = path.join(CACHE_OUT_DIR, String(SPOTANIM_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const [label, encodedGroups] of [['server', serverEncodedGroups], ['client', clientEncodedGroups]] as const) {
        for (const groupId of configIndex.groupIds) {
            const rawContainer = readFlatFile(SPOTANIM_ARCHIVE, groupId);
            configIndex.packed[groupId] = rawContainer;

            if (!configIndex.unpackGroup(groupId)) {
                console.error(`Failed to unpack Spotanim group ${groupId}.`);
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
            fs.writeFileSync(path.join(outDir, `${groupId}${suffix}.dat`), container);
        }
    }
}

pack();
