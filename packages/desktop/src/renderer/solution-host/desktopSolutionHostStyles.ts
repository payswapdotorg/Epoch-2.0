/**
 * Desktop Solution Host — inline styles (W006).
 *
 * 抽离自 DesktopSolutionHost.tsx 以满足 architecture-policy maxFileLines: 400。
 * 纯样式常量，不含逻辑；组件按名导入。
 */
import type { CSSProperties } from "react";

export const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  background: "#f7f9fa",
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
  background: "rgba(255,255,255,0.92)",
  borderRadius: 8,
  padding: "6px 10px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
  fontSize: 13,
  pointerEvents: "auto",
};
export const readyDotStyle: CSSProperties = {
  display: "inline-block",
  width: 8,
  height: 8,
  marginLeft: 8,
  borderRadius: "50%",
  background: "#2e8b57",
};
export const buttonStyle: CSSProperties = {
  pointerEvents: "auto",
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
  boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
};
export const linkButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "#3a6ea5",
  cursor: "pointer",
  fontSize: 11,
  padding: 0,
  textDecoration: "underline",
};
export const rightPanelStyle: CSSProperties = {
  position: "absolute",
  top: 56,
  right: 12,
  background: "rgba(255,255,255,0.95)",
  borderRadius: 8,
  padding: "10px 12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
  fontSize: 12,
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
  opacity: 0.7,
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
  borderRadius: 8,
  padding: "4px 10px",
  fontSize: 12,
  boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
};
export const errorBoxStyle: CSSProperties = {
  margin: "auto",
  background: "#fff",
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
