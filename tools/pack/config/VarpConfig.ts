import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import {
    CACHE_OUT_DIR,
    CONFIG_DIR,
    loadNameToIdMap,
    readConfigFile,
    packGroupAuto,
    updateMasterIndex,
    updateChecksumTable,
    writeMasterIndex,
    writeChecksumTable,
    assembleGroupBuffer,
    readFlatFile,
} from '#tools/util/ConfigPackHelper.ts';

const VARP_ARCHIVE = 2;
const VARP_GROUP = 16;

const CLIENT_VARP_OPCODES = new Set<number>([5]);

export type VarpOpcode = {
    code: number;
    payload: any;
};

function parseScope(value: string): number {
    switch (value) {
        case 'temp': return VarPlayerType.SCOPE_TEMP;
        case 'perm': return VarPlayerType.SCOPE_PERM;
        default: {
            const n = parseInt(value, 10);
            if (Number.isNaN(n)) throw new Error(`Unknown varp scope: ${value}`);
            return n;
        }
    }
}

function parseVarType(value: string): number {
    const char = ScriptVarType.getTypeChar(value);
    if (char === null) {
        throw new Error(`Unknown varp type: ${value}`);
    }
    return char;
}

function parseNumber(value: string, context: string): number {
    if (value.startsWith('0x')) {
        if (!/^-?[0-9a-fA-F]+$/.test(value.slice(2))) {
            throw new Error(`Invalid hex number for ${context}: ${value}`);
        }
        return parseInt(value, 16);
    }
    if (!/^-?[0-9]+$/.test(value)) {
        throw new Error(`Invalid number for ${context}: ${value}`);
    }
    return parseInt(value, 10);
}

function parseBoolean(value: string): boolean {
    const v = value.trim().toLowerCase();
    if (v === 'yes' || v === 'true') return true;
    if (v === 'no' || v === 'false') return false;
    throw new Error(`Invalid boolean value: ${value}`);
}

export function parseVarpFields(lines: string[], debugname: string): VarpOpcode[] {
    const ops: VarpOpcode[] = [];

    for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();

        if (key === 'scope') {
            ops.push({ code: 1, payload: parseScope(val) });
        } else if (key === 'type') {
            ops.push({ code: 2, payload: parseVarType(val) });
        } else if (key === 'protect') {
            if (!parseBoolean(val)) {
                ops.push({ code: 4, payload: null });
            }
        } else if (key === 'clientcode') {
            ops.push({ code: 5, payload: parseNumber(val, key) });
        } else if (key === 'transmit') {
            if (parseBoolean(val)) {
                ops.push({ code: 6, payload: null });
            }
        }
    }

    if (debugname.length > 0) {
        ops.push({ code: 250, payload: debugname });
    }

    return ops;
}

export function encodeVarpOps(ops: VarpOpcode[]): Uint8Array {
    const buf = new Packet(new Uint8Array(256));

    for (const { code, payload } of ops) {
        buf.p1(code);

        if (code === 1) {
            buf.p1(Number(payload) & 0xff);
        } else if (code === 2) {
            buf.p1(Number(payload) & 0xff);
        } else if (code === 4) {
            // parameterless flag
        } else if (code === 5) {
            buf.p2(Number(payload));
        } else if (code === 6) {
            // parameterless flag
        } else if (code === 250) {
            buf.pjstr(String(payload ?? ''));
        } else {
            throw new Error(`Unrecognized varp opcode: ${code}`);
        }
    }

    buf.p1(0);
    return new Uint8Array(buf.data.subarray(0, buf.pos));
}

export function pack() {
    const varpNameToId = loadNameToIdMap('varp.pack');
    const configBlocks    = readConfigFile('.varp');

    if (configBlocks.size === 0) {
        console.error('No .varp entries found');
        return;
    }

    const configIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, VARP_ARCHIVE);
    configIndex.decode(indexData);

    const rawContainer = readFlatFile(VARP_ARCHIVE, VARP_GROUP);
    configIndex.packed[VARP_GROUP] = rawContainer;

    if (!configIndex.unpackGroup(VARP_GROUP)) {
        console.error('Failed to unpack Varp group.');
        return;
    }

    const filesCount = configIndex.groupSize[VARP_GROUP];
    const fileIds = configIndex.fileIds[VARP_GROUP];

    const serverOpsById = new Map<number, VarpOpcode[]>();
    const clientOpsById = new Map<number, VarpOpcode[]>();

    for (const [name, lines] of configBlocks) {
        const id = varpNameToId.get(name);
        if (id === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            continue;
        }

        const ops = parseVarpFields(lines, name);
        serverOpsById.set(id, ops);
        clientOpsById.set(id, ops.filter(op => CLIENT_VARP_OPCODES.has(op.code)));
    }

    const orderedIds = Array.from({ length: filesCount }, (_, i) => fileIds ? fileIds[i] : i);

    const outDir = path.join(CACHE_OUT_DIR, String(VARP_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const modifiedContainers = new Map<number, Uint8Array>();

    for (const [label, opsById] of [['server', serverOpsById], ['client', clientOpsById]] as const) {
        const orderedFiles = orderedIds.map(id => {
            const ops = opsById.get(id);
            if (ops !== undefined) {
                return encodeVarpOps(ops);
            }
            return configIndex.unpacked[VARP_GROUP]?.[id] ?? new Uint8Array([0x00]);
        });

        const groupBuffer = assembleGroupBuffer(orderedFiles);
        const container = packGroupAuto(groupBuffer, rawContainer);

        const suffix = label === 'server' ? '' : '.client';
        const outPath = path.join(outDir, `${VARP_GROUP}${suffix}.dat`);
        fs.writeFileSync(outPath, container);

        if (label === 'server') {
            modifiedContainers.set(VARP_GROUP, container);
        }
    }

    // const updatedMaster = updateMasterIndex(VARP_ARCHIVE, modifiedContainers);
    // writeMasterIndex(updatedMaster, VARP_ARCHIVE);

    // const updatedChecksum = updateChecksumTable(new Map([[VARP_ARCHIVE, updatedMaster]]));
    // writeChecksumTable(updatedChecksum);
}

pack();