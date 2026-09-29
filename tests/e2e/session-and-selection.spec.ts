import { expect, type Page, test } from "@playwright/test";
import initSqlJs from "sql.js";

let database: Buffer;
test.beforeAll(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(
    "CREATE TABLE datas (id INTEGER, type INTEGER); CREATE TABLE texts (id INTEGER, name TEXT, desc TEXT);",
  );
  database = Buffer.from(db.export());
  db.close();
});

async function resources(page: Page) {
  await page.route("**/*.cdb", (route) => route.fulfill({ body: database }));
  await page.route("**/*.conf", (route) =>
    route.fulfill({
      body: "!system 1211 确认\n!system 1295 取消\n!system 1001 手牌\n!system 1004 墓地",
    }),
  );
  await page.route("**/test-release-v2.json", (route) =>
    route.fulfill({ json: [] }),
  );
}
async function setup(page: Page) {
  await resources(page);
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

async function openSelection(page: Page, max = 1) {
  await page.evaluate(async (max) => {
    const { displaySimpleSelectCardsModal } = await import(
      "/src/ui/Duel/Message/SimpleSelectCardsModal/index.tsx"
    );
    const { ygopro } = await import("/src/api/index.ts");
    window.__selected = null;
    const cards = [89631139, 46986414, 15025844].map((code, index) => ({
      meta: { id: code, data: {}, text: { name: `Card ${index}` } },
      location: new ygopro.CardLocation({
        controller: 0,
        zone: index === 2 ? ygopro.CardZone.GRAVE : ygopro.CardZone.HAND,
        sequence: index,
      }),
      response: index,
    }));
    if (max > 1) {
      const { displaySelectActionsModal } = await import(
        "/src/ui/Duel/Message/SelectActionsModal/index.tsx"
      );
      void displaySelectActionsModal({ min: 2, max, selectables: cards });
      return;
    }
    void displaySimpleSelectCardsModal({ selectables: cards }).then(
      (result) => {
        window.__selected = result.map((c) => c.response);
      },
    );
  }, max);
}

test("single selection replaces the previous card within and across zones", async ({
  page,
}) => {
  await setup(page);
  await openSelection(page);
  const options = page.getByTestId("duel-select-card-option");
  await options.nth(0).click();
  await options.nth(1).click();
  await expect(options.nth(0).locator(".ant-pro-checkcard")).not.toHaveClass(
    /checked/,
  );
  await expect(options.nth(1).locator(".ant-pro-checkcard")).toHaveClass(
    /checked/,
  );
  await expect(
    page.locator('[data-testid="duel-select-card-submit"]:visible'),
  ).toBeEnabled();
  await page
    .getByTestId("duel-select-cards-modal")
    .getByText("墓地", { exact: true })
    .click();
  await options.first().click();
  await page.locator('[data-testid="duel-select-card-submit"]:visible').click();
  await expect.poll(() => page.evaluate(() => window.__selected)).toEqual([2]);
});

test("right drawers leave the toolbar visible and clickable after resizing", async ({
  page,
}, info) => {
  await setup(page);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      const { displayCardListModal } = await import(
        "/src/ui/Duel/Message/CardListModal/index.tsx"
      );
      displayCardListModal({ isZone: true, zone: 4, controller: 0 });
    });
    const drawer = page.getByTestId("duel-card-list-drawer");
    await expect(drawer).toBeVisible();
    await expect
      .poll(async () => {
        const bar = (await page.getByTestId("duel-toolbar").boundingBox())!;
        const box = (await drawer.boundingBox())!;
        return box.y + box.height < bar.y;
      })
      .toBe(true);
    await page.getByTestId("duel-surrender").click();
    await expect(page.getByTestId("duel-surrender-confirm")).toBeVisible();
    await page.keyboard.press("Escape");
    await drawer.getByRole("button", { name: "Close" }).click();
  }
  await page.evaluate(async () => {
    const { displayActionHistory } = await import(
      "/src/ui/Duel/Message/ActionHistory/index.tsx"
    );
    displayActionHistory();
  });
  const historyDrawer = page.getByTestId("duel-history-drawer");
  await expect(historyDrawer).toBeVisible();
  const bar = (await page.getByTestId("duel-toolbar").boundingBox())!;
  const box = (await historyDrawer.boundingBox())!;
  expect(box.y + box.height).toBeLessThan(bar.y);
  await page.screenshot({ path: info.outputPath("sidebar-toolbar.png") });
});

