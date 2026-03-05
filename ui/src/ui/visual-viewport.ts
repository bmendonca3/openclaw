const KEYBOARD_INSET_CUTOFF_PX = 80;

export const CHAT_KEYBOARD_INSET_CSS_VAR = "--chat-viewport-keyboard-inset";

export function computeVisualViewportKeyboardInset(params: {
  windowInnerHeight: number;
  viewportHeight: number;
  viewportOffsetTop?: number;
}): number {
  const rawInset =
    params.windowInnerHeight - (params.viewportHeight + (params.viewportOffsetTop ?? 0));
  const roundedInset = Math.max(0, Math.round(rawInset));
  return roundedInset >= KEYBOARD_INSET_CUTOFF_PX ? roundedInset : 0;
}

type VisualViewportLike = {
  height: number;
  offsetTop: number;
  addEventListener: (type: "resize" | "scroll", listener: () => void) => void;
  removeEventListener: (type: "resize" | "scroll", listener: () => void) => void;
};

type WindowLike = {
  innerHeight: number;
  visualViewport?: VisualViewportLike;
  addEventListener: (type: "resize", listener: () => void) => void;
  removeEventListener: (type: "resize", listener: () => void) => void;
};

export function attachVisualViewportKeyboardInset(params?: {
  root?: HTMLElement;
  win?: WindowLike;
}): () => void {
  const root = params?.root ?? document.documentElement;
  const win = params?.win ?? window;
  const viewport = win.visualViewport;

  const updateInset = () => {
    const inset = viewport
      ? computeVisualViewportKeyboardInset({
          windowInnerHeight: win.innerHeight,
          viewportHeight: viewport.height,
          viewportOffsetTop: viewport.offsetTop,
        })
      : 0;
    root.style.setProperty(CHAT_KEYBOARD_INSET_CSS_VAR, `${inset}px`);
  };

  updateInset();

  if (!viewport) {
    return () => {
      root.style.removeProperty(CHAT_KEYBOARD_INSET_CSS_VAR);
    };
  }

  viewport.addEventListener("resize", updateInset);
  viewport.addEventListener("scroll", updateInset);
  win.addEventListener("resize", updateInset);

  return () => {
    viewport.removeEventListener("resize", updateInset);
    viewport.removeEventListener("scroll", updateInset);
    win.removeEventListener("resize", updateInset);
    root.style.removeProperty(CHAT_KEYBOARD_INSET_CSS_VAR);
  };
}
