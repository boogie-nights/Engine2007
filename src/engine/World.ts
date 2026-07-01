import NetworkPlayer from '#/engine/NetworkPlayer.ts';
import type Player from '#/engine/entity/Player.ts';
import Packet from '#/io/Packet.ts';
import OpenRs2 from '#/util/OpenRs2.ts';
import MessageGame from '#/network/server/model/game/MessageGame.ts';
import IfOpenSub from '#/network/server/model/game/IfOpenSub.ts';
import IfOpenTop from '#/network/server/model/game/IfOpenTop.ts';
import PlayerInfo from '#/network/server/model/game/PlayerInfo.ts';
import RebuildNormal from '#/network/server/model/game/RebuildNormal.ts';
import { Worker } from 'worker_threads';
import * as rsbuf from '#/network/rsbuf/index.js';
import { PlayerInfoProt } from '#/network/rsbuf/prot.ts';
import Huffman from '#/wordfilter2/Huffman.ts';
import WordPack from '#/wordfilter2/WordPack.ts';
import { PlayerStat } from '#/engine/entity/PlayerStat.js';

class World {
    cache = OpenRs2.RS2_500;

    readonly players: Player[] = new Array(2048);
    currentTick: number = 100; // start with a minute of uptime in case scripts skip testing 0-checks

    // private readonly loggerThread = new Worker('./src/server/logger/LoggerThread.ts'); todo

    getNextPlayerSlot(): number {
        for (let i = 1; i < 2047; i++) {
            if (typeof this.players[i] === 'undefined') {
                return i;
            }
        }
        return -1;
    }

    async load() {
        await this.cache.predownload();
        await this.cache.loadKeys();
        await this.cache.loadMapIndex();

        const huffmanBytes = await this.cache.getFile(10, 'huffman', '');
        if (!huffmanBytes) {
            throw new Error('Missing huffman table in cache index 10');
        }
        WordPack.setHuffman(new Huffman(huffmanBytes));

        this.cycle();
    }

    submitInputTracking(player: Player, buf: Uint8Array) {
        // this.loggerThread.postMessage({
        //     type: 'input_track',
        //     session_uuid: player.session,
        //     timestamp: Date.now(),
        //     buf: Buffer.from(buf).toString('base64')
        // });
    }

    cycle() {
        // read client input
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!(player instanceof NetworkPlayer)) {
                continue;
            }

            if (player.client.state === -1) {
                rsbuf.removePlayer(player.pid);
                delete this.players[i];
                continue;
            }

            // the client has code like `for (int i = 0; i < 5 && read(); i++)` which mirrors this logic

            player.client.userLimit = 0;
            player.client.clientLimit = 0;

