import classNames from "classnames";
import { CSSProperties } from "react";

import { getCardImgUrl } from "@/api";
import { useConfig } from "@/config";

import styles from "./index.module.scss";

const { assetsPath } = useConfig();

interface Props {
  className?: string;
  isBack?: boolean;
  code?: number;
  targeted?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  width?: number | string;
  loading?: "eager" | "lazy";
  onClick?: () => void;
  onLoad?: () => void;
  onError?: () => void;
}

export const YgoCard: React.FC<Props> = ({
  className,
  code = 0,
  isBack = false,
  targeted = false,
  disabled = false,
  width,
  style,
  loading = "eager",
  onClick,
  onLoad,
  onError,
}) => {
  const src = getCardImgUrl(code, isBack);

  return (
    <div
      className={classNames(styles["ygo-card"], className)}
      style={{ width, ...style }}
      onClick={onClick}
    >
      <img
        key={src}
        className={styles.image}
        src={src}
        alt=""
        loading={loading}
        decoding="async"
        draggable={false}
        onLoad={onLoad}
        onError={onError}
      />
      {targeted && (
        <div className={styles.targeted}>
          <img src={`${assetsPath}/targeted.png`} alt="" />
        </div>
      )}
      {disabled && (
        <div className={styles.disabled}>
          <img src={`${assetsPath}/disabled.png`} alt="" />
        </div>
      )}
    </div>
  );
};
