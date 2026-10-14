/**
 * W036-W3 — 品牌审计规则（违规模式 + 允许例外）。
 *
 * 依据 spec/work-orders/W036-ubuntu-epoch-desktop-release.md 产品法：
 * - 活跃产品身份必须是 Epoch（desktop entry Name、dpkg 包名、app 名称、窗口标题来源）。
 * - Epoch 自有打包 UI 代码（app.asar 内 out/** + 根 package.json）中不得出现显著的
 *   ZCode 产品 chrome 字符串。
 * - 允许例外（不判失败）：第三方声明/许可证、@zcode/* 包命名空间、ZCODE_* 环境变量名、
 *   zcode-* 存储/IPC 键名、非活跃身份字符串（ZCode Preview / ZCode Dev / 兼容 appId）、
 *   文件路径、source map 引用、上游依赖中的版权头。
 *
 * 分类机制：违规命中若与某个允许例外的字符区间重叠，则重新归类为「允许例外」；
 * 既非违规也非例外的 \bZCode\b 命中进入 reviewItems（供 TL 裁量，不判失败）。
 */

/**
 * Epoch 发布产物的既定身份常量（TL 已提交的 desktop-product-identity.mjs）：
 * EPOCH_DESKTOP_IDENTITY=1 → productName "Epoch"、appId org.epoch.desktop、
 * linux executable/package "epoch"。
 */
export const EPOCH_IDENTITY = Object.freeze({
  productName: "Epoch",
  packageName: "epoch",
  executableName: "epoch",
  iconName: "epoch",
  desktopEntryName: "epoch.desktop",
  appId: "org.epoch.desktop",
});

/**
 * electron-builder Linux 默认安装目录为 /opt/${productName}；deb 数据段内的主程序
 * 相对路径（dpkg-deb --contents 的列表项去掉 "./" 前缀）。
 */
export const DEB_LAYOUT = Object.freeze({
  installDir: "opt/Epoch",
  executable: "opt/Epoch/epoch",
  asar: "opt/Epoch/resources/app.asar",
  desktopEntryDir: "usr/share/applications",
  iconGlob: /^usr\/share\/icons\/hicolor\/\w+\/apps\/epoch\.png$/,
});

/**
 * desktop entry 的 Categories 必须落在 freedesktop 注册主类别内
 * （electron-builder.config.js 里配置为 "Development"）。
 */
export const VALID_DESKTOP_CATEGORIES = new Set([
  "AudioVideo",
  "Development",
  "Education",
  "Game",
  "Graphics",
  "Network",
  "Office",
  "Science",
  "Settings",
  "System",
  "Utility",
]);

/**
 * 产物文件名规则（buildDesktopArtifactName）：
 * ${productName}-${version}-${platformName}-${arch}${suffix}.${extension}
 * x86_64 为强制首发目标（acceptance gate B），arm64 允许；_TEST 后缀标记测试后端
 * 产物（允许出现但记 warning——发布产物应为生产后端构建）。
 * TL 修正（2026-10-14 实测）：electron-builder 的 arch 渲染是平台惯用名——
 * deb 用 Debian 架构名 amd64，AppImage 用 uname 风格 x86_64（实测产物
 * Epoch-3.14.3-linux-amd64.deb / Epoch-3.14.3-linux-x86_64.AppImage）。
 * 四种拼写都接受，跨模式归一为 x64/arm64 语义。
 */
export const ARTIFACT_NAME_PATTERN =
  /^Epoch-(\d+(?:\.\d+){2}(?:[+._-][\w]+)*)-linux-(x64|amd64|x86_64|arm64|aarch64)(_TEST)?\.(deb|AppImage)$/;
export function normalizeArtifactArch(arch) {
  if (arch === "amd64" || arch === "x86_64") return "x64";
  if (arch === "aarch64") return "arm64";
  return arch;
}

/**
 * 判失败的显著 ZCode chrome 模式（只作用于 Epoch 自有代码范围：
 * app.asar 内 out/** 与根 package.json；以及 deb/AppImage 的元数据文本）。
 *
 * 只收录「无歧义的用户可见产品短语」（对话框标题/欢迎语/登录文案等）。
 * 注意：本仓库是三身份共享代码基（ZCode production/preview + Epoch，W036 产品法 #4/#5
 * 禁止为品牌而 fork），Worker 1 的既定修复模式是 `isEpochDesktopRuntime ? "Epoch" : "ZCode"`
 * 三元门控——被门控的 ZCode 分支字面量是合法的共享代码，静态扫描无法区分门控与否，
 * 因此「裸产品名字面量」不判违规，进入优先 review（见 PRIORITY_REVIEW_PATTERNS）。
 */