test("only the server's active player counts down, including background time, and sending a response stops it", async ({
  page,
}) => {
  await setup(page);
  await page.clock.install();
  await page.evaluate(async () => {
    const { matStore } = await import("/src/stores/index.ts");
    matStore.timeLimits.set(0, 120);
    matStore.timeLimits.set(1, 90);
  });
  const me = page.locator(
    '[data-testid="duel-player-timer"][data-player="me"]',
  );
  const op = page.locator(
    '[data-testid="duel-player-timer"][data-player="op"]',
  );
  await page.clock.fastForward(5000);
  await expect(me).toHaveText(/02:00.*等待/);
  await expect(op).toHaveText(/01:25.*操作中/);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(20_000);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(op).toHaveText(/01:05.*操作中/);
  await page.evaluate(async () => {
    const { matStore } = await import("/src/stores/index.ts");
    const { sendSocketData } = await import("/src/middleware/socket.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    matStore.timeLimits.set(0, 80);
    sendSocketData(
      getUIContainer().conn,
      new Uint8Array([5, 0, 1, 0, 0, 0, 0]),
    );
  });
  await page.clock.fastForward(10_000);
  await expect(me).toHaveText(/01:20.*等待/);
  await expect(op).toHaveText(/01:05.*等待/);
});

test("initialization failure is shown and retry shares one load then succeeds", async ({
  page,
}) => {
  await resources(page);
  let attempts = 0;
  let fail = true;
  await page.route("**/sql-wasm.wasm", async (route) => {
    attempts += 1;
    if (fail) await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  await page.goto("/match");
  await expect(page.getByTestId("connection-status")).toContainText(
    "资源初始化失败",
  );
  expect(attempts).toBe(1);
  fail = false;
  await page.getByRole("button", { name: "重新加载资源" }).click();
  await page.evaluate(async () => {
    const { initializeApp } = await import("/src/ui/Layout/utils.ts");
    await Promise.all([initializeApp(), initializeApp()]);
  });
  await expect(page.getByTestId("connection-status")).not.toBeVisible();
  expect(attempts).toBe(2);
});

test("connection timeout and retry, background return and server disconnect have explicit states", async ({
  page,
}) => {
  await setup(page);
  await page.clock.install();
  await page.evaluate(async () => {
    const { connectSrvpro } = await import("/src/ui/Match/util.ts");
    class FakeSocket extends EventTarget {
      static OPEN = 1;
      static CLOSED = 3;
      static CLOSING = 2;
      readyState = 0;
      binaryType = "arraybuffer";
      onopen: Function;
      onclose: Function;
      onerror: Function;
      onmessage: Function;
      constructor(public url: string) {
        super();
        window.__socket = this;
      }
      send() {}
      close() {
        if (this.readyState === 3) return;
        this.readyState = 3;
        queueMicrotask(() => this.onclose?.(new Event("close")));
      }
    }
    window.WebSocket = FakeSocket;
    window.__connect = () =>
      connectSrvpro({
        ip: "test.invalid:1234",
        player: "Test",
        passWd: "",
      }).catch((error) => {
        window.__connectError = error.message;
      });
    void window.__connect();
  });
  await expect(page.getByTestId("connection-status")).toHaveAttribute(
    "data-phase",
    "connecting",
  );
  await page.clock.fastForward(15_001);
  await expect(page.getByTestId("connection-status")).toContainText("连接超时");
  await page.evaluate(() => {
    void window.__connect();
  });
  await expect(page.getByTestId("connection-status")).toHaveAttribute(
    "data-phase",
    "connecting",
  );
  await page.evaluate(() => {
    window.__socket.readyState = 1;
    window.__socket.onopen(new Event("open"));
  });
  await expect(page.getByTestId("connection-status")).toHaveAttribute(
    "data-phase",
    "joining",
  );
  await page.evaluate(() => {
    window.__socket.onmessage(
      new MessageEvent("message", { data: new Uint8Array([1, 0, 18]).buffer }),
    );
  });
  await expect(page.getByTestId("connection-status")).not.toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("connection-status")).toContainText(
    "已返回对局",
  );
  await page.evaluate(async () => {
    const { displayYesNoModal } = await import("/src/ui/Duel/Message/YesNoModal/index.tsx");
    void displayYesNoModal("断线前的选择");
  });
  await expect(page.getByText("断线前的选择", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.__socket.readyState = 3;
    window.__socket.onclose(new Event("close"));
  });
  await expect(page.getByTestId("connection-status")).toHaveAttribute(
    "data-phase",
    "disconnected",
  );
  await expect(page.getByRole("button", { name: "返回大厅" })).toBeVisible();
  await expect(page.getByText("断线前的选择", { exact: true })).not.toBeVisible();
});

test("card images and the local card back load as WebP", async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const { getCardImgUrl } = await import("/src/api/index.ts");
    return [
      getCardImgUrl(46986414),
      getCardImgUrl(0),
      getCardImgUrl(46986414, true),
    ];
  });
  expect(result.every((url) => url.endsWith(".webp"))).toBe(true);
  const response = await page.request.get(result[1]);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/webp");
});

