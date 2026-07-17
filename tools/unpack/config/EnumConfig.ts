import fs from 'fs';
import path from 'path';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import { PlayerStatNameMap } from '#/engine/entity/PlayerStat.ts';
import Js5Index from '#/js5/Js5Index.js';
import Packet from '#/io/Packet.js';
import {
    ensureOutputDirs,
    writePackFile,
    writeConfigFile,
    loadPackFile,
    readFlatFile,
    resolveName,
    PACK_DIR
} from '#tools/util/ConfigPackHelper.ts';

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

const nameCache = new Map<string, Map<number, string> | null>();

function namesForType(typeName: string): Map<number, string> | null {
    if (nameCache.has(typeName)) {
        return nameCache.get(typeName)!;
    }

    const fileName = TYPE_PACK_FILE[typeName] ?? `${typeName}.pack`;

    let names: Map<number, string> | null = null;
    try {
        names = loadPackFile(fileName);
    } catch {
        names = null;
    }

    nameCache.set(typeName, names);
    return names;
}

let interfaceComponentMaps: { groupNames: Map<number, string>; componentFullNames: Map<string, string> } | null = null;

function buildInterfaceComponentMaps(): { groupNames: Map<number, string>; componentFullNames: Map<string, string> } {
    if (interfaceComponentMaps) {
        return interfaceComponentMaps;
    }

    const groupNames = new Map<number, string>();
    const componentFullNames = new Map<string, string>();

    try {
        const idToName = loadPackFile('interface.pack');

        if (idToName.size > 0) {
            const ifaceIndexData = readFlatFile(255, 3);

            if (ifaceIndexData) {
                const ifaceIndex = new Js5Index(false, false);
                ifaceIndex.decode(ifaceIndexData);

                let nextId = 0;

                for (let groupId = 0; groupId < ifaceIndex.capacity; groupId++) {
                    if (!ifaceIndex.isGroupValid(groupId)) continue;

                    let groupData: Uint8Array;
                    try {
                        groupData = readFlatFile(3, groupId);
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
                        groupNames.set(groupId, interfaceName);
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
                            componentFullNames.set(`${groupId}:${compId}`, fullName);
                        }
                    }
                }
            }
        }
    } catch {
    }

    interfaceComponentMaps = { groupNames, componentFullNames };
    return interfaceComponentMaps;
}

function resolveComponentRef(raw: number): string {
    const group = raw >>> 16;
    const file = raw & 0xffff;

    const { groupNames, componentFullNames } = buildInterfaceComponentMaps();

    const fullName = componentFullNames.get(`${group}:${file}`);
    if (fullName) {
        return fullName;
    }

    const interfaceName = groupNames.get(group) ?? `interface_${group}`;
    return `${interfaceName}:com_${file}`;
}

function resolveTypedValue(typeCode: number, raw: number | string): string {
    if (typeCode === ScriptVarType.STRING) {
        return raw as string;
    }

    if (typeCode === ScriptVarType.INT || typeCode === ScriptVarType.AUTOINT) {
        return String(raw);
    }

    if (raw === -1) {
        return 'null';
    }

    if (typeCode === ScriptVarType.COMPONENT) {
        return resolveComponentRef(raw as number);
    }

    if (typeCode === ScriptVarType.STAT) {
        return PlayerStatNameMap.get(raw as number) ?? String(raw);
    }

    const typeName = ScriptVarType.getType(typeCode);
    const names = namesForType(typeName);
    const resolved = names?.get(raw as number);

    return resolved ?? String(raw);
}

