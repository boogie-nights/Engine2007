import Js5Index from '#/js5/Js5Index.js';
import Packet from '#/io/Packet.js';
import {
    ensureOutputDirs,
    writePackFile,
    writeConfigFile,
    readFlatFile,
    loadPackFile,
} from '#tools/util/ConfigPackHelper.ts';

const CONFIG_ARCHIVE = 2;
const MESANIM_GROUP = 7;

function unpack() {
    ensureOutputDirs();

    const seqNames = loadPackFile('seq.pack');

    try {
        const configIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, CONFIG_ARCHIVE);
        if (!indexData) {
            console.error('Failed to read Config Archive Index (255.2) from cache.');
            return;
        }
        configIndex.decode(indexData);

        const rawContainer = readFlatFile(CONFIG_ARCHIVE, MESANIM_GROUP);
        if (!rawContainer) {
            console.error('Failed to read Mesanim group (2.7) from cache.');
            return;
        }

        configIndex.packed[MESANIM_GROUP] = rawContainer;
        if (!configIndex.unpackGroup(MESANIM_GROUP)) {
            console.error('Failed to unpack Mesanim group.');
            return;
        }

        const filesCount = configIndex.groupSize[MESANIM_GROUP];
        const fileIds = configIndex.fileIds[MESANIM_GROUP];

        const packLines: string[] = [];
        const configBlocks: string[] = [];

        for (let i = 0; i < filesCount; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const mesanimId = fileId;
            const name = `mesanim_${mesanimId}`;
            packLines.push(`${mesanimId}=${name}`);

            const fileData = configIndex.unpacked[MESANIM_GROUP]?.[fileId];
            if (!fileData) continue;

            const buf = new Packet(fileData);
            const len: number[] = [-1, -1, -1, -1];

            const def: string[] = [`[${name}]`];

            try {
                while (buf.pos < buf.data.length) {
                    const opcode = buf.g1();
                    if (opcode === 0) break;

                    if (opcode >= 1 && opcode <= 4) {
                        const value = buf.g2();
                        len[opcode - 1] = value;
                        const seqName = seqNames.get(value) ?? `seq_${value}`;
                        def.push(`len${opcode}=${seqName}`);
                    } else {
                        console.error(`Unknown opcode ${opcode} on Mesanim ID ${mesanimId}, aborting parse.`);
                        break;
                    }
                }

                configBlocks.push(def.join('\n'));

            } catch (err) {
                console.error(`Parsing warning on Mesanim ID ${mesanimId}:`, err);
                configBlocks.push(`[${name}]`);
            }
        }

        writePackFile('mesanim.pack', packLines);
        writeConfigFile('all.mesanim', configBlocks);

    } catch (err) {
        console.error('Error during Mesanim configs unpacking:', err);
    }
}

unpack();
