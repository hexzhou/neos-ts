import { LockOutlined } from "@ant-design/icons";
import { CheckCard } from "@ant-design/pro-components";
import { Button, Card, Space, Tooltip } from "antd";
import classnames from "classnames";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { INTERNAL_Snapshot as Snapshot, useSnapshot } from "valtio";

import { type CardMeta, Region, ygopro } from "@/api";
import { fetchStrings } from "@/api";
import { CardType, isMe, matStore } from "@/stores";
import { validSelection } from "@/stores/selectionRules";
import { ScrollableArea, YgoCard } from "@/ui/Shared";

import { groupBy } from "../../utils";
import { showCardModal } from "../CardModal";
import { NeosModal } from "../NeosModal";
import styles from "./index.module.scss";

export interface SelectCardsModalProps {
  selectionKind?: "count" | "tribute" | "sum";
  isOpen: boolean;
  min: number;
  max: number;
  single: boolean;
  selecteds: Snapshot<Option[]>; // 已经选择了的卡
  selectables: Snapshot<Option[]>; // 最多选择多少卡
  mustSelects: Snapshot<Option[]>; // 单选
  cancelable: boolean; // 能否取消
  finishable: boolean; // 选择足够了之后，能否确认
  totalLevels: number; // 需要的总等级数（用于同调/仪式/...）
  overflow: boolean; // 选择等级时候，是否可以溢出
  isChain?: boolean; // 是否是 select_chain 选择
  onSubmit: (options: Snapshot<Option[]>) => void;
  onCancel: () => void;
  onFinish: () => void;
}

