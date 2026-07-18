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

const MIDI_ARCHIVE = 6;
const MIDI_OUT_DIR = path.join(Environment.BUILD_SRC_DIR, 'songs');

function unpack() {
    ensureOutputDirs();
    if (!fs.existsSync(MIDI_OUT_DIR)) {
        fs.mkdirSync(MIDI_OUT_DIR, { recursive: true });
    }

    const midiNames = loadPackFile('midi-names.pack');

    const midiIndex = new Js5Index(false, false);

    const indexData = readFlatFile(255, MIDI_ARCHIVE);
    if (!indexData) {
        console.error(`Failed to read Midi Archive Index (255.${MIDI_ARCHIVE}) from cache.`);
        return;
    }
    midiIndex.decode(indexData);

    const packLines: string[] = [];

    for (let g = 0; g < midiIndex.capacity; g++) {
        if (midiIndex.groupSize[g] === 0) continue;

        let groupData: Uint8Array;
        try {
            groupData = readFlatFile(MIDI_ARCHIVE, g);
        } catch {
            continue;
        }

        midiIndex.packed[g] = groupData;
        if (!midiIndex.unpackGroup(g)) continue;

        const fileData = midiIndex.unpacked[g]?.[0];
        if (!fileData) continue;

        const name = midiNames.get(g) ?? `midi_${g}`;
        packLines.push(`${g}=${name}`);

        try {
            const decoded = new MidiFile(new Packet(fileData));
            fs.writeFileSync(path.join(MIDI_OUT_DIR, `${name}.mid`), decoded.midi);
        } catch (err) {
            console.error(`Failed to decode midi [${name}] (id ${g}):`, err);
        }
    }

    writePackFile('midi.pack', packLines);
}

unpack();
