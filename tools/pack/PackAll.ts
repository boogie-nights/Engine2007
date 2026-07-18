// import fs from 'fs';
import { parentPort } from 'worker_threads';

// import * as fflate from 'fflate';

// import FileStream from '#/io/FileStream.js';
import Packet from '#/io/Packet.js';

// import { ModelPack, revalidatePack } from '#tools/pack/PackFile.js';
// import { packClientWordenc } from '#tools/pack/chat/pack.js';
// import { packConfigs } from '#tools/pack/config/PackShared.js';
// import { packClientGraphics } from '#tools/pack/graphics/pack.js';
// import { packClientInterface } from '#tools/pack/interface/PackClient.js';
// import { packMaps } from '#tools/pack/map/Pack.js';
// import { packClientMidi } from '#tools/pack/midi/pack.js';
// import { packClientSound } from '#tools/pack/sound/pack.js';
// import { packClientMedia } from '#tools/pack/sprite/media.js';
// import { packClientTexture } from '#tools/pack/sprite/textures.js';
// import { packClientTitle } from '#tools/pack/sprite/title.js';
import { runServerCompiler } from '#tools/pack/Compiler.ts';
// import { packClientVersionList } from '#tools/pack/versionlist/pack.js';
import { clearFsCache } from '#tools/pack/FsCache.ts';
import { regenScriptPack } from '#tools/pack/ScriptPack.ts';
import { pack as packVarps } from './config/VarpConfig.ts';
import { pack as packVarbits } from './config/VarbitConfig.ts';
import { pack as packFlu } from './config/FluConfig.ts';
import { pack as packFlo } from './config/FloConfig.ts';
import { pack as packInv } from './config/InvConfig.ts';
import { pack as packSeq } from './config/SeqConfig.ts';
import { pack as packObj } from './config/ObjConfig.ts';
import { pack as packLoc } from './config/LocConfig.ts';
import { pack as packIf } from './interface/pack.ts';
import { pack as packNpc } from './config/NpcConfig.ts';
import { pack as packVarn } from './config/VarnConfig.ts';
import { pack as packVars } from './config/VarsConfig.ts';
import { pack as packEnum } from './config/EnumConfig.ts';
import { pack as packParam } from './config/ParamConfig.ts';
import OpenRs2 from '#/util/OpenRs2.ts';
import { pack as packHunt} from './config/HuntConfig.ts';
import { pack as packStruct} from './config/StructConfig.ts';
import { pack as packCategory } from './config/Category.ts';
import { pack as packMesAnim } from './config/MesAnimConfig.ts';
import { pack as packSpot } from './config/SpotConfig.ts';

export async function packAll(modelFlags: number[]) {
    if (parentPort) {
        parentPort.postMessage({
            type: 'dev_progress',
            broadcast: 'Packing changes'
        });
    }

    clearFsCache();
    console.error('(First run only) Delete entire data/cache and let it redownload... and then empty keys.json and run map packer !');
    await OpenRs2.RS2_500.predownload();
    await OpenRs2.RS2_500.loadKeys();
    await OpenRs2.RS2_500.loadMapIndex();
    console.warn('Inefficiently packing configs every time...');
    await packVarps();
    await packVarbits();
    await packFlu();
    await packFlo();
    await packObj();
    await packInv();
    await packSeq();
    await packLoc();
    await packIf();
    await packNpc();
    await packVarn();
    await packVars();
    await packEnum();
    await packParam();
    await packHunt();
    await packStruct();
    await packCategory();
    await packMesAnim();
    await packSpot();
    
    // revalidatePack();

    // for (let i = 0; i < ModelPack.max; i++) {
    //     modelFlags[i] = 0;
    // }

    // // todo: better build conditions to do minimal rebuilds and only build a new client cache if necessary
    // const cache = new FileStream('data/pack', true);

    // await packConfigs(cache, modelFlags);
    // packClientInterface(cache, modelFlags);

    // // relies on reading configs/interfaces for compile-time context
    console.warn('Packing scripts (also inefficiently)');
    regenScriptPack();
    runServerCompiler();

    // await packClientTitle(cache);
    // await packClientMedia(cache);
    // await packClientTexture(cache);
    // packClientWordenc(cache);
    // packClientSound(cache);

    // packClientGraphics(cache, modelFlags);

    // packClientMidi(cache);

    // packMaps(cache, modelFlags);

    // packClientVersionList(cache, modelFlags); // relies on additional flags set during packMaps

    // const build = Packet.alloc(0);
    // build.p4(Date.now() / 1000);
    // build.save('data/pack/server/build');

    // const zipPack: Record<string, Uint8Array> = {};
    // for (let archive = 1; archive <= 4; archive++) {
    //     const count = cache.count(archive);
    //     for (let file = 0; file < count; file++) {
    //         const data = cache.read(archive, file);
    //         if (!data) {
    //             continue;
    //         }

    //         zipPack[`${archive}.${file}`] = data;
    //     }
    // }
    // const zip = fflate.zipSync(zipPack, { level: 0 });
    // fs.writeFileSync('data/pack/ondemand.zip', zip);

    if (parentPort) {
        parentPort.postMessage({
            type: 'dev_progress',
            text: 'Reloading with changes'
        });
    }
}