import fs from 'fs';
import path from 'path';
import Js5Index from '#/js5/Js5Index.js';
import Packet from '#/io/Packet.js';
import MidiFile from './MidiFile.js';
import Environment from '#/util/Environment.ts';
import {
    ensureOutputDirs,
    writePackFile,
    loadPackFile,
    readFlatFile,
} from '#tools/util/ConfigPackHelper.ts';

const JINGLE_ARCHIVE = 11;
const JINGLE_OUT_DIR = path.join(Environment.BUILD_SRC_DIR, 'jingles');

function unpack() {
    ensureOutputDirs();
    if (!fs.existsSync(JINGLE_OUT_DIR)) {
        fs.mkdirSync(JINGLE_OUT_DIR, { recursive: true });
    }

    const jingleNames = loadPackFile('jingle-names.pack');

    const jingleIndex = new Js5Index(false, false);

    const indexData = readFlatFile(255, JINGLE_ARCHIVE);
    if (!indexData) {
        console.error(`Failed to read Jingle Archive Index (255.${JINGLE_ARCHIVE}) from cache.`);
        return;
    }
    jingleIndex.decode(indexData);

    const packLines: string[] = [];

    for (let g = 0; g < jingleIndex.capacity; g++) {
        if (jingleIndex.groupSize[g] === 0) continue;

        let groupData: Uint8Array;
        try {
            groupData = readFlatFile(JINGLE_ARCHIVE, g);
        } catch {
            continue;
        }

        jingleIndex.packed[g] = groupData;
        if (!jingleIndex.unpackGroup(g)) continue;

        const fileData = jingleIndex.unpacked[g]?.[0];
        if (!fileData) continue;

        const name = jingleNames.get(g) ?? `jingle_${g}`;
        packLines.push(`${g}=${name}`);

        try {
            const decoded = new MidiFile(new Packet(fileData));
            fs.writeFileSync(path.join(JINGLE_OUT_DIR, `${name}.mid`), decoded.midi);
        } catch (err) {
            console.error(`Failed to decode jingle [${name}] (id ${g}):`, err);
        }
    }

    writePackFile('jingle.pack', packLines);
}

unpack();
