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
} from '#tools/util/ConfigPackHelper.ts';

const CONFIG_ARCHIVE = 2;
const IDK_GROUP = 3;

const IDK_PART_TYPE_NAMES: Record<number, string> = {
    0: 'man_hair',
    1: 'man_jaw',
    2: 'man_torso',
    3: 'man_arms',
    4: 'man_hands',
    5: 'man_legs',
    6: 'man_feet',
    7: 'woman_hair',
    8: 'woman_jaw',
    9: 'woman_torso',
    10: 'woman_arms',
    11: 'woman_hands',
    12: 'woman_legs',
    13: 'woman_feet',
};

function unpack() {
    ensureOutputDirs();

    const idkNames = loadPackFile('idk-names.pack');
    const modelPack = loadPackFile('model.pack');

    const getModelName = (id: number): string => modelPack.get(id) ?? `model_${id}`;

    const resolveColor = (hsl: number): string => {
        const possible = ColorConversion.reverseHsl(hsl);
        const rgb = possible.length > 0 ? possible[0] : null;

        if (rgb !== null && ColorConversion.rgb15toHsl16(rgb) === hsl) {
            return String(rgb);
        }

        return `hsl:${hsl}`;
    };

    try {
        const configIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, CONFIG_ARCHIVE);
        if (!indexData) {
            console.error('Failed to read Config Archive Index (255.2) from cache.');
            return;
        }
        configIndex.decode(indexData);

        const rawContainer = readFlatFile(CONFIG_ARCHIVE, IDK_GROUP);
        if (!rawContainer) {
            console.error(`Failed to read Idk group (${CONFIG_ARCHIVE}.${IDK_GROUP}) from cache.`);
            return;
        }

        configIndex.packed[IDK_GROUP] = rawContainer;
        if (!configIndex.unpackGroup(IDK_GROUP)) {
            console.error('Failed to unpack Idk group.');
            return;
        }

        const filesCount = configIndex.groupSize[IDK_GROUP];
        const fileIds = configIndex.fileIds[IDK_GROUP];

        const packLines: string[] = [];
        const configBlocks: string[] = [];

        for (let i = 0; i < filesCount; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const idkId = fileId;

            const name = idkNames.get(idkId) ?? resolveName(null, 'idk', idkId);
            packLines.push(`${idkId}=${name}`);

            const fileData = configIndex.unpacked[IDK_GROUP]?.[fileId];
            if (!fileData) continue;

            const buf = new Packet(fileData);
            const def: string[] = [`[${name}]`];

            try {
                while (buf.pos < buf.data.length) {
                    const opcode = buf.g1();
                    if (opcode === 0) break;

                    if (opcode === 1) {
                        const type = buf.g1();
                        def.push(`type=${IDK_PART_TYPE_NAMES[type] ?? type}`);
                    } else if (opcode === 2) {
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            def.push(`model${j + 1}=${getModelName(buf.g2())}`);
                        }
                    } else if (opcode === 3) {
                        def.push('disable=yes');
                    } else if (opcode === 40) {
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const retexD = buf.g2();
                            const recolD = buf.g2();
                            def.push(`retex_d${j + 1}=${retexD}`);
                            def.push(`recol_d${j + 1}=${resolveColor(recolD)}`);
                        }
                    } else if (opcode === 41) {
                        const count = buf.g1();
                        for (let j = 0; j < count; j++) {
                            const retexS = buf.g2();
                            const recolS = buf.g2();
                            def.push(`retex_s${j + 1}=${retexS}`);
                            def.push(`recol_s${j + 1}=${resolveColor(recolS)}`);
                        }
                    } else if (opcode >= 60 && opcode < 70) {
                        const index = opcode - 60;
                        if (index >= 5) {
                            console.warn(`Idk ID ${idkId} (${name}): head opcode ${opcode} maps to index ${index}, out of range for head[5] — ignoring value.`);
                            buf.g2();
                            continue;
                        }
                        def.push(`head${index + 1}=${getModelName(buf.g2())}`);
                    } else {
                        console.error(`Unknown opcode ${opcode} on Idk ID ${idkId} (${name}), aborting parse.`);
                        break;
                    }
                }
            } catch (err) {
                console.error(`Parsing error on Idk ID ${idkId} (${name}):`, err);
            }

            configBlocks.push(def.join('\n'));
        }

        writePackFile('idk.pack', packLines);
        writeConfigFile('all.idk', configBlocks);

    } catch (err) {
        console.error('Error during Idk configs unpacking:', err);
    }
}

unpack();