/**
 * W037-W2 — 观察型正向代理（update-network-assertion / dev-update-journey 共用）。
 *
 * 目的：在不改动应用任何配置的前提下，观察 Electron 应用「全部 Chromium 网络栈」的
 * 出站请求（renderer fetch/XHR + 主进程 electron.net —— electron-updater 的
 * ElectronHttpExecutor 正是走 electron.net 的 "electron-updater" partition session，
 * 遵从 --proxy-server）。HTTPS 经代理表现为 CONNECT host:port（主机级证据）；
 * HTTP 经代理表现为绝对 URI 请求（URL 级证据）。
 *
 * 策略：
 * - sinkHosts（默认 ZCode 端点）：CONNECT 即记录后挂断 —— 更新流量对 ZCode 端点的
 *   「尝试触达」本身就是证据；测试绝不向第三方 ZCode 服务器发送真实流量。
 * - 其余主机（GitHub feed 等）：透明隧道转发 —— 应用获得真实响应（例如
 *   api.github.com 的 404/403），行为保持真实。
 *
 * Node http（host 子进程的后端直连）不走 Chromium 代理，也不在本层观察范围 ——
 * 该层的观察范围在 manifest 中如实记录（观察分层诚实声明）。
 */
import { createServer } from "node:http";
import { connect as netConnect } from "node:net";
import { hostnameOf, hostnameOfOrigin } from "./common.mjs";

/**
 * 启动观察代理。
 * @param {object} options
 * @param {string[]} options.sinkOrigins 以 https://host 形式给出需要 sink 的端点 origin 列表
 * @param {string} options.logPrefix
 * @returns {Promise<{port:number, close:()=>Promise<void>, hits:()=>Array, requests:()=>Array, policy:object}>}
 */
export async function startObservingProxy(options = {}) {
  const sinkHosts = new Set(
    (options.sinkOrigins ?? [])
      .map((origin) => hostnameOfOrigin(origin))
      .filter(Boolean),
  );
  const records = [];
  const requestRecords = [];
  const prefix = options.logPrefix ?? "proxy";

  function record(entry) {
    records.push({ timestamp: new Date().toISOString(), ...entry });
  }

  const server = createServer((req, res) => {
    // 普通 HTTP（绝对 URI 形式经代理）
    const url = req.url ?? "";
    let host = null;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      host = req.headers.host?.split(":")[0]?.toLowerCase() ?? null;
    }
    const policy = sinkHosts.has(host) ? "sink" : "tunnel";
    record({ layer: "proxy", kind: "http", method: req.method, url, host, policy });
    requestRecords.push({ method: req.method, url, host, policy });
    if (policy === "sink") {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("observing-proxy: sink (update-channel acceptance — no third-party traffic)");
      return;
    }
    const upstream = (async () => {
      const { request } = await import("node:http");
      const parsed = new URL(url);
      const upstreamReq = request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || 80,
          path: `${parsed.pathname}${parsed.search}`,
          method: req.method,
          headers: { ...req.headers, host: parsed.host },
        },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        },
      );
      upstreamReq.on("error", (error) => {
        record({ layer: "proxy", kind: "http-upstream-error", url, error: String(error.message) });
        try {
          res.writeHead(502);
          res.end("observing-proxy: upstream error");
        } catch {
          // 响应可能已开始
        }
      });
      req.pipe(upstreamReq);
    })();
    upstream.catch((error) => {
      record({ layer: "proxy", kind: "http-error", url, error: String(error?.message ?? error) });
      try {
        res.writeHead(502);
        res.end("observing-proxy: error");
      } catch {
        // 响应可能已开始
      }
    });
  });

  // HTTPS CONNECT 隧道
  server.on("connect", (req, clientSocket, head) => {
    const target = req.url ?? "";
    const host = hostnameOf(target);
    const port = Number.parseInt(target.replace(/^.*:/, ""), 10) || 443;
    const policy = sinkHosts.has(host) ? "sink" : "tunnel";
    record({ layer: "proxy", kind: "connect", host, port, policy });
    requestRecords.push({ method: "CONNECT", url: target, host, port, policy });
    if (policy === "sink") {
      clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      clientSocket.destroy();
      return;
    }
    const upstreamSocket = netConnect({ host, port }, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
      record({ layer: "proxy", kind: "connect-established", host, port });
    });
    upstreamSocket.on("error", (error) => {
      record({
        layer: "proxy",
        kind: "connect-error",
        host,
        port,
        error: String(error.message),
      });
      try {
        clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      } catch {
        // socket 可能已关
      }
      clientSocket.destroy();
    });
    clientSocket.on("error", () => {
      upstreamSocket.destroy();
    });
  });

  server.on("error", (error) => {
    record({ layer: "proxy", kind: "server-error", error: String(error.message) });
  });

  await new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = server.address();

  const close = async () => {
    await new Promise((resolveClose) => {
      server.close(() => resolveClose());
      server.closeAllConnections?.();
      setTimeout(resolveClose, 500).unref?.();
    });
  };

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    policy: { sinkHosts: [...sinkHosts] },
    hits: () => records,
    requests: () => requestRecords,
    close,
    note: `observing proxy on 127.0.0.1:${port} — sink=${[...sinkHosts].join(",") || "none"}; ${
      prefix
    }`,
  };
}

/** 在 proxy 记录里按主机筛选（返回全部匹配记录，附时间戳）。 */
export function requestsToHost(requestsLike, host) {
  return (requestsLike ?? []).filter((entry) => entry.host === host);
}
