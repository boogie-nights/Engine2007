import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import { PlayerStatNameMap } from '#/engine/entity/PlayerStat.ts';
import {
    CACHE_OUT_DIR,
    readFlatFile,
    assembleGroupBuffer,
    packGroupAuto,
    loadNameToIdMap,
    loadPackFile,
    readConfigFile,
} from '#tools/util/ConfigPackHelper.ts';

const CONFIG_ARCHIVE = 2;
const PARAM_GROUP = 11;
const IFACE_ARCHIVE = 3;

const TYPE_PACK_FILE: Partial<Record<string, string>> = {
    obj: 'obj.pack',
    namedobj: 'obj.pack',
    npc: 'npc.pack',
    loc: 'loc.pack',
    seq: 'seq.pack',
    struct: 'struct.pack',
    inv: 'inv.pack',
    synth: 'synth.pack',
    varp: 'varp.pack',
    varbit: 'varbit.pack',
    category: 'category.pack',
    spotanim: 'spotanim.pack',
    idkit: 'idkit.pack',
    dbrow: 'dbrow.pack',
    midi: 'midi.pack',
    enum: 'enum.pack'
};

const nameToIdCache = new Map<string, Map<string, number> | null>();

function nameToIdForType(typeName: string): Map<string, number> | null {
    if (nameToIdCache.has(typeName)) {
        return nameToIdCache.get(typeName)!;
    }

    const fileName = TYPE_PACK_FILE[typeName] ?? `${typeName}.pack`;

    let map: Map<string, number> | null = null;
    try {
        map = loadNameToIdMap(fileName);
    } catch {
        map = null;
    }

    nameToIdCache.set(typeName, map);
    return map;
}

let statNameToId: Map<string, number> | null = null;

function getStatNameToId(): Map<string, number> {
    if (!statNameToId) {
        statNameToId = new Map();
        for (const [id, name] of PlayerStatNameMap) {
            statNameToId.set(name, id);
        }
    }
    return statNameToId;
}

function resolveTypeCode(typeName: string): number {
    const code = ScriptVarType.getTypeChar(typeName);
    if (code === null) {
        throw new Error(`Unknown script var type: ${typeName}`);
    }
    return code;
}

let interfaceReverseMaps: { fullNameToRaw: Map<string, number>; groupNameToId: Map<string, number> } | null = null;

function buildInterfaceReverseMaps(): { fullNameToRaw: Map<string, number>; groupNameToId: Map<string, number> } {
    if (interfaceReverseMaps) {
        return interfaceReverseMaps;
    }

    const fullNameToRaw = new Map<string, number>();
    const groupNameToId = new Map<string, number>();

    try {
        const idToName = loadPackFile('interface.pack');

        if (idToName.size > 0) {
            const ifaceIndexData = readFlatFile(255, IFACE_ARCHIVE);

            if (ifaceIndexData) {
                const ifaceIndex = new Js5Index(false, false);
                ifaceIndex.decode(ifaceIndexData);

                let nextId = 0;

                for (let groupId = 0; groupId < ifaceIndex.capacity; groupId++) {
                    if (!ifaceIndex.isGroupValid(groupId)) continue;

                    let groupData: Uint8Array;
                    try {
                        groupData = readFlatFile(IFACE_ARCHIVE, groupId);
                    } catch {
                        continue;
                    }

                    ifaceIndex.packed[groupId] = groupData;
                    if (!ifaceIndex.unpackGroup(groupId)) {
                        continue;
                    }

                    const interfaceName = idToName.get(nextId);
                    nextId++;
                    if (interfaceName !== undefined) {
                        groupNameToId.set(interfaceName, groupId);
                    }

                    const compCount = ifaceIndex.groupSize[groupId];
                    const compFileIds = ifaceIndex.fileIds[groupId];

                    for (let i = 0; i < compCount; i++) {
                        const compId = compFileIds ? compFileIds[i] : i;
                        const compData = ifaceIndex.unpacked[groupId]?.[compId];
                        if (!compData) continue;

                        const fullName = idToName.get(nextId);
                        nextId++;
                        if (fullName !== undefined) {
                            fullNameToRaw.set(fullName, (groupId << 16) | compId);
                        }
                    }
                }
            }
        }
    } catch {
    }

    interfaceReverseMaps = { fullNameToRaw, groupNameToId };
    return interfaceReverseMaps;
}

