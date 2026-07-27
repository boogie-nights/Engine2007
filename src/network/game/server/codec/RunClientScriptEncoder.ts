import type Packet from '#/io/Packet.ts';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.ts';
import type RunClientScript from '#/network/game/server/model/RunClientScript.ts';
import ServerGameProt from '#/network/game/server/prot/ServerGameProt.ts';

export default class RunClientScriptEncoder extends ServerGameMessageEncoder<RunClientScript> {
    prot = ServerGameProt.RUNCLIENTSCRIPT;

    encode(buf: Packet, message: RunClientScript) {
        const { id, args } = message;

        let types = '';
        for (let i = 0; i < args.length; i++) {
            if (typeof args[i] === 'string') {
                types += 's';
            } else {
                types += 'i';
            }
        }
        buf.pjstr(types);

        for (let i = args.length - 1; i >= 0; i--) {
            const arg = args[i];
            if (typeof arg === 'string') {
                buf.pjstr(arg);
            } else {
                buf.p4(arg);
            }
        }

        buf.p4(id);
    }
}
