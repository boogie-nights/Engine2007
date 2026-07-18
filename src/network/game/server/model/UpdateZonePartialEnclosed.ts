import ServerGameMessage from '#/network/game/server/ServerGameMessage.js';
import { ServerGameProtPriority } from '#/network/game/server/prot/ServerGameProtPriority.ts';

export default class UpdateZonePartialEnclosed extends ServerGameMessage {
    priority = ServerGameProtPriority.BUFFERED;
    constructor(
        readonly zoneX: number,
        readonly zoneZ: number,
        readonly originX: number,
        readonly originZ: number,
        readonly data: Uint8Array
    ) {
        super();
    }
}
