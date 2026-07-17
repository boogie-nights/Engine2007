import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import { PlayerStatNameMap } from '#/engine/entity/PlayerStat.ts';
import {
    CACHE_OUT_DIR,
    PACK_DIR,
    readFlatFile,
    assembleGroupBuffer,
    packGroupAuto,
    loadNameToIdMap,
    loadPackFile,
    readConfigFile,
} from '#tools/util/ConfigPackHelper.ts';

const ENUM_ARCHIVE = 17;
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
    midi: 'midi.pack'
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
    if (typeName === 'autoint') {
        return ScriptVarType.INT;
    }

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

function encodeTypedValue(typeCode: number, raw: string): number {
    if (typeCode === ScriptVarType.INT || typeCode === ScriptVarType.AUTOINT) {
        return parseInt(raw, 10);
    }

    if (raw === 'null') {
        return -1;
    }

    if (typeCode === ScriptVarType.COMPONENT) {
        return resolveComponentValue(raw);
    }

    if (typeCode === ScriptVarType.STAT) {
        const id = getStatNameToId().get(raw);
        if (id !== undefined) return id;
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
        throw new Error(`Unknown stat name: ${raw}`);
    }

    const typeName = ScriptVarType.getType(typeCode);
    const nameToId = nameToIdForType(typeName);
    const fromMap = nameToId?.get(raw);
    if (fromMap !== undefined) return fromMap;

    const n = Number(raw);
    if (Number.isFinite(n)) return n;

    throw new Error(`Unknown ${typeName} name: ${raw}`);
}

type ParsedEnum = {
    inputTypeName: string | null;
    outputTypeName: string | null;
    isAutoint: boolean;
    defaultRaw: string | null;
    vals: Array<{ key?: string; value: string }>;
};

function parseEnumBlock(name: string, lines: string[]): ParsedEnum {
    const parsed: ParsedEnum = {
        inputTypeName: null,
        outputTypeName: null,
        isAutoint: false,
        defaultRaw: null,
        vals: []
    };

    for (const raw of lines) {
        const eq = raw.indexOf('=');
        if (eq === -1) continue;

        const key = raw.slice(0, eq).trim();
        const value = raw.slice(eq + 1);

        if (key === 'inputtype') {
            const v = value.trim();
            if (v === 'autoint') {
                parsed.isAutoint = true;
                parsed.inputTypeName = 'int';
            } else {
                parsed.inputTypeName = v;
            }
        } else if (key === 'outputtype') {
            parsed.outputTypeName = value.trim();
        } else if (key === 'default') {
            parsed.defaultRaw = value;
        } else if (key === 'clientside') {
        } else if (key === 'val') {
            if (parsed.isAutoint) {
                parsed.vals.push({ value: value });
            } else {
                const comma = value.indexOf(',');
                if (comma === -1) {
                    throw new Error(`Expected comma in val for enum [${name}]: ${value}`);
                }
                parsed.vals.push({ key: value.slice(0, comma).trim(), value: value.slice(comma + 1) });
            }
        }
    }

    return parsed;
}

function encodeEnum(name: string, parsed: ParsedEnum, debugName?: string): Uint8Array {
    const buf = new Packet(new Uint8Array(65536));

    let inputTypeCode = -1;
    let outputTypeCode = -1;

    if (parsed.inputTypeName !== null) {
        inputTypeCode = resolveTypeCode(parsed.inputTypeName);
        buf.p1(1);
        buf.p1(inputTypeCode);
    }

    if (parsed.outputTypeName !== null) {
        outputTypeCode = resolveTypeCode(parsed.outputTypeName);
        buf.p1(2);
        buf.p1(outputTypeCode);
    }

    if (parsed.vals.length > 0) {
        const useString = outputTypeCode === ScriptVarType.STRING;
        buf.p1(useString ? 5 : 6);
        buf.p2(parsed.vals.length);

        for (let j = 0; j < parsed.vals.length; j++) {
            const entry = parsed.vals[j];

            const keyRaw = parsed.isAutoint ? j : encodeTypedValue(inputTypeCode, (entry.key ?? '').trim());
            buf.p4(keyRaw);

            if (useString) {
                buf.pjstr(entry.value);
            } else {
                buf.p4(encodeTypedValue(outputTypeCode, entry.value.trim()));
            }
        }
    }

    if (parsed.defaultRaw !== null) {
        if (outputTypeCode === ScriptVarType.STRING) {
            buf.p1(3);
            buf.pjstr(parsed.defaultRaw);
        } else {
            const val = outputTypeCode !== -1
                ? encodeTypedValue(outputTypeCode, parsed.defaultRaw.trim())
                : Number(parsed.defaultRaw.trim());
            buf.p1(4);
            buf.p4(val);
        }
    }

    if (debugName) {
        buf.p1(250);
        buf.pjstr(debugName);
    }

    buf.p1(0);
    return new Uint8Array(buf.data.subarray(0, buf.pos));
}

