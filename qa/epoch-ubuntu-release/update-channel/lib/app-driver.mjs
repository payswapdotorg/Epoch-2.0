/**
 * W037-W2 — 真实窗口驱动共享件（update-network-assertion / dev-update-journey 共用）。
 *
 * - 主进程 stdout/stderr 捕获（[auto-update] 日志行是 provider 身份与 feed 命中的运行时证据）；
 * - CDP Network 域观察（renderer 请求 URL 级证据 —— playwright electron context 的 newCDPSession）；
 * - 「检查更新」菜单路径驱动：app.evaluate 进入主进程，按 id 取菜单项，直接调用其
 *   click 处理器（正是菜单被点击时执行的同一条 executeDesktopCommand 路径）；
 * - 菜单项状态轮询（label/enabled 由 autoUpdater 的 menuState 驱动 —— 真实 UI 状态面）；
 * - 首屏就绪等待（复用 W036 冻结选择器）。
 */
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { JOURNEY_SELECTORS } from "../../lib/journey-core.mjs";
import { scrubSecrets } from "./common.mjs";

export const CHECK_FOR_UPDATE_MENU_ID = "check-for-update";

/** 捕获主进程 stdout/stderr（行缓冲、脱敏、上限保护）。 */
export function captureProcessOutput(app, { maxLines = 4000 } = {}) {
  const lines = [];
  const push = (stream, tag) => {
    if (!stream) return;
    let pending = "";
    stream.setEncoding?.("utf8");
    stream.on("data", (chunk) => {
      pending += String(chunk);
      let index = pending.indexOf("\n");
      while (index >= 0) {
        const line = scrubSecrets(pending.slice(0, index)).trimEnd();
        pending = pending.slice(index + 1);
        if (line && lines.length < maxLines) {
          lines.push({ stream: tag, timestamp: new Date().toISOString(), text: line });
        }
        index = pending.indexOf("\n");
      }
    });
  };
  try {
    const child = app.process();
    push(child.stdout, "stdout");
    push(child.stderr, "stderr");
  } catch {
    // 进程句柄不可用时 stdout 证据缺失，其余观察层继续
  }
  return {
    lines,
    snapshot() {
      return lines;
    },
    autoUpdateLines() {
      return lines.filter((entry) => /\[auto-update\]|\[force-update\]|electron-updater/i.test(entry.text));
    },
  };
}

/** CDP Network 观察器：记录 renderer 的全部请求（URL 级）。 */
export async function attachCdpNetwork(page, { onRequest } = {}) {
  const requests = [];
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  session.on("Network.requestWillBeSent", (event) => {
    const record = {
      layer: "cdp",
      kind: "http",
      timestamp: new Date().toISOString(),
      requestId: event.requestId,
      method: event.request?.method ?? null,
      url: event.request?.url ?? null,
      type: event.type ?? null,
    };
    requests.push(record);
    onRequest?.(record);
  });
  return {
    session,
    requests,
    close: async () => {
      try {
        await session.detach();
      } catch {
        // 会话可能已失效
      }
    },
  };
}

/** 菜单项快照（真实 UI 状态：label/enabled 由 menuState 驱动）。 */
export async function snapshotUpdateMenuItem(app) {
  try {
    return await Promise.race([
      app.evaluate(({ Menu }, itemId) => {
        const menu = Menu.getApplicationMenu();
        if (!menu) return { found: false, reason: "no-application-menu" };
        const item = menu.getMenuItemById(itemId);
        if (!item) return { found: false, reason: "no-menu-item" };
        return {
          found: true,
          label: item.label,
          enabled: item.enabled,
          hasClick: typeof item.click === "function",
        };
      }, CHECK_FOR_UPDATE_MENU_ID),
      sleep(15_000).then(() => ({ found: false, reason: "app.evaluate timeout" })),
    ]);
  } catch (error) {
    return { found: false, reason: `app.evaluate failed: ${error.message}` };
  }
}

/**
 * 触发菜单的「检查更新」：按 id 定位菜单项并调用其 click 处理器 —— 与真实用户点击
 * 菜单项执行的同一处理器（executeDesktopCommand(CheckForUpdates)）。键盘路径
 * （Alt 菜单条导航）作为 hasClick 不可用时的兜底尽力而为，并如实记录使用的路径。
 */
