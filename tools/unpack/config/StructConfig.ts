import Js5Index from '#/js5/Js5Index.js';
import Packet from '#/io/Packet.js';
import {
    ensureOutputDirs,
    writePackFile,
    writeConfigFile,
    loadPackFile,
    readFlatFile,
    resolveName
} from '#tools/util/ConfigPackHelper.ts';

const CONFIG_ARCHIVE = 2;
const STRUCT_GROUP = 26;

function unpack() {
    ensureOutputDirs();

    const structNames = loadPackFile('struct-names.pack');
    const paramNames = loadPackFile('param.pack');

    try {
        const configIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, CONFIG_ARCHIVE);
        if (!indexData) {
            console.error('Failed to read Config Archive Index (255.2) from cache.');
            return;
        }
        configIndex.decode(indexData);

        const rawContainer = readFlatFile(CONFIG_ARCHIVE, STRUCT_GROUP);
        if (!rawContainer) {
            console.error('Failed to read Struct group (2.26) from cache.');
            return;
        }

        configIndex.packed[STRUCT_GROUP] = rawContainer;
        if (!configIndex.unpackGroup(STRUCT_GROUP)) {
            console.error('Failed to unpack Struct group.');
            return;
        }

        const filesCount = configIndex.groupSize[STRUCT_GROUP];
        const fileIds = configIndex.fileIds[STRUCT_GROUP];

        type Entry = { fileId: number; structId: number };
        const entries: Entry[] = [];
        const resolvedNames = new Map<number, string>();
        const packLines: string[] = [];

        for (let i = 0; i < filesCount; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const structId = fileId;

            const name = structNames.get(structId) ?? resolveName(null, 'struct', structId);

            entries.push({ fileId, structId });
            resolvedNames.set(structId, name);
            packLines.push(`${structId}=${name}`);
        }

        writePackFile('struct.pack', packLines);

        const configBlocks: string[] = [];

        for (const { fileId, structId } of entries) {
            const fileData = configIndex.unpacked[STRUCT_GROUP]?.[fileId];
            if (!fileData) continue;

            const name = resolvedNames.get(structId) ?? `struct_${structId}`;
            const buf = new Packet(fileData);

            const def: string[] = [`[${name}]`];

            try {
                while (buf.pos < buf.data.length) {
                    const opcode = buf.g1();
                    if (opcode === 0) break;

                    if (opcode === 249) {
                        const count = buf.g1();

                        for (let j = 0; j < count; j++) {
                            const isString = buf.g1() === 1;
                            const paramKey = buf.g3();
                            const value = isString ? buf.gjstr() : buf.g4();

                            const paramName = paramNames.get(paramKey) ?? `param_${paramKey}`;
                            def.push(`param=${paramName},${value}`);
                        }
                    } else {
                        console.error(`Unknown opcode ${opcode} on Struct ID ${structId}, aborting parse.`);
                        break;
                    }
                }

                configBlocks.push(def.join('\n'));

            } catch (err) {
                console.error(`Parsing warning on Struct ID ${structId}:`, err);
                configBlocks.push(`[${name}]`);
            }
        }

        writeConfigFile('all.struct', configBlocks);

    } catch (err) {
        console.error('Error during Struct configs unpacking:', err);
    }
}

unpack();