export const PROMINENT_CHROME_PATTERNS = Object.freeze([
  {
    id: "chrome-zcode-desktop",
    pattern: /\bZCode Desktop\b/g,
    reason: "用户可见的 ZCode Desktop 产品名（描述/标题/发布物料）",
    // W036 TL：三身份共享代码基的既定修复模式是 `isEpochDesktopRuntime ? "Epoch…" : "ZCode…"`
    // （产品法 #5 禁止为品牌 fork）——门控后的非 Epoch 分支字面量会继续随包分发。
    // epochCounterpart：同一表达式的 Epoch 分支字面量；命中点邻近（±160 字符）
    // 存在对应分支字面量时，视为合法 flavor 分支而非未门控 chrome（见 classifyTextContent）。
    epochCounterpart: /\bEpoch Desktop\b/g,
  },
  {
    id: "chrome-update-dialog",
    pattern: /\bUpdate ZCode\b/g,
    reason: "用户可见的更新对话框 ZCode 标题（需按 isEpochDesktopRuntime 门控为 Epoch）",
    epochCounterpart: /\bUpdate Epoch\b/g,
  },
  {
    id: "chrome-quit-dialog",
    pattern: /Quit Z Code\?/g,
    reason: "用户可见的退出确认对话框 ZCode 文案（需 Epoch 门控）",
    epochCounterpart: /Quit Epoch\?/g,
  },
  {
    id: "chrome-endpoint-dialog",
    pattern: /\bZCode Endpoint\b/g,
    reason: "用户可见的 ZCode Endpoint 对话框标题（需 Epoch 门控）",
    epochCounterpart: /\bEpoch Endpoint\b/g,
  },
  {
    id: "chrome-external-link",
    pattern: /Open external ZCode link\?/g,
    reason: "用户可见的外部链接确认 ZCode 文案（需 Epoch 门控）",
    epochCounterpart: /Open external Epoch link\?/g,
  },
  {
    id: "chrome-zh-update-dialog",
    pattern: /需要升级 ZCode/g,
    reason: "用户可见的中文更新对话框 ZCode 标题（需 Epoch 门控）",
    epochCounterpart: /需要升级 Epoch/g,
  },
  {
    id: "chrome-zh-external-link",
    pattern: /打开外部 ZCode 链接/g,
    reason: "用户可见的中文外部链接确认 ZCode 文案（需 Epoch 门控）",
    epochCounterpart: /打开外部 Epoch 链接/g,
  },
  {
    id: "chrome-welcome",
    pattern: /Welcome to ZCode\b/g,
    reason: "用户可见的 ZCode 欢迎语（需 Epoch 门控）",
    epochCounterpart: /Welcome to Epoch\b/g,
  },
  {
    id: "chrome-sign-in",
    pattern: /\bSign in to ZCode\b/g,
    reason: "用户可见的 ZCode 登录入口文案（需 Epoch 门控）",
    epochCounterpart: /\bSign in to Epoch\b/g,
  },
]);

/** flavor 分支判定的邻近窗口：三元表达式内两个分支字面量的最大间距（实测
 *  `…isEpochDesktopRuntime ? "Epoch Endpoint" : "ZCode Endpoint"` 间隔 ~30 字符；
 * 压缩后略宽，取 160 覆盖中文文案与多行三元）。 */
const FLAVOR_BRANCH_ADJACENCY_CHARS = 160;

/**
 * 优先 review 模式：命中不判失败，但以 priority 标记进入 reviewItems 供 TL 裁量。
 * 裸产品名字面量（["'`]ZCode["'`]）在三身份共享代码基里可能是合法的 flavor 分支
 * （如 desktopRuntimeEnv 的 production 兜底、deep-link 默认值、about 菜单三元门控），
 * 也可能是未门控的可见 chrome（如 renderer 的 alt="ZCode"）——静态扫描无法区分，
 * 由 TL 按 snippet 裁量或要求 Worker 1 补门控。
 */
