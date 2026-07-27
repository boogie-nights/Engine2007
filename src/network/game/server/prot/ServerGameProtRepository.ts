import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import ServerGameZoneMessageEncoder from '#/network/game/server/ServerGameZoneMessageEncoder.js';
import ServerGameMessage from '#/network/game/server/ServerGameMessage.js';
import ServerGameZoneMessage from '#/network/game/server/ServerGameZoneMessage.js';

import ChatFilterSettingsEncoder from '#/network/game/server/codec/ChatFilterSettingsEncoder.js';
import LogoutEncoder from '#/network/game/server/codec/LogoutEncoder.js';
import MessageGameEncoder from '#/network/game/server/codec/MessageGameEncoder.js';
import MessagePrivateEncoder from '#/network/game/server/codec/MessagePrivateEncoder.js';
import MidiJingleEncoder from '#/network/game/server/codec/MidiJingleEncoder.js';
import MidiSongEncoder from '#/network/game/server/codec/MidiSongEncoder.js';
import NpcInfoEncoder from '#/network/game/server/codec/NpcInfoEncoder.js';
import PlayerInfoEncoder from '#/network/game/server/codec/PlayerInfoEncoder.js';
import RebuildNormalEncoder from '#/network/game/server/codec/RebuildNormalEncoder.js';
import SynthSoundEncoder from '#/network/game/server/codec/SynthSoundEncoder.js';
import UpdateInvFullEncoder from '#/network/game/server/codec/UpdateInvFullEncoder.js';
import UpdateRunEnergyEncoder from '#/network/game/server/codec/UpdateRunEnergyEncoder.js';
import UpdateRunWeightEncoder from '#/network/game/server/codec/UpdateRunWeightEncoder.js';
import UpdateStatEncoder from '#/network/game/server/codec/UpdateStatEncoder.js';
import ChatFilterSettings from '#/network/game/server/model/ChatFilterSettings.js';
import Logout from '#/network/game/server/model/Logout.js';
import MessageGame from '#/network/game/server/model/MessageGame.js';
import MessagePrivate from '#/network/game/server/model/MessagePrivate.js';
import MidiJingle from '#/network/game/server/model/MidiJingle.js';
import MidiSong from '#/network/game/server/model/MidiSong.js';
import NpcInfo from '#/network/game/server/model/NpcInfo.js';
import PlayerInfo from '#/network/game/server/model/PlayerInfo.js';
import RebuildNormal from '#/network/game/server/model/RebuildNormal.js';
import SynthSound from '#/network/game/server/model/SynthSound.js';
import UpdateInvFull from '#/network/game/server/model/UpdateInvFull.js';
import UpdateRunEnergy from '#/network/game/server/model/UpdateRunEnergy.js';
import UpdateRunWeight from '#/network/game/server/model/UpdateRunWeight.js';
import UpdateStat from '#/network/game/server/model/UpdateStat.js';
import IfOpenTop from '#/network/game/server/model/IfOpenTop.js';
import IfOpenTopEncoder from '#/network/game/server/codec/IfOpenTopEncoder.js';
import IfOpenSub from '#/network/game/server/model/IfOpenSub.js';
import IfOpenSubEncoder from '#/network/game/server/codec/IfOpenSubEncoder.js';
import LocAddChange from '#/network/game/server/model/LocAddChange.ts';
import LocAddChangeEncoder from '#/network/game/server/codec/LocAddChangeEncoder.ts';
import UpdateZoneFullFollows from '#/network/game/server/model/UpdateZoneFullFollows.ts';
import UpdateZoneFullFollowsEncoder from '#/network/game/server/codec/UpdateZoneFullFollowsEncoder.ts';
import UpdateZonePartialEnclosed from '#/network/game/server/model/UpdateZonePartialEnclosed.ts';
import UpdateZonePartialEnclosedEncoder from '#/network/game/server/codec/UpdateZonePartialEnclosedEncoder.ts';
import UpdateZonePartialFollows from '#/network/game/server/model/UpdateZonePartialFollows.ts';
import UpdateZonePartialFollowsEncoder from '#/network/game/server/codec/UpdateZonePartialFollowsEncoder.ts';
import RunClientScript from '#/network/game/server/model/RunClientScript.ts';
import RunClientScriptEncoder from '#/network/game/server/codec/RunClientScriptEncoder.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type GenericOutgoingMessage<T extends ServerGameMessage> = new (...args: any[]) => T;

class ServerGameProtRepository {
    private encoders: Map<GenericOutgoingMessage<ServerGameMessage>, ServerGameMessageEncoder<ServerGameMessage>> = new Map();

    protected bind<T extends ServerGameMessage>(message: GenericOutgoingMessage<T>, encoder: ServerGameMessageEncoder<T>) {
        if (this.encoders.has(message)) {
            throw new Error(`[ServerProtRepository] Already defines a ${message.name}.`);
        }
        this.encoders.set(message, encoder);
    }

    getEncoder<T extends ServerGameMessage>(message: T): ServerGameMessageEncoder<T> | undefined {
        return this.encoders.get(message.constructor as GenericOutgoingMessage<T>);
    }

    getZoneEncoder<T extends ServerGameZoneMessage>(message: T): ServerGameZoneMessageEncoder<T> | undefined {
        return this.encoders.get(message.constructor as GenericOutgoingMessage<T>) as ServerGameZoneMessageEncoder<T> | undefined;
    }

    constructor() {
        this.bind(ChatFilterSettings, new ChatFilterSettingsEncoder());
        this.bind(Logout, new LogoutEncoder());
        this.bind(MessageGame, new MessageGameEncoder());
        this.bind(MessagePrivate, new MessagePrivateEncoder());
        this.bind(MidiJingle, new MidiJingleEncoder());
        this.bind(MidiSong, new MidiSongEncoder());
        this.bind(PlayerInfo, new PlayerInfoEncoder());
        this.bind(NpcInfo, new NpcInfoEncoder());
        this.bind(RebuildNormal, new RebuildNormalEncoder());
        this.bind(SynthSound, new SynthSoundEncoder());
        this.bind(UpdateInvFull, new UpdateInvFullEncoder());
        this.bind(UpdateRunEnergy, new UpdateRunEnergyEncoder());
        this.bind(UpdateRunWeight, new UpdateRunWeightEncoder());
        this.bind(UpdateStat, new UpdateStatEncoder());
        this.bind(IfOpenTop, new IfOpenTopEncoder());
        this.bind(IfOpenSub, new IfOpenSubEncoder());
        this.bind(LocAddChange, new LocAddChangeEncoder());
        this.bind(UpdateZoneFullFollows, new UpdateZoneFullFollowsEncoder());
        this.bind(UpdateZonePartialEnclosed, new UpdateZonePartialEnclosedEncoder());
        this.bind(UpdateZonePartialFollows, new UpdateZonePartialFollowsEncoder());
        this.bind(RunClientScript, new RunClientScriptEncoder());
    }
}

export default new ServerGameProtRepository();