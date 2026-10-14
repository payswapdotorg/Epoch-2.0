/* eslint-disable max-lines -- the repo convention for long release scripts (see scripts/bundle.mjs); the journey/audit keep their step logic together on purpose. */
/**
 * W036-W3 — 打包产物真实 Electron 窗口验收旅程（步骤实现）。
 *
 * 旅程（spec/acceptance/ubuntu-epoch-desktop-release.md 必需旅程）：
 *   launch → identity → world-dominant → navigate → select → inspect →
 *   isolate → unisolate → measure → annotate → relaunch
 *
 * 无跳过路径：任一步骤无法运行即记 fail 并写明 blocker；任一步骤失败 →
 * 整体 exit 非 0（验收法：跳过的关键旅程不得记为通过）。
 *
 * 选择器依赖（Worker 1 须保留，见 DesktopSolutionHost.tsx / DesktopSolutionW007Panel.tsx）：
 * - [data-testid="epoch-world-canvas"]（世界画布，W006 冻结）；
 * - [title="world ready"]（ready dot，W006 冻结）；
 * - [data-testid="epoch-w007-panel"]（工具面板；其父容器即右侧面板，inspector 文本来源）；
 * - [data-testid="epoch-isolate-{LAYER}"] / epoch-unisolate（图层隔离，LAYER ∈
 *   SITE/FOUNDATION/STRUCTURE/ENVELOPE/MEP/FINISHES）；
 * - epoch-measure / epoch-measurements / epoch-measurement-*；
 * - epoch-annotation-input / epoch-annotate / epoch-annotations / epoch-annotation-*；
 * - 可见文本行 "entityId:"（inspector 行无 testid——按 W006 journey 的既有约定依赖可见文本）。
 */
import { setTimeout as sleep } from "node:timers/promises";

/** 冻结的选择器清单（旅程依赖面，供 TL 校对 Worker 1 的保留义务）。 */
export const JOURNEY_SELECTORS = Object.freeze({
  worldCanvas: '[data-testid="epoch-world-canvas"]',
  readyDot: '[title="world ready"]',
  w007Panel: '[data-testid="epoch-w007-panel"]',
  unisolate: '[data-testid="epoch-unisolate"]',
  measure: '[data-testid="epoch-measure"]',
  measurements: '[data-testid="epoch-measurements"]',
  annotationInput: '[data-testid="epoch-annotation-input"]',
  annotate: '[data-testid="epoch-annotate"]',
  annotations: '[data-testid="epoch-annotations"]',
  inspectorEntityRow: "text=entityId:",
});

/** DesktopSolutionHost LAYER_LABELS 的逆映射（inspector 显示人类可读层名）。 */
const LAYER_LABEL_TO_ID = Object.freeze({
  Site: "SITE",
  Foundation: "FOUNDATION",
  Structure: "STRUCTURE",
  Envelope: "ENVELOPE",
  MEP: "MEP",
  Finishes: "FINISHES",
});

const ALL_LAYER_IDS = Object.freeze(["SITE", "FOUNDATION", "STRUCTURE", "ENVELOPE", "MEP", "FINISHES"]);

/** 点击目标网格（W006 journey 实证过命中顺序：屋面板 → 柱 → 楼板/基础 → 墙）。 */
const CLICK_TARGETS = Object.freeze([
  { fx: 0.5, fy: 0.35 },
  { fx: 0.42, fy: 0.55 },
  { fx: 0.58, fy: 0.55 },
  { fx: 0.5, fy: 0.65 },
  { fx: 0.35, fy: 0.5 },
  { fx: 0.65, fy: 0.5 },
  { fx: 0.5, fy: 0.5 },
  { fx: 0.45, fy: 0.45 },
  { fx: 0.55, fy: 0.45 },
]);

export const WAIT_TIMEOUT_MS = 150_000;
const ANNOTATION_TEXT = "W036 acceptance anchor — world-anchored note";

function createSteps(log) {
  const steps = [];
  return {
    steps,
    async run(step, title, fn) {
      const startedAt = Date.now();
      log(`step ${step} (${title}) …`);
      try {
        const detail = (await fn()) ?? {};
        steps.push({ step, title, status: "pass", durationMs: Date.now() - startedAt, detail });
        log(`step ${step} PASS (${Date.now() - startedAt}ms)`);
        return { ok: true, detail };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        steps.push({
          step,
          title,
          status: "fail",
          durationMs: Date.now() - startedAt,
          error: message,
        });
        log(`step ${step} FAIL: ${message}`);
        return { ok: false, error: message };
      }
    },
  };
}