export const PRIORITY_REVIEW_PATTERNS = Object.freeze([
  {
    id: "product-name-literal",
    pattern: /["'`]ZCode["'`]/g,
    reason:
      "ZCode 产品名字面量（共享代码基 flavor 分支合法；若为未门控的用户可见字符串则需 Epoch 化）",
  },
]);

/**
 * 允许例外（记录命中数但不判失败）。每条带 reason，报告中原样呈现。
 * 注意全部使用 global 正则（供 exec 循环取区间）。
 */
export const ALLOWED_EXCEPTIONS = Object.freeze([
  {
    id: "zcode-package-scope",
    pattern: /@zcode\/[\w./-]+/g,
    reason: "内部 @zcode/* 包命名空间（W036 产品法 #5：不做全局重命名）",
  },
  {
    // W036 TL（2026-10-14 实测裁定）：shared/src/desktopMenu.ts 的 i18n 数据表行
    // `"titleBar.menu.help.zcodeEndpoint": "ZCode Endpoint"` —— 这是数据记录而非
    // 渲染点；该菜单仅 ZCODE_ENV=test 出现，且桌面消费端（desktopApplicationMenu
    // 的 getLabel）已按 isEpochDesktopRuntime 覆写为 Epoch Endpoint。shared 的表
    // 不能按桌面运行时身份静态分叉（三身份共享）。仅放行带 message-id 键前缀的
    // 表行形式；裸的 "ZCode Endpoint"（对话框标题/窗口标题）仍判失败。
    id: "zcode-endpoint-i18n-table-row",
    pattern: /["'`]titleBar\.menu\.help\.zcodeEndpoint["'`]\s*:\s*["'`]ZCode Endpoint["'`]/g,
    reason: "endpoint 切换器 i18n 表行（数据记录；桌面消费端已按运行时身份覆写）",
  },
  {
    id: "zcode-env-vars",
    pattern: /\bZCODE_[A-Z0-9_]+\b/g,
    reason: "ZCODE_* 环境变量名（后端环境轴与兼容开关，单独命名轴）",
  },
  {
    id: "zcode-storage-ipc-keys",
    pattern: /["'`]zcode-[a-z0-9-]+["'`]/g,
    reason: "zcode-* 存储/IPC 键名（内部兼容标识符）",
  },
  {
    id: "zcode-domains",
    pattern: /\bzcode\.z\.ai\b/g,
    reason: "上游域名（遥测/端点/署名链接）",
  },
  {
    id: "zcode-paths",
    pattern: /(?:\/|\\|["'`])\.?zcode[\w.-]*(?:\/|\\|["'`])/g,
    reason: "文件路径中的 zcode 段（.zcode 数据目录、源码路径等）",
  },
  {
    id: "sourcemap-references",
    pattern: /sourceMappingURL=\S+/g,
    reason: "source map 引用",
  },
  {
    id: "copyright-notices",
    pattern: /(?:Copyright|©|版权所有|版权)[^\n"'`]{0,160}/gi,
    reason: "上游版权/法定署名（W036 产品法 #6：保留第三方署名不是品牌失败）",
  },
  {
    id: "notice-file-names",
    pattern: /\b(?:THIRD-PARTY-NOTICES|LICENSE|NOTICE|OPEN_SOURCE)[\w.-]*/g,
    reason: "第三方声明/许可证文件名",
  },
]);

/**
 * 非活跃身份字符串：仅当活跃身份为 Epoch 时允许出现在包内
 * （上游 Preview/开发态身份的兼容代码路径）。若活跃身份本身是 ZCode
 * （如根 package.json productName="ZCode"），审计已由身份检查判失败。
 */
export const NON_ACTIVE_IDENTITY_ALLOWLIST = Object.freeze([
  {
    id: "preview-identity",
    pattern: /\bZCode Preview\b/g,
    reason: "非活跃 Preview 身份字符串（活跃身份必须为 Epoch）",
  },
  {
    id: "dev-identity",
    pattern: /\bZCode Dev\b/g,
    reason: "非活跃开发态身份字符串（打包态不会激活）",
  },
  {
    id: "compat-app-ids",
    pattern: /\b(?:dev\.zcode\.app(?:\.preview)?|cn\.aminer\.zcode)\b/g,
    reason: "非活跃的 appId/AUMID 兼容字符串",
  },
]);

/**
 * Review 探针：捕获既非违规也非例外的 ZCode 词命中（供 TL 裁量；不判失败）。
 * camelCase 标识符（如 useZCodeIntl）不构成 \bZCode\b 命中，天然排除。
 */
export const REVIEW_PROBE_PATTERN = /\bZCode\b/g;

/** 审计扫描的文本扩展名（app.asar 内只扫描这些；二进制跳过并计数）。 */
export const SCANNABLE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".htm",
  ".css",
  ".txt",
  ".md",
  ".map",
]);

/** 违规扫描的自有代码范围（app.asar 内路径前缀）；其余（node_modules）按上游范围跳过。 */
export const OWN_CODE_SCOPES = Object.freeze(["out/"]);

/**
 * 对单个文本内容执行分类扫描。
 * 返回 { violations, exceptionCounts, reviewItems }：
 * - violations: [{ patternId, reason, snippet }]（判失败）
 * - exceptionCounts: { exceptionId: count }（含非活跃身份条目）
 * - reviewItems: [{ snippet, priority?, patternId? }]（priority 项来自 PRIORITY_REVIEW_PATTERNS，
 *   供 TL 裁量；上限 REVIEW_ITEM_CAP，priority 项优先保留）
 */
export const REVIEW_ITEM_CAP = 30;

function collectRanges(pattern, text) {
  const ranges = [];
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match;
  while ((match = re.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
    if (match.index === re.lastIndex) re.lastIndex += 1; // 防御零长匹配死循环
  }
  return ranges;
}

function snippetOf(text, start, end) {
  const contextStart = Math.max(0, start - 48);
  const contextEnd = Math.min(text.length, end + 48);
  return text.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim();
}

export function classifyTextContent(text) {
  const violations = [];
  const exceptionCounts = {};
  const priorityReviewItems = [];
  const plainReviewItems = [];

  const exceptionRanges = [];
  for (const exception of [...ALLOWED_EXCEPTIONS, ...NON_ACTIVE_IDENTITY_ALLOWLIST]) {
    const ranges = collectRanges(exception.pattern, text);
    if (ranges.length > 0) {
      exceptionCounts[exception.id] = (exceptionCounts[exception.id] ?? 0) + ranges.length;
      for (const range of ranges) exceptionRanges.push(range);
    }
  }

  const violationRangesByPattern = new Map();
  for (const rule of PROMINENT_CHROME_PATTERNS) {
    // W036 TL：先收集同表达式的 Epoch 分支字面量区间；命中点在邻近窗口内存在
    // 对应分支字面量 → 判为合法 flavor 分支（计入 exceptionCounts，不进 violations）。
    // 裸的未门控字面量（邻近无 Epoch 分支）仍然判失败——规则的牙齿保留。
    const counterpartRanges = rule.epochCounterpart ? collectRanges(rule.epochCounterpart, text) : [];
    const isFlavorBranch = (hit) =>
      counterpartRanges.some(
        (range) =>
          hit.start - FLAVOR_BRANCH_ADJACENCY_CHARS < range.end &&
          range.start < hit.end + FLAVOR_BRANCH_ADJACENCY_CHARS,
      );
    const allRanges = collectRanges(rule.pattern, text);
    const branchedRanges = allRanges.filter(isFlavorBranch);
    if (branchedRanges.length > 0) {
      exceptionCounts[`flavor-branch:${rule.id}`] =
        (exceptionCounts[`flavor-branch:${rule.id}`] ?? 0) + branchedRanges.length;
    }
    const ranges = allRanges.filter(
      (hit) =>
        !exceptionRanges.some((range) => hit.start < range.end && range.start < hit.end) &&
        !isFlavorBranch(hit),
    );
    if (ranges.length > 0) violationRangesByPattern.set(rule.id, ranges);
    for (const hit of ranges) {
      violations.push({
        patternId: rule.id,
        reason: rule.reason,
        snippet: snippetOf(text, hit.start, hit.end),
      });
    }
  }

  const priorityRanges = [];
  for (const rule of PRIORITY_REVIEW_PATTERNS) {
    for (const hit of collectRanges(rule.pattern, text)) {
      const coveredByException = exceptionRanges.some(
        (range) => hit.start < range.end && range.start < hit.end,
      );
      const coveredByViolation = [...violationRangesByPattern.values()]
        .flat()
        .some((range) => hit.start < range.end && range.start < hit.end);
      if (coveredByException || coveredByViolation) continue;
      priorityRanges.push(hit);
      if (priorityReviewItems.length < REVIEW_ITEM_CAP) {
        priorityReviewItems.push({
          snippet: snippetOf(text, hit.start, hit.end),
          priority: true,
          patternId: rule.id,
          reason: rule.reason,
        });
      }
    }
  }

  for (const hit of collectRanges(REVIEW_PROBE_PATTERN, text)) {
    const covered =
      exceptionRanges.some((range) => hit.start < range.end && range.start < hit.end) ||
      priorityRanges.some((range) => hit.start < range.end && range.start < hit.end) ||
      [...violationRangesByPattern.values()]
        .flat()
        .some((range) => hit.start < range.end && range.start < hit.end);
    if (covered) continue;
    if (plainReviewItems.length < REVIEW_ITEM_CAP - priorityReviewItems.length) {
      plainReviewItems.push({ snippet: snippetOf(text, hit.start, hit.end) });
    }
  }

  return {
    violations,
    exceptionCounts,
    reviewItems: [...priorityReviewItems, ...plainReviewItems].slice(0, REVIEW_ITEM_CAP),
  };
}
