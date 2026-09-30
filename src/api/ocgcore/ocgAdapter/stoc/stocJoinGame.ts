import { BufferReader } from "@/infra";

import { ygopro } from "../../idl/ocgcore";
import { StocAdapter, YgoProPacket } from "../packet";

/*
 * STOC JoinGame
 *
 * @usage - 告知客户端/前端已成功加入房间
 * */
export default class JoinGameAdapter implements StocAdapter {
  packet: YgoProPacket;

  constructor(packet: YgoProPacket) {
    this.packet = packet;
  }

  upcast(): ygopro.YgoStocMsg {
    // HostInfo 的 time_limit 位于偏移 18，uint16 小端；短包没有房间时限。
    let timeLimit = -1;
    if (this.packet.exData.byteLength >= 20) {
      const reader = new BufferReader(this.packet.exData);
      reader.setOffset(18);
      timeLimit = reader.readUint16();
    }
    return new ygopro.YgoStocMsg({
      stoc_join_game: new ygopro.StocJoinGame({ time_limit: timeLimit }),
    });
  }
}
