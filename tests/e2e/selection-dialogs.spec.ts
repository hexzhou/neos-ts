import { expect, type Page, test } from "@playwright/test";
import initSqlJs from "sql.js";

test.use({ viewport: { width: 1280, height: 1000 } });

let database: Buffer;
test.beforeAll(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE datas (id INTEGER, type INTEGER); CREATE TABLE texts (id INTEGER, name TEXT, desc TEXT);",
  );
  for (const code of [1000001, 1000002, 1000003]) {
    db.run("INSERT INTO datas VALUES (?, 33)", [code]);
    db.run("INSERT INTO texts VALUES (?, ?, ?)", [code, `候选 ${code}`, ""]);
  }
  database = Buffer.from(db.export());
  db.close();
});

async function setup(page: Page) {
  await page.route("**/*.cdb", (route) => route.fulfill({ body: database }));
  await page.route("**/*.conf", (route) =>
    route.fulfill({
      body: "!system 212 已选择的卡\n!system 1211 确认\n!system 1295 取消\n!system 1004 墓地",
    }),
  );
  await page.route("**/test-release-v2.json", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(/\/\d+\.webp(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="438"><rect width="300" height="438" fill="gray"/></svg>',
    }),
  );
  await page.goto("/match");
  await expect(page.getByTestId("match-deck-select")).toBeVisible();
  await page.evaluate(async () => {
    const { initializeApp } = await import("/src/ui/Layout/utils.ts");
    await initializeApp();
    const { initUIContainer } = await import("/src/container/compat.ts");
    const { matStore } = await import("/src/stores/index.ts");
    window.__sent = [];
    initUIContainer({
      isClosed: () => false,
      close: () => {},
      ws: {
        readyState: WebSocket.OPEN,
        send: (data: Uint8Array) => window.__sent.push([...data]),
      },
    });
    matStore.selfType = 1;
    matStore.currentPlayer = 0;
    history.pushState({}, "", "/duel");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByTestId("duel-toolbar")).toBeVisible();
  await page.waitForTimeout(1100);
}

test("counter allocation keeps untouched cards at zero and resets on reopening", async ({
  page,
}) => {
  await setup(page);
  async function openCounter() {
    await page.evaluate(async () => {
      const { displayCheckCounterModal } = await import(
        "/src/ui/Duel/Message/index.ts"
      );
      void displayCheckCounterModal({
        min: 1,
        counterType: 1,
        options: [
          { code: 1000001, max: 2 },
          { code: 1000002, max: 2 },
        ],
      });
    });
  }
  const surface = page.locator(
    '[data-testid="duel-movable-selection"]:visible',
  );
  const inputs = surface.getByRole("spinbutton");
  const finish = surface.getByRole("button", { name: "finish", exact: true });
  await openCounter();
  await expect(inputs).toHaveCount(2);
  await expect(finish).toBeDisabled();
  await inputs.first().fill("1");
  await inputs.first().press("Tab");
  await expect(inputs.last()).toHaveValue("0");
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
  expect(await page.evaluate(() => window.__sent[0].slice(3))).toEqual([
    1, 0, 0, 0,
  ]);
  await expect(surface).toHaveCount(0);

  await openCounter();
  await expect(inputs.first()).toHaveValue("0");
  await expect(inputs.last()).toHaveValue("0");
  await expect(finish).toBeDisabled();
  await inputs.last().fill("1");
  await inputs.last().press("Tab");
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(2);
  expect(await page.evaluate(() => window.__sent[1].slice(3))).toEqual([
    0, 0, 1, 0,
  ]);
});

test("three-card sorting sends each original card's new position", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const { displaySortCardModal } = await import(
      "/src/ui/Duel/Message/index.ts"
    );
    const { fetchCard } = await import("/src/api/index.ts");
    void displaySortCardModal(
      [1000001, 1000002, 1000003].map((code, response) => ({
        meta: fetchCard(code),
        response,
      })),
    );
  });
  const surface = page.locator(
    '[data-testid="duel-movable-selection"]:visible',
  );
  const cards = surface.locator('[aria-roledescription="sortable"]');
  await expect(cards).toHaveCount(3);
  await expect
    .poll(() =>
      cards.evaluateAll((nodes) =>
        nodes.map((node) => {
          const img = node.querySelector("img")!;
          return img.complete && img.naturalWidth > 0;
        }),
      ),
    )
    .toEqual([true, true, true]);
  await page.waitForTimeout(350);
  const from = (await cards.last().boundingBox())!;
  const to = (await cards.first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 8);
  await page.waitForTimeout(100);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 20,
  });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await expect
    .poll(() =>
      cards.evaluateAll((nodes) =>
        nodes.map((node) => node.querySelector("img")!.alt),
      ),
    )
    .toEqual(["1000003", "1000001", "1000002"]);
  // dnd-kit 在拖动结束后短暂拦截点击，等待事件监听释放。
  await page.waitForTimeout(100);
  await surface.getByRole("button", { name: "finish", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
  expect(await page.evaluate(() => window.__sent[0].slice(3))).toEqual([
    1, 2, 0,
  ]);
});

test("sum popup displays locked mandatory cards and submits them once", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const { ygopro } = await import("/src/api/index.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { default: selectSum } = await import(
      "/src/service/duel/selectSum.ts"
    );
    const make = (code: number, sequence: number, level1: number) => ({
      code,
      location: new ygopro.CardLocation({
        controller: 0,
        zone: ygopro.CardZone.GRAVE,
        sequence,
      }),
      level1,
      response: 0,
    });
    void selectSum(getUIContainer(), {
      overflow: 0,
      level_sum: 8,
      min: 1,
      max: 1,
      must_select_cards: [make(1000001, 0, 3)],
      selectable_cards: [make(1000002, 1, 5)],
    });
  });
  const surface = page.locator(
    '[data-testid="duel-select-cards-modal"]:visible',
  );
  const mandatory = surface.getByTestId("duel-select-card-mandatory-option");
  const submit = page.locator(
    '[data-testid="duel-select-card-submit"]:visible',
  );
  await expect(mandatory).toHaveCount(1);
  await expect(mandatory).toHaveAttribute("data-card-code", "1000001");
  await expect(mandatory.locator(".ant-pro-checkcard")).toHaveClass(/checked/);
  await expect(submit).toBeDisabled();
  await mandatory.click();
  await expect(mandatory.locator(".ant-pro-checkcard")).toHaveClass(/checked/);
  await expect(page.getByTestId("duel-card-detail")).toHaveAttribute(
    "data-card-code",
    "1000001",
  );
  await expect(submit).toBeDisabled();
  await expect(surface.getByTestId("duel-select-card-option")).toHaveCount(1);
  await surface.getByTestId("duel-select-card-option").click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => page.evaluate(() => window.__sent.length)).toBe(1);
  // 必选项与可选项各有自己的序号，响应中各出现一次。
  expect(await page.evaluate(() => window.__sent[0].slice(3))).toEqual([
    2, 0, 0,
  ]);
});