test("multi-card prompts still keep multiple selections", async ({ page }) => {
  await setup(page);
  await openSelection(page, 2);
  const options = page.getByTestId("duel-select-card-option");
  await options.nth(0).click();
  await options.nth(1).click();
  await expect(options.locator(".ant-pro-checkcard-checked")).toHaveCount(2);
  await page.locator('[data-testid="duel-select-card-submit"]:visible').click();
  expect(await page.evaluate(() => window.__sent.at(-1).slice(3))).toEqual([
    2, 0, 1,
  ]);
});

test("disconnect clears pending dialogs and drawers without closing the next game's prompt", async ({ page }) => {
  await setup(page);
  await openSelection(page);
  await page.evaluate(async () => {
    const { displayYesNoModal } = await import("/src/ui/Duel/Message/YesNoModal/index.tsx");
    const { displayActionHistory } = await import("/src/ui/Duel/Message/ActionHistory/index.tsx");
    window.__oldPromptFinished = false;
    void displayYesNoModal("上一局的选择").then(() => { window.__oldPromptFinished = true; });
    displayActionHistory();
  });
  await expect(page.getByText("上一局的选择", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { disconnectSession } = await import("/src/ui/Match/util.ts");
    const { displayYesNoModal } = await import("/src/ui/Duel/Message/YesNoModal/index.tsx");
    disconnectSession();
    // 在旧 Promise 的 continuation 执行前打开新提示，防止旧清理误关新弹窗。
    window.__newPromptFinished = false;
    void displayYesNoModal("新一局的选择").then(() => { window.__newPromptFinished = true; });
  });
  await expect(page.getByText("上一局的选择", { exact: true })).not.toBeVisible();
  await expect(page.locator('[data-testid="duel-select-cards-modal"]:visible')).toHaveCount(0);
  await expect(page.getByTestId("duel-history-drawer")).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__oldPromptFinished)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__selected)).toEqual([]);
  await expect(page.getByText("新一局的选择", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__newPromptFinished)).toBe(false);
  expect(await page.evaluate(() => window.__sent)).toEqual([]);
  await page.getByTestId("duel-yesno-yes").click();
  await expect.poll(() => page.evaluate(() => window.__newPromptFinished)).toBe(true);
  expect(await page.evaluate(() => window.__sent.length)).toBe(1);
});

test("duel result replaces pending choices and is cleared on returning to the lobby", async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const { displayYesNoModal } = await import("/src/ui/Duel/Message/YesNoModal/index.tsx");
    void displayYesNoModal("尚未完成的发动确认");
    const { default: win } = await import("/src/service/duel/win.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    window.__winFinished = false;
    void win(getUIContainer(), { win_player: 0, reason: 0 }).then(() => { window.__winFinished = true; });
  });
  await expect(page.getByTestId("duel-end-modal")).toBeVisible();
  await expect(page.getByText("尚未完成的发动确认", { exact: true })).not.toBeVisible();
  await page.evaluate(() => {
    history.pushState({}, "", "/match");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByTestId("match-deck-select")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__winFinished)).toBe(true);
  await page.evaluate(() => {
    history.pushState({}, "", "/duel");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByTestId("duel-toolbar")).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("duel-end-modal")).not.toBeVisible();
  await expect(page.locator('[data-testid="duel-yesno-modal"]:visible')).toHaveCount(0);
});