/** 读取右侧面板文本（inspector / 工具面板所在容器；经 epoch-w007-panel 的父节点定位）。 */
async function readRightPanelText(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="epoch-w007-panel"]');
    const rightPanel = panel ? panel.parentElement : null;
    return rightPanel ? (rightPanel.textContent ?? "") : null;
  });
}

function parseEntityId(panelText) {
  if (!panelText) return null;
  // TL 修正（2026-10-14 实测）：右栏 textContent 把各展示行无分隔地拼接成
  // "entityId: site-plottype: Sitedimensions: …"——原贪婪字符类（含 ':'）会把
  // 下一行的行名一起吞进 ID（实测解析出 "site-plottype:"）。W006 inspector 的
  // 行序是固定的（entityId → type → layer → …），用非贪婪匹配到下一个行名
  // "type:" 为止即可拿到纯 ID。
  const match = panelText.match(/entityId:\s*(.+?)\s*type:/);
  return match ? match[1].trim() : null;
}

function parseLayerId(panelText) {
  if (!panelText) return null;
  // 同上：layer 行后紧跟 dimensions 行，无分隔拼接。匹配到 "dimensions:" 为止，
  // 再把展示名（Site/…）映射回层 ID（SITE/…）。
  const match = panelText.match(/layer:\s*(.+?)\s*dimensions:/);
  if (!match) return null;
  const label = match[1].trim();
  return LAYER_LABEL_TO_ID[label] ?? label;
}

async function waitForWorldReady(page, log) {
  // 打包冷启动：asar 内加载 + Babylon 软件光栅化（SwiftShader）首帧可能需要 10-30s。
  log(`waiting for ${JOURNEY_SELECTORS.worldCanvas} …`);
  await page.waitForSelector(JOURNEY_SELECTORS.worldCanvas, { timeout: WAIT_TIMEOUT_MS });
  log(`waiting for ready dot ${JOURNEY_SELECTORS.readyDot} …`);
  await page.waitForSelector(JOURNEY_SELECTORS.readyDot, { timeout: WAIT_TIMEOUT_MS });
}

