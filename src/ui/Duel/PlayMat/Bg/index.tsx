import classnames from "classnames";
import { createContext, useContext } from "react";
import { type INTERNAL_Snapshot as Snapshot, useSnapshot } from "valtio";

import { sendSelectPlaceResponse, ygopro } from "@/api";
import { Container } from "@/container";
import { getUIContainer } from "@/container/compat";
import type { CardType } from "@/stores";
import {
  type BlockState,
  cardStore,
  isMe,
  type PlaceInteractivity,
  placeStore,
} from "@/stores";
import { fieldInspection } from "@/stores/fieldInspection";
import { BgChain, type ChainMarker, type ChainProps } from "@/ui/Shared";

import { linkedZoneKeys, zoneKey } from "../fieldGeometry";
import styles from "./index.module.scss";

const { MZONE, SZONE, EXTRA, GRAVE, REMOVED } = ygopro.CardZone;

const getController = (opponent = false) => {
  if (opponent) return isMe(0) ? 1 : 0;

  return isMe(0) ? 0 : 1;
};

const toChainMarkers = (
  chainIndex: readonly number[],
  location: Omit<ChainMarker, "index">,
): ChainMarker[] =>
  chainIndex.map((index) => ({
    ...location,
    index,
  }));

const LinkedZones = createContext(new Set<string>());

const BgBlock: React.FC<
  React.HTMLProps<HTMLDivElement> & {
    disabled?: boolean;
    highlight?: boolean;
    glowing?: boolean;
    chains: ChainProps;
  }
> = ({
  disabled = false,
  highlight = false,
  glowing = false,
  className,
  chains,
  ...rest
}) => {
  const linkedZones = useContext(LinkedZones);
  const data = rest as Record<string, unknown>;
  const linked =
    data["data-zone"] === "MZONE" &&
    linkedZones.has(
      zoneKey(Number(data["data-controller"]), Number(data["data-sequence"])),
    );
  return (
    <div
      {...rest}
      data-linked={linked}
      className={classnames(styles.block, className, {
        [styles.highlight]: highlight,
        [styles.glowing]: glowing,
        [styles.linked]: linked,
      })}
    >
      {<DisabledCross disabled={disabled} />}
      {<BgChain {...chains} />}
    </div>
  );
};

const BgExtraRow: React.FC<{
  meSnap: Snapshot<BlockState[]>;
  opSnap: Snapshot<BlockState[]>;
}> = ({ meSnap, opSnap }) => {
  const container = getUIContainer();
  const meController = getController();
  const opController = getController(true);

  return (
    <div className={classnames(styles.row)}>
      {Array.from({ length: 2 }).map((_, i) => (
        <BgBlock
          key={i}
          data-testid="duel-zone"
          data-zone={ygopro.CardZone[MZONE]}
          data-zone-value={MZONE}
          data-controller={meController}
          data-sequence={i + 5}
          data-place-selectable={
            !!meSnap[i].interactivity || !!opSnap[1 - i].interactivity
          }
          className={styles.extra}
          onClick={() => {
            onBlockClick(container, meSnap[i].interactivity);
            onBlockClick(container, opSnap[1 - i].interactivity);
          }}
          disabled={meSnap[i].disabled || opSnap[1 - i].disabled}
          highlight={!!meSnap[i].interactivity || !!opSnap[1 - i].interactivity}
          chains={{
            chains: [
              ...toChainMarkers(meSnap[i].chainIndex, {
                controller: meController,
                zone: MZONE,
                sequence: i + 5,
              }),
              ...toChainMarkers(opSnap[1 - i].chainIndex, {
                controller: opController,
                zone: MZONE,
                sequence: 6 - i,
              }),
            ],
          }}
        />
      ))}
    </div>
  );
};

const BgRow: React.FC<{
  szone?: boolean;
  opponent?: boolean;
  snap: Snapshot<BlockState[]>;
}> = ({ szone = false, opponent = false, snap }) => {
  const container = getUIContainer();
  const controller = getController(opponent);
  const zone = szone ? SZONE : MZONE;

  return (
    <div className={classnames(styles.row, { [styles.opponent]: opponent })}>
      {Array.from({ length: 5 }).map((_, i) => (
        <BgBlock
          key={i}
          data-testid="duel-zone"
          data-zone={ygopro.CardZone[zone]}
          data-zone-value={zone}
          data-controller={controller}
          data-sequence={i}
          data-place-selectable={!!snap[i].interactivity}
          className={classnames({ [styles.szone]: szone })}
          onClick={() => onBlockClick(container, snap[i].interactivity)}
          disabled={snap[i].disabled}
          highlight={!!snap[i].interactivity}
          chains={{
            chains: toChainMarkers(snap[i].chainIndex, {
              controller,
              zone,
              sequence: i,
            }),
          }}
        />
      ))}
    </div>
  );
};

