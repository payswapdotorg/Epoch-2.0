import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { pdfJsCMapsPlugin } from "../ui/vite/pdfJsCMapsPlugin.js";
import { thirdPartyNoticesVitePlugin } from "../../scripts/third-party-notices.mjs";
// Vite 配置在 Node 加载期执行，不能导入 @zcode/shared 根入口。
// 根入口包含 NodeNext 风格的源码 re-export，Node 会按真实文件查找 .js 并在 bootstrap 阶段失败。
import {
  resolveRuntimeZCodeEndpointOrigin,
  pickProductEndpointEnv,
  resolveZaiOAuthClientId,
  resolveZaiOAuthOrigin,
} from "@zcode/shared/zcodeEndpoint";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const { version } = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf-8"));

function resolveZCodeEnv(value: string | undefined): "test" | "production" {
  return value?.trim().toLowerCase() === "production" ? "production" : "test";
}

export default defineConfig(({ mode }) => {
  // `.env*` 只提供链接常量；当前产品环境由启动脚本或 CI 注入 ZCODE_ENV。
  // 启动脚本通过 process.env 显式选择 test/production；它必须优先于 .env 文件，
  // 否则 share:test 可能被 mode 的旧配置误解析到错误 endpoint。
  const env = { ...loadEnv(mode, REPO_ROOT, ""), ...process.env };
  const zcodeEnv = resolveZCodeEnv(env.ZCODE_ENV);
  const endpointEnv = {
    ...env,
    ZCODE_ENV: zcodeEnv,
  };
  const zcodeEndpointOrigin = resolveRuntimeZCodeEndpointOrigin(endpointEnv);
  const zaiOAuthOrigin = resolveZaiOAuthOrigin(endpointEnv);
  // ZAI OAuth client_id 是公开标识，允许注入浏览器包；secret/token 不得走 VITE_。
  const zaiOAuthClientId = resolveZaiOAuthClientId(endpointEnv);

  return {
    plugins: [pdfJsCMapsPlugin(), react(), tailwindcss(), thirdPartyNoticesVitePlugin()],
    resolve: {
      alias: {
        // 修复 UI 组件库中的 @ 别名解析失败。
        // 问题原因：packages/ui 的源码直接被 web 应用交给 Vite 打包，但 web 自己没声明 @ -> packages/ui/src，
        // 所以像 "@/components/lib/utils" 这类导入会在运行时构建阶段报找不到模块。
        // 这里把别名补到消费方 Vite 配置里，保持现有组件源码不动，影响面最小。
        "@": resolve(__dirname, "../ui/src"),
        // Recharts 依赖 d3-shape@3.x，后者需要 d3-path 的 Path 导出。
        // hoisted node_modules 可能把 d3-shape 旁边的旧 d3-path@1.x 暴露给 Vite 预构建，
        // 导致桌面/Web dev 都在依赖优化阶段失败；显式指向根部 3.x 入口以固定解析边界。
        "d3-path": resolve(__dirname, "../../node_modules/d3-path/src/index.js"),
        // W005：消费冻结的 wave-1 epoch 契约/适配器包。为遵守工单锁文件边界
        // （pnpm-lock.yaml 仅允许新增 evidence runner 的 devDeps），不把这些
        // workspace 包写进 web 的 package.json 依赖，而是在消费方 Vite 配置里
        // 用别名直接指向各包公开入口 src/index.ts（与 tsc 的 paths 对齐）。
        // 适配器（renderer-babylon）内部 import @babylonjs/core 走 node_modules 正常解析。
        "@zcode/epoch-world-model": resolve(__dirname, "../epoch-world-model/src/index.ts"),
        "@zcode/epoch-reconstruction-contract": resolve(
          __dirname,
          "../epoch-reconstruction-contract/src/index.ts",
        ),
        "@zcode/epoch-world-presentation": resolve(
          __dirname,
          "../epoch-world-presentation/src/index.ts",
        ),
        "@zcode/epoch-renderer-contract": resolve(
          __dirname,
          "../epoch-renderer-contract/src/index.ts",
        ),
        "@zcode/epoch-solution-contract": resolve(
          __dirname,
          "../epoch-solution-contract/src/index.ts",
        ),
        "@zcode/epoch-solution-surface": resolve(
          __dirname,
          "../epoch-solution-surface/src/index.ts",
        ),
        "@zcode/epoch-construction-fixture": resolve(
          __dirname,
          "../epoch-construction-fixture/src/index.ts",
        ),
        "@zcode/epoch-renderer-babylon": resolve(
          __dirname,
          "../epoch-renderer-babylon/src/index.ts",
        ),
        // W007：消费新建的 epoch-solution-runtime + epoch-world-interaction 公开入口。
        // 与 tsc 的 paths 对齐；不写进 web 的 package.json 依赖（保持工单锁文件边界）。
        "@zcode/epoch-solution-runtime": resolve(
          __dirname,
          "../epoch-solution-runtime/src/index.ts",
        ),
        "@zcode/epoch-world-interaction": resolve(
          __dirname,
          "../epoch-world-interaction/src/index.ts",
        ),
        // W005：fixture 引擎在浏览器进程内运行，epoch-world-model 的 computeWorldDigest
        // 用 node:crypto.createHash('sha256')。浏览器无 node:crypto，vite 默认外置会抛错。
        // 这里把 node:crypto 别名到 web-epoch 自带的同步 SHA-256 polyfill（与 node 输出一致）。
        "node:crypto": resolve(__dirname, "src/epoch/nodeCryptoShim.ts"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // Web 登录本地调试时，OAuth token 交换必须先命中线上同源接口。
        // 该专用代理放在 `/api` 通配代理之前，避免被转发到本地 server 导致 404。
        "/api/v1/oauth/token": {
          target: zcodeEndpointOrigin,
          changeOrigin: true,
          secure: true,
        },
        // 将 /ws 和 /api 请求代理到 server（默认 3030 端口）
        "/ws": { target: "ws://localhost:3030", ws: true },
        "/api": { target: "http://localhost:3030" },
      },
    },
    optimizeDeps: {
      // 修复：在依赖预构建阶段显式加入 react 相关入口，避免 rolldown 解析 `react/jsx-runtime`
      // / `react/jsx-dev-runtime` 时返回无后缀路径导致的加载失败（UNLOADABLE_DEPENDENCY）。
      include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
      // W005：冻结的 wave-1 epoch 契约/适配器包不写进 web 的 package.json 依赖
      // （遵守工单锁文件边界），改由 resolve.alias 直接指向各包公开入口 src/index.ts
      // 服务。这些包在扫描阶段无 node_modules 符号链接可解析，故显式排除预构建，
      // 让 Vite 在请求时按 alias 解析为源码（与既有 @ -> ui/src 同模式）。
      exclude: [
        "@zcode/epoch-world-model",
        "@zcode/epoch-reconstruction-contract",
        "@zcode/epoch-world-presentation",
        "@zcode/epoch-renderer-contract",
        "@zcode/epoch-solution-contract",
        "@zcode/epoch-solution-surface",
        "@zcode/epoch-construction-fixture",
        "@zcode/epoch-renderer-babylon",
        // @babylonjs/core 是 ESM barrel（数千子模块）；dev optimizer 预构建整个图会
        // OOM（沙箱 4GB 内存）。排除后 Vite 按需以 ESM 形式服务各子模块，首帧慢但稳定。
        "@babylonjs/core",
      ],
    },
    worker: {
      rollupOptions: {
        // @pierre/diffs 的 worker 入口依赖 import 后注册 message 监听。
        // 它的 package sideEffects 漏声明会让生产 worker 子构建被摇成 0B；
        // 只关闭 worker 构建的摇树，避免影响主包。
        treeshake: false,
      },
    },
    define: {
      __ZCODE_ENDPOINT_ENV__: JSON.stringify(pickProductEndpointEnv(env)),
      __ZCODE_VERSION__: JSON.stringify(version),
      __ZCODE_COMMIT__: JSON.stringify(env.ZCODE_COMMIT || "unknown"),
      __ZCODE_ENV__: JSON.stringify(zcodeEnv),
      "import.meta.env.VITE_ZCODE_BASE_URL": JSON.stringify(zcodeEndpointOrigin),
      // 兼容旧 Web runtime 读取名；新代码统一读 VITE_ZCODE_BASE_URL。
      "import.meta.env.VITE_ZCODE_ENDPOINT_ORIGIN": JSON.stringify(zcodeEndpointOrigin),
      // 明确注入 OAuth 公开配置，避免 Web 端在不同 mode 下隐式依赖源码 fallback。
      "import.meta.env.VITE_ZAI_OAUTH_CLIENT_ID": JSON.stringify(zaiOAuthClientId),
      "import.meta.env.VITE_ZAI_OAUTH_ORIGIN": JSON.stringify(zaiOAuthOrigin),
    },
    build: {
      // 生产不在浏览器产物暴露 sourceMappingURL，避免客户端侧还原业务源码。
      sourcemap: mode === "production" ? "hidden" : true,
    },
  };
});
