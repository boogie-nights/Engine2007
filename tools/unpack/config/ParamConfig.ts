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
    resolveName
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

const NPC_STATS = ['hitpoints', 'attack', 'strength', 'defence', 'magic', 'ranged'];

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

    if (typeCode === ScriptVarType.NPC_STAT) {
        return NPC_STATS[raw as number] ?? String(raw);
    }

    const typeName = ScriptVarType.getType(typeCode);
    const names = namesForType(typeName);
    const resolved = names?.get(raw as number);

    return resolved ?? String(raw);
}

function unpack() {
    ensureOutputDirs();

    const paramNames = loadPackFile('param-names.pack');

    try {
        const configIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, CONFIG_ARCHIVE);
        if (!indexData) {
            console.error('Failed to read Config Archive Index (255.2) from cache.');
            return;
        }
        configIndex.decode(indexData);

        const rawContainer = readFlatFile(CONFIG_ARCHIVE, PARAM_GROUP);
        if (!rawContainer) {
            console.error('Failed to read Param group (2.11) from cache.');
            return;
        }

        configIndex.packed[PARAM_GROUP] = rawContainer;
        if (!configIndex.unpackGroup(PARAM_GROUP)) {
            console.error('Failed to unpack Param group.');
            return;
        }

        const filesCount = configIndex.groupSize[PARAM_GROUP];
        const fileIds = configIndex.fileIds[PARAM_GROUP];

        type Entry = { fileId: number; paramId: number };
        const entries: Entry[] = [];
        const resolvedNames = new Map<number, string>();
        const packLines: string[] = [];

        for (let i = 0; i < filesCount; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const paramId = fileId;

            const name = paramNames.get(paramId) ?? resolveName(null, 'param', paramId);

            entries.push({ fileId, paramId });
            resolvedNames.set(paramId, name);
            packLines.push(`${paramId}=${name}`);
        }

        writePackFile('param.pack', packLines);

        const configBlocks: string[] = [];

        for (const { fileId, paramId } of entries) {
            const fileData = configIndex.unpacked[PARAM_GROUP]?.[fileId];
            if (!fileData) continue;

            const name = resolvedNames.get(paramId) ?? `param_${paramId}`;
            const buf = new Packet(fileData);

            let type = -1;

            const def: string[] = [`[${name}]`];

            try {
                while (buf.pos < buf.data.length) {
                    const opcode = buf.g1();
                    if (opcode === 0) break;

                    if (opcode === 1) {
                        type = buf.g1();
                        def.push(`type=${ScriptVarType.getType(type)}`);
                    } else if (opcode === 2) {
                        const defaultInt = buf.g4();
                        def.push(`default=${resolveTypedValue(type, defaultInt)}`);
                    } else if (opcode === 4) {
                        def.push(`autodisable=no`);
                    } else if (opcode === 5) {
                        const defaultString = buf.gjstr();
                        def.push(`default=${defaultString}`);
                    } else {
                        console.error(`Unknown opcode ${opcode} on Param ID ${paramId}, aborting parse.`);
                        break;
                    }
                }

                configBlocks.push(def.join('\n'));

            } catch (err) {
                console.error(`Parsing warning on Param ID ${paramId}:`, err);
                configBlocks.push(`[${name}]`);
            }
        }

        writeConfigFile('all.param', configBlocks);

    } catch (err) {
        console.error('Error during Param configs unpacking:', err);
    }
}

unpack();