const BgOtherBlocks: React.FC<{ op?: boolean }> = ({ op }) => {
  useSnapshot(cardStore);
  const container = getUIContainer();
  const controller = getController(op);
  const judgeGlowing = (zone: ygopro.CardZone) =>
    !!cardStore
      .at(zone, controller)
      .reduce((sum, c) => (sum += c.idleInteractivities.length), 0);
  const glowingExtra = judgeGlowing(EXTRA);
  const glowingGraveyard = judgeGlowing(GRAVE);
  const glowingBanish = judgeGlowing(REMOVED);
  const snap = useSnapshot(placeStore.inner);
  const field = op ? snap[SZONE].op[5] : snap[SZONE].me[5];
  const grave = op ? snap[GRAVE].op : snap[GRAVE].me;
  const removed = op ? snap[REMOVED].op : snap[REMOVED].me;
  const extra = op ? snap[EXTRA].op : snap[EXTRA].me;

  const getN = (zone: ygopro.CardZone) => cardStore.at(zone, controller).length;

  const genChains = (states: Snapshot<BlockState[]>, zone: ygopro.CardZone) => {
    const chains: ChainMarker[] = states.flatMap((state, sequence) =>
      toChainMarkers(state.chainIndex, {
        controller,
        zone,
        sequence,
      }),
    );
    chains.sort((a, b) => a.index - b.index);

    return chains;
  };

  return (
    <div className={classnames(styles["other-blocks"], { [styles.op]: op })}>
      <BgBlock
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[REMOVED]}
        data-zone-value={REMOVED}
        data-controller={controller}
        data-place-selectable={false}
        className={styles.banish}
        glowing={!op && glowingBanish}
        chains={{
          chains: genChains(removed, REMOVED),
          op,
          nBelow: getN(REMOVED),
        }}
      />
      <BgBlock
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[GRAVE]}
        data-zone-value={GRAVE}
        data-controller={controller}
        data-place-selectable={false}
        className={styles.graveyard}
        glowing={!op && glowingGraveyard}
        chains={{
          chains: genChains(grave, GRAVE),
          op,
          nBelow: getN(GRAVE),
        }}
      />
      <BgBlock
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[SZONE]}
        data-zone-value={SZONE}
        data-controller={controller}
        data-sequence={5}
        data-place-selectable={!!field.interactivity}
        className={styles.field}
        onClick={() => onBlockClick(container, field.interactivity)}
        disabled={field.disabled}
        highlight={!!field.interactivity}
        chains={{
          chains: toChainMarkers(field.chainIndex, {
            controller,
            zone: SZONE,
            sequence: 5,
          }),
          op,
        }}
      />
      <BgBlock
        data-testid="duel-zone"
        data-zone="DECK"
        data-controller={controller}
        data-place-selectable={false}
        className={styles.deck}
        chains={{ chains: [] }}
      />
      <BgBlock
        data-testid="duel-zone"
        data-zone={ygopro.CardZone[EXTRA]}
        data-zone-value={EXTRA}
        data-controller={controller}
        data-place-selectable={false}
        className={classnames(styles.deck, styles["extra-deck"])}
        glowing={!op && glowingExtra}
        chains={{
          chains: genChains(extra, EXTRA),
          op,
          nBelow: getN(EXTRA),
        }}
      />
    </div>
  );
};

export const Bg: React.FC = () => {
  const { inner } = useSnapshot(cardStore);
  const { hovered, pinned } = useSnapshot(fieldInspection);
  const inspected = hovered ?? pinned;
  const linked = linkedZoneKeys(
    inner.find((card) => card.uuid === inspected) as CardType | undefined,
  );
  const snap = useSnapshot(placeStore.inner);
  return (
    <LinkedZones.Provider value={linked}>
      <div className={styles["mat-bg"]}>
        <BgRow snap={snap[SZONE].op} szone opponent />
        <BgRow snap={snap[MZONE].op} opponent />
        <BgExtraRow
          meSnap={snap[MZONE].me.slice(5, 7)}
          opSnap={snap[MZONE].op.slice(5, 7)}
        />
        <BgRow snap={snap[MZONE].me} />
        <BgRow snap={snap[SZONE].me} szone />
        <BgOtherBlocks />
        <BgOtherBlocks op />
      </div>
    </LinkedZones.Provider>
  );
};

const onBlockClick = (
  container: Container,
  placeInteractivity: PlaceInteractivity,
) => {
  if (placeInteractivity) {
    placeStore.pushPlaceResponse(placeInteractivity.response);
    if (
      placeStore.selectPlaceResponses.length >=
      placeStore.selectPlaceRequiredCount
    ) {
      sendSelectPlaceResponse(container.conn, placeStore.selectPlaceResponses);
      cardStore.inner.forEach((card) => (card.idleInteractivities = []));
      placeStore.clearAllInteractivity();
      placeStore.startPlaceSelection(1);
    }
  }
};

const DisabledCross: React.FC<{ disabled: boolean }> = ({ disabled }) => (
  <div
    className={classnames(styles["disabled-cross"], {
      [styles.show]: disabled,
    })}
  ></div>
);
