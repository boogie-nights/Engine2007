import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import {
    CACHE_DIR,
    CACHE_OUT_DIR,
    CONFIG_DIR,
    loadNameToIdMap,
    readConfigFile,
    parseColour,
    readFlatFile,
    packGroupAuto,
    updateMasterIndex,
    updateChecksumTable,
    writeMasterIndex,
    writeChecksumTable,
} from '#tools/util/ConfigPackHelper.ts';

function encodeFlu(
    entryName: string,
    lines: string[],
    textureNameToId: Map<string, number>,
): Uint8Array {
    const buf = new Packet(new Uint8Array(256));

    for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();

        switch (key) {
            case 'colour':
                buf.p1(1); buf.p3(parseColour(val));
                break;
            case 'texture': {
                const texId = textureNameToId.get(val) ?? parseInt(val.replace('texture_', ''), 10);
                buf.p1(2); buf.p2(texId);
                break;
            }
            case 'scale':
                buf.p1(3); buf.p2(parseInt(val, 10));
                break;
            case 'blend':
                if (val === 'no') buf.p1(4);
                break;
            case 'occlude':
                if (val === 'no') buf.p1(5);
                break;
        }
    }

    if (!entryName.match(/^flu_\d+$/)) {
        buf.p1(6); buf.pjstr(entryName);
    }

    buf.p1(0);
    return buf.data.subarray(0, buf.pos);
}

export function pack() {
    const fluNameToId     = loadNameToIdMap('flu.pack');
    const textureNameToId = loadNameToIdMap('texture.pack');
    const configBlocks    = readConfigFile('.flu');

    if (configBlocks.size === 0) {
        console.error('No .flu entries found');
        return;
    }

    const configIndex = new Js5Index(false, false);

    const indexData = readFlatFile(255, 2);
    configIndex.decode(indexData);

    const rawContainer = readFlatFile(2, 1);
    configIndex.packed[1] = rawContainer;

    if (!configIndex.unpackGroup(1)) {
        console.error('Failed to unpack Floor Underlays group.');
        return;
    }

    const filesCount = configIndex.groupSize[1];
    const fileIds    = configIndex.fileIds[1];

    const compressedSize   = (rawContainer[1] << 24) | (rawContainer[2] << 16) |
                             (rawContainer[3] << 8)  |  rawContainer[4];
    const containerBodyEnd = 9 + compressedSize;
    const trailerBytes     = rawContainer.length - containerBodyEnd;
    const originalVersion  = trailerBytes >= 2
        ? ((rawContainer[rawContainer.length - 2] << 8) | rawContainer[rawContainer.length - 1])
        : null;

    const encodedMap = new Map<number, Uint8Array>();
    let encoded = 0, skipped = 0;

    for (const [name, lines] of configBlocks) {
        const id = fluNameToId.get(name);
        if (id === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            skipped++;
            continue;
        }
        encodedMap.set(id, encodeFlu(name, lines, textureNameToId));
        encoded++;
    }

    const orderedIds   = Array.from({ length: filesCount }, (_, i) => fileIds ? fileIds[i] : i);
    const orderedFiles = orderedIds.map(id => {
        const enc = encodedMap.get(id);
        if (!enc) {
            const orig = configIndex.unpacked[1]?.[id];
            if (orig) console.warn(`No encoded entry for id ${id}, using original bytes.`);
            return orig ?? new Uint8Array([0x00]);
        }
        return enc;
    });

    const totalDataSize = orderedFiles.reduce((s, f) => s + f.length, 0);
    const trailerSize   = filesCount * 4 + 1;
    const groupBuffer   = new Uint8Array(totalDataSize + trailerSize);
    const groupView     = new DataView(groupBuffer.buffer, groupBuffer.byteOffset);

    let writePos = 0;
    for (const f of orderedFiles) { groupBuffer.set(f, writePos); writePos += f.length; }

    let trailerPos = totalDataSize;
    let prevSize   = 0;
    for (let i = 0; i < filesCount; i++) {
        const delta = orderedFiles[i].length - prevSize;
        groupView.setInt32(trailerPos, delta, false);
        prevSize    = orderedFiles[i].length;
        trailerPos += 4;
    }
    groupBuffer[trailerPos] = 1;

    const container = packGroupAuto(groupBuffer, rawContainer);

    const outDir  = path.join(CACHE_OUT_DIR, '2');
    const outPath = path.join(outDir, '1.dat');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, container);

    const updatedMaster = updateMasterIndex(2, new Map([[1, container]]));
    writeMasterIndex(updatedMaster, 2);

    const updatedChecksum = updateChecksumTable(new Map([[2, updatedMaster]]));
    writeChecksumTable(updatedChecksum);

}

pack();