export const SelectCardsModal: React.FC<SelectCardsModalProps> = ({
  selectionKind = "count",
  isOpen,
  min,
  max,
  single,
  selecteds,
  selectables,
  mustSelects,
  cancelable,
  finishable,
  totalLevels,
  overflow,
  isChain = false,
  onSubmit,
  onCancel,
  onFinish,
}) => {
  const grouped = groupBy(selectables, (option) => option.location?.zone!);
  const [result, setResult] = useState<[ygopro.CardZone, Option[]][]>([]);
  const [submitable, setSubmitable] = useState(false);

  const singleSelection = single || max === 1;
  const multipleZones = grouped.length > 1;

  const hint = useSnapshot(matStore.hint);
  const preHintMsg = hint.esHint || "";
  const selectHintMsg = hint.esSelectHint || "请选择卡片";

  const minMaxText = min === max ? min : `${min}-${max}`;

  const { t: i18n } = useTranslation("SelectCardModal");

  useEffect(() => {
    const initial: [ygopro.CardZone, Option[]][] = grouped.map(([zone, _]) => [
      zone,
      [] as Option[],
    ]);
    setResult(initial);
  }, [selectables, isOpen]);

  // 判断是否可以提交
  useEffect(() => {
    const flatResult = result.map(([_, v]) => v).flat();
    setSubmitable(
      validSelection(flatResult, mustSelects, {
        selectionKind,
        single,
        min,
        max,
        totalLevels,
        overflow,
      }),
    );
  }, [
    result,
    single,
    min,
    max,
    mustSelects,
    totalLevels,
    overflow,
    selectionKind,
  ]);

  // 文案
  const [submitText, finishText, cancelText] = [1211, 1296, 1295].map((n) =>
    fetchStrings(Region.System, n),
  );

  // Quick select if possiable
  const onQuickSelect = (option: Option) => {
    if (
      (max === 1 || single) &&
      validSelection([option], mustSelects, {
        selectionKind,
        single,
        min,
        max,
        totalLevels,
        overflow,
      })
    ) {
      // if `max` is 1, it means that we can just select one,
      // so quick selection is possiable in this case.
      onSubmit([...mustSelects, option]);
    }
  };

  return (
    <NeosModal
      movable
      title={
        <>
          <span>{preHintMsg}</span>
          <span>{selectHintMsg}</span>
          <span>
            ({i18n("PleaseSelect")} {minMaxText} {i18n("Cards")})
          </span>
          <span>{single ? i18n("SelectOneCardAtTime") : ""}</span>
        </>
      } // TODO: 这里可以再细化一些
      width={"38.25rem"}
      okButtonProps={{
        disabled: !submitable,
      }}
      open={isOpen}
      afterClose={() => {
        // Modal每次展示时都会消费`esHint`和`esSelectHint`，
        // 否则这些提示会保留到下一次Modal展示，可能会疑惑玩家
        matStore.hint.esHint = undefined;
        matStore.hint.esSelectHint = undefined;
      }}
      footer={
        <>
          {cancelable && (
            <Button data-testid="duel-select-card-cancel" onClick={onCancel}>
              {cancelText}
            </Button>
          )}
          {finishable && (
            <Button
              data-testid="duel-select-card-finish"
              type="primary"
              onClick={onFinish}
            >
              {finishText}
            </Button>
          )}
          <Button
            data-testid="duel-select-card-submit"
            type="primary"
            disabled={!submitable}
            onClick={() =>
              onSubmit([...mustSelects, ...result.map(([_, v]) => v).flat()])
            }
          >
            {submitText}
          </Button>
        </>
      }
    >
      <Space
        data-testid="duel-select-cards-modal"
        data-select-min={min}
        data-select-max={max}
        data-select-single={single}
        data-select-is-chain={isChain}
        data-select-cancelable={cancelable}
        data-select-finishable={finishable}
        direction="vertical"
        style={{ width: "100%", overflow: "hidden" }}
      >
        <ScrollableArea maxHeight="50vh" className={styles.groups}>
          {mustSelects.length > 0 && (
            <section
              className={styles.container}
              data-testid="duel-select-card-mandatory"
            >
              <h3 className={styles["group-title"]}>
                {fetchStrings(Region.System, 212)}
              </h3>
              <div className={styles["check-group"]}>
                {mustSelects.map((card, i) => (
                  <Tooltip title={card.effectDesc} placement="bottom" key={i}>
                    <div
                      className={styles["mandatory-card"]}
                      data-testid="duel-select-card-mandatory-option"
                      data-card-code={card.meta.id}
                      data-card-response={card.response}
                    >
                      <CheckCard
                        checked
                        cover={
                          <YgoCard
                            code={card.meta.id}
                            targeted={card.targeted}
                            className={styles.card}
                          />
                        }
                        className={classnames(styles["check-card"], {
                          [styles.opponent]:
                            card.location?.controller !== undefined &&
                            !isMe(card.location.controller),
                        })}
                        onClick={() => showCardModal(card)}
                      />
                      <LockOutlined
                        className={styles["mandatory-lock"]}
                        aria-hidden
                      />
                    </div>
                  </Tooltip>
                ))}
              </div>
            </section>
          )}
          {grouped.map(([zone, cards]) => (
            <CardZoneGroup zone={zone} horizontal={multipleZones} key={zone}>
              <CheckCard.Group
                onChange={(res: any) => {
                  const newRes: [ygopro.CardZone, Option[]][] = result.map(
                    ([k, v]) => [
                      k,
                      k === zone
                        ? singleSelection
                          ? res.slice(-1)
                          : res
                        : singleSelection
                        ? []
                        : v,
                    ],
                  );
                  setResult(newRes);
                }}
                value={result.find(([k, _]) => k === zone)?.[1] ?? ([] as any)}
                // TODO 考虑如何设置默认值，比如只有一个的，就直接选中
                multiple
                className={classnames(styles["check-group"], {
                  [styles["horizontal-group"]]: multipleZones,
                })}
              >
                {cards.map((card, j) => (
                  <Tooltip title={card.effectDesc} placement="bottom" key={j}>
                    {/* 这儿必须有一个div，不然tooltip不生效 */}
                    <div
                      data-testid="duel-select-card-option"
                      data-card-code={card.meta.id}
                      data-card-controller={card.location?.controller}
                      data-card-zone={
                        card.location?.zone === undefined
                          ? undefined
                          : ygopro.CardZone[card.location.zone]
                      }
                      data-card-zone-value={card.location?.zone}
                      data-card-sequence={card.location?.sequence}
                      data-card-response={card.response}
                      onDoubleClick={() => onQuickSelect(card as Option)}
                    >
                      <CheckCard
                        cover={
                          <YgoCard
                            code={card.meta.id}
                            targeted={card.targeted}
                            disabled={card.disabled}
                            className={styles.card}
                          />
                        }
                        className={classnames(styles["check-card"], {
                          [styles.opponent]:
                            card.location?.controller !== undefined &&
                            !isMe(card.location.controller),
                        })}
                        value={card}
                        onClick={() => {
                          showCardModal(card);
                        }}
                      />
                    </div>
                  </Tooltip>
                ))}
              </CheckCard.Group>
            </CardZoneGroup>
          ))}
        </ScrollableArea>
        <p>
          <span>
            {/* TODO: 这里的字体可以调整下 */}
            {selecteds.length > 0 ? fetchStrings(Region.System, 212) : ""}
          </span>
        </p>
        <div className={styles["check-group"]}>
          {selecteds.map((card, i) => (
            <Tooltip
              title={card.effectDesc}
              placement="bottom"
              key={grouped.length + i}
            >
              <div>
                <Card
                  cover={
                    <YgoCard
                      code={card.meta.id}
                      targeted={card.targeted}
                      className={styles.card}
                    />
                  }
                  className={styles["check-card"]}
                  onClick={() => {
                    showCardModal(card);
                  }}
                />
              </div>
            </Tooltip>
          ))}
        </div>
      </Space>
    </NeosModal>
  );
};

const CardZoneGroup: React.FC<
  React.PropsWithChildren<{
    zone: ygopro.CardZone;
    horizontal: boolean;
  }>
> = ({ zone, horizontal, children }) => {
  const label = fetchStrings(Region.System, zone + 1000);

  return (
    <section
      className={styles.container}
      data-testid="duel-select-card-group"
      data-card-zone={ygopro.CardZone[zone]}
      aria-label={label}
    >
      {horizontal && <h3 className={styles["group-title"]}>{label}</h3>}
      <div
        className={horizontal ? styles["row-viewport"] : undefined}
        data-testid="duel-select-card-row"
      >
        {horizontal ? (
          <ScrollableArea
            className={styles["row-content"]}
            scrollProps={{
              tabIndex: 0,
              options: {
                overflow: { x: "scroll", y: "hidden" },
                scrollbars: {
                  autoHide: "never",
                  theme: "os-theme-light",
                },
              },
            }}
          >
            {children}
          </ScrollableArea>
        ) : (
          children
        )}
      </div>
    </section>
  );
};

export interface Option {
  // card id
  meta: CardMeta;
  location?: ygopro.CardLocation;
  // 效果
  effectDesc?: string;
  // 作为素材的cost，比如同调召唤的星级
  tributeValue?: number;
  level1?: number;
  level2?: number;
  response?: number;
  targeted?: boolean;
  disabled?: boolean;
  // 便于直接返回这个信息
  //
  // 尽量不要用这个字段
  card?: CardType;
}
