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
 */
export const ARTIFACT_NAME_PATTERN =
  /^Epoch-(\d+(?:\.\d+){2}(?:[+._-][\w]+)*)-linux-(x64|arm64)(_TEST)?\.(deb|AppImage)$/;

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
  },
  {
    id: "chrome-update-dialog",
    pattern: /\bUpdate ZCode\b/g,
    reason: "用户可见的更新对话框 ZCode 标题（需按 isEpochDesktopRuntime 门控为 Epoch）",
  },
  {
    id: "chrome-quit-dialog",
    pattern: /Quit Z Code\?/g,
    reason: "用户可见的退出确认对话框 ZCode 文案（需 Epoch 门控）",
  },
  {
    id: "chrome-endpoint-dialog",
    pattern: /\bZCode Endpoint\b/g,
    reason: "用户可见的 ZCode Endpoint 对话框标题（需 Epoch 门控）",
  },
  {
    id: "chrome-external-link",
    pattern: /Open external ZCode link\?/g,
    reason: "用户可见的外部链接确认 ZCode 文案（需 Epoch 门控）",
  },
  {
    id: "chrome-zh-update-dialog",
    pattern: /需要升级 ZCode/g,
    reason: "用户可见的中文更新对话框 ZCode 标题（需 Epoch 门控）",
  },
  {
    id: "chrome-zh-external-link",
    pattern: /打开外部 ZCode 链接/g,
    reason: "用户可见的中文外部链接确认 ZCode 文案（需 Epoch 门控）",
  },
  {
    id: "chrome-welcome",
    pattern: /Welcome to ZCode\b/g,
    reason: "用户可见的 ZCode 欢迎语（需 Epoch 门控）",
  },
  {
    id: "chrome-sign-in",
    pattern: /\bSign in to ZCode\b/g,
    reason: "用户可见的 ZCode 登录入口文案（需 Epoch 门控）",
  },
]);

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
    const ranges = collectRanges(rule.pattern, text).filter(
      (hit) => !exceptionRanges.some((range) => hit.start < range.end && range.start < hit.end),
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