/** 单次会话旅程（01-09）。ctx 需要 { app, page, capture, log, pageErrors }。 */
export async function runJourneySession(ctx) {
  const { app, page, capture, log } = ctx;
  const recorder = createSteps(log);
  const worldState = {
    selectedEntityId: null,
    selectedLayerId: null,
    hitPoint: null,
    inspectorText: null,
  };

  // ---------- 01 launch + identity ----------
  await recorder.run("01-launch-identity", "窗口打开；窗口标题必须为 Epoch；app.getName() 可读时必须为 Epoch", async () => {
    const url = page.url();
    const windowTitle = await page.title();
    if (windowTitle !== "Epoch") {
      throw new Error(
        `窗口标题为 ${JSON.stringify(windowTitle)}，期望 "Epoch"（来源：out/renderer/index.html <title> 与 BrowserWindow 标题；Worker 1 负责）`,
      );
    }
    // 主进程身份（app.getName()）：可读则必须为 Epoch；不可读时回退到 窗口标题 + 世界 HUD 文本。
    let mainInfo = null;
    let fallbackReason = null;
    try {
      mainInfo = await Promise.race([
        app.evaluate(({ app: electronApp }) => ({
          name: electronApp.getName(),
          version: electronApp.getVersion(),
          packaged: electronApp.isPackaged,
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
        })),
        sleep(15_000).then(() => {
          throw new Error("app.evaluate timeout (15s)");
        }),
      ]);
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : String(error);
      log(`app.evaluate unavailable: ${fallbackReason}`);
    }
    if (mainInfo) {
      if (mainInfo.name !== "Epoch") {
        throw new Error(
          `app.getName()=${JSON.stringify(mainInfo.name)}，期望 "Epoch"（来源：app.asar 根 package.json productName + app.setName；见 desktopRuntimeEnv.ts）`,
        );
      }
      await capture(page, "01-launch", "Epoch 窗口打开；标题与 app.getName() 均为 Epoch。");
      return { url, windowTitle, appInfo: mainInfo, identitySource: "window-title+app.getName()" };
    }
    // 回退：窗口标题（已验）+ 世界 HUD 文本必须含 Epoch（acceptance law 的等效身份证据）。
    await page.waitForSelector(JOURNEY_SELECTORS.worldCanvas, { timeout: 60_000 }).catch(() => {});
    await sleep(1500);
    const hudText = await page
      .evaluate(() => document.getElementById("epoch-solution-root")?.textContent ?? "")
      .catch(() => "");
    if (!hudText.includes("Epoch")) {
      throw new Error(
        `app.evaluate 不可用（${fallbackReason}）且世界 HUD 文本不含 "Epoch"——无法确认产品身份`,
      );
    }
    await capture(page, "01-launch", "Epoch 窗口打开；标题为 Epoch（HUD 含 Epoch Solution；app.getName() 不可读，已回退）。");
    return { url, windowTitle, hudTextHead: hudText.slice(0, 120), fallbackReason };
  });

  // ---------- 02 world dominant ----------
  await recorder.run("02-world-dominant", "施工世界可见且占主导（画布 + ready + ≥85% 覆盖）", async () => {
    await waitForWorldReady(page, log);
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const canvas = page.locator(JOURNEY_SELECTORS.worldCanvas);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("世界画布无 boundingBox（不可见？）");
    const coverage = (box.width * box.height) / (viewport.width * viewport.height);
    if (coverage < 0.85) {
      throw new Error(
        `世界画布覆盖率为 ${(coverage * 100).toFixed(1)}%（${box.width}x${box.height} @ ${viewport.width}x${viewport.height}），低于 85% 主导阈值`,
      );
    }
    const hudText = await page
      .evaluate(() => document.getElementById("epoch-solution-root")?.textContent?.slice(0, 160) ?? null)
      .catch(() => null);
    await capture(page, "02-world", "打开即入施工 Solution 世界：画布全幅占主导，无仪表盘/占位符，ready dot 亮起。");
    return { viewport, canvasBox: box, coverage: Number(coverage.toFixed(4)), hudText };
  });

  // ---------- 03 navigate ----------
  let navigateDetail = {};
  await recorder.run("03-navigate", "真实指针事件轨道拖拽 + 滚轮缩放；画面必须随之变化", async () => {
    const canvas = page.locator(JOURNEY_SELECTORS.worldCanvas);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("世界画布不可见，无法导航");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const beforeShot = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 30, { steps: 12 });
    await page.mouse.up();
    await page.mouse.wheel(0, -240);
    await sleep(900);
    const afterShot = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    const viewChanged = !beforeShot.equals(afterShot);
    const canvasAlive = (await page.locator(JOURNEY_SELECTORS.worldCanvas).count()) > 0;
    if (!canvasAlive) throw new Error("导航后世界画布消失（渲染器崩溃？）");
    navigateDetail = { viewChanged };
    await capture(page, "03-navigate", "轨道拖拽（orbit）+ 滚轮缩放后的视角；与 02 相比画面已变化。");
    if (!viewChanged) {
      // 弱正信号：截图字节未变 → 导航未产生可见变化，按失败处理（不静默放过）。
      throw new Error("导航前后画布截图字节相同——轨道拖拽未产生可见视角变化");
    }
    return navigateDetail;
  });

  // ---------- 04 select ----------
  await recorder.run("04-select", "点击画布命中语义实体（presentationId→entityId，invariant 11）", async () => {
    const canvas = page.locator(JOURNEY_SELECTORS.worldCanvas);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("世界画布不可见，无法选择");
    let hitTarget = null;
    let panelText = null;
    for (const target of CLICK_TARGETS) {
      const px = box.x + box.width * target.fx;
      const py = box.y + box.height * target.fy;
      await page.mouse.click(px, py);
      await sleep(700);
      const hits = await page.locator(JOURNEY_SELECTORS.inspectorEntityRow).count().catch(() => 0);
      if (hits > 0) {
        hitTarget = target;
        panelText = await readRightPanelText(page);
        worldState.hitPoint = { x: px, y: py, fx: target.fx, fy: target.fy };
        break;
      }
    }
    if (!hitTarget || !panelText) {
      throw new Error(
        `点击 ${CLICK_TARGETS.length} 个目标后 inspector 未出现 "entityId:" 行——命中测试未解析出语义实体（检查渲染器 hitTest 与画布命中区域）`,
      );
    }
    const entityId = parseEntityId(panelText);
    const layerId = parseLayerId(panelText);
    if (!entityId) throw new Error(`inspector 文本无法解析 entityId：${panelText.slice(0, 200)}`);
    worldState.selectedEntityId = entityId;
    worldState.selectedLayerId = layerId;
    await capture(page, "04-select", `点击命中语义实体 ${entityId}（layer=${layerId}）；inspector 出现 "entityId:" 行。`);
    return { hitTarget, entityId, layerId, panelTextHead: panelText.slice(0, 240) };
  });

  // ---------- 05 inspect ----------
  await recorder.run("05-inspect", "inspector 展示工程语义（entityId/type/layer 必备行）", async () => {
    const panelText = await readRightPanelText(page);
    if (!panelText) throw new Error("无法读取右侧面板文本（epoch-w007-panel 父容器）");
    const requiredRows = ["entityId:", "type:", "layer:"];
    const missing = requiredRows.filter((row) => !panelText.includes(row));
    if (missing.length > 0) {
      throw new Error(`inspector 缺少必备语义行: ${missing.join(", ")}；面板文本：${panelText.slice(0, 240)}`);
    }
    worldState.inspectorText = panelText;
    await capture(page, "05-inspect", "Inspector 显示选中实体的工程语义（entityId/type/layer/材料/尺寸/工程量投影）。");
    return { panelTextHead: panelText.slice(0, 400) };
  });

  // ---------- 06 isolate ----------
  await recorder.run("06-isolate", "隔离一层（仅该层可见）；命中测试必须反映可见性变化", async () => {
    const originalLayerId = worldState.selectedLayerId ?? parseLayerId(worldState.inspectorText ?? "");
    const candidates = ALL_LAYER_IDS.filter((id) => id !== originalLayerId);
    const isolateLayerId = candidates[0] ?? "FOUNDATION";
    const button = page.locator(`[data-testid="epoch-isolate-${isolateLayerId}"]`);
    if ((await button.count()) === 0) {
      throw new Error(`找不到 [data-testid="epoch-isolate-${isolateLayerId}"]（Worker 1 须保留隔离按钮 testid）`);
    }
    await button.click();
    await sleep(900);
    await capture(page, "06-isolate", `隔离 ${isolateLayerId}：仅该层可见，其余五层隐藏（renderer-neutral setVisibility）。`);
    if (!worldState.hitPoint) throw new Error("缺少已记录的命中点（04 步骤应已记录）");
    // 命中探针：同一屏幕点在隔离后应不再解析到原实体（其层已隐藏）。
    await page.mouse.click(worldState.hitPoint.x, worldState.hitPoint.y);
    await sleep(700);
    const probeText = await readRightPanelText(page);
    const probeEntityId = parseEntityId(probeText);
    if (probeEntityId === worldState.selectedEntityId) {
      throw new Error(
        `隔离 ${isolateLayerId} 后，同一点击点仍解析到原实体 ${probeEntityId}（其层 ${originalLayerId} 应已隐藏）——隔离未作用于命中测试`,
      );
    }
    return {
      isolatedLayerId: isolateLayerId,
      originalLayerId: originalLayerId ?? null,
      originalEntityId: worldState.selectedEntityId,
      probeEntityIdAfterIsolate: probeEntityId,
      probeClearedSelection: probeEntityId === null,
    };
  });

  // ---------- 07 unisolate ----------
  await recorder.run("07-unisolate", "恢复全部图层；同一命中点应重新解析到原实体", async () => {
    const button = page.locator(JOURNEY_SELECTORS.unisolate);
    if ((await button.count()) === 0) {
      throw new Error(`找不到 ${JOURNEY_SELECTORS.unisolate}（Worker 1 须保留恢复按钮 testid）`);
    }
    await button.click();
    await sleep(900);
    await capture(page, "07-unisolate", "恢复全部六层可见（Show all layers）。");
    if (!worldState.hitPoint) throw new Error("缺少已记录的命中点");
    await page.mouse.click(worldState.hitPoint.x, worldState.hitPoint.y);
    await sleep(700);
    const probeText = await readRightPanelText(page);
    const probeEntityId = parseEntityId(probeText);
    if (probeEntityId !== worldState.selectedEntityId) {
      throw new Error(
        `恢复后同一点击点解析到 ${JSON.stringify(probeEntityId)}，期望原实体 ${JSON.stringify(worldState.selectedEntityId)}——图层恢复未作用于命中测试`,
      );
    }
    // 恢复后的选择即原实体（为 09 标注提供 anchor）。
    return { restoredEntityId: probeEntityId };
  });

  // ---------- 08 measure ----------
  await recorder.run("08-measure", "添加测量；epoch-measurements 列表增长且含 SI 单位读数", async () => {
    const listBefore = await page.locator(`${JOURNEY_SELECTORS.measurements} li`).count();
    const button = page.locator(JOURNEY_SELECTORS.measure);
    if ((await button.count()) === 0) {
      throw new Error(`找不到 ${JOURNEY_SELECTORS.measure}（Worker 1 须保留测量按钮 testid）`);
    }
    await button.click();
    await page
      .waitForFunction(
        (selector) => document.querySelectorAll(`${selector} li`).length > 0,
        JOURNEY_SELECTORS.measurements,
        { timeout: 15_000 },
      )
      .catch(() => {
        throw new Error("点击 epoch-measure 后 15s 内 epoch-measurements 未出现条目");
      });
    const listAfter = await page.locator(`${JOURNEY_SELECTORS.measurements} li`).count();
    const firstMeasurement = await page
      .locator(`${JOURNEY_SELECTORS.measurements} li`)
      .first()
      .textContent()
      .catch(() => "");
    if (!/m\b/.test(firstMeasurement ?? "")) {
      throw new Error(`测量条目缺少 SI 单位读数（期望形如 "5.00 m"）：${firstMeasurement}`);
    }
    await capture(page, "08-measure", `测量列表 ${listBefore}→${listAfter}，读数 ${firstMeasurement?.trim()}。`);
    return { listBefore, listAfter, firstMeasurement: firstMeasurement?.trim() ?? null };
  });

  // ---------- 09 annotate ----------
  await recorder.run("09-annotate", "录入标注并锚定到选中实体；epoch-annotations 列表增长", async () => {
    const input = page.locator(JOURNEY_SELECTORS.annotationInput);
    const button = page.locator(JOURNEY_SELECTORS.annotate);
    if ((await input.count()) === 0 || (await button.count()) === 0) {
      throw new Error("找不到 epoch-annotation-input / epoch-annotate（Worker 1 须保留标注 testid）");
    }
    const listBefore = await page.locator(`${JOURNEY_SELECTORS.annotations} li`).count();
    await input.fill(ANNOTATION_TEXT);
    await button.click();
    await page
      .waitForFunction(
        (selector) => document.querySelectorAll(`${selector} li`).length > 0,
        JOURNEY_SELECTORS.annotations,
        { timeout: 15_000 },
      )
      .catch(() => {
        throw new Error("点击 epoch-annotate 后 15s 内 epoch-annotations 未出现条目");
      });
    const listAfter = await page.locator(`${JOURNEY_SELECTORS.annotations} li`).count();
    const firstAnnotation = await page
      .locator(`${JOURNEY_SELECTORS.annotations} li`)
      .first()
      .textContent()
      .catch(() => "");
    const textOk = (firstAnnotation ?? "").includes(ANNOTATION_TEXT);
    const anchorOk =
      worldState.selectedEntityId !== null &&
      (firstAnnotation ?? "").includes(worldState.selectedEntityId);
    if (!textOk || !anchorOk) {
      throw new Error(
        `标注条目应包含文本 ${JSON.stringify(ANNOTATION_TEXT)} 与实体锚点 ${JSON.stringify(worldState.selectedEntityId)}，实际：${firstAnnotation}`,
      );
    }
    await capture(page, "09-annotate", `标注 “${ANNOTATION_TEXT}” 已锚定到实体 ${worldState.selectedEntityId}。`);
    return { listBefore, listAfter, firstAnnotation: firstAnnotation?.trim() ?? null };
  });

  return { steps: recorder.steps, worldState };
}

export const JOURNEY_ANNOTATION_TEXT = ANNOTATION_TEXT;
