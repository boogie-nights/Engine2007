import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import {
    CACHE_OUT_DIR,
    readFlatFile,
    assembleGroupBuffer,
    packGroupAuto,
    loadNameToIdMap,
    readConfigFile,
} from '#tools/util/ConfigPackHelper.ts';

const CONFIG_ARCHIVE = 2;
const MESANIM_GROUP = 7;

type MesanimOpcode = {
    code: number;
    payload: number;
};

function parseMesanimFields(name: string, lines: string[], seqNameToId: Map<string, number>): MesanimOpcode[] {
    const ops: MesanimOpcode[] = [];

    for (const raw of lines) {
        const eq = raw.indexOf('=');
        if (eq === -1) continue;

        const key = raw.slice(0, eq).trim();
        if (!key.startsWith('len')) continue;

        const lenIndex = Number(key.substring(3));
        if (isNaN(lenIndex) || lenIndex < 1 || lenIndex > 4) continue;

        const value = raw.slice(eq + 1).trim();
        const seqId = seqNameToId.get(value);
        if (seqId === undefined) {
            throw new Error(`Mesanim [${name}] ${key}: unknown seq '${value}'`);
        }

        ops.push({ code: lenIndex, payload: seqId });
    }

    return ops;
}

function encodeMesanim(ops: MesanimOpcode[], debugName?: string): Uint8Array {
    const buf = new Packet(new Uint8Array(256));

    for (const { code, payload } of ops) {
        buf.p1(code);
        buf.p2(payload);
    }

    if (debugName) {
        buf.p1(250);
        buf.pjstr(debugName);
    }

    buf.p1(0);
    return new Uint8Array(buf.data.subarray(0, buf.pos));
}

export function pack() {
    const seqNameToId = loadNameToIdMap('seq.pack');
    const mesanimNameToId = loadNameToIdMap('mesanim.pack');
    const configBlocks = readConfigFile('.mesanim');

    if (configBlocks.size === 0) {
        console.error('No .mesanim entries found under BUILD_SRC_DIR/scripts');
        return;
    }

    const configIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, CONFIG_ARCHIVE);
    if (!indexData) {
        console.error('Failed to read Config Archive Index (255.2).');
        return;
    }
    configIndex.decode(indexData);

    const rawContainer = readFlatFile(CONFIG_ARCHIVE, MESANIM_GROUP);
    if (!rawContainer) {
        console.error('Failed to read Mesanim group (2.7).');
        return;
    }
    configIndex.packed[MESANIM_GROUP] = rawContainer;
    if (!configIndex.unpackGroup(MESANIM_GROUP)) {
        console.error('Failed to unpack Mesanim group.');
        return;
    }

    const emptyClientEncoding = encodeMesanim([]);
    const serverEncoded = new Map<number, Uint8Array>();

    for (const [name, lines] of configBlocks) {
        const mesanimId = mesanimNameToId.get(name);
        if (mesanimId === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            continue;
        }

        try {
            const ops = parseMesanimFields(name, lines, seqNameToId);
            serverEncoded.set(mesanimId, encodeMesanim(ops, name));
        } catch (err) {
            console.error(`Failed to encode mesanim [${name}]:`, err);
        }
    }

    const outDir = path.join(CACHE_OUT_DIR, String(CONFIG_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const filesCount = configIndex.groupSize[MESANIM_GROUP];
    const fileIds = configIndex.fileIds[MESANIM_GROUP];
    const orderedIds = Array.from({ length: filesCount }, (_, i) => fileIds ? fileIds[i] : i);

    const orderedServerFiles = orderedIds.map(id => {
        const enc = serverEncoded.get(id);
        if (!enc) {
            return configIndex.unpacked[MESANIM_GROUP]?.[id] ?? new Uint8Array([0x00]);
        }
        return enc;
    });
    const serverGroupBuffer = assembleGroupBuffer(orderedServerFiles);
    const serverContainer = packGroupAuto(serverGroupBuffer, rawContainer);
    fs.writeFileSync(path.join(outDir, `${MESANIM_GROUP}.dat`), serverContainer);

    const orderedClientFiles = orderedIds.map(() => emptyClientEncoding);
    const clientGroupBuffer = assembleGroupBuffer(orderedClientFiles);
    const clientContainer = packGroupAuto(clientGroupBuffer, rawContainer);
    fs.writeFileSync(path.join(outDir, `${MESANIM_GROUP}.client.dat`), clientContainer);
}

pack();
