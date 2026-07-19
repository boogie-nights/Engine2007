import fs from 'fs';
import path from 'path';
import { ungzip } from 'pako';
import Js5Index from '#/js5/Js5Index.js';
import BZip2 from '#/io/BZip2.ts';
import Packet from '#/io/Packet.ts';
import Environment from '#/util/Environment.ts';
import {
    ensureOutputDirs,
    writePackFile,
    loadPackFile,
    readFlatFile,
} from '#tools/util/ConfigPackHelper.ts';

const MODEL_ARCHIVE = 7;
const MODEL_OUT_DIR = path.join(Environment.BUILD_SRC_DIR, 'models');

function decompressGroup(raw: Uint8Array): Uint8Array {
    const ctype = raw[0];
    const clen = ((raw[1] << 24) | (raw[2] << 16) | (raw[3] << 8) | raw[4]) >>> 0;

    if (ctype === 0) {
        return raw.subarray(5, 5 + clen);
    }

    const ulen = ((raw[5] << 24) | (raw[6] << 16) | (raw[7] << 8) | raw[8]) >>> 0;
    const payload = raw.subarray(9, 9 + clen);

    if (ctype === 1) {
        return BZip2.decompress(new Packet(payload), ulen);
    }

    return ungzip(payload);
}

function unpack() {
    ensureOutputDirs();
    if (!fs.existsSync(MODEL_OUT_DIR)) {
        fs.mkdirSync(MODEL_OUT_DIR, { recursive: true });
    }

    const logLines: string[] = [];
    const log = (msg: string) => {
        console.error(msg);
        logLines.push(msg);
    };

    const modelNames = loadPackFile('model-names.pack');

    const modelIndex = new Js5Index(false, false);

    const indexData = readFlatFile(255, MODEL_ARCHIVE);
    modelIndex.decode(indexData);

    const packLines: string[] = [];
    let ok = 0;
    let errored = 0;

    for (let g = 0; g < modelIndex.capacity; g++) {
        try {
            if (modelIndex.groupSize[g] === 0) continue;

            let groupData: Uint8Array;
            try {
                groupData = readFlatFile(MODEL_ARCHIVE, g);
            } catch {
                continue;
            }

            let fileData: Uint8Array;
            try {
                fileData = decompressGroup(groupData);
            } catch (err) {
                log(`Group ${g}: decompress failed — ${err instanceof Error ? err.message : String(err)}`);
                errored++;
                continue;
            }

            const name = modelNames.get(g) ?? `model_${g}`;
            packLines.push(`${g}=${name}`);

            const isOb3 = fileData.length >= 2 && fileData[fileData.length - 1] === 0xff && fileData[fileData.length - 2] === 0xff;
            const ext = isOb3 ? '.ob3' : '.ob2';

            fs.writeFileSync(path.join(MODEL_OUT_DIR, `${name}${ext}`), fileData);
            ok++;
        } catch (err) {
            log(`Group ${g}: uncaught exception — ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
            errored++;
        }
    }
    writePackFile('model.pack', packLines);
}

unpack();