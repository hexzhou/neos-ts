import { useSnapshot } from "valtio";

import { cardStore } from "@/stores";
import { fieldInspection } from "@/stores/fieldInspection";

import { Bg } from "../Bg";
import { Card } from "../Card";
import { FieldConnections } from "../FieldConnections";
import { FieldControls } from "../Menu";
import styles from "./index.module.scss";

// 后面再改名
export const Mat: React.FC = () => {
  return (
    <section
      className={`${styles.mat} duel-mat`}
      onClick={(event) => {
        if (!(event.target as Element).closest('[data-testid="duel-card"]'))
          fieldInspection.pinned = null;
      }}
    >
      <div className={`${styles.camera} duel-mat-camera`}>
        <div className={`${styles.plane} duel-mat-plane`}>
          <Bg />
          <div className={`${styles.container} duel-mat-card-container`}>
            <Cards />
          </div>
          <FieldConnections />
          <FieldControls />
        </div>
      </div>
    </section>
  );
};

const Cards: React.FC = () => {
  const { inner } = useSnapshot(cardStore);
  const length = inner.length;
  return (
    <>
      {Array.from({ length }).map((_, i) => (
        <Card key={inner[i].uuid} idx={i} />
      ))}
    </>
  );
};
