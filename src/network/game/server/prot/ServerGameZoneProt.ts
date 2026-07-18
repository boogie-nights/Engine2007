export default class ServerGameZoneProt {
    static byId: ServerGameZoneProt[] = [];

    static readonly LOC_ADD_CHANGE = new ServerGameZoneProt(44, 4);

    constructor(
        readonly id: number,
        readonly length: number
    ) {
        ServerGameZoneProt.byId[id] = this;
    }
}