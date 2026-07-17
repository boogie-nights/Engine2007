import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import {
    CACHE_OUT_DIR,
    CONFIG_DIR,
    PACK_DIR,
    loadNameToIdMap,
    readConfigFile,
    packGroupAuto,
    readFlatFile,
    assembleGroupBuffer,
    updateMasterIndex,
    updateChecksumTable,
    writeMasterIndex,
    writeChecksumTable,
} from '#tools/util/ConfigPackHelper.ts';

export function loadVarbitLocations(): Map<number, { groupId: number; fileId: number }> {
    const result = new Map<number, { groupId: number; fileId: number }>();
    const filePath = path.join(PACK_DIR, 'varbit-locations.pack');
    if (!fs.existsSync(filePath)) return result;

    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const seqId = parseInt(trimmed.slice(0, eqIdx), 10);
        const [groupStr, fileStr] = trimmed.slice(eqIdx + 1).split(':');
        const groupId = parseInt(groupStr, 10);
        const fileId = parseInt(fileStr, 10);
        if (!isNaN(seqId) && !isNaN(groupId) && !isNaN(fileId)) {
            result.set(seqId, { groupId, fileId });
        }
    }

    return result;
}

export function toVarbitArchiveId(loc: { groupId: number; fileId: number }): number {
    return (loc.fileId << 10) | loc.groupId;
}

function encodeVarbit(
    lines: string[],
    varpNameToId: Map<string, number>,
    debugName?: string,
): Uint8Array {
    const buf = new Packet(new Uint8Array(256));

    let basevar = 0;
    let startbit = 0;
    let endbit = 0;
    let hasBasevar = false;

    for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();

        switch (key) {
            case 'basevar':
                basevar = varpNameToId.get(val) ?? parseInt(val, 10);
                hasBasevar = true;
                break;
            case 'startbit':
                startbit = parseInt(val, 10);
                break;
            case 'endbit':
                endbit = parseInt(val, 10);
                break;
        }
    }

    if (hasBasevar) {
        buf.p1(1);
        buf.p2(basevar);
        buf.p1(startbit);
        buf.p1(endbit);
    }

    if (debugName) {
        buf.p1(250);
        buf.pjstr(debugName);
    }

    buf.p1(0);

    return buf.data.subarray(0, buf.pos);
}

export function pack() {
    const varpNameToId = loadNameToIdMap('varp.pack');
    const varbitNameToId = loadNameToIdMap('varbit.pack');
    const varbitLocations = loadVarbitLocations();
    const configBlocks    = readConfigFile('.varbit');

    if (configBlocks.size === 0) {
        console.error('No .varbit entries found');
        return;
    }

    const configIndex = new Js5Index(false, false);

    const indexData = readFlatFile(255, 22);
    configIndex.decode(indexData);

    const serverEncodedGroups = new Map<number, Map<number, Uint8Array>>();
    const clientEncodedGroups = new Map<number, Map<number, Uint8Array>>();

    for (const [name, lines] of configBlocks) {
        const seqId = varbitNameToId.get(name);
        if (seqId === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            continue;
        }

        const loc = varbitLocations.get(seqId);
        if (!loc) {
            console.warn(`No archive location for entry [${name}] (seqId ${seqId}) — skipping. Was varbit-locations.pack regenerated after the last unpack?`);
            continue;
        }

        const { groupId, fileId } = loc;

        if (!serverEncodedGroups.has(groupId)) {
            serverEncodedGroups.set(groupId, new Map());
        }
        if (!clientEncodedGroups.has(groupId)) {
            clientEncodedGroups.set(groupId, new Map());
        }

        serverEncodedGroups.get(groupId)!.set(fileId, encodeVarbit(lines, varpNameToId, name));
        clientEncodedGroups.get(groupId)!.set(fileId, encodeVarbit(lines, varpNameToId));
    }

    const outDir = path.join(CACHE_OUT_DIR, '22');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const modifiedContainers = new Map<number, Uint8Array>();

    for (const [label, encodedGroups] of [['server', serverEncodedGroups], ['client', clientEncodedGroups]] as const) {
        for (const groupId of configIndex.groupIds) {
            const rawContainer = readFlatFile(22, groupId);
            configIndex.packed[groupId] = rawContainer;

            if (!configIndex.unpackGroup(groupId)) {
                console.error(`Failed to unpack Varbit group ${groupId}.`);
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

            if (label === 'server') {
                modifiedContainers.set(groupId, container);
            }
        }
    }

    // const updatedMaster = updateMasterIndex(22, modifiedContainers);
    // writeMasterIndex(updatedMaster, 22);

    // const updatedChecksum = updateChecksumTable(new Map([[22, updatedMaster]]));
    // writeChecksumTable(updatedChecksum);
}

pack();