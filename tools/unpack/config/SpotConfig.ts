import fs from 'fs';
import path from 'path';
import Js5Index from '#/js5/Js5Index.js';
import Packet from '#/io/Packet.js';
import ColorConversion from '#tools/util/ColorConversion.ts';
import {
    ensureOutputDirs,
    writeConfigFile,
    writePackFile,
    resolveName,
    loadPackFile,
    readFlatFile,
    PACK_DIR,
} from '#tools/util/ConfigPackHelper.ts';

const SPOTANIM_ARCHIVE = 21;

function unpack() {
    ensureOutputDirs();

    const spotanimNames = loadPackFile('spotanim-names.pack');
    const seqNames = loadPackFile('seq.pack');
    const texturePack = loadPackFile('texture.pack');
    const modelPack = loadPackFile('model.pack');

    const getTextureName = (id: number): string => texturePack.get(id) ?? `texture_${id}`;

    const getModelName = (id: number): string => modelPack.get(id) ?? `model_${id}`;

    const getSeqName = (id: number): string => {
        if (id === -1 || id === 65535) return 'null';
        return seqNames.get(id) ?? `seq_${id}`;
    };

    const resolveColor = (hsl: number): string => {
        const possible = ColorConversion.reverseHsl(hsl);
        const rgb = possible.length > 0 ? possible[0] : null;

        if (rgb !== null && ColorConversion.rgb15toHsl16(rgb) === hsl) {
            return String(rgb);
        }

        return `hsl:${hsl}`;
    };

    try {
        const spotIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, SPOTANIM_ARCHIVE);
        if (!indexData) {
            console.error(`Failed to read Spotanim Archive Index (255.${SPOTANIM_ARCHIVE}) from cache.`);
            return;
        }
        spotIndex.decode(indexData);

        const groupCount = spotIndex.capacity;

        for (let g = 0; g < groupCount; g++) {
            const groupSize = spotIndex.groupSize[g];
            if (groupSize === 0) continue;

            const groupData = readFlatFile(SPOTANIM_ARCHIVE, g);
            if (!groupData) continue;

            spotIndex.packed[g] = groupData;
            spotIndex.unpackGroup(g);
        }

        type Entry = { groupId: number; fileId: number; spotId: number };
        const entries: Entry[] = [];
        const resolvedNames = new Map<number, string>();
        const packLines: string[] = [];

        let nextIndex = 0;

        for (let g = 0; g < groupCount; g++) {
            const groupSize = spotIndex.groupSize[g];
            if (groupSize === 0) continue;

            const fileIds = spotIndex.fileIds[g];

            for (let i = 0; i < groupSize; i++) {
                const fileId = fileIds ? fileIds[i] : i;
                const fileData = spotIndex.unpacked[g]?.[fileId];
                if (!fileData) continue;

                const spotId = nextIndex;
                nextIndex++;

                const debugName = spotanimNames.get(spotId) ?? resolveName(null, 'spotanim', spotId);

                entries.push({ groupId: g, fileId, spotId });
                resolvedNames.set(spotId, debugName);
                packLines.push(`${spotId}=${debugName}`);
            }
        }

        writePackFile('spotanim.pack', packLines);

        const locationLines = entries.map(e => `${e.spotId}=${e.groupId}:${e.fileId}`);
        fs.writeFileSync(path.join(PACK_DIR, 'spotanim-locations.pack'), locationLines.join('\n') + '\n');

        const configBlocks: string[] = [];

        for (const { groupId, fileId, spotId } of entries) {
            const fileData = spotIndex.unpacked[groupId]?.[fileId];
            if (!fileData) continue;

            const debugName = resolvedNames.get(spotId) ?? `spotanim_${spotId}`;
            const buf = new Packet(fileData);
            const def: string[] = [`[${debugName}]`];

            try {
                while (buf.pos < buf.data.length) {
                    const opcode = buf.g1();
                    if (opcode === 0) break;

                    if (opcode === 1) {
                        def.push(`model=${getModelName(buf.g2())}`);
                    } else if (opcode === 2) {
                        def.push(`anim=${getSeqName(buf.g2())}`);
                    } else if (opcode === 4) {
                        def.push(`resizeh=${buf.g2()}`);
                    } else if (opcode === 5) {
                        def.push(`resizev=${buf.g2()}`);
                    } else if (opcode === 6) {
                        def.push(`angle=${buf.g2()}`);
                    } else if (opcode === 7) {
                        def.push(`ambient=${buf.g1()}`);
                    } else if (opcode === 8) {
                        def.push(`contrast=${buf.g1()}`);
                    } else if (opcode === 9) {
                        def.push('hillskew=yes');
                    } else if (opcode === 40) {
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const src = buf.g2();
                            const dst = buf.g2();
                            def.push(`recol${j + 1}s=${resolveColor(src)}`);
                            def.push(`recol${j + 1}d=${resolveColor(dst)}`);
                        }
                    } else if (opcode === 41) {
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const src = buf.g2();
                            const dst = buf.g2();
                            def.push(`retex${j + 1}s=${getTextureName(src)}`);
                            def.push(`retex${j + 1}d=${getTextureName(dst)}`);
                        }
                    } else {
                        console.error(`Unknown opcode ${opcode} on Spotanim ID ${spotId}, aborting parse.`);
                        break;
                    }
                }
            } catch (err) {
                console.error(`Parsing error on Spotanim ID ${spotId} (${debugName}):`, err);
            }

            configBlocks.push(def.join('\n'));
        }

        writeConfigFile('all.spotanim', configBlocks);

    } catch (err) {
        console.error('Error during Spotanim configs unpacking:', err);
    }
}

unpack();
