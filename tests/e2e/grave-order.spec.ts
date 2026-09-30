import { expect, type Page, test } from "@playwright/test";
import initSqlJs from "sql.js";

let database: Buffer;
test.beforeAll(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE datas (id INTEGER, type INTEGER); CREATE TABLE texts (id INTEGER, name TEXT, desc TEXT);",
  );
  for (let i = 0; i < 6; i++) {
    db.run("INSERT INTO datas VALUES (?, 1)", [1000001 + i]);
    db.run("INSERT INTO texts VALUES (?, ?, ?)", [
      1000001 + i,
      `墓地卡片 ${i + 1}`,
      "墓地顺序测试。",
    ]);
  }
  database = Buffer.from(db.export());
  db.close();
});

async function setup(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.route("**/*.cdb", (route) => route.fulfill({ body: database }));
  await page.route("**/*.conf", (route) =>
    route.fulfill({ body: "!system 1004 墓地\n!system 1001 手牌" }),
  );
  await page.route("**/test-release-v2.json", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(/\/100000[1-6]\.webp(\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 146"><rect width="100" height="146" fill="#997544"/></svg>',
    }),
  );
  await page.goto("/match");
  await expect(page.getByTestId("match-deck-select")).toBeVisible();
  await page.evaluate(async () => {
    const { initializeApp } = await import("/src/ui/Layout/utils.ts");
    await initializeApp();
    const { initUIContainer, getUIContainer } = await import(
      "/src/container/compat.ts"
    );
    const { matStore, cardStore } = await import("/src/stores/index.ts");
    const { settingStore } = await import("/src/stores/settingStore/index.ts");
    settingStore.saveAnimationConfig({ enabled: false });
    const { fetchCard, ygopro } = await import("/src/api/index.ts");
    const { cardZoneToNumber } = await import(
      "/src/api/ocgcore/ocgAdapter/util.ts"
    );
    initUIContainer({
      isClosed: () => false,
      close: () => {},
      ws: { readyState: WebSocket.OPEN, send: () => {} },
    });
    matStore.selfType = ygopro.StocTypeChange.SelfType.PLAYER1;
    // 创建顺序故意不同于墓地序号，双方交错存放。
    cardStore.inner = [0, 2, 1].flatMap((sequence) =>
      [0, 1].map((controller) => {
        const code = 1000001 + controller * 3 + sequence;
        return {
          uuid: `grave-${controller}-${sequence}`,
          code,
          meta: fetchCard(code),
          location: new ygopro.CardLocation({
            controller,
            zone: ygopro.CardZone.GRAVE,
            sequence,
            position: ygopro.CardPosition.FACEUP_ATTACK,
          }),
          counters: {},
          idleInteractivities: [],
          selectInfo: { selectable: false, selected: false },
          status: 0,
          isToken: false,
          targeted: false,
        };
      }),
    );
    window.__graveMove = async (
      uuid: string,
      zone: number,
      sequence: number,
    ) => {
      const card = cardStore.inner.find((c) => c.uuid === uuid)!;
      const from = card.location;
      const payload = new Uint8Array(17);
      payload[0] = 50;
      new DataView(payload.buffer).setUint32(1, card.code, true);
      payload.set(
        [from.controller, cardZoneToNumber(from.zone), from.sequence, 1],
        5,
      );
      payload.set([from.controller, zone, sequence, 1], 9);
      const wire = new Uint8Array(payload.length + 3);
      new DataView(wire.buffer).setUint16(0, payload.length + 1, true);
      wire[2] = 1;
      wire.set(payload, 3);
      const { default: handle } = await import(
        "/src/service/onSocketMessage.ts"
      );
      await handle(
        getUIContainer(),
        new MessageEvent("message", { data: wire.buffer }),
      );
    };
    history.pushState({}, "", "/duel");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByTestId("duel-toolbar")).toBeVisible();
  await expect(page.getByTestId("duel-card")).toHaveCount(6);
}

const card = (page: Page, uuid: string) =>
  page.locator(`[data-testid="duel-card"][data-card-uuid="${uuid}"]`);
const drawer = (page: Page) => page.getByTestId("duel-card-list-drawer");

async function expectList(page: Page, codes: number[]) {
  await expect(drawer(page)).toBeVisible();
  await expect
    .poll(() =>
      drawer(page)
        .locator(".ant-space-item img")
        .evaluateAll((images) =>
          images.map((img) =>
            Number((img as HTMLImageElement).src.match(/\/(\d+)\.webp/)?.[1]),
          ),
        ),
    )
    .toEqual(codes);
}

async function expectTop(page: Page, uuid: string) {
  await expect(card(page, uuid)).toBeVisible();
  // 检查真正显示且可点击的顶卡，避免只验证 z-index 数值。
  await expect
    .poll(() =>
      card(page, uuid).evaluate((element) => {
        const rect = element.querySelector("img")!.getBoundingClientRect();
        return document
          .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          ?.closest('[data-testid="duel-card"]')
          ?.getAttribute("data-card-uuid");
      }),
    )
    .toBe(uuid);
}

for (const controller of [0, 1]) {
  test(`player ${controller} grave list follows sequence after cards leave and return`, async ({
    page,
  }) => {
    await setup(page);
    await expectTop(page, `grave-${controller}-2`);
    await card(page, `grave-${controller}-2`).click();
    const base = 1000001 + controller * 3;
    await expectList(page, [base + 2, base + 1, base]);
    await page.evaluate((controller) => {
      return window.__graveMove(`grave-${controller}-0`, 2, 0);
    }, controller);
    await expectList(page, [base + 2, base + 1]);
    await page.evaluate((controller) => {
      return window.__graveMove(`grave-${controller}-0`, 16, 2);
    }, controller);
    await expectList(page, [base, base + 2, base + 1]);
    await drawer(page)
      .locator(".ant-space-item img")
      .first()
      .locator("..")
      .click();
    await expect(page.getByTestId("duel-card-detail")).toHaveAttribute(
      "data-card-code",
      String(base),
    );
  });

  test(`player ${controller} visible grave top stays in sync after sequence shifts`, async ({
    page,
  }) => {
    await setup(page);
    await page.evaluate(async () => {
      const { settingStore } = await import("/src/stores/settingStore/index.ts");
      settingStore.saveAnimationConfig({ enabled: true });
    });
    await expectTop(page, `grave-${controller}-2`);
    await page.evaluate((controller) => {
      return window.__graveMove(`grave-${controller}-0`, 2, 0);
    }, controller);
    await expect(card(page, `grave-${controller}-2`)).toHaveAttribute(
      "data-card-sequence",
      "1",
    );
    await expectTop(page, `grave-${controller}-2`);
    // 底部卡重新入墓应成为顶卡，不能被已减小序号的旧顶卡遮住。
    await page.evaluate((controller) => {
      return window.__graveMove(`grave-${controller}-0`, 16, 2);
    }, controller);
    await expectTop(page, `grave-${controller}-0`);
    await card(page, `grave-${controller}-0`).click();
    const base = 1000001 + controller * 3;
    await expectList(page, [base, base + 2, base + 1]);
    await drawer(page).getByRole("button", { name: "Close" }).click();
    await page.evaluate((controller) => {
      return window.__graveMove(`grave-${controller}-0`, 0, 0);
    }, controller);
    await expect(card(page, `grave-${controller}-0`)).toHaveCount(0);
    await expectTop(page, `grave-${controller}-2`);
  });
}
