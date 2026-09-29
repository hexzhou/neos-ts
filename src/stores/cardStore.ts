import { proxy } from "valtio";

import { CardData, CardMeta, ygopro } from "@/api";
import { STATUS_DISABLED, STATUS_FORBIDDEN } from "@/common";

import type { Interactivity } from "./matStore/types";
import { type NeosStore } from "./shared";

/**
 * Status of card on field
 *
 * TODO: use class
 */
export interface CardType {
  uuid: string; // 一张卡的唯一标识
  code: number; // 卡号
  meta: CardMeta;
  originalData?: CardData; // 用于比较场上数值与原始数值 // 卡片元数据
  location: ygopro.CardLocation;
  idleInteractivities: Interactivity<number>[]; // IDLE状态下的互动信息
  counters: { [type: number]: number }; // 指示器
  isToken: boolean; // 是否是token
  targeted: boolean; // 当前卡是否被选择成为效果的对象
  selectInfo: {
    selectable: boolean; // 是否可以被选择
    selected: boolean; // 是否已经被选择
    response?: number; // 被选择时发送给服务器的值
  };
  equipTarget?: string; // 装备目标的 UUID，随控制权和位置变化保持身份
  effectTargets?: string[]; // 持续效果对象的 UUID
  status: number; // Current status, STATUS_DISABLED, etc.
}

export class CardStore implements NeosStore {
  inner: CardType[] = [];
  at(zone: ygopro.CardZone, controller: number): CardType[];
  at(
    zone: ygopro.CardZone,
    controller: number,
    sequence?: number,
    overlay_sequence?: number,
  ): CardType | undefined;
  at(
    zone: ygopro.CardZone,
    controller: number,
    sequence?: number,
    overlay_sequence?: number,
  ) {
    if (sequence !== undefined) {
      if (overlay_sequence !== undefined) {
        return this.inner
          .filter(
            (card) =>
              card.location.zone === zone &&
              card.location.controller === controller &&
              card.location.sequence === sequence &&
              card.location.is_overlay === true &&
              card.location.overlay_sequence === overlay_sequence,
          )
          .at(0);
      } else {
        return this.inner
          .filter(
            (card) =>
              card.location.zone === zone &&
              card.location.controller === controller &&
              card.location.sequence === sequence &&
              card.location.is_overlay === false,
          )
          .at(0);
      }
    } else {
      return this.inner.filter(
        (card) =>
          card.location.zone === zone &&
          card.location.controller === controller &&
          card.location.is_overlay === false,
      );
    }
  }
  find(
    location: Pick<
      ygopro.CardLocation,
      "zone" | "controller" | "sequence" | "is_overlay" | "overlay_sequence"
    >,
  ): CardType | undefined {
    return this.at(
      location.zone,
      location.controller,
      location.sequence,
      location.is_overlay ? location.overlay_sequence : undefined,
    );
  }
  // 获取特定位置下的所有超量素材
  findOverlay(
    zone: ygopro.CardZone,
    controller: number,
    sequence: number,
  ): CardType[] {
    return this.inner.filter(
      (card) =>
        card.location.zone === zone &&
        card.location.controller === controller &&
        card.location.sequence === sequence &&
        card.location.is_overlay,
    );
  }
  clearRelations(uuid: string): void {
    for (const card of this.inner) {
      if (card.uuid === uuid || card.equipTarget === uuid)
        card.equipTarget = undefined;
      card.effectTargets =
        card.uuid === uuid
          ? []
          : card.effectTargets?.filter((target) => target !== uuid);
    }
  }
  reset(): void {
    this.inner = [];
  }
}

// TODO: provided in class
export function isCardDisabled(card: CardType): boolean {
  return (card.status & (STATUS_DISABLED | STATUS_FORBIDDEN)) > 0;
}

export const cardStore = proxy(new CardStore());
