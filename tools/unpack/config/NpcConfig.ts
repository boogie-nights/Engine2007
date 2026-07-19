import fs from 'fs';
import path from 'path';
import Js5Index from '#/js5/Js5Index.js';
import Packet from '#/io/Packet.js';
import ColorConversion from '#tools/util/ColorConversion.ts';
import {
    ensureOutputDirs,
    writeConfigFile,
    writePackFile,
    loadPackFile,
    readFlatFile,
    PACK_DIR
} from '#tools/util/ConfigPackHelper.ts';

const NPC_ARCHIVE = 18;

function unpack() {
    ensureOutputDirs();

    try {
        const npcIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, NPC_ARCHIVE);
        if (!indexData) {
            console.error(`Failed to read Npcs Archive Index (255.${NPC_ARCHIVE}) from cache.`);
            return;
        }
        npcIndex.decode(indexData);

        const groupCount = npcIndex.capacity;

        for (let g = 0; g < groupCount; g++) {
            const groupSize = npcIndex.groupSize[g];
            if (groupSize === 0) continue;

            const groupData = readFlatFile(NPC_ARCHIVE, g);
            if (!groupData) continue;

            npcIndex.packed[g] = groupData;
            npcIndex.unpackGroup(g);
        }

        const npcNamesPack = loadPackFile('npc-names.pack');
        const texturePack = loadPackFile('texture.pack');
        const seqPack = loadPackFile('seq.pack');
        const varbitPack = loadPackFile('varbit.pack');
        const varpPack = loadPackFile('varp.pack');
        const modelPack = loadPackFile('model.pack');

        const getSeqName = (id: number) => seqPack.get(id) ?? `seq_${id}`;
        const getVarbitName = (id: number) => varbitPack.get(id) ?? `varbit_${id}`;
        const getVarpName = (id: number) => varpPack.get(id) ?? `varp_${id}`;
        const getTextureName = (id: number) => texturePack.get(id) ?? `texture_${id}`;
        const getModelName = (id: number) => modelPack.get(id) ?? `model_${id}`;

        const resolveColor = (hsl: number): string => {
            const possible = ColorConversion.reverseHsl(hsl);
            return possible.length > 0 ? String(possible[0]) : `hsl:${hsl}`;
        };

        type Entry = { g: number; fileId: number; npcId: number };
        const entries: Entry[] = [];
        const resolvedNames = new Map<number, string>();
        const seenNames = new Set<string>();

        let nextId = 0;

        for (let g = 0; g < groupCount; g++) {
            const groupSize = npcIndex.groupSize[g];
            if (groupSize === 0) continue;

            const fileIds = npcIndex.fileIds[g];

            for (let i = 0; i < groupSize; i++) {
                const fileId = fileIds ? fileIds[i] : i;
                if (!npcIndex.unpacked[g]?.[fileId]) continue;

                const npcId = nextId++;
                const defaultName = `npc_${npcId}`;
                let debugName = npcNamesPack.get(npcId) ?? defaultName;

                if (debugName !== defaultName) {
                    if (seenNames.has(debugName)) {
                        console.warn(`Duplicate npc-name "${debugName}" at npc ID ${npcId} — using default name instead.`);
                        debugName = defaultName;
                    } else {
                        seenNames.add(debugName);
                    }
                }

                entries.push({ g, fileId, npcId });
                resolvedNames.set(npcId, debugName);
            }
        }

        const packLines = entries.map(e => `${e.npcId}=${resolvedNames.get(e.npcId)}`);
        const locationLines = entries.map(e => `${e.npcId}=${e.g}:${e.fileId}`);

        writePackFile('npc.pack', packLines);
        fs.writeFileSync(path.join(PACK_DIR, 'npc-locations.pack'), locationLines.join('\n') + '\n');

        const getNpcDebugName = (id: number): string => {
            if (id === 65535 || id === -1) return 'null';
            return resolvedNames.get(id) ?? `npc_${id}`;
        };

        const configBlocks: string[] = [];

        for (const { g, fileId, npcId } of entries) {
            const debugName = resolvedNames.get(npcId)!;
            const fileData = npcIndex.unpacked[g]?.[fileId];
            if (!fileData) continue;

            const buf = new Packet(fileData);
            const def: string[] = [`[${debugName}]`];

            let modelIndex = 0;
            let headIndex = 0;

            const occurrence = new Map<string, number>();
            const suf = (family: string): string => {
                const n = (occurrence.get(family) ?? 0) + 1;
                occurrence.set(family, n);
                return n === 1 ? '' : `#${n}`;
            };

            try {
                while (buf.pos < buf.data.length) {
                    const opcode = buf.g1();
                    if (opcode === 0) break;

                    if (opcode === 1) {
                        const sfx = suf('models');
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const model = buf.g2();
                            modelIndex++;
                            def.push(`model${modelIndex}${sfx}=${getModelName(model)}`);
                        }
                    } else if (opcode === 2) {
                        const sfx = suf('name');
                        def.push(`name${sfx}=${buf.gjstr()}`);
                    } else if (opcode === 3) {
                        const sfx = suf('desc');
                        def.push(`desc${sfx}=${buf.gjstr()}`);
                    } else if (opcode === 12) {
                        const sfx = suf('size');
                        def.push(`size${sfx}=${buf.g1()}`);
                    } else if (opcode === 13) {
                        const sfx = suf('readyanim');
                        def.push(`readyanim${sfx}=${getSeqName(buf.g2())}`);
                    } else if (opcode === 14) {
                        const sfx = suf('walk');
                        def.push(`walkanim${sfx}=${getSeqName(buf.g2())}`);
                    } else if (opcode === 15) {
                        const sfx = suf('turnleftanim');
                        def.push(`turnleftanim${sfx}=${getSeqName(buf.g2())}`);
                    } else if (opcode === 16) {
                        const sfx = suf('turnrightanim');
                        def.push(`turnrightanim${sfx}=${getSeqName(buf.g2())}`);
                    } else if (opcode === 17) {
                        const sfx = suf('walk');
                        const walkanim = buf.g2();
                        const walkanim_b = buf.g2();
                        const walkanim_r = buf.g2();
                        const walkanim_l = buf.g2();
                        def.push(`walkanim${sfx}=${getSeqName(walkanim)}`);
                        def.push(`walkanim_b${sfx}=${getSeqName(walkanim_b)}`);
                        def.push(`walkanim_r${sfx}=${getSeqName(walkanim_r)}`);
                        def.push(`walkanim_l${sfx}=${getSeqName(walkanim_l)}`);
                    } else if (opcode >= 30 && opcode < 35) {
                        const index = opcode - 30 + 1;
                        const sfx = suf(`op${index}`);
                        def.push(`op${index}${sfx}=${buf.gjstr()}`);
                    } else if (opcode === 40) {
                        const sfx = suf('recol');
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const src = buf.g2();
                            const dst = buf.g2();
                            def.push(`recol${j + 1}s${sfx}=${resolveColor(src)}`);
                            def.push(`recol${j + 1}d${sfx}=${resolveColor(dst)}`);
                        }
                    } else if (opcode === 41) {
                        const sfx = suf('retex');
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const src = buf.g2();
                            const dst = buf.g2();
                            def.push(`retex${j + 1}s${sfx}=${getTextureName(src)}`);
                            def.push(`retex${j + 1}d${sfx}=${getTextureName(dst)}`);
                        }
                    } else if (opcode === 42) {
                        const sfx = suf('recolpalette');
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            def.push(`recol${j + 1}d_palette${sfx}=${buf.g1b()}`);
                        }
                    } else if (opcode === 60) {
                        const sfx = suf('heads');
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const model = buf.g2();
                            headIndex++;
                            def.push(`head${headIndex}${sfx}=${getModelName(model)}`);
                        }
                    } else if (opcode === 93) {
                        const sfx = suf('minimap');
                        def.push(`minimap${sfx}=no`);
                    } else if (opcode === 95) {
                        const sfx = suf('vislevel');
                        const vislevel = buf.g2();
                        def.push(`vislevel${sfx}=${vislevel === 0 ? 'hide' : vislevel}`);
                    } else if (opcode === 97) {
                        const sfx = suf('resizeh');
                        def.push(`resizeh${sfx}=${buf.g2()}`);
                    } else if (opcode === 98) {
                        const sfx = suf('resizev');
                        def.push(`resizev${sfx}=${buf.g2()}`);
                    } else if (opcode === 99) {
                        const sfx = suf('alwaysontop');
                        def.push(`alwaysontop${sfx}=yes`);
                    } else if (opcode === 100) {
                        const sfx = suf('ambient');
                        def.push(`ambient${sfx}=${buf.g1b()}`);
                    } else if (opcode === 101) {
                        const sfx = suf('contrast');
                        def.push(`contrast${sfx}=${buf.g1b() * 5}`);
                    } else if (opcode === 102) {
                        const sfx = suf('headicon');
                        def.push(`headicon${sfx}=${buf.g2()}`);
                    } else if (opcode === 103) {
                        const sfx = suf('turnspeed');
                        def.push(`turnspeed${sfx}=${buf.g2()}`);
                    } else if (opcode === 106 || opcode === 118) {
                        const sfx = suf('multinpc');
                        let multivarbit = buf.g2();
                        if (multivarbit === 65535) multivarbit = -1;
                        let multivarp = buf.g2();
                        if (multivarp === 65535) multivarp = -1;
                        let defaultNpc = -1;
                        if (opcode === 118) {
                            defaultNpc = buf.g2();
                            if (defaultNpc === 65535) defaultNpc = -1;
                        }
                        if (multivarbit !== -1) {
                            def.push(`multivarbit${sfx}=${getVarbitName(multivarbit)}`);
                        }
                        if (multivarp !== -1) {
                            def.push(`multivarp${sfx}=${getVarpName(multivarp)}`);
                        }
                        const count = buf.g1();
                        for (let j = 0; j <= count; j++) {
                            let id = buf.g2();
                            if (id === 65535) id = -1;
                            def.push(`multinpc${j + 1}${sfx}=${getNpcDebugName(id)}`);
                        }
                        if (opcode === 118) {
                            def.push(`multinpcdefault${sfx}=${getNpcDebugName(defaultNpc)}`);
                        }
                    } else if (opcode === 107) {
                        const sfx = suf('active');
                        def.push(`active${sfx}=no`);
                    } else if (opcode === 109) {
                        const sfx = suf('walksmoothing');
                        def.push(`walksmoothing${sfx}=no`);
                    } else if (opcode === 111) {
                        const sfx = suf('spotshadow');
                        def.push(`spotshadow${sfx}=yes`);
                    } else if (opcode === 113) {
                        const sfx = suf('spotshadowcolour');
                        const spotshadowcolour1 = buf.g2();
                        const spotshadowcolour2 = buf.g2();
                        def.push(`spotshadowcolour${sfx}=${spotshadowcolour1},${spotshadowcolour2}`);
                    } else if (opcode === 114) {
                        const sfx = suf('spotshadowtrans');
                        const spotshadowtrans1 = buf.g1b();
                        const spotshadowtrans2 = buf.g1b();
                        def.push(`spotshadowtrans${sfx}=${spotshadowtrans1},${spotshadowtrans2}`);
                    } else if (opcode === 115) {
                        const sfx = suf('field2350');
                        const field2350 = buf.g1() * 4;
                        const field2329 = buf.g1() * 4;
                        def.push(`field2350${sfx}=${field2350}`);
                        def.push(`field2329${sfx}=${field2329}`);
                    } else if (opcode === 119) {
                        const sfx = suf('walkflags');
                        def.push(`walkflags${sfx}=${buf.g1b()}`);
                    } else if (opcode === 249) {
                        const sfx = suf('params');
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const isString = buf.g1() === 1;
                            const key = buf.g3();
                            const val = isString ? buf.gjstr() : buf.g4();
                            def.push(`param${sfx}=${key},${isString ? 's' : 'n'},${val}`);
                        }
                    } else {
                        console.error(`Unhandled opcode ${opcode} on npc ID ${npcId} (${debugName}) - aborting this entry to avoid desync.`);
                        break;
                    }
                }
            } catch (err) {
                console.error(`Parsing error on npc ID ${npcId} (${debugName}):`, err);
            }

            configBlocks.push(def.join('\n'));
        }

        writeConfigFile('all.npc', configBlocks);

    } catch (err) {
        console.error('Error during Npc configs unpacking:', err);
    }
}

unpack();