test("time bars remain visible before synchronization and use the room limit and server countdown", async ({ page }, info) => {
  await setup(page);
  const timers = page.getByTestId("duel-player-timer");
  await expect(timers).toHaveCount(2);
  await expect(timers.nth(0)).toContainText("未同步");
  await expect(timers.nth(1)).toContainText("未同步");
  await page.evaluate(async () => {
    const { default: handleSocketMessage } = await import("/src/service/onSocketMessage.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { matStore, roomStore } = await import("/src/stores/index.ts");
    roomStore.players = [{name: "我方", isMe: true}, {name: "对方", isMe: false}];
    matStore.initInfo.set(0, { life: 8000 });
    matStore.initInfo.set(1, { life: 8000 });
    const packet = new Uint8Array(23);
    packet.set([21, 0, 18]);
    new DataView(packet.buffer).setUint16(21, 180, true);
    await handleSocketMessage(getUIContainer(), new MessageEvent("message", {data: packet.buffer}));
  });
  for (const timer of await timers.all()) {
    await expect(timer).toContainText("03:00");
    await expect(timer).toHaveAttribute("data-active", "false");
  }
  await page.clock.install();
  await page.evaluate(async () => {
    const { default: handleSocketMessage } = await import("/src/service/onSocketMessage.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    await handleSocketMessage(getUIContainer(), new MessageEvent("message", {data: new Uint8Array([5, 0, 24, 0, 0, 120, 0]).buffer}));
  });
  await page.clock.fastForward(5000);
  const me = page.locator('[data-testid="duel-player-timer"][data-player="me"]');
  const op = page.locator('[data-testid="duel-player-timer"][data-player="op"]');
  await expect(me).toContainText("01:55");
  await expect(op).toContainText("03:00");
  await expect(me.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "115");
  await expect(me.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "180");
  for (const viewport of [{width: 1440, height: 900}, {width: 844, height: 390}]) {
    await page.setViewportSize(viewport);
    for (const timer of await timers.all()) {
      await expect(timer).toBeInViewport();
      const rect = await timer.boundingBox();
      expect(rect!.width).toBeGreaterThanOrEqual(136);
      const bar = await timer.getByRole("progressbar").boundingBox();
      expect(bar!.height).toBeGreaterThanOrEqual(5);
      const text = await timer.locator("strong").boundingBox();
      expect(text!.x + text!.width).toBeLessThanOrEqual(rect!.x + rect!.width);
    }
    await page.screenshot({path: info.outputPath(`time-bars-${viewport.width}.png`)});
  }
  await page.evaluate(async () => {
    const { resetDuel, roomStore } = await import("/src/stores/index.ts");
    resetDuel();
    roomStore.timeLimit = 0;
  });
  await expect(timers.nth(0)).toContainText("本局不限时");
  await expect(timers.nth(1)).toContainText("本局不限时");
  await page.evaluate(async () => {
    const { replayStore } = await import("/src/stores/index.ts");
    replayStore.isReplay = true;
  });
  await expect(timers.nth(0)).toContainText("回放不计时");
  await expect(timers.nth(1)).toContainText("回放不计时");
});

async function connectFakeSession(page: Page) {
  await page.evaluate(async () => {
    const { connectSrvpro } = await import("/src/ui/Match/util.ts");
    class FakeSocket {
      static OPEN = 1;
      static CLOSED = 3;
      static CLOSING = 2;
      readyState = 0;
      onopen: Function;
      onclose: Function;
      onmessage: Function;
      onerror: Function;
      constructor() {
        window.__socket = this;
        queueMicrotask(() => {
          this.readyState = 1;
          this.onopen?.(new Event("open"));
          this.onmessage?.(new MessageEvent("message", {data: new Uint8Array([1, 0, 18]).buffer}));
        });
      }
      send(data: Uint8Array) { window.__sent.push([...data]); }
      close() {
        if (this.readyState === 3) return;
        this.readyState = 3;
        queueMicrotask(() => this.onclose?.(new Event("close")));
      }
    }
    window.WebSocket = FakeSocket;
    await connectSrvpro({ip: "test.invalid:1234", player: "Test", passWd: ""});
    window.__sent = [];
  });
}

test("spectators exit locally without sending a surrender packet", async ({page}) => {
  await setup(page);
  await connectFakeSession(page);
  await page.evaluate(async () => {
    const {matStore, roomStore} = await import("/src/stores/index.ts");
    matStore.selfType = 3;
    roomStore.selfType = 100;
  });
  await expect(page.getByTestId("duel-leave")).toHaveText("退出观战");
  await expect(page.getByTestId("duel-surrender")).toHaveCount(0);
  await page.getByTestId("duel-leave").click();
  await expect(page.getByTestId("match-deck-select")).toBeVisible();
  expect(await page.evaluate(() => window.__socket.readyState)).toBe(3);
  expect(await page.evaluate(() => window.__sent)).toEqual([]);
});

test("server close preserves the result and a downloadable replay after returning to lobby", async ({page}) => {
  await setup(page);
  await connectFakeSession(page);
  await page.evaluate(async () => {
    // 原始协议的 WIN 帧，断线时仍应保留已接收的录像。
    window.__socket.onmessage(new MessageEvent("message", {data: new Uint8Array([4, 0, 1, 5, 0, 0]).buffer}));
  });
  await expect(page.getByTestId("duel-end-modal")).toBeVisible();
  await page.evaluate(() => {
    window.__socket.readyState = 3;
    window.__socket.onclose(new Event("close"));
  });
  await expect(page.getByTestId("duel-end-modal")).toBeVisible();
  await expect(page.getByTestId("session-unavailable")).toHaveCount(0);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", {name: "保存录像", exact: true}).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.neos\.yrp3d$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect([...Buffer.concat(chunks)]).toEqual([5, 2, 0, 0, 0, 0, 0]);
  await expect(page.getByTestId("match-deck-select")).toBeVisible();
  await expect(page.getByTestId("save-replay")).toHaveText("保存上一局录像");
  const secondDownload = page.waitForEvent("download");
  await page.getByTestId("save-replay").click();
  expect((await secondDownload).suggestedFilename()).toBe(download.suggestedFilename());
});

test("field cards show live stats, levels and counters with MDPro3 change colors and hide private cards", async ({page}, info) => {
  await setup(page);
  await page.setViewportSize({width: 1440, height: 900});
  await page.evaluate(async () => {
    const {cardStore} = await import("/src/stores/index.ts");
    const {genCard} = await import("/src/service/utils/genCard.ts");
    const {ygopro} = await import("/src/api/index.ts");
    const {TYPE_MONSTER, TYPE_XYZ, TYPE_LINK} = await import("/src/common.ts");
    const make = (uuid: string, seq: number, type: number, controller = 0) => genCard({
      uuid, code: 46986414,
      meta: {id: 46986414, data: {type, atk: 2500, def: 2100, level: 7}, text: {name: uuid}},
      location: new ygopro.CardLocation({controller, zone: ygopro.CardZone.MZONE, sequence: seq, position: ygopro.CardPosition.FACEUP_ATTACK}),
      counters: {}, idleInteractivities: [], selectInfo: {selectable: false, selected: false}, targeted: false, isToken: false, status: 0,
    });
    cardStore.inner = [make("normal", 0, TYPE_MONSTER), make("xyz", 2, TYPE_MONSTER | TYPE_XYZ), make("link", 4, TYPE_MONSTER | TYPE_LINK), make("opponent", 1, TYPE_MONSTER, 1), make("hidden", 3, TYPE_MONSTER, 1)];
    cardStore.inner[4].location.position = ygopro.CardPosition.FACEDOWN_DEFENSE;
    const {default: handle} = await import("/src/service/onSocketMessage.ts");
    const {getUIContainer} = await import("/src/container/compat.ts");
    window.__updateStats = async (seq: number, flags: number, values: number[]) => {
      const payload = new Uint8Array(8 + values.length * 4);
      const dv = new DataView(payload.buffer);
      dv.setUint32(0, payload.length, true);
      dv.setUint32(4, flags, true);
      values.forEach((v, i) => dv.setInt32(8 + i * 4, v, true));
      const wire = new Uint8Array(7 + payload.length);
      new DataView(wire.buffer).setUint16(0, wire.length - 2, true);
      wire.set([1, 7, 0, 4, seq], 2);
      wire.set(payload, 7);
      await handle(getUIContainer(), new MessageEvent("message", {data: wire.buffer}));
    };
    await window.__updateStats(0, 0x10 | 0x100 | 0x200 | 0x20000, [8, 3000, 1800, 1, (3 << 16) | 1]);
    await window.__updateStats(2, 0x20, [4]);
    await window.__updateStats(4, 0x800000, [3, 0]);
  });
  const normal = page.locator('[data-card-uuid="normal"]');
  await expect(normal.getByTestId("field-card-atk")).toHaveText("3000");
  await expect(normal.getByTestId("field-card-atk")).toHaveAttribute("data-change", "up");
  await expect(normal.getByTestId("field-card-atk")).toHaveCSS("color", "rgb(89, 216, 255)");
  await expect(normal.getByTestId("field-card-def")).toHaveAttribute("data-change", "down");
  await expect(normal.getByTestId("field-card-def")).toHaveCSS("color", "rgb(255, 121, 121)");
  await expect(normal.getByTestId("field-card-level")).toHaveText("8");
  await expect(normal.getByTestId("field-card-counter")).toHaveText("3");
  await expect(page.locator('[data-card-uuid="xyz"]').getByTestId("field-card-level")).toHaveText("4");
  await expect(page.locator('[data-card-uuid="link"]').getByTestId("field-card-level")).toHaveText("3");
  await expect(page.locator('[data-card-uuid="link"]').getByTestId("field-card-def")).toHaveCount(0);
  await expect(page.locator('[data-card-uuid="hidden"]').getByTestId("field-card-info")).toHaveCount(0);
  await expect(normal.getByTestId("field-card-level").locator('svg[data-icon="level"]')).toBeVisible();
  await expect(page.locator('[data-card-uuid="xyz"] svg[data-icon="rank"]')).toBeVisible();
  await expect(page.locator('[data-card-uuid="link"] svg[data-icon="link"]')).toBeVisible();
  expect(await normal.getByTestId("field-card-info").innerText()).not.toMatch(/ATK|DEF|LINK|阶/);
  await page.waitForTimeout(800);
  await page.screenshot({path: info.outputPath("field-stats.png")});
  await page.evaluate(async () => {
    const {cardStore} = await import("/src/stores/index.ts");
    const {ygopro} = await import("/src/api/index.ts");
    const {callCardMove} = await import("/src/ui/Duel/PlayMat/Card/index.tsx");
    cardStore.inner[0].location.position = ygopro.CardPosition.FACEUP_DEFENSE;
    await callCardMove("normal");
    await window.__updateStats(0, 0x10 | 0x100 | 0x200 | 0x20000, [7, 2500, 2100, 0]);
  });
  await expect(normal.getByTestId("field-card-atk")).toHaveAttribute("data-change", "normal");
  await expect(normal.getByTestId("field-card-counter")).toHaveCount(0);
  await expect(normal.getByTestId("field-card-def")).toHaveAttribute("data-emphasis", "true");
  await page.screenshot({path: info.outputPath("field-stats-defense.png")});
});


test("a buffered clock update followed by WIN still reaches replay and result when the server closes immediately", async ({page}) => {
  await setup(page);
  await connectFakeSession(page);
  await page.evaluate(() => {
    window.__socket.onmessage(new MessageEvent("message", {data: new Uint8Array([5, 0, 24, 0, 0, 120, 0, 4, 0, 1, 5, 0, 0]).buffer}));
    window.__socket.readyState = 3;
    window.__socket.onclose(new Event("close"));
  });
  await expect(page.getByTestId("duel-end-modal")).toBeVisible();
  await expect(page.getByTestId("session-unavailable")).toHaveCount(0);
  expect(await page.evaluate(async () => {
    const {replayStore} = await import("/src/stores/index.ts");
    return replayStore.encode().map((buffer) => [...new Uint8Array(buffer)]);
  })).toEqual([[5, 2, 0, 0, 0, 0, 0]]);
});

test("available chain mode asks at non-hint timings and preserves forced effects", async ({ page }) => {
  await setup(page);
  const control = page.getByTestId("duel-chain-setting");
  await control.click();
  await page.getByTestId("duel-chain-setting-available").click();
  await expect(control).toHaveAttribute("data-chain-setting", "available");
  const sendChain = async (mode: number, count: number, forced = false, special = 0) => {
    await page.evaluate(async ({ mode, count, forced, special }) => {
      const { matStore } = await import("/src/stores/index.ts");
      const { resetDuelDialogs } = await import("/src/stores/duelDialogs.ts");
      const { getUIContainer } = await import("/src/container/compat.ts");
      const { ygopro } = await import("/src/api/index.ts");
      const { default: selectChain } = await import("/src/service/duel/selectChain.ts");
      resetDuelDialogs();
      window.__sent = [];
      matStore.chainSetting = mode;
      void selectChain(getUIContainer(), {
        special_count: special, hint0: 0, hint1: 0,
        chains: Array.from({ length: count }, (_, i) => ({
          code: 46986414, response: 7 + i, forced,
          location: new ygopro.CardLocation({ controller: 0, zone: ygopro.CardZone.MZONE, sequence: i }),
        })),
      });
    }, { mode, count, forced, special });
  };
  const modal = page.locator('[data-testid="duel-select-cards-modal"]:visible');
  const sent = () => page.evaluate(() => window.__sent);
  await sendChain(3, 1);
  await expect(modal).toBeVisible();
  // Waiting past the phase animation duration must never decline an effect.
  await page.waitForTimeout(800);
  expect(await sent()).toEqual([]);
  await page.locator('[data-testid="duel-select-card-option"]:visible').click();
  await page.locator('[data-testid="duel-select-card-submit"]:visible').click();
  expect((await sent()).at(-1).slice(2)).toEqual([1, 7, 0, 0, 0]);
  for (const mode of [0, 1, 2, 3]) {
    await sendChain(mode, 0);
    await expect.poll(sent).toEqual([[5, 0, 1, 255, 255, 255, 255]]);
  }
  for (const mode of [1, 2]) {
    await sendChain(mode, 1);
    await expect.poll(sent).toEqual([[5, 0, 1, 255, 255, 255, 255]]);
  }
  for (const [mode, special] of [[0, 0], [2, 1], [3, 0]]) {
    await sendChain(mode, 2, false, special);
    await expect(modal).toBeVisible();
    expect(await sent()).toEqual([]);
    await page.locator('[data-testid="duel-select-card-cancel"]:visible').click();
    await expect.poll(sent).toEqual([[5, 0, 1, 255, 255, 255, 255]]);
  }
  for (const mode of [1, 3]) {
    await sendChain(mode, 1, true);
    await expect.poll(sent).toEqual([[5, 0, 1, 7, 0, 0, 0]]);
    await sendChain(mode, 2, true);
    await expect(modal).toBeVisible();
    await expect(page.locator('[data-testid="duel-select-card-cancel"]:visible')).not.toBeVisible();
    expect(await sent()).toEqual([]);
  }
});

test("phase banners show DP and SP in order, send no response and clear on disconnect", async ({ page }, info) => {
  await setup(page);
  await page.evaluate(async () => {
    const { default: handle } = await import("/src/service/duel/gameMsg.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const phases = ygopro.StocGameMessage.MsgNewPhase.PhaseType;
    window.__phaseDone = false;
    window.__phases = [];
    window.__showPhase = (name: string) => handle(getUIContainer(), {
      stoc_game_msg: { gameMsg: "new_phase", new_phase: { phase_type: phases[name] } },
    });
    void (async () => {
      for (const phase of ["DRAW", "STANDBY", "MAIN1"]) {
        await window.__showPhase(phase);
        window.__phases.push(phase);
      }
      window.__phaseDone = true;
    })();
  });
  const banner = page.getByTestId("duel-phase-banner");
  await expect(banner).toHaveAttribute("data-phase", "DP");
  await expect(banner).toHaveCSS("pointer-events", "none");
  await page.screenshot({ path: info.outputPath("draw-phase.png") });
  await expect(banner).toHaveAttribute("data-phase", "SP");
  await expect(banner).toHaveAttribute("data-phase", "M1");
  await expect.poll(() => page.evaluate(() => window.__phaseDone)).toBe(true);
  await expect(banner).not.toBeVisible();
  expect(await page.evaluate(() => window.__phases)).toEqual(["DRAW", "STANDBY", "MAIN1"]);
  expect(await page.evaluate(() => window.__sent)).toEqual([]);
  // A reset cancels both the display and its pending wait immediately.
  await page.evaluate(async () => {
    window.__phaseDone = false;
    void window.__showPhase("END").then(() => { window.__phaseDone = true; });
  });
  await expect(banner).toHaveAttribute("data-phase", "EP");
  await page.evaluate(async () => {
    const { resetDuelDialogs } = await import("/src/stores/duelDialogs.ts");
    resetDuelDialogs(true);
  });
  await expect(banner).not.toBeVisible();
  expect(await page.evaluate(() => window.__phaseDone)).toBe(true);
  await page.evaluate(() => window.__showPhase("DAMAGE"));
  await expect(banner).not.toBeVisible();
});

test("xyz material badges track attached cards, detachments and controller changes", async ({ page }, info) => {
  await setup(page);
  await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { TYPE_MONSTER, TYPE_XYZ } = await import("/src/common.ts");
    const make = (uuid: string, controller: number, overlay = false, sequence = 2) => ({
      uuid, code: 46986414,
      meta: { id: 46986414, data: { type: TYPE_MONSTER | TYPE_XYZ, rank: 4, atk: 2500, def: 2100 }, text: { name: uuid } },
      location: new ygopro.CardLocation({ controller, zone: ygopro.CardZone.MZONE, sequence, position: ygopro.CardPosition.FACEUP_ATTACK, is_overlay: overlay, overlay_sequence: Number(uuid.at(-1)) || 0 }),
      counters: {}, idleInteractivities: [], selectInfo: { selectable: false, selected: false }, targeted: false, isToken: false, status: 0,
    });
    cardStore.inner = [make("xyz", 0), make("opponent-xyz", 1), make("material0", 0, true), make("material1", 0, true), make("other-material", 1, true), make("different-zone", 0, true, 4)];
  });
  const host = page.locator('[data-card-uuid="xyz"]');
  const opponent = page.locator('[data-card-uuid="opponent-xyz"]');
  await expect(host.getByTestId("field-card-materials")).toHaveText("2");
  await expect(opponent.getByTestId("field-card-materials")).toHaveText("1");
  await expect(page.locator('[data-card-uuid="material0"]').getByTestId("field-card-info")).toHaveCount(0);
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath("xyz-materials.png") });
  await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { default: move } = await import("/src/service/duel/move.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    const material = cardStore.inner.find(c => c.uuid === "material0");
    await move(getUIContainer(), { code: material.code, from: material.location, to: new ygopro.CardLocation({ controller: 0, zone: ygopro.CardZone.GRAVE, sequence: 0, position: ygopro.CardPosition.FACEUP_ATTACK }), reason: 0 });
  });
  await expect(host.getByTestId("field-card-materials")).toHaveText("1");
  await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    cardStore.inner.find(c => c.uuid === "material1").location.controller = 1;
  });
  await expect(host.getByTestId("field-card-materials")).toHaveText("0");
  await expect(opponent.getByTestId("field-card-materials")).toHaveText("2");
  await page.evaluate(async () => {
    const { cardStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    cardStore.inner.find(c => c.uuid === "xyz").location.position = ygopro.CardPosition.FACEDOWN_DEFENSE;
  });
  await expect(host.getByTestId("field-card-materials")).toHaveCount(0);
});

