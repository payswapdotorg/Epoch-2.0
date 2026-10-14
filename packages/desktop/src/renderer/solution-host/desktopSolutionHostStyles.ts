/**
 * Desktop Solution Host — inline styles (W006; Epoch palette since W036).
 *
 * 抽离自 DesktopSolutionHost.tsx 以满足 architecture-policy maxFileLines: 400。
 * 纯样式常量，不含逻辑；组件按名导入。
 *
 * W036 Epoch 视觉方向：solution-host 是桌面端世界覆盖层（packages/ui W003 冻结，
 * 不接入 Tailwind token），这里以显式色板常量维护，与应用图标/启动壳同一方向：
 * - 暖制图纸 #F5F1EA —— 覆盖层底色（世界画布本身不染色，只染周边 chrome）；
 * - 蓝图海军蓝 #1F3A5F —— 标题/主文本（对纸底对比度约 10:1，AAA）；
 * - 陶土 #C75D3F —— 强调色/激活指示（对纸底约 3.7:1，只用于大号/粗体或非文本元素）；
 * - 陶土深 #A84A30 —— 小号链接/强调文本（对纸底约 5:1，满足 WCAG AA 4.5:1）。
 */
import type { CSSProperties } from "react";

export const epochPalette = {
  paper: "#F5F1EA",
  paperEdge: "rgba(31, 58, 95, 0.16)",
  ink: "#1F3A5F",
  inkSubtle: "rgba(31, 58, 95, 0.72)",
  terracotta: "#C75D3F",
  terracottaDeep: "#A84A30",
  /** 纸面悬浮件的暖色投影——保持 W006 的低强度浮层观感，只换色温。 */
  chromeShadow: "0 1px 4px rgba(31, 42, 59, 0.16)",
} as const;

export const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  background: epochPalette.paper,
  overflow: "hidden",
};
export const hiddenStyle: CSSProperties = { ...overlayStyle, display: "none" };
export const canvasStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
  touchAction: "none",
};
export const hudTopBarStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  right: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  pointerEvents: "none",
};
export const titleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "rgba(255,255,255,0.94)",
  border: `1px solid ${epochPalette.paperEdge}`,
  borderRadius: 8,
  padding: "6px 10px",
  boxShadow: epochPalette.chromeShadow,
  fontSize: 13,
  color: epochPalette.ink,
  pointerEvents: "auto",
};
export const readyDotStyle: CSSProperties = {
  display: "inline-block",
  width: 8,
  height: 8,
  marginLeft: 8,
  borderRadius: "50%",
  // W036：就绪指示从绿色改用品牌陶土——Epoch 色板内没有绿色，语义用 title="world ready" 保留。
  background: epochPalette.terracotta,
};
export const buttonStyle: CSSProperties = {
  pointerEvents: "auto",
  background: "rgba(255,255,255,0.94)",
  border: `1px solid ${epochPalette.paperEdge}`,
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 13,
  color: epochPalette.ink,
  cursor: "pointer",
  boxShadow: epochPalette.chromeShadow,
};
export const linkButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  // 小号文本链接用陶土深档（AA 4.5:1），纯陶土只在粗体/大号元素上使用。
  color: epochPalette.terracottaDeep,
  cursor: "pointer",
  fontSize: 11,
  padding: 0,
  textDecoration: "underline",
};
export const rightPanelStyle: CSSProperties = {
  position: "absolute",
  top: 56,
  right: 12,
  background: "rgba(255,255,255,0.96)",
  border: `1px solid ${epochPalette.paperEdge}`,
  borderRadius: 8,
  padding: "10px 12px",
  boxShadow: epochPalette.chromeShadow,
  fontSize: 12,
  color: epochPalette.ink,
  minWidth: 220,
  maxWidth: 280,
  maxHeight: "78vh",
  overflowY: "auto",
  pointerEvents: "auto",
};
export const panelTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 6,
};
export const panelTitleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: epochPalette.inkSubtle,
};
export const inspectorRowStyle: CSSProperties = { margin: "3px 0", lineHeight: 1.4 };
export const layerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  margin: "3px 0",
};
export const hintStyle: CSSProperties = {
  position: "absolute",
  bottom: 12,
  left: 12,
  background: "rgba(255,255,255,0.92)",
  border: `1px solid ${epochPalette.paperEdge}`,
  borderRadius: 8,
  padding: "4px 10px",
  fontSize: 12,
  color: epochPalette.inkSubtle,
  boxShadow: epochPalette.chromeShadow,
};
export const errorBoxStyle: CSSProperties = {
  margin: "auto",
  background: "#fff",
  // 语义色不参与品牌化：错误仍用红色状态色，只与纸底协调边框。
  border: "1px solid #d33",
  borderRadius: 8,
  padding: 16,
  maxWidth: 480,
  color: "#a00",
};
export const reopenButtonStyle: CSSProperties = {
  position: "fixed",
  bottom: 12,
  right: 12,
  zIndex: 41,
  ...buttonStyle,
};
