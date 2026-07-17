import fs from 'fs';
import path from 'path';
import Js5Index from '#/js5/Js5Index.js';
import Packet from '#/io/Packet.js';
import {
    ensureOutputDirs,
    writePackFile,
    writeConfigFile,
    loadPackFile,
    readFlatFile,
    PACK_DIR
} from '#tools/util/ConfigPackHelper.ts';

function unpack() {
    ensureOutputDirs();
    const sequentialNames = loadPackFile('seq-names.pack');
    const objNames = loadPackFile('obj.pack');

    try {
        const configIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, 20);
        if (!indexData) {
            console.error('Failed to read Sequence Configs Archive Index (255.20) from cache.');
            return;
        }
        configIndex.decode(indexData);

        const groupIds = configIndex.groupIds || Array.from(
            { length: configIndex.groupSize.length },
            (_, i) => i
        ).filter(i => configIndex.groupSize[i] !== undefined && configIndex.groupSize[i] > 0);

        type Entry = { groupId: number; fileId: number; seqId: number };
        const entries: Entry[] = [];
        const resolvedNames = new Map<number, string>();
        const packLines: string[] = [];

        let nextIndex = 0;

        for (const groupId of groupIds) {
            const groupData = readFlatFile(20, groupId);
            if (!groupData) continue;

            configIndex.packed[groupId] = groupData;
            if (!configIndex.unpackGroup(groupId)) {
                console.error(`Failed to unpack sequence group ${groupId}.`);
                continue;
            }

            const filesCount = configIndex.groupSize[groupId];
            const fileIds = configIndex.fileIds[groupId];

            for (let i = 0; i < filesCount; i++) {
                const fileId = fileIds ? fileIds[i] : i;
                const seqId = nextIndex;

                const name = sequentialNames.get(seqId) ?? `seq_${seqId}`;
                nextIndex++;

                entries.push({ groupId, fileId, seqId });
                resolvedNames.set(seqId, name);
                packLines.push(`${seqId}=${name}`);
            }
        }

        writePackFile('seq.pack', packLines);

        const locationLines = entries.map(e => `${e.seqId}=${e.groupId}:${e.fileId}`);
        fs.writeFileSync(path.join(PACK_DIR, 'seq-locations.pack'), locationLines.join('\n') + '\n');

        const configBlocks: string[] = [];

        for (const { groupId, fileId, seqId } of entries) {
            if (!configIndex.unpacked[groupId]) continue;

                const fileData = configIndex.unpacked[groupId][fileId];
                if (!fileData) continue;

                const name = resolvedNames.get(seqId) ?? `seq_${seqId}`;
                const buf = new Packet(fileData);

                const scalarOccurrence = new Map<string, number>();
                const nextKey = (base: string): string => {
                    const n = (scalarOccurrence.get(base) ?? 0) + 1;
                    scalarOccurrence.set(base, n);
                    return n === 1 ? base : `${base}#${n}`;
                };

                const scalarLines: string[] = [];

                let framesCount = 0;
                let frames: number[] = [];
                let delays: number[] = [];
                const iframes: number[] = [];
                let iframeCount = -1;
                let soundCount = -1;
                const frameSounds = new Map<number, { synth: number, loops: number, volume: number, alts: number[] }>();

                try {
                    while (buf.pos < buf.data.length) {
                        const opcode = buf.g1();
                        if (opcode === 0) break;

                        if (opcode === 1) {
                            framesCount = buf.g2();
                            for (let j = 0; j < framesCount; j++) {
                                delays.push(buf.g2());
                            }
                            for (let j = 0; j < framesCount; j++) {
                                frames.push(buf.g2());
                            }
                            for (let j = 0; j < framesCount; j++) {
                                frames[j] += buf.g2() << 16;
                            }
                        } else if (opcode === 2) {
                            const loops = buf.g2();
                            scalarLines.push(`${nextKey('loops')}=${loops}`);
                        } else if (opcode === 3) {
                            const count = buf.g1();
                            const labels: string[] = [];
                            for (let j = 0; j < count; j++) {
                                const wm = buf.g1();
                                labels.push(`label_${wm}`);
                            }
                            scalarLines.push(`${nextKey('walkmerge')}=${labels.join(',')}`);
                        } else if (opcode === 4) {
                            scalarLines.push(`${nextKey('reachforward')}=yes`);
                        } else if (opcode === 5) {
                            const priority = buf.g1();
                            scalarLines.push(`${nextKey('priority')}=${priority}`);
                        } else if (opcode === 6) {
                            const replaceheldleft = buf.g2();
                            let v: string;
                            if (replaceheldleft === 65535 || replaceheldleft === 0) {
                                v = 'hide';
                            } else {
                                v = objNames.get(replaceheldleft) ?? `obj_${replaceheldleft}`;
                            }
                            scalarLines.push(`${nextKey('replaceheldleft')}=${v}`);
                        } else if (opcode === 7) {
                            const replaceheldright = buf.g2();
                            let v: string;
                            if (replaceheldright === 65535 || replaceheldright === 0) {
                                v = 'hide';
                            } else {
                                v = objNames.get(replaceheldright) ?? `obj_${replaceheldright}`;
                            }
                            scalarLines.push(`${nextKey('replaceheldright')}=${v}`);
                        } else if (opcode === 8) {
                            const maxloops = buf.g1();
                            scalarLines.push(`${nextKey('maxloops')}=${maxloops}`);
                        } else if (opcode === 9) {
                            const val = buf.g1();
                            const preanim_move = val === 0 ? 'delaymove' : val === 1 ? 'delayanim' : val === 2 ? 'merge' : val.toString();
                            scalarLines.push(`${nextKey('preanim_move')}=${preanim_move}`);
                        } else if (opcode === 10) {
                            const val = buf.g1();
                            const postanim_move = val === 0 ? 'delaymove' : val === 1 ? 'abortanim' : val === 2 ? 'merge' : val.toString();
                            scalarLines.push(`${nextKey('postanim_move')}=${postanim_move}`);
                        } else if (opcode === 11) {
                            const val = buf.g1();
                            const duplicatebehaviour = val === 0 ? '0' : val === 1 ? 'reset' : val === 2 ? 'reset_loop' : val.toString();
                            scalarLines.push(`${nextKey('duplicatebehaviour')}=${duplicatebehaviour}`);
                        } else if (opcode === 12) {
                            const count = buf.g1();
                            iframeCount = count;
                            for (let j = 0; j < count; j++) {
                                iframes.push(buf.g2());
                            }
                            for (let j = 0; j < count; j++) {
                                iframes[j] += buf.g2() << 16;
                            }
                        } else if (opcode === 13) {
                            const count = buf.g2();
                            soundCount = count;
                            for (let j = 0; j < count; j++) {
                                const len = buf.g1();
                                if (len > 0) {
                                    const packedVal = buf.g3();
                                    const synth = packedVal >> 8;
                                    const loopsVal = (packedVal >> 4) & 0x7;
                                    const volume = packedVal & 0xf;
                                    const alts: number[] = [];
                                    for (let k = 1; k < len; k++) {
                                        alts.push(buf.g2());
                                    }
                                    frameSounds.set(j, { synth, loops: loopsVal, volume, alts });
                                }
                            }
                        } else if (opcode === 14) {
                            scalarLines.push(`${nextKey('field1993')}=yes`);
                        }
                    }

                    const def: string[] = [`[${name}]`, ...scalarLines];

                    for (let j = 0; j < framesCount; j++) {
                        const index = j + 1;
                        const frameName = `anim_${frames[j]}`;
                        def.push(`frame${index}=${frameName}`);

                        if (delays[j] !== 0) {
                            def.push(`delay${index}=${delays[j]}`);
                        }
                    }

                    const effectiveIframeCount = iframeCount !== -1 ? iframeCount : 0;
                    for (let j = 0; j < effectiveIframeCount; j++) {
                        const v = iframes[j];
                        if (v !== undefined && v !== -1 && v !== 65535) {
                            const iframeName = `anim_${v}`;
                            def.push(`iframe${j + 1}=${iframeName}`);
                        }
                    }

                    const effectiveSoundCount = soundCount !== -1 ? soundCount : 0;
                    for (let j = 0; j < effectiveSoundCount; j++) {
                        const snd = frameSounds.get(j);
                        if (snd) {
                            const index = j + 1;
                            def.push(`synth${index}=${snd.synth}`);
                            def.push(`loopcount${index}=${snd.loops}`);
                            def.push(`volume${index}=${snd.volume}`);
                            if (snd.alts.length > 0) {
                                def.push(`synth_alt${index}=${snd.alts.join(',')}`);
                            }
                        }
                    }

                    if (iframeCount !== -1) {
                        def.push(`numiframes=${iframeCount}`);
                    }
                    if (soundCount !== -1) {
                        def.push(`numsounds=${soundCount}`);
                    }

                    configBlocks.push(def.join('\n'));

                } catch (err) {
                    console.error(`Parsing warning on Sequence ID ${seqId}:`, err);
                    configBlocks.push([`[${name}]`, ...scalarLines].join('\n'));
                }
        }

        writeConfigFile('all.seq', configBlocks);

    } catch (err) {
        console.error('Error during Sequence configs unpacking:', err);
    }
}

unpack();