test("spectator life bars show both seats and keep player names in participant view", async ({ page }) => {
  await setup(page);
  const bottom = page.locator('[data-testid="duel-player-life"][data-player="me"]');
  const top = page.locator('[data-testid="duel-player-life"][data-player="op"]');
  await page.evaluate(async () => {
    const { roomStore, matStore } = await import("/src/stores/index.ts");
    const { ygopro } = await import("/src/api/index.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { default: typeChange } = await import("/src/service/room/typeChange.ts");
    roomStore.players = [
      { name: "First seat", state: 0, isMe: true },
      { name: "Second seat", state: 0, isMe: false },
    ];
    typeChange(getUIContainer(), new ygopro.YgoStocMsg({
      stoc_type_change: new ygopro.StocTypeChange({
        self_type: ygopro.StocTypeChange.SelfType.OBSERVER,
      }),
    }));
    matStore.selfType = ygopro.StocGameMessage.MsgStart.PlayerType.Observer;
  });
  await expect(bottom.getByText("First seat", { exact: true })).toBeVisible();
  await expect(top.getByText("Second seat", { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => {
    const { roomStore } = await import("/src/stores/index.ts");
    return roomStore.players.some((player) => player?.isMe);
  })).toBe(false);

  // 名称晚于观战身份到达时，也应更新对应席位。
  await page.evaluate(async () => {
    const { ygopro } = await import("/src/api/index.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { default: enter } = await import("/src/service/room/hsPlayerEnter.ts");
    enter(getUIContainer(), new ygopro.YgoStocMsg({
      stoc_hs_player_enter: new ygopro.StocHsPlayerEnter({ pos: 0, name: "Updated first seat" }),
    }));
  });
  await expect(bottom.getByText("Updated first seat", { exact: true })).toBeVisible();
  await expect(top.getByText("Second seat", { exact: true })).toBeVisible();

  // 名称消息也必须分别更新两位玩家，避免覆盖同一个席位。
  await page.evaluate(async () => {
    const { ygopro } = await import("/src/api/index.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { default: names } = await import("/src/service/duel/sibylName.ts");
    names(getUIContainer(), new ygopro.StocGameMessage.MsgSibylName({
      name_0: "Replay first", name_1: "Replay second",
    }));
  });
  await expect(bottom.getByText("Replay first", { exact: true })).toBeVisible();
  await expect(top.getByText("Replay second", { exact: true })).toBeVisible();

  // 第二个席位的参战玩家仍显示在下方。
  await page.evaluate(async () => {
    const { ygopro } = await import("/src/api/index.ts");
    const { getUIContainer } = await import("/src/container/compat.ts");
    const { default: typeChange } = await import("/src/service/room/typeChange.ts");
    typeChange(getUIContainer(), new ygopro.YgoStocMsg({
      stoc_type_change: new ygopro.StocTypeChange({
        self_type: ygopro.StocTypeChange.SelfType.PLAYER2,
      }),
    }));
  });
  await expect(bottom.getByText("Replay second", { exact: true })).toBeVisible();
  await expect(top.getByText("Replay first", { exact: true })).toBeVisible();
});