function resolveComponentValue(raw: string): number {
    const { fullNameToRaw, groupNameToId } = buildInterfaceReverseMaps();

    const direct = fullNameToRaw.get(raw);
    if (direct !== undefined) {
        return direct;
    }

    const idx = raw.lastIndexOf(':com_');
    if (idx === -1) {
        throw new Error(`Unrecognized component reference: ${raw}`);
    }

    const ifaceName = raw.slice(0, idx);
    const fileId = Number(raw.slice(idx + 5));
    if (!Number.isFinite(fileId)) {
        throw new Error(`Unrecognized component reference: ${raw}`);
    }

    const fallbackMatch = /^interface_(\d+)$/.exec(ifaceName);
    const groupId = fallbackMatch ? Number(fallbackMatch[1]) : groupNameToId.get(ifaceName);

    if (groupId === undefined) {
        throw new Error(`Unknown interface name in component reference: ${raw}`);
    }

    return (groupId << 16) | fileId;
}

const NPC_STATS = ['hitpoints', 'attack', 'strength', 'defence', 'magic', 'ranged'];

export function lookupParamValue(typeCode: number, raw: string): number | string | null {
    if (raw === 'null') {
        return typeCode === ScriptVarType.STRING ? '' : -1;
    }

    if (typeCode === ScriptVarType.INT) {
        let n: number;
        if (raw.startsWith('0x')) {
            if (!/^-?[0-9a-fA-F]+$/.test(raw.slice(2))) return null;
            n = parseInt(raw, 16);
        } else {
            if (!/^-?[0-9]+$/.test(raw)) return null;
            n = parseInt(raw, 10);
        }
        return Number.isNaN(n) ? null : n;
    }

    if (typeCode === ScriptVarType.STRING) {
        return raw.length > 1000 ? null : raw;
    }

    if (typeCode === ScriptVarType.BOOLEAN) {
        if (raw !== 'yes' && raw !== 'no' && raw !== 'true' && raw !== 'false' && raw !== '1' && raw !== '0') {
            return null;
        }
        return (raw === 'yes' || raw === 'true' || raw === '1') ? 1 : 0;
    }

    if (typeCode === ScriptVarType.COORD) {
        const parts = raw.split('_');
        if (parts.length !== 5) return null;

        const level = parseInt(parts[0], 10);
        const mX = parseInt(parts[1], 10);
        const mZ = parseInt(parts[2], 10);
        const lX = parseInt(parts[3], 10);
        const lZ = parseInt(parts[4], 10);

        if ([level, mX, mZ, lX, lZ].some(n => Number.isNaN(n))) return null;
        if (lZ < 0 || lX < 0 || mZ < 0 || mX < 0 || level < 0) return null;
        if (lZ > 63 || lX > 63 || mZ > 255 || mX > 255 || level > 3) return null;

        const x = (mX << 6) + lX;
        const z = (mZ << 6) + lZ;
        return z | (x << 14) | (level << 28);
    }

    if (typeCode === ScriptVarType.STAT) {
        const id = getStatNameToId().get(raw);
        return id !== undefined ? id : null;
    }

    if (typeCode === ScriptVarType.NPC_STAT) {
        const id = NPC_STATS.indexOf(raw);
        return id !== -1 ? id : null;
    }

    if (typeCode === ScriptVarType.COMPONENT) {
        try {
            return resolveComponentValue(raw);
        } catch {
            return null;
        }
    }

    if (typeCode === ScriptVarType.INTERFACE) {
        if (raw.indexOf(':') !== -1) return null;
        const id = nameToIdForType('interface')?.get(raw);
        return id !== undefined ? id : null;
    }

    const typeName = ScriptVarType.getType(typeCode);
    const nameToId = nameToIdForType(typeName);
    const id = nameToId?.get(raw);
    return id !== undefined ? id : null;
}

export type ParamOpcode = {
    code: number;
    payload: number | string | null;
};

