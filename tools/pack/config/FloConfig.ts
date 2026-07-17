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
    packGroupAuto,
    readFlatFile,
    updateMasterIndex,
    updateChecksumTable,
    writeMasterIndex,
    writeChecksumTable,
} from '#tools/util/ConfigPackHelper.ts';

function encodeFlo(
    entryName: string,
    lines: string[],
    textureNameToId: Map<string, number>,
): Uint8Array {
    const buf = new Packet(new Uint8Array(512));

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
                const nextLine = lines[lines.indexOf(line) + 1]?.trim();
                if (nextLine === 'texture_size=2') {
                    buf.p1(3); buf.p2(texId);
                } else {
                    buf.p1(2); buf.p1(texId);
                }
                break;
            }
            case 'texture_size':
                break;
            case 'occlude':
                if (val === 'no') buf.p1(5);
                break;
            case 'mapcolour':
                buf.p1(7); buf.p3(parseColour(val));
                break;
            case 'water':
                if (val === 'yes') buf.p1(8);
                break;
            case 'scale':
                buf.p1(9); buf.p2(parseInt(val, 10));
                break;
            case 'shadow':
                if (val === 'no') buf.p1(10);
                break;
            case 'priority':
                buf.p1(11); buf.p1(parseInt(val, 10));
                break;
            case 'blend':
                if (val === 'yes') buf.p1(12);
                break;
            case 'waterfogcolour':
                buf.p1(13); buf.p3(parseColour(val));
                break;
            case 'waterfogscale':
                buf.p1(14); buf.p1(parseInt(val, 10));
                break;
        }
    }

    if (!entryName.match(/^flo_\d+$/)) {
        buf.p1(6); buf.pjstr(entryName);
    }

    buf.p1(0);
    return buf.data.subarray(0, buf.pos);
}

export function pack() {
    const floNameToId     = loadNameToIdMap('flo.pack');
    const textureNameToId = loadNameToIdMap('texture.pack');
    const configBlocks    = readConfigFile('.flo');

    if (configBlocks.size === 0) {
        console.error('No .flo entries found');
        return;
    }

    const configIndex = new Js5Index(false, false);

    const indexData = readFlatFile(255, 2);
    configIndex.decode(indexData);

    const rawContainer = readFlatFile(2, 4);
    configIndex.packed[4] = rawContainer;

    if (!configIndex.unpackGroup(4)) {
        console.error('Failed to unpack Floor Overlays group.');
        return;
    }

    const filesCount = configIndex.groupSize[4];
    const fileIds    = configIndex.fileIds[4];

    const compressedSize  = (rawContainer[1] << 24) | (rawContainer[2] << 16) |
                            (rawContainer[3] << 8)  |  rawContainer[4];
    const containerBodyEnd = 9 + compressedSize;
    const trailerBytes     = rawContainer.length - containerBodyEnd;
    const originalVersion  = trailerBytes >= 2
        ? ((rawContainer[rawContainer.length - 2] << 8) | rawContainer[rawContainer.length - 1])
        : null;

    const encodedMap = new Map<number, Uint8Array>();
    let encoded = 0, skipped = 0;

    for (const [name, lines] of configBlocks) {
        const id = floNameToId.get(name);
        if (id === undefined) {
            console.warn(`No ID for entry [${name}] — skipping.`);
            skipped++;
            continue;
        }
        encodedMap.set(id, encodeFlo(name, lines, textureNameToId));
        encoded++;
    }

    const orderedIds   = Array.from({ length: filesCount }, (_, i) => fileIds ? fileIds[i] : i);
    const orderedFiles = orderedIds.map(id => {
        const enc = encodedMap.get(id);
        if (!enc) {
            const orig = configIndex.unpacked[4]?.[id];
            if (orig) console.warn(`No encoded entry for id ${id}, using original bytes.`);
            return orig ?? new Uint8Array([0]);
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
    const outPath = path.join(outDir, '4.dat');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, container);
    //TODO, ONLY IF BUILD_VERIFY = FALSE
    const updatedMaster = updateMasterIndex(2, new Map([[4, container]]));
    writeMasterIndex(updatedMaster, 2);

    const updatedChecksum = updateChecksumTable(new Map([[2, updatedMaster]]));
    writeChecksumTable(updatedChecksum);
}

pack();