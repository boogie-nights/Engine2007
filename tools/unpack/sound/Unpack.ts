import fs from 'fs';
import path from 'path';
import Js5Index from '#/js5/Js5Index.js';
import Environment from '#/util/Environment.ts';
import {
    ensureOutputDirs,
    writePackFile,
    loadPackFile,
    readFlatFile,
} from '#tools/util/ConfigPackHelper.ts';

const SYNTH_ARCHIVE = 4;
const SYNTH_OUT_DIR = path.join(Environment.BUILD_SRC_DIR, 'synths');

function unpack() {
    ensureOutputDirs();
    if (!fs.existsSync(SYNTH_OUT_DIR)) fs.mkdirSync(SYNTH_OUT_DIR, { recursive: true });

    const synthNames = loadPackFile('synth-names.pack');

    const synthIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, SYNTH_ARCHIVE);
    if (!indexData) {
        console.error(`Failed to read Synth Archive Index (255.${SYNTH_ARCHIVE}) from cache.`);
        return;
    }
    synthIndex.decode(indexData);

    const validGroups: number[] = [];
    for (let g = 0; g < synthIndex.capacity; g++) {
        if (synthIndex.groupSize[g] > 0) validGroups.push(g);
    }

    const packLines: string[] = [];
    let extracted = 0;

    for (const g of validGroups) {
        let groupData: Uint8Array;
        try {
            groupData = readFlatFile(SYNTH_ARCHIVE, g);
        } catch {
            continue;
        }
        synthIndex.packed[g] = groupData;
        if (!synthIndex.unpackGroup(g)) continue;

        const fileData = synthIndex.unpacked[g]?.[0];
        if (!fileData) continue;

        const synthId = g;
        const name = synthNames.get(synthId) ?? `sound_${synthId}`;
        packLines.push(`${synthId}=${name}`);

        fs.writeFileSync(path.join(SYNTH_OUT_DIR, `${name}.synth`), fileData);
        extracted++;
    }

    writePackFile('synth.pack', packLines);
}

unpack();