            while (player.client.userLimit < 5 && player.client.clientLimit < 50 && player.read()) {
                // empty
            }
        }

        // process players
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];

            // todo
        }

        // write client output
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!player) continue;
            if (!(player instanceof NetworkPlayer)) {
                continue;
            }

            if (player.client.state === -1) {
                rsbuf.removePlayer(player.pid);
                delete this.players[i];
                continue;
            }

            player.updateStats();

            const appearance = (player.masks & PlayerInfoProt.APPEARANCE)
                ? player.generateAppearance()
                : (player.appearanceBuf ?? player.generateAppearance());
            rsbuf.computePlayer(
                player.x,
                player.level,
                player.z,
                player.originX,
                player.originZ,
                player.pid,
                player.tele,
                player.jump,
                player.runDir,
                player.walkDir,
                player.visibility,
                player.isActive,
                player.masks,
                appearance,
                player.lastAppearance,
                player.faceEntity,
                player.faceSquareX,
                player.faceSquareZ,
                player.faceAngleX,
                player.faceAngleZ,
                player.hitmarkDamage,
                player.hitmarkType,
                player.hitmark2Damage,
                player.hitmark2Type,
                player.levels[PlayerStat.HITPOINTS],
                player.baseLevels[PlayerStat.HITPOINTS],
                player.animId,
                player.animDelay,
                player.sayMessage,
                player.chatMessage,
                player.chatColour ?? 0,
                player.chatEffect ?? 0,
                player.chatRights ?? 0,
                player.spotanimId,
                player.spotanimHeight,
                player.spotanimTime,
                player.exactStartX,
                player.exactStartZ,
                player.exactEndX,
                player.exactEndZ,
                player.exactMoveStart,
                player.exactMoveEnd,
                player.exactMoveFacing
            );

            const dx = Math.abs(player.lastTickX - player.x);
            const dz = Math.abs(player.lastTickZ - player.z);
            const levelChanged = player.lastLevel !== player.level;

            const bytes = rsbuf.playerInfo(0, player.pid, dx, dz, levelChanged);
            player.write(new PlayerInfo(bytes));

            if (player.buffer.length > 0) {
                for (const message of player.buffer) {
                    player.write(message, true);
                }

                player.buffer.length = 0;
            }
            player.lastTickX = player.x;
            player.lastTickZ = player.z;
            player.lastLevel = player.level;
        }

        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!player) continue;
            player.resetEntity(false);
        }

        rsbuf.cleanup();
        this.currentTick++;

        // todo: account for drift due to event loop/OS scheduling
        setTimeout(this.cycle.bind(this), 600);
    }

    addPlayer(player: Player, reconnect = false) {
        if (player instanceof NetworkPlayer) {
            const slot = this.getNextPlayerSlot();
            if (slot === -1) {
                player.client.close();
                return;
            }
            player.pid = slot;
            this.players[slot] = player;
            rsbuf.addPlayer(slot);
            const reply = Packet.alloc(9);
            if (reconnect) {
                reply.p1(15);
                player.client.write(reply);
                player.client.state = 1;
                return;
            }

            reply.p1(2);      // ok
            reply.p1(0);      // staffmodlevel
            reply.p1(0);      // playermod
            reply.p1(0);      // underage
            reply.p1(0);      // mapQuickchat
            reply.p1(1);      // mouseTracked
            reply.p2(player.pid);   // selfSlot
            reply.p1(1);      // membersAccount
            player.client.write(reply);
            player.client.state = 1;
            player.buildAppearance(0); //todo
            player.write(new RebuildNormal(2656, 4704));
            // runescript: mes("Welcome to RuneScape.");
            player.write(new MessageGame('Welcome to RuneScape.'));
            // runescript: if_opentop(toplevel);
            player.write(new IfOpenTop(548));

            // runescript: if_openoverlay(toplevel:x, y);
            player.write(new IfOpenSub((548 << 16) | 115, 137, 1)); // toplevel:chat -> chat
            player.write(new IfOpenSub((548 << 16) | 128, 92, 1)); // toplevel:stone0 -> combat-unarmed
            player.write(new IfOpenSub((548 << 16) | 129, 320, 1)); // toplevel:stone1 -> stats
            player.write(new IfOpenSub((548 << 16) | 130, 274, 1)); // toplevel:stone2 -> questjournal_v2
            player.write(new IfOpenSub((548 << 16) | 131, 149, 1)); // toplevel:stone3 -> inventory
            player.write(new IfOpenSub((548 << 16) | 132, 387, 1)); // toplevel:stone4 -> wornitems
            player.write(new IfOpenSub((548 << 16) | 133, 271, 1)); // toplevel:stone5 -> prayer
            player.write(new IfOpenSub((548 << 16) | 134, 192, 1)); // toplevel:stone6 -> magic
            player.write(new IfOpenSub((548 << 16) | 135, 662, 1)); // toplevel:stone7 -> lore_stats_side
            player.write(new IfOpenSub((548 << 16) | 136, 550, 1)); // toplevel:stone8 -> friends2
            player.write(new IfOpenSub((548 << 16) | 137, 551, 1)); // toplevel:stone9 -> ignore2
            player.write(new IfOpenSub((548 << 16) | 138, 589, 1)); // toplevel:stone10 -> clanjoin
            player.write(new IfOpenSub((548 << 16) | 139, 261, 1)); // toplevel:stone11 -> options
            player.write(new IfOpenSub((548 << 16) | 140, 464, 1)); // toplevel:stone12 -> emotes
            player.write(new IfOpenSub((548 << 16) | 141, 187, 1)); // toplevel:stone13 -> music
            player.write(new IfOpenSub((548 << 16) | 142, 182, 1));  // toplevel:logout -> logout
        }
    }
}

export default new World();
