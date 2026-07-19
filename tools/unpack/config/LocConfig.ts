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

const LOC_ARCHIVE = 16;

function unpack() {
    ensureOutputDirs();

    try {
        const locIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, LOC_ARCHIVE);
        if (!indexData) {
            console.error(`Failed to read Locs Archive Index (255.${LOC_ARCHIVE}) from cache.`);
            return;
        }
        locIndex.decode(indexData);

        const groupCount = locIndex.capacity;

        for (let g = 0; g < groupCount; g++) {
            const groupSize = locIndex.groupSize[g];
            if (groupSize === 0) continue;

            const groupData = readFlatFile(LOC_ARCHIVE, g);
            if (!groupData) continue;

            locIndex.packed[g] = groupData;
            locIndex.unpackGroup(g);
        }

        const locNamesPack = loadPackFile('loc-names.pack');
        const texturePack = loadPackFile('texture.pack');
        const seqPack = loadPackFile('seq.pack');
        const varbitPack = loadPackFile('varbit.pack');
        const varpPack = loadPackFile('varp.pack');
        const categoryPack = loadPackFile('category.pack');
        const modelPack = loadPackFile('model.pack');

        const resolvedNames = new Map<number, string>();
        const configBlocks: string[] = [];

        const getTextureName = (id: number) => texturePack.get(id) ?? `texture_${id}`;
        const getSeqName = (id: number) => seqPack.get(id) ?? `seq_${id}`;
        const getVarbitName = (id: number) => varbitPack.get(id) ?? `varbit_${id}`;
        const getVarpName = (id: number) => varpPack.get(id) ?? `varp_${id}`;
        const getCategoryName = (id: number) => categoryPack.get(id) ?? `category_${id}`;
        const getModelName = (id: number) => modelPack.get(id) ?? `model_${id}`;

        const resolveColor = (hsl: number): string => {
            const possible = ColorConversion.reverseHsl(hsl);
            return possible.length > 0 ? String(possible[0]) : `hsl:${hsl}`;
        };

        const seenNames = new Set<string>();

        for (let g = 0; g < groupCount; g++) {
            const groupSize = locIndex.groupSize[g];
            if (groupSize === 0) continue;

            const fileIds = locIndex.fileIds[g];

            for (let i = 0; i < groupSize; i++) {
                const fileId = fileIds ? fileIds[i] : i;
                if (!locIndex.unpacked[g]?.[fileId]) continue;

                const locId = (g << 8) | fileId;
                const defaultName = `loc_${locId}`;
                let debugName = locNamesPack.get(locId) ?? defaultName;

                if (debugName !== defaultName) {
                    if (seenNames.has(debugName)) {
                        console.warn(`Duplicate loc-name "${debugName}" at loc ID ${locId} — using default name instead.`);
                        debugName = defaultName;
                    } else {
                        seenNames.add(debugName);
                    }
                }

                resolvedNames.set(locId, debugName);
            }
        }

        const sortedPack = Array.from(resolvedNames.entries()).sort((a, b) => a[0] - b[0]);

        const packLines: string[] = [];
        const locationLines: string[] = [];

        for (const [locId, debugName] of sortedPack) {
            packLines.push(`${locId}=${debugName}`);

            const g = locId >>> 8;
            const fileId = locId & 255;
            locationLines.push(`${locId}=${g}:${fileId}`);
        }

        writePackFile('loc.pack', packLines);
        fs.writeFileSync(path.join(PACK_DIR, 'loc-locations.pack'), locationLines.join('\n') + '\n');

        const getLocDebugName = (id: number): string => {
            if (id === 65535 || id === -1) return 'null';
            return resolvedNames.get(id) ?? `loc_${id}`;
        };

        for (const [locId, debugName] of sortedPack) {
            const g = locId >>> 8;
            const fileId = locId & 255;
            const fileData = locIndex.unpacked[g]?.[fileId];
            if (!fileData) continue;

            const buf = new Packet(fileData);
            const def: string[] = [`[${debugName}]`];

            let modelIndex = 0;

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
                            const shape = buf.g1();
                            modelIndex++;
                            def.push(`model${modelIndex}${sfx}=${getModelName(model)},${shape}`);
                        }
                    } else if (opcode === 2) {
                        const sfx = suf('name');
                        def.push(`name${sfx}=${buf.gjstr()}`);
                    } else if (opcode === 3) {
                        const sfx = suf('desc');
                        def.push(`desc${sfx}=${buf.gjstr()}`);
                    } else if (opcode === 5) {
                        const sfx = suf('models');
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const model = buf.g2();
                            modelIndex++;
                            def.push(`model${modelIndex}${sfx}=${getModelName(model)},default`);
                        }
                    } else if (opcode === 14) {
                        const sfx = suf('width');
                        def.push(`width${sfx}=${buf.g1()}`);
                    } else if (opcode === 15) {
                        const sfx = suf('length');
                        def.push(`length${sfx}=${buf.g1()}`);
                    } else if (opcode === 17) {
                        const sfx = suf('blockflags');
                        def.push(`blockrange${sfx}=no`);
                        def.push(`blockwalk${sfx}=0`);
                    } else if (opcode === 18) {
                        const sfx = suf('blockflags');
                        def.push(`blockrange${sfx}=no`);
                    } else if (opcode === 19) {
                        const sfx = suf('active');
                        def.push(`active${sfx}=${buf.g1() !== 0 ? 'yes' : 'no'}`);
                    } else if (opcode === 21) {
                        const sfx = suf('skew');
                        def.push(`skewType${sfx}=1`);
                    } else if (opcode === 22) {
                        const sfx = suf('sharelight');
                        def.push(`sharelight${sfx}=yes`);
                    } else if (opcode === 23) {
                        const sfx = suf('occlude');
                        def.push(`occlude${sfx}=yes`);
                    } else if (opcode === 24) {
                        const sfx = suf('anim');
                        let anim = buf.g2();
                        if (anim === 65535) anim = -1;
                        def.push(`anim${sfx}=${anim === -1 ? 'null' : getSeqName(anim)}`);
                    } else if (opcode === 25) {
                        const sfx = suf('hasalpha');
                        def.push(`hasalpha${sfx}=yes`);
                    } else if (opcode === 27) {
                        const sfx = suf('blockflags');
                        def.push(`blockwalk${sfx}=1`);
                    } else if (opcode === 28) {
                        const sfx = suf('wallwidth');
                        def.push(`wallwidth${sfx}=${buf.g1()}`);
                    } else if (opcode === 29) {
                        const sfx = suf('ambient');
                        def.push(`ambient${sfx}=${buf.g1b()}`);
                    } else if (opcode === 39) {
                        const sfx = suf('contrast');
                        def.push(`contrast${sfx}=${buf.g1b() * 5}`);
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
                        const sfx = suf('mapfunction');
                        def.push(`mapfunction${sfx}=${buf.g2()}`);
                    } else if (opcode === 61) {
                        const sfx = suf('category');
                        def.push(`category${sfx}=${getCategoryName(buf.g2())}`);
                    } else if (opcode === 62) {
                        const sfx = suf('mirror');
                        def.push(`mirror${sfx}=yes`);
                    } else if (opcode === 64) {
                        const sfx = suf('shadow');
                        def.push(`shadow${sfx}=no`);
                    } else if (opcode === 65) {
                        const sfx = suf('resizex');
                        def.push(`resizex${sfx}=${buf.g2()}`);
                    } else if (opcode === 66) {
                        const sfx = suf('resizey');
                        def.push(`resizey${sfx}=${buf.g2()}`);
                    } else if (opcode === 67) {
                        const sfx = suf('resizez');
                        def.push(`resizez${sfx}=${buf.g2()}`);
                    } else if (opcode === 68) {
                        const sfx = suf('mapscene');
                        def.push(`mapscene${sfx}=${buf.g2()}`);
                    } else if (opcode === 69) {
                        const sfx = suf('forceapproach');
                        const flags = buf.g1();
                        let forceapproach = '';
                        if ((flags & 0b0001) === 0) forceapproach = 'north';
                        else if ((flags & 0b0010) === 0) forceapproach = 'east';
                        else if ((flags & 0b0100) === 0) forceapproach = 'south';
                        else if ((flags & 0b1000) === 0) forceapproach = 'west';
                        def.push(`forceapproach${sfx}=${forceapproach}`);
                    } else if (opcode === 70) {
                        const sfx = suf('offsetx');
                        def.push(`offsetx${sfx}=${buf.g2s()}`);
                    } else if (opcode === 71) {
                        const sfx = suf('offsety');
                        def.push(`offsety${sfx}=${buf.g2s()}`);
                    } else if (opcode === 72) {
                        const sfx = suf('offsetz');
                        def.push(`offsetz${sfx}=${buf.g2s()}`);
                    } else if (opcode === 73) {
                        const sfx = suf('forcedecor');
                        def.push(`forcedecor${sfx}=yes`);
                    } else if (opcode === 74) {
                        const sfx = suf('breakroutefinding');
                        def.push(`breakroutefinding${sfx}=yes`);
                    } else if (opcode === 75) {
                        const sfx = suf('raiseobject');
                        def.push(`raiseobject${sfx}=${buf.g1() !== 0 ? 'yes' : 'no'}`);
                    } else if (opcode === 77 || opcode === 92) {
                        const sfx = suf('multiloc');
                        let multivarbit = buf.g2();
                        if (multivarbit === 65535) multivarbit = -1;
                        let multivarp = buf.g2();
                        if (multivarp === 65535) multivarp = -1;
                        let defaultLoc = -1;
                        if (opcode === 92) {
                            defaultLoc = buf.g2();
                            if (defaultLoc === 65535) defaultLoc = -1;
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
                            def.push(`multiloc${j + 1}${sfx}=${getLocDebugName(id)}`);
                        }
                        if (opcode === 92) {
                            def.push(`multilocdefault${sfx}=${getLocDebugName(defaultLoc)}`);
                        }
                    } else if (opcode === 78) {
                        const sfx = suf('bgsound');
                        let bgsound = buf.g2();
                        if (bgsound === 65535) bgsound = -1;
                        const range = buf.g1();
                        def.push(`bgsound_sound${sfx}=${bgsound}`);
                        def.push(`bgsound_range${sfx}=${range}`);
                    } else if (opcode === 79) {
                        const sfx = suf('bgsound');
                        const mindelay = buf.g2();
                        const maxdelay = buf.g2();
                        const range = buf.g1();
                        const count = buf.g1();
                        const sounds: number[] = [];
                        for (let j = 0; j < count; j++) {
                            sounds.push(buf.g2());
                        }
                        def.push(`bgsound_mindelay${sfx}=${mindelay}`);
                        def.push(`bgsound_maxdelay${sfx}=${maxdelay}`);
                        def.push(`bgsound_range${sfx}=${range}`);
                        def.push(`bgsound_random${sfx}=${sounds.join(',')}`);
                    } else if (opcode === 81) {
                        const sfx = suf('skew');
                        const skewAmount = ((buf.g1() * 256) << 16) >> 16;
                        def.push(`skewType${sfx}=2`);
                        def.push(`skewAmount${sfx}=${skewAmount}`);
                    } else if (opcode === 82) {
                        const sfx = suf('unknown82');
                        def.push(`unknown82${sfx}=yes`);
                    } else if (opcode === 88) {
                        const sfx = suf('unknown88');
                        def.push(`unknown88${sfx}=yes`);
                    } else if (opcode === 89) {
                        const sfx = suf('randomanimframe');
                        def.push(`randomanimframe${sfx}=no`);
                    } else if (opcode === 90) {
                        const sfx = suf('field2799');
                        def.push(`field2799${sfx}=yes`);
                    } else if (opcode === 91) {
                        const sfx = suf('members');
                        def.push(`members${sfx}=yes`);
                    } else if (opcode === 93) {
                        const sfx = suf('skew');
                        const skewAmount = buf.g2s();
                        def.push(`skewType${sfx}=3`);
                        def.push(`skewAmount${sfx}=${skewAmount}`);
                    } else if (opcode === 94) {
                        const sfx = suf('skew');
                        def.push(`skewType${sfx}=4`);
                    } else if (opcode === 95) {
                        const sfx = suf('skew');
                        def.push(`skewType${sfx}=5`);
                    } else if (opcode === 249) {
                        const sfx = suf('params');
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const isString = buf.g1() === 1;
                            const key = buf.g3();
                            const val = isString ? buf.gjstr() : buf.g4();
                            def.push(`param${sfx}=${key},${isString ? 's' : 'n'},${val}`);
                        }
                    } else if (opcode === 250) {
                        buf.gjstr();
                    } else {
                        console.error(`Unhandled opcode ${opcode} on loc ID ${locId} (${debugName}) - aborting this entry to avoid desync.`);
                        break;
                    }
                }
            } catch (err) {
                console.error(`Parsing error on loc ID ${locId} (${debugName}):`, err);
            }

            configBlocks.push(def.join('\n'));
        }

        writeConfigFile('all.loc', configBlocks);

    } catch (err) {
        console.error('Error during Loc configs unpacking:', err);
    }
}

unpack();
