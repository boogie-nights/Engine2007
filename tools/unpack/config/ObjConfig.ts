import Js5Index from '#/js5/Js5Index.js';
import Packet from '#/io/Packet.js';
import ColorConversion from '#tools/util/ColorConversion.ts';
import {
    ensureOutputDirs,
    writeConfigFile,
    resolveName,
    loadPackFile,
    readFlatFile,
} from '#tools/util/ConfigPackHelper.ts';

function unpack() {
    ensureOutputDirs();

    try {
        const objIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, 19);
        if (!indexData) {
            console.error('Failed to read Objects Archive Index (255.19) from cache.');
            return;
        }
        objIndex.decode(indexData);

        const groupCount = objIndex.capacity;

        for (let g = 0; g < groupCount; g++) {
            const groupSize = objIndex.groupSize[g];
            if (groupSize === 0) continue;

            const groupData = readFlatFile(19, g);
            if (!groupData) continue;

            objIndex.packed[g] = groupData;
            objIndex.unpackGroup(g);
        }

        const objPack = loadPackFile('obj.pack');
        const texturePack = loadPackFile('texture.pack');
        const modelPack = loadPackFile('model.pack');

        const resolvedNames = new Map<number, string>();
        const configBlocks: string[] = [];

        const getTextureName = (id: number) => {
            return texturePack.get(id) ?? `texture_${id}`;
        };

        const getModelName = (id: number) => {
            return modelPack.get(id) ?? `model_${id}`;
        };

        const resolveColor = (hsl: number): number => {
            const possible = ColorConversion.reverseHsl(hsl);
            return possible.length > 0 ? possible[0] : hsl;
        };

        for (let g = 0; g < groupCount; g++) {
            const groupSize = objIndex.groupSize[g];
            if (groupSize === 0) continue;

            const fileIds = objIndex.fileIds[g];

            for (let i = 0; i < groupSize; i++) {
                const fileId = fileIds ? fileIds[i] : i;
                const fileData = objIndex.unpacked[g]?.[fileId];
                if (!fileData) continue;

                const itemId = (g << 8) | fileId;
                const buf = new Packet(fileData);
                let itemName: string | null = null;

                try {
                    while (buf.pos < buf.data.length) {
                        const opcode = buf.g1();
                        if (opcode === 0) break;

                        if (opcode === 1) { buf.pos += 2; }
                        else if (opcode === 2) { itemName = buf.gjstr(); }
                        else if (opcode === 4) { buf.pos += 2; }
                        else if (opcode === 5) { buf.pos += 2; }
                        else if (opcode === 6) { buf.pos += 2; }
                        else if (opcode === 7) { buf.pos += 2; }
                        else if (opcode === 8) { buf.pos += 2; }
                        else if (opcode === 11) {}
                        else if (opcode === 12) { buf.pos += 4; }
                        else if (opcode === 16) {}
                        else if (opcode === 23) { buf.pos += 3; }
                        else if (opcode === 24) { buf.pos += 2; }
                        else if (opcode === 25) { buf.pos += 3; }
                        else if (opcode === 26) { buf.pos += 2; }
                        else if (opcode >= 30 && opcode < 35) { buf.gjstr(); }
                        else if (opcode >= 35 && opcode < 40) { buf.gjstr(); }
                        else if (opcode === 40) {
                            const count = buf.g1();
                            buf.pos += count * 4;
                        } else if (opcode === 41) {
                            const count = buf.g1();
                            buf.pos += count * 4;
                        } else if (opcode === 42) {
                            const count = buf.g1();
                            buf.pos += count;
                        } else if (opcode === 65) {}
                        else if (opcode === 78) { buf.pos += 2; }
                        else if (opcode === 79) { buf.pos += 2; }
                        else if (opcode === 90) { buf.pos += 2; }
                        else if (opcode === 91) { buf.pos += 2; }
                        else if (opcode === 92) { buf.pos += 2; }
                        else if (opcode === 93) { buf.pos += 2; }
                        else if (opcode === 95) { buf.pos += 2; }
                        else if (opcode === 96) { buf.pos += 1; }
                        else if (opcode === 97) { buf.pos += 2; }
                        else if (opcode === 98) { buf.pos += 2; }
                        else if (opcode >= 100 && opcode < 110) { buf.pos += 4; }
                        else if (opcode === 110) { buf.pos += 2; }
                        else if (opcode === 111) { buf.pos += 2; }
                        else if (opcode === 112) { buf.pos += 2; }
                        else if (opcode === 113) { buf.pos += 1; }
                        else if (opcode === 114) { buf.pos += 1; }
                        else if (opcode === 115) { buf.pos += 1; }
                        else if (opcode === 121) { buf.pos += 2; }
                        else if (opcode === 122) { buf.pos += 2; }
                        else if (opcode === 124) {
                            buf.g1();
                            buf.pos += 12;
                        }
                        else if (opcode === 249) {
                            const count = buf.g1();
                            for (let k = 0; k < count; k++) {
                                const isString = buf.g1() === 1;
                                buf.pos += 3;
                                if (isString) {
                                    buf.gjstr();
                                } else {
                                    buf.pos += 4;
                                }
                            }
                        }
                    }
                } catch {}

                let debugName = objPack.get(itemId);
                if (!debugName) {
                    debugName = resolveName(itemName, 'obj', itemId);
                }
                resolvedNames.set(itemId, debugName);
            }
        }

        const sortedPack = Array.from(resolvedNames.entries()).sort((a, b) => a[0] - b[0]);

        const getObjDebugName = (id: number): string => {
            if (id === 65535 || id === -1) return 'null';
            return resolvedNames.get(id) ?? `obj_${id}`;
        };

        for (const [itemId, debugName] of sortedPack) {
            const g = itemId >>> 8;
            const fileId = itemId & 255;
            const fileData = objIndex.unpacked[g]?.[fileId];
            if (!fileData) continue;

            const buf = new Packet(fileData);
            const def: string[] = [`[${debugName}]`];

            try {
                while (buf.pos < buf.data.length) {
                    const opcode = buf.g1();
                    if (opcode === 0) break;

                    if (opcode === 1) {
                        def.push(`model=${getModelName(buf.g2())}`);
                    } else if (opcode === 2) {
                        def.push(`name=${buf.gjstr()}`);
                    } else if (opcode === 4) {
                        def.push(`2dzoom=${buf.g2()}`);
                    } else if (opcode === 5) {
                        def.push(`2dxan=${buf.g2()}`);
                    } else if (opcode === 6) {
                        def.push(`2dyan=${buf.g2()}`);
                    } else if (opcode === 7) {
                        let val = buf.g2();
                        if (val > 32767) val -= 65536;
                        def.push(`2dxof=${val}`);
                    } else if (opcode === 8) {
                        let val = buf.g2();
                        if (val > 32767) val -= 65536;
                        def.push(`2dyof=${val}`);
                    } else if (opcode === 11) {
                        def.push('stackable=yes');
                    } else if (opcode === 12) {
                        def.push(`cost=${buf.g4()}`);
                    } else if (opcode === 16) {
                        def.push('members=yes');
                    } else if (opcode === 23) {
                        def.push(`manwear=${getModelName(buf.g2())},${buf.g1()}`);
                    } else if (opcode === 24) {
                        def.push(`manwear2=${getModelName(buf.g2())}`);
                    } else if (opcode === 25) {
                        def.push(`womanwear=${getModelName(buf.g2())},${buf.g1()}`);
                    } else if (opcode === 26) {
                        def.push(`womanwear2=${getModelName(buf.g2())}`);
                    } else if (opcode >= 30 && opcode < 35) {
                        const index = opcode - 30 + 1;
                        def.push(`op${index}=${buf.gjstr()}`);
                    } else if (opcode >= 35 && opcode < 40) {
                        const index = opcode - 35 + 1;
                        def.push(`iop${index}=${buf.gjstr()}`);
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
                    } else if (opcode === 42) {
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            def.push(`recol${j + 1}d_palette=${buf.g1b()}`);
                        }
                    } else if (opcode === 65) {
                        def.push('stockmarket=yes');
                    } else if (opcode === 78) {
                        def.push(`manwear3=${getModelName(buf.g2())}`);
                    } else if (opcode === 79) {
                        def.push(`womanwear3=${getModelName(buf.g2())}`);
                    } else if (opcode === 90) {
                        def.push(`manhead=${getModelName(buf.g2())}`);
                    } else if (opcode === 91) {
                        def.push(`womanhead=${getModelName(buf.g2())}`);
                    } else if (opcode === 92) {
                        def.push(`manhead2=${getModelName(buf.g2())}`);
                    } else if (opcode === 93) {
                        def.push(`womanhead2=${getModelName(buf.g2())}`);
                    } else if (opcode === 95) {
                        def.push(`2dzan=${buf.g2()}`);
                    } else if (opcode === 96) {
                        def.push(`dummyitem=${buf.g1()}`);
                    } else if (opcode === 97) {
                        def.push(`certlink=${getObjDebugName(buf.g2())}`);
                    } else if (opcode === 98) {
                        def.push(`certtemplate=${getObjDebugName(buf.g2())}`);
                    } else if (opcode >= 100 && opcode < 110) {
                        const index = opcode - 100 + 1;
                        const linkId = buf.g2();
                        const count = buf.g2();
                        def.push(`count${index}=${getObjDebugName(linkId)},${count}`);
                    } else if (opcode === 110) {
                        def.push(`resizex=${buf.g2()}`);
                    } else if (opcode === 111) {
                        def.push(`resizey=${buf.g2()}`);
                    } else if (opcode === 112) {
                        def.push(`resizez=${buf.g2()}`);
                    } else if (opcode === 113) {
                        def.push(`ambient=${buf.g1b()}`);
                    } else if (opcode === 114) {
                        def.push(`contrast=${buf.g1b() * 5}`);
                    } else if (opcode === 115) {
                        def.push(`team=${buf.g1()}`);
                    } else if (opcode === 121) {
                        def.push(`lentlink=${getObjDebugName(buf.g2())}`);
                    } else if (opcode === 122) {
                        def.push(`lenttemplate=${getObjDebugName(buf.g2())}`);
                    } else if (opcode === 124) {
                        const index = buf.g1();
                        const vals: number[] = [];
                        for (let j = 0; j < 6; j++) {
                            vals.push(buf.g2s());
                        }
                        def.push(`offsets${index}=${vals.join(',')}`);
                    } else if (opcode === 249) {
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const isString = buf.g1() === 1;
                            const key = buf.g3();
                            const val = isString ? buf.gjstr() : buf.g4();
                            def.push(`param=${key},${val}`);
                        }
                    }
                }
            } catch (err) {
                console.error(`Parsing error on item ID ${itemId} (${debugName}):`, err);
            }

            configBlocks.push(def.join('\n'));
        }

        writeConfigFile('all.obj', configBlocks);

    } catch {
        
    }
}

unpack();
