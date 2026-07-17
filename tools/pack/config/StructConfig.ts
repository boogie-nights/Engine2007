import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import {
    CACHE_OUT_DIR,
    readFlatFile,
    assembleGroupBuffer,
    packGroupAuto,
    loadNameToIdMap,
    readConfigFile,
} from '#tools/util/ConfigPackHelper.ts';
import { lookupParamValue } from './ParamConfig.ts';

const CONFIG_ARCHIVE = 2;
const STRUCT_GROUP = 26;

type StructParam = {
    paramId: number;
    isString: boolean;
    value: number | string;
};

function loadParamTypes(): Map<string, number> {
    const paramBlocks = readConfigFile('.param');
    const paramTypes = new Map<string, number>();

    for (const [name, lines] of paramBlocks) {
        for (const line of lines) {
            const eq = line.indexOf('=');
            if (eq === -1) continue;
            if (line.slice(0, eq).trim() !== 'type') continue;

            const typeName = line.slice(eq + 1).trim();
            const code = ScriptVarType.getTypeChar(typeName);
            if (code === null) {
                throw new Error(`Unknown script var type for param [${name}]: ${typeName}`);
            }
            paramTypes.set(name, code);
            break;
        }
    }

    return paramTypes;
}

function parseStructFields(
    name: string,
    lines: string[],
    paramNameToId: Map<string, number>,
    paramTypes: Map<string, number>
): StructParam[] {
    const params: StructParam[] = [];

    for (const raw of lines) {
        const eq = raw.indexOf('=');
        if (eq === -1) continue;

        const key = raw.slice(0, eq).trim();
        if (key !== 'param') continue;

        const value = raw.slice(eq + 1);
        const comma = value.indexOf(',');
        if (comma === -1) {
            throw new Error(`Expected comma in param for struct [${name}]: ${value}`);
        }

        const paramName = value.slice(0, comma).trim();
        const rawValue = value.slice(comma + 1);

        const paramId = paramNameToId.get(paramName);
        if (paramId === undefined) {
            throw new Error(`Unknown param name in struct [${name}]: ${paramName}`);
        }

        const typeCode = paramTypes.get(paramName);
        if (typeCode === undefined) {
            throw new Error(`No type found for param [${paramName}] referenced by struct [${name}]`);
        }

        const isString = typeCode === ScriptVarType.STRING;
        const paramValue = lookupParamValue(typeCode, isString ? rawValue : rawValue.trim());

        if (paramValue === null) {
            throw new Error(`Struct [${name}] has invalid value for param [${paramName}]: ${rawValue}`);
        }

        params.push({ paramId, isString, value: paramValue });
    }

    return params;
}

function encodeStruct(params: StructParam[], debugName?: string): Uint8Array {
    const buf = new Packet(new Uint8Array(1024));

    if (params.length > 0) {
        buf.p1(249);
        buf.p1(params.length);

        for (const { paramId, isString, value } of params) {
            buf.pbool(isString);
            buf.p3(paramId);

            if (isString) {
                buf.pjstr(value as string);
            } else {
                buf.p4(value as number);
            }
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
    const structNameToId = loadNameToIdMap('struct.pack');
    const paramNameToId = loadNameToIdMap('param.pack');
    const paramTypes = loadParamTypes();
    const configBlocks = readConfigFile('.struct');

    if (configBlocks.size === 0) {
        console.error('No .struct entries found under BUILD_SRC_DIR/scripts');
        return;
    }

    const configIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, CONFIG_ARCHIVE);
    if (!indexData) {
        console.error('Failed to read Config Archive Index (255.2).');
        return;
    }
    configIndex.decode(indexData);

    const rawContainer = readFlatFile(CONFIG_ARCHIVE, STRUCT_GROUP);
    if (!rawContainer) {
        console.error('Failed to read Struct group (2.26).');
        return;
    }
    configIndex.packed[STRUCT_GROUP] = rawContainer;
    if (!configIndex.unpackGroup(STRUCT_GROUP)) {
        console.error('Failed to unpack Struct group.');
        return;
    }

    const emptyClientEncoding = encodeStruct([]);
    const serverEncoded = new Map<number, Uint8Array>();

    for (const [name, lines] of configBlocks) {
        const structId = structNameToId.get(name);
        if (structId === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            continue;
        }

        try {
            const params = parseStructFields(name, lines, paramNameToId, paramTypes);
            serverEncoded.set(structId, encodeStruct(params, name));
        } catch (err) {
            console.error(`Failed to encode struct [${name}]:`, err);
        }
    }

    const outDir = path.join(CACHE_OUT_DIR, String(CONFIG_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const filesCount = configIndex.groupSize[STRUCT_GROUP];
    const fileIds = configIndex.fileIds[STRUCT_GROUP];
    const orderedIds = Array.from({ length: filesCount }, (_, i) => fileIds ? fileIds[i] : i);

    const orderedServerFiles = orderedIds.map(id => {
        const enc = serverEncoded.get(id);
        if (!enc) {
            return configIndex.unpacked[STRUCT_GROUP]?.[id] ?? new Uint8Array([0x00]);
        }
        return enc;
    });
    const serverGroupBuffer = assembleGroupBuffer(orderedServerFiles);
    const serverContainer = packGroupAuto(serverGroupBuffer, rawContainer);
    fs.writeFileSync(path.join(outDir, `${STRUCT_GROUP}.dat`), serverContainer);

    const orderedClientFiles = orderedIds.map(() => emptyClientEncoding);
    const clientGroupBuffer = assembleGroupBuffer(orderedClientFiles);
    const clientContainer = packGroupAuto(clientGroupBuffer, rawContainer);
    fs.writeFileSync(path.join(outDir, `${STRUCT_GROUP}.client.dat`), clientContainer);
}

pack();