function parseParamFields(name: string, lines: string[]): ParamOpcode[] {
    let typeCode = -1;

    for (const raw of lines) {
        const eq = raw.indexOf('=');
        if (eq === -1) continue;
        if (raw.slice(0, eq).trim() === 'type') {
            typeCode = resolveTypeCode(raw.slice(eq + 1).trim());
            break;
        }
    }

    const ops: ParamOpcode[] = [];

    for (const raw of lines) {
        const eq = raw.indexOf('=');
        if (eq === -1) continue;

        const key = raw.slice(0, eq).trim();
        const value = raw.slice(eq + 1);

        if (key === 'type') {
            ops.push({ code: 1, payload: typeCode });
        } else if (key === 'autodisable') {
            if (value.trim() !== 'no') continue;
            ops.push({ code: 4, payload: null });
        } else if (key === 'default') {
            if (typeCode === -1) {
                throw new Error(`Param [${name}] has 'default' but no 'type' was found`);
            }

            const raw = typeCode === ScriptVarType.STRING ? value : value.trim();
            const paramValue = lookupParamValue(typeCode, raw);

            if (paramValue === null) {
                throw new Error(`Param [${name}] has invalid default value: ${value}`);
            }

            if (typeCode === ScriptVarType.STRING) {
                ops.push({ code: 5, payload: paramValue as string });
            } else {
                ops.push({ code: 2, payload: paramValue as number });
            }
        }
    }

    return ops;
}

function encodeParamOps(ops: ParamOpcode[], debugName?: string): Uint8Array {
    const buf = new Packet(new Uint8Array(256));

    for (const { code, payload } of ops) {
        buf.p1(code);

        if (code === 1 || code === 2) {
            if (code === 1) {
                buf.p1(Number(payload));
            } else {
                buf.p4(Number(payload));
            }
        } else if (code === 4) {
        } else if (code === 5) {
            buf.pjstr(String(payload ?? ''));
        } else {
            throw new Error(`Unrecognized param opcode: ${code}`);
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
    const paramNameToId = loadNameToIdMap('param.pack');
    const configBlocks = readConfigFile('.param');

    if (configBlocks.size === 0) {
        console.error('No .param entries found under BUILD_SRC_DIR/scripts');
        return;
    }

    const configIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, CONFIG_ARCHIVE);
    if (!indexData) {
        console.error('Failed to read Config Archive Index (255.2).');
        return;
    }
    configIndex.decode(indexData);

    const rawContainer = readFlatFile(CONFIG_ARCHIVE, PARAM_GROUP);
    if (!rawContainer) {
        console.error('Failed to read Param group (2.11).');
        return;
    }
    configIndex.packed[PARAM_GROUP] = rawContainer;
    if (!configIndex.unpackGroup(PARAM_GROUP)) {
        console.error('Failed to unpack Param group.');
        return;
    }

    const serverEncoded = new Map<number, Uint8Array>();
    const clientEncoded = new Map<number, Uint8Array>();

    for (const [name, lines] of configBlocks) {
        const paramId = paramNameToId.get(name);
        if (paramId === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            continue;
        }

        let ops: ParamOpcode[];
        try {
            ops = parseParamFields(name, lines);
        } catch (err) {
            console.error(`Failed to parse param [${name}]:`, err);
            continue;
        }

        try {
            serverEncoded.set(paramId, encodeParamOps(ops, name));
            clientEncoded.set(paramId, encodeParamOps(ops));
        } catch (err) {
            console.error(`Failed to encode param [${name}]:`, err);
        }
    }

    const outDir = path.join(CACHE_OUT_DIR, String(CONFIG_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const filesCount = configIndex.groupSize[PARAM_GROUP];
    const fileIds = configIndex.fileIds[PARAM_GROUP];
    const orderedIds = Array.from({ length: filesCount }, (_, i) => fileIds ? fileIds[i] : i);

    for (const [label, encodedMap] of [['server', serverEncoded], ['client', clientEncoded]] as const) {
        const orderedFiles = orderedIds.map(id => {
            const enc = encodedMap.get(id);
            if (!enc) {
                return configIndex.unpacked[PARAM_GROUP]?.[id] ?? new Uint8Array([0x00]);
            }
            return enc;
        });

        const groupBuffer = assembleGroupBuffer(orderedFiles);
        const container = packGroupAuto(groupBuffer, rawContainer);

        const suffix = label === 'server' ? '' : '.client';
        const outPath = path.join(outDir, `${PARAM_GROUP}${suffix}.dat`);
        fs.writeFileSync(outPath, container);
    }
}

pack();