function unpack() {
    ensureOutputDirs();
    const enumNames = loadPackFile('enum-names.pack');

    try {
        const configIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, 17);
        if (!indexData) {
            console.error('Failed to read Enum Configs Archive Index (255.17) from cache.');
            return;
        }
        configIndex.decode(indexData);

        const groupIds = configIndex.groupIds || Array.from(
            { length: configIndex.groupSize.length },
            (_, i) => i
        ).filter(i => configIndex.groupSize[i] !== undefined && configIndex.groupSize[i] > 0);

        type Entry = { groupId: number; fileId: number; enumId: number };
        const entries: Entry[] = [];
        const resolvedNames = new Map<number, string>();
        const packLines: string[] = [];

        let nextIndex = 0;

        for (const groupId of groupIds) {
            const groupData = readFlatFile(17, groupId);
            if (!groupData) continue;

            configIndex.packed[groupId] = groupData;
            if (!configIndex.unpackGroup(groupId)) {
                console.error(`Failed to unpack enum group ${groupId}.`);
                continue;
            }

            const filesCount = configIndex.groupSize[groupId];
            const fileIds = configIndex.fileIds[groupId];

            for (let i = 0; i < filesCount; i++) {
                const fileId = fileIds ? fileIds[i] : i;
                const enumId = nextIndex;

                const name = enumNames.get(enumId) ?? resolveName(null, 'enum', enumId);
                nextIndex++;

                entries.push({ groupId, fileId, enumId });
                resolvedNames.set(enumId, name);
                packLines.push(`${enumId}=${name}`);
            }
        }

        writePackFile('enum.pack', packLines);

        const locationLines = entries.map(e => `${e.enumId}=${e.groupId}:${e.fileId}`);
        fs.writeFileSync(path.join(PACK_DIR, 'enum-locations.pack'), locationLines.join('\n') + '\n');

        const configBlocks: string[] = [];

        for (const { groupId, fileId, enumId } of entries) {
            if (!configIndex.unpacked[groupId]) continue;

            const fileData = configIndex.unpacked[groupId][fileId];
            if (!fileData) continue;

            const name = resolvedNames.get(enumId) ?? `enum_${enumId}`;
            const buf = new Packet(fileData);

            let inputtype = -1;
            let outputtype = -1;
            let defaultLine: string | null = null;
            const keys: (number | string)[] = [];
            const values: (number | string)[] = [];
            let valOpcode = -1;

            try {
                while (buf.pos < buf.data.length) {
                    const opcode = buf.g1();
                    if (opcode === 0) break;

                    if (opcode === 1) {
                        inputtype = buf.g1();
                    } else if (opcode === 2) {
                        outputtype = buf.g1();
                    } else if (opcode === 3) {
                        defaultLine = buf.gjstr();
                    } else if (opcode === 4) {
                        defaultLine = String(buf.g4());
                    } else if (opcode === 5 || opcode === 6) {
                        valOpcode = opcode;
                        const count = buf.g2();
                        for (let j = 0; j < count; j++) {
                            const key = buf.g4();
                            keys.push(key);
                            values.push(opcode === 5 ? buf.gjstr() : buf.g4());
                        }
                    } else {
                        console.error(`Unknown opcode ${opcode} on Enum ID ${enumId}, aborting parse.`);
                        break;
                    }
                }

                const def: string[] = [`[${name}]`];

                const isAutoint = inputtype === ScriptVarType.INT
                    && keys.length > 0
                    && keys.every((k, idx) => k === idx);

                if (inputtype !== -1) {
                    def.push(`inputtype=${isAutoint ? 'autoint' : ScriptVarType.getType(inputtype)}`);
                }

                if (outputtype !== -1) {
                    def.push(`outputtype=${ScriptVarType.getType(outputtype)}`);
                }

                if (defaultLine !== null) {
                    if (outputtype !== -1 && outputtype !== ScriptVarType.STRING) {
                        def.push(`default=${resolveTypedValue(outputtype, Number(defaultLine))}`);
                    } else {
                        def.push(`default=${defaultLine}`);
                    }
                }

                if (keys.length > 0) {
                    def.push(`transmit=yes`);
                }

                for (let j = 0; j < keys.length; j++) {
                    const valStr = valOpcode === 5 ? (values[j] as string) : resolveTypedValue(outputtype, values[j]);

                    if (isAutoint) {
                        def.push(`val=${valStr}`);
                    } else {
                        const keyStr = resolveTypedValue(inputtype, keys[j]);
                        def.push(`val=${keyStr},${valStr}`);
                    }
                }

                configBlocks.push(def.join('\n'));

            } catch (err) {
                console.error(`Parsing warning on Enum ID ${enumId}:`, err);
                configBlocks.push(`[${name}]`);
            }
        }

        writeConfigFile('all.enum', configBlocks);

    } catch (err) {
        console.error('Error during Enum configs unpacking:', err);
    }
}

unpack();