export async function clickCheckForUpdates(app, logFn) {
  const snapshot = await snapshotUpdateMenuItem(app);
  if (!snapshot.found) {
    return { clicked: false, via: null, reason: snapshot.reason ?? "menu item not found", snapshot };
  }
  if (!snapshot.enabled) {
    return { clicked: false, via: null, reason: `menu item disabled (label=${snapshot.label})`, snapshot };
  }
  if (snapshot.hasClick) {
    try {
      await app.evaluate(({ Menu }, itemId) => {
        const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
        if (!item || typeof item.click !== "function") return false;
        item.click(item, null, {});
        return true;
      }, CHECK_FOR_UPDATE_MENU_ID);
      logFn?.("菜单路径触发：check-for-update 菜单项 click 处理器（主进程）");
      return { clicked: true, via: "menu-item-click-handler", snapshot };
    } catch (error) {
      return { clicked: false, via: null, reason: `click invoke failed: ${error.message}`, snapshot };
    }
  }
  // 兜底：键盘菜单条导航（Xvfb 下尽力而为；不可靠即如实记录）
  return {
    clicked: false,
    via: null,
    reason: "MenuItem.click 不可调用，且键盘菜单条导航在无 WM 的 Xvfb 会话不可靠 —— 菜单路径无法驱动",
    snapshot,
  };
}

/** 轮询菜单项状态直到 predicate 为真或超时；返回观测到的状态序列（证据）。 */
export async function pollMenuStates(app, { predicate, timeoutMs = 30_000, intervalMs = 500 } = {}) {
  const observed = [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await snapshotUpdateMenuItem(app);
    if (snapshot.found) {
      const last = observed[observed.length - 1];
      if (!last || last.label !== snapshot.label || last.enabled !== snapshot.enabled) {
        observed.push({
          timestamp: new Date().toISOString(),
          label: snapshot.label,
          enabled: snapshot.enabled,
        });
      }
      if (predicate?.(snapshot, observed)) {
        return { settled: true, observed };
      }
    }
    await sleep(intervalMs);
  }
  return { settled: false, observed };
}

/** 首屏就绪（W036 冻结选择器：世界画布 + ready dot）。 */
export async function waitForFirstScreen(page, { timeoutMs = 180_000, logFn } = {}) {
  const markers = { worldCanvas: false, readyDot: false };
  try {
    logFn?.(`等待世界画布 ${JOURNEY_SELECTORS.worldCanvas} …`);
    await page.waitForSelector(JOURNEY_SELECTORS.worldCanvas, { timeout: timeoutMs });
    markers.worldCanvas = true;
  } catch {
    // 首屏失败如实记录
  }
  try {
    logFn?.(`等待 ready dot ${JOURNEY_SELECTORS.readyDot} …`);
    await page.waitForSelector(JOURNEY_SELECTORS.readyDot, { timeout: Math.min(timeoutMs, 120_000) });
    markers.readyDot = true;
  } catch {
    // 首屏失败如实记录
  }
  return { ready: markers.worldCanvas && markers.readyDot, markers };
}

/** 抓图 + 记录（失败不影响退出码）。 */
export async function capture(page, evidenceDir, id, description, screenshots, logFn) {
  try {
    const file = `${id}.png`;
    await page.screenshot({ path: join(evidenceDir, file), fullPage: false });
    screenshots.push({ file, step: id, description });
    logFn?.(`captured ${file} — ${description}`);
    return file;
  } catch (error) {
    logFn?.(`screenshot ${id} failed: ${error.message}`);
    return null;
  }
}

/** 优雅关闭 + 超时强杀兜底（journey-ubuntu.mjs 同款）。 */
export async function closeApp(app, logFn, timeoutMs = 30_000) {
  try {
    await Promise.race([
      app.close(),
      sleep(timeoutMs).then(() => {
        throw new Error("app.close() timeout");
      }),
    ]);
    return "close";
  } catch (error) {
    logFn?.(`app.close() 未在 ${timeoutMs}ms 内完成（${error.message}）——SIGKILL 兜底`);
    try {
      app.process().kill("SIGKILL");
    } catch {
      // 进程可能已退出
    }
    await sleep(1500);
    return "kill";
  }
}
