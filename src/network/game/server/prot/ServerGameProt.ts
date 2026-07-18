export default class ServerGameProt {
    static byId: ServerGameProt[] = [];

    static readonly IF_OPENTOP = new ServerGameProt(86, 3);
    static readonly IF_OPENSUB = new ServerGameProt(25, 7);

    static readonly CHAT_FILTER_SETTINGS = new ServerGameProt(237, 3);
    static readonly MESSAGE_GAME = new ServerGameProt(117, -1);
    static readonly MESSAGE_PRIVATE = new ServerGameProt(6, -1);

    static readonly LOGOUT = new ServerGameProt(240, 0);

    static readonly MIDI_JINGLE = new ServerGameProt(89, 5);
    static readonly MIDI_SONG = new ServerGameProt(10, 2);
    static readonly SYNTH_SOUND = new ServerGameProt(113, 5);

    static readonly PLAYER_INFO = new ServerGameProt(116, -2);
    static readonly NPC_INFO = new ServerGameProt(19, -2);

    static readonly REBUILD_NORMAL = new ServerGameProt(79, -2);

    static readonly UPDATE_INV_FULL = new ServerGameProt(186, -2);
    static readonly UPDATE_RUNENERGY = new ServerGameProt(68, 1);
    static readonly UPDATE_RUNWEIGHT = new ServerGameProt(54, 2);
    static readonly UPDATE_STAT = new ServerGameProt(204, 6);

    static readonly UPDATE_ZONE_FULL_FOLLOWS = new ServerGameProt(88, 2);
    static readonly UPDATE_ZONE_PARTIAL_FOLLOWS = new ServerGameProt(163, 2);
    static readonly UPDATE_ZONE_PARTIAL_ENCLOSED = new ServerGameProt(134, -2);

    constructor(
        readonly id: number,
        readonly length: number
    ) {
        ServerGameProt.byId[id] = this;
    }
}