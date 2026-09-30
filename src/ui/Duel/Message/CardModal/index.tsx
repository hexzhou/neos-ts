import { LeftOutlined } from "@ant-design/icons";
import { Divider, Drawer, Space, Tag } from "antd";
import React from "react";
import { proxy, useSnapshot } from "valtio";

import { type CardMeta, fetchStrings, Region } from "@/api";
import { quoteCardName } from "@/api/cardText";
import { cardStore, type CardType, hasIncompleteSummon } from "@/stores";
import { registerDuelDialogReset } from "@/stores/duelDialogs";
import { YgoCard } from "@/ui/Shared";

import {
  Attribute2StringCodeMap,
  extraCardTypes,
  Race2StringCodeMap,
  TYPE_LINK,
  Type2StringCodeMap,
} from "../../../../common";
import { Desc } from "./Desc";
import styles from "./index.module.scss";

const defaultStore = {
  isOpen: false,
  meta: {
    id: 0,
    data: {},
    text: {
      name: "",
      desc: "",
    },
  } satisfies CardMeta as CardMeta,
  interactivies: [] as {
    desc: string;
    response: number;
    effectCode?: number;
  }[],
  counters: {} as Record<number, number>,
  cardUuid: null as string | null,
};

const store = proxy({ ...defaultStore });
registerDuelDialogReset(() => Object.assign(store, defaultStore));

export const CardModal = () => {
  const snap = useSnapshot(store);
  const cards = useSnapshot(cardStore);
  const { cardUuid } = snap;
  const liveCard = cards.inner.find((card) => card.uuid === cardUuid);
  const summonIncomplete =
    liveCard && hasIncompleteSummon(liveCard as CardType);

  const { isOpen, meta, counters } = snap;

  const name = meta?.text.name;
  const types = extraCardTypes(meta?.data.type ?? 0);
  const race = meta?.data.race;
  const attribute = meta?.data.attribute;
  const desc = meta?.text.desc;
  const atk = meta?.data.atk;
  const def = meta?.data.def;

  return (
    // TODO: 宽度要好好设置 根据屏幕宽度
    <Drawer
      open={isOpen}
      placement="left"
      onClose={() => (store.isOpen = false)}
      rootClassName="duel-translucent-drawer"
      className={styles.drawer}
      mask={false}
      title={quoteCardName(name)}
      closeIcon={<LeftOutlined />}
      width={350}
    >
      <div
        className={styles.container}
        data-testid="duel-card-detail"
        data-card-code={meta?.id}
      >
        <div className={styles.summary}>
          <YgoCard code={meta?.id} width="100%" style={{ borderRadius: 4 }} />
          <div className={styles.info}>
            <AtkLine
              atk={atk}
              def={types.includes(TYPE_LINK) ? undefined : def}
            />
            <CounterLine counters={counters} />
            <AttLine types={types} race={race} attribute={attribute} />
            {/* TODO: 只有怪兽卡需要展示攻击防御 */}
            {/* TODO: 展示星级/LINK数 */}
          </div>
        </div>
        <Divider style={{ margin: "0.625rem 0" }}></Divider>
        {summonIncomplete && (
          <p
            className={styles.summonIncomplete}
            data-testid="card-summon-incomplete"
          >
            未正规登场
          </p>
        )}
        <Desc desc={desc} />
      </div>
    </Drawer>
  );
};

const AttLine = (props: {
  types: number[];
  race?: number;
  attribute?: number;
}) => {
  const race = props.race
    ? fetchStrings(Region.System, Race2StringCodeMap.get(props.race) || 0)
    : undefined;
  const attribute = props.attribute
    ? fetchStrings(
        Region.System,
        Attribute2StringCodeMap.get(props.attribute) || 0,
      )
    : undefined;
  const types = props.types
    .map((t) => fetchStrings(Region.System, Type2StringCodeMap.get(t) || 0))
    .join("/");
  return (
    <div className={styles.attline}>
      {(attribute || race) && (
        <div className={styles.attributeRow}>
          {attribute && <Tag>{attribute}</Tag>}
          {race && <Tag>{race}</Tag>}
        </div>
      )}
      {types && <Tag>{types}</Tag>}
    </div>
  );
};

const AtkLine = (props: { atk?: number; def?: number }) => (
  <Space
    size={10}
    className={styles.atkLine}
    direction="vertical"
    data-testid="duel-card-stats"
  >
    <div
      data-testid="duel-card-stat"
      data-stat="ATK"
      data-stat-value={props.atk ?? ""}
    >
      <div className={styles.title}>ATK</div>
      <div className={styles.number}>{props.atk ?? "?"}</div>
    </div>
    <div
      data-testid="duel-card-stat"
      data-stat="DEF"
      data-stat-value={props.def ?? ""}
    >
      <div className={styles.title}>DEF</div>
      <div className={styles.number}>{props.def ?? "?"}</div>
    </div>
  </Space>
);

const CounterLine = (props: { counters: { [type: number]: number } }) => {
  if (!Object.values(props.counters).some((count) => count > 0)) return null;

  return (
    <Space size={10} className={styles.counterLine} direction="vertical">
      {Object.entries(props.counters).map(
        ([counterType, count], idx) =>
          count > 0 && (
            <div
              key={idx}
              data-testid="duel-card-counter"
              data-counter-type={counterType}
              data-counter-count={count}
            >
              <div className={styles.title}>
                {fetchStrings(
                  Region.Counter,
                  `0x${Number(counterType).toString(16)}`,
                )}
              </div>
              <div className={styles.number}>{count}</div>
            </div>
          ),
      )}
    </Space>
  );
};

export const showCardModal = (
  card: Partial<Pick<typeof store, "meta" | "counters">> & {
    uuid?: string;
    location?: Parameters<typeof cardStore.find>[0];
  },
) => {
  store.isOpen = true;
  store.meta = card?.meta ?? defaultStore.meta;
  store.counters = card?.counters ?? defaultStore.counters;
  store.cardUuid =
    card.uuid ??
    (card.location ? cardStore.find(card.location)?.uuid : undefined) ??
    null;
};

export const closeCardModal = () => {
  store.isOpen = false;
};