function loadEnumLocations(): Map<number, { groupId: number; fileId: number }> {
    const result = new Map<number, { groupId: number; fileId: number }>();
    const filePath = path.join(PACK_DIR, 'enum-locations.pack');
    if (!fs.existsSync(filePath)) return result;

    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const enumId = parseInt(trimmed.slice(0, eqIdx), 10);
        const [groupStr, fileStr] = trimmed.slice(eqIdx + 1).split(':');
        const groupId = parseInt(groupStr, 10);
        const fileId = parseInt(fileStr, 10);
        if (!isNaN(enumId) && !isNaN(groupId) && !isNaN(fileId)) {
            result.set(enumId, { groupId, fileId });
        }
    }

    return result;
}

export function pack() {
    const enumNameToId = loadNameToIdMap('enum.pack');
    const enumLocations = loadEnumLocations();
    const configBlocks = readConfigFile('.enum');

    if (configBlocks.size === 0) {
        console.error('No .enum entries found');
        return;
    }

    const configIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, ENUM_ARCHIVE);
    if (!indexData) {
        console.error('Failed to read Enum Configs Archive Index (255.17) from cache.');
        return;
    }
    configIndex.decode(indexData);

    const serverEncodedGroups = new Map<number, Map<number, Uint8Array>>();
    const clientEncodedGroups = new Map<number, Map<number, Uint8Array>>();

    for (const [name, lines] of configBlocks) {
        const enumId = enumNameToId.get(name);
        if (enumId === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            continue;
        }

        const loc = enumLocations.get(enumId);
        if (!loc) {
            console.warn(`No archive location for entry [${name}] (enumId ${enumId}) — skipping.`);
            continue;
        }

        const { groupId, fileId } = loc;

        let parsed: ParsedEnum;
        try {
            parsed = parseEnumBlock(name, lines);
        } catch (err) {
            console.error(`Failed to parse enum [${name}]:`, err);
            continue;
        }

        if (!serverEncodedGroups.has(groupId)) {
            serverEncodedGroups.set(groupId, new Map());
        }
        if (!clientEncodedGroups.has(groupId)) {
            clientEncodedGroups.set(groupId, new Map());
        }

        try {
            serverEncodedGroups.get(groupId)!.set(fileId, encodeEnum(name, parsed, name));
            clientEncodedGroups.get(groupId)!.set(fileId, encodeEnum(name, parsed));
        } catch (err) {
            console.error(`Failed to encode enum [${name}]:`, err);
        }
    }

    const outDir = path.join(CACHE_OUT_DIR, String(ENUM_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const [label, encodedGroups] of [['server', serverEncodedGroups], ['client', clientEncodedGroups]] as const) {
        for (const groupId of configIndex.groupIds) {
            const rawContainer = readFlatFile(ENUM_ARCHIVE, groupId);
            configIndex.packed[groupId] = rawContainer;

            if (!configIndex.unpackGroup(groupId)) {
                console.error(`Failed to unpack Enum group ${groupId}.`);
                continue;
            }

            const filesCount = configIndex.groupSize[groupId];
            const fileIds = configIndex.fileIds[groupId];

            const encodedMap = encodedGroups.get(groupId) ?? new Map<number, Uint8Array>();

            const orderedIds = Array.from({ length: filesCount }, (_, i) => fileIds ? fileIds[i] : i);
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
