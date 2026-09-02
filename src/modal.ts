import { Modal, App } from 'obsidian';
import type { BetterMermaidSettings } from './settings';
import { i18n } from './settings';

const ZOOM_OPTIONS = [
  { label: '20%', value: 0.2 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1.0 },
];

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const ZOOM_STEP = 1.5;
// Two taps within this window and distance are treated as a double-tap.
const DOUBLE_TAP_MS = 300;
const TAP_MOVE_TOLERANCE = 12;

export class MermaidImageModal extends Modal {
  private svg: SVGSVGElement;
  private settings: BetterMermaidSettings;
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private dragMoved = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;
  private viewport: HTMLElement;
  private svgEl: SVGSVGElement;
  private zoomSelect: HTMLSelectElement;
  private resizeObserver: ResizeObserver | null = null;

  // Active touch/pen/mouse pointers (coordinates relative to the viewport).
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStartDist = 0;
  private pinchStartScale = 1;
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;

  constructor(app: App, svg: SVGSVGElement, settings: BetterMermaidSettings) {
    super(app);
    this.svg = svg;
    this.settings = settings;
    this.scale = settings.defaultZoomLevel / 100;
    this.modalEl.addClass('better-mermaid-modal-size');
  }

  private t(key: string): string {
    return i18n(this.settings.language, key);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('better-mermaid-modal');

    this.svgEl = this.svg.cloneNode(true) as SVGSVGElement;
    this.svgEl.removeAttribute('width');
    this.svgEl.removeAttribute('height');
    // Strip inline styles that Obsidian may have added (e.g. max-width:100%)
    // so they don't interfere with the modal's own sizing.
    this.svgEl.removeAttribute('style');
    // Explicitly enforce uniform scaling so the diagram content is never
    // stretched non-uniformly even if CSS dimensions change.
    this.svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svgEl.addClass('better-mermaid-svg');

    // Fix text squeezing: inject CSS into the SVG so that foreignObject
    // content wraps properly instead of overflowing or being clipped.
    this.fixTextOverflow();

    this.viewport = contentEl.createDiv({ cls: 'better-mermaid-viewport' });
    this.viewport.appendChild(this.svgEl);

    // Defer the initial size calculation until the browser has finished laying
    // out the modal (flex layout).  The ResizeObserver below handles subsequent
    // size changes (e.g. window resize).
    requestAnimationFrame(() => {
      this.applyView();
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.applyView();
    });
    this.resizeObserver.observe(this.viewport);

    const controls = this.viewport.createDiv({ cls: 'better-mermaid-controls' });

    controls.createEl('label', { text: this.t('zoom') });

    this.zoomSelect = controls.createEl('select');
    ZOOM_OPTIONS.forEach((opt) => {
      const option = this.zoomSelect.createEl('option');
      option.value = String(opt.value);
      option.text = opt.label;
    });
    this.zoomSelect.value = String(this.scale);
    this.zoomSelect.addEventListener('change', () => {
      const gen = this.zoomSelect.querySelector('[data-generated]');
      if (gen) gen.remove();
      this.setZoom(parseFloat(this.zoomSelect.value));
    });

    this.addZoomButton(controls, '−', 'zoomOut', () =>
      this.zoomBy(1 / ZOOM_STEP),
    );
    this.addZoomButton(controls, '+', 'zoomIn', () => this.zoomBy(ZOOM_STEP));

    const fitBtn = controls.createEl('button', { text: this.t('fitView') });
    fitBtn.addEventListener('click', () => this.resetView());

    const btn = controls.createEl('button', { text: this.t('downloadPng') });
    btn.addEventListener('click', () => {
      void this.handleDownload(btn);
    });

    // Pointer events unify mouse (desktop) and touch (mobile) input.
    // `touch-action: none` (see styles.css) keeps the browser from hijacking
    // touch gestures for page scrolling/zooming.
    this.viewport.addEventListener('wheel', this.onWheel, { passive: false });
    this.viewport.addEventListener('pointerdown', this.onPointerDown);
    this.viewport.addEventListener('pointermove', this.onPointerMove);
    this.viewport.addEventListener('pointerup', this.onPointerUp);
    this.viewport.addEventListener('pointercancel', this.onPointerCancel);
  }

  onClose() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.viewport.removeEventListener('wheel', this.onWheel);
    this.viewport.removeEventListener('pointerdown', this.onPointerDown);
    this.viewport.removeEventListener('pointermove', this.onPointerMove);
    this.viewport.removeEventListener('pointerup', this.onPointerUp);
    this.viewport.removeEventListener('pointercancel', this.onPointerCancel);

    this.pointers.clear();
    this.pinchStartDist = 0;
    this.contentEl.empty();
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragMoved = false;
  }

  private addZoomButton(
    parent: HTMLElement,
    text: string,
    ariaKey: string,
    onClick: () => void,
  ) {
    const button = parent.createEl('button', { text });
    button.setAttribute('aria-label', this.t(ariaKey));
    button.addEventListener('click', onClick);
  }

  private zoomBy(factor: number) {
    this.setZoom(this.clampScale(this.scale * factor));
  }

  private resetView() {
    this.panX = 0;
    this.panY = 0;
    this.scale = 1;
    this.applyView();
    this.syncZoomDisplay(1);
  }

  private clampScale(scale: number): number {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  }

  private setZoom(scale: number) {
    const ratio = scale / this.scale;
    // Keep the diagram point currently under the viewport center fixed
    // (anchors are expressed relative to the viewport center).
    this.panX *= ratio;
    this.panY *= ratio;
    this.scale = scale;

    this.applyView();
    this.syncZoomDisplay(scale);
  }

  private syncZoomDisplay(scale: number) {
    const gen = this.zoomSelect.querySelector('[data-generated]');
    if (gen) gen.remove();

    const exact = ZOOM_OPTIONS.find((o) => Math.abs(o.value - scale) < 0.005);
    if (exact) {
      this.zoomSelect.value = String(exact.value);
      return;
    }

    const doc = this.contentEl.ownerDocument;
    const opt = doc.createElement('option');
    opt.setAttribute('data-generated', 'true');
    opt.value = String(scale);
    opt.text = `${Math.round(scale * 100)}%`;
    this.zoomSelect.appendChild(opt);
    this.zoomSelect.value = String(scale);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const rect = this.viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      const factor = 1 - e.deltaY * 0.005;
      const newScale = this.clampScale(this.scale * factor);
      const ratio = newScale / this.scale;
      this.panX = mx + (this.panX - mx) * ratio;
      this.panY = my + (this.panY - my) * ratio;
      this.scale = newScale;
      this.applyView();
      this.syncZoomDisplay(newScale);
    } else if (e.shiftKey) {
      this.panX -= e.deltaY;
      this.updateTransform();
    } else {
      this.panY -= e.deltaY;
      this.updateTransform();
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.better-mermaid-controls')) return;

    const pos = this.pointerPos(e);
    this.pointers.set(e.pointerId, pos);
    try {
      this.viewport.setPointerCapture(e.pointerId);
    } catch {
      // Some webviews reject capture; panning still works without it.
    }

    if (this.pointers.size === 1) {
      this.isDragging = true;
      this.dragMoved = false;
      this.dragStartX = pos.x;
      this.dragStartY = pos.y;
      this.panStartX = this.panX;
      this.panStartY = this.panY;
      this.viewport.addClass('better-mermaid-grabbing');
    } else if (this.pointers.size === 2) {
      this.pinchStartDist = this.pointerDistance();
      this.pinchStartScale = this.scale;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const pos = this.pointerPos(e);
    this.pointers.set(e.pointerId, pos);

    if (this.pointers.size >= 2 && this.pinchStartDist > 0) {
      const dist = this.pointerDistance();
      if (dist <= 0) return;
      this.dragMoved = true;
      const newScale = this.clampScale(
        this.pinchStartScale * (dist / this.pinchStartDist),
      );
      // Keep the diagram point under the pinch midpoint stationary.
      const rect = this.viewport.getBoundingClientRect();
      const mid = this.pointerMidpoint();
      const mx = mid.x - rect.width / 2;
      const my = mid.y - rect.height / 2;
      const ratio = newScale / this.scale;
      this.panX = mx + (this.panX - mx) * ratio;
      this.panY = my + (this.panY - my) * ratio;
      this.scale = newScale;
      this.applyView();
      this.syncZoomDisplay(newScale);
    } else if (this.pointers.size === 1 && this.isDragging) {
      if (
        Math.hypot(pos.x - this.dragStartX, pos.y - this.dragStartY) >
        TAP_MOVE_TOLERANCE
      ) {
        this.dragMoved = true;
      }
      if (e.cancelable) e.preventDefault();
      this.panX = this.panStartX + (pos.x - this.dragStartX);
      this.panY = this.panStartY + (pos.y - this.dragStartY);
      this.updateTransform();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const tracked = this.pointers.delete(e.pointerId);
    const upTarget = e.target as HTMLElement;
    const inControls = !!upTarget.closest('.better-mermaid-controls');

    if (this.pointers.size === 0) {
      const wasPinching = this.pinchStartDist > 0;
      this.isDragging = false;
      this.pinchStartDist = 0;
      this.viewport.removeClass('better-mermaid-grabbing');

      if (tracked && !wasPinching && !this.dragMoved && !inControls) {
        this.handleTap(e);
      }
      this.dragMoved = false;
    } else if (this.pointers.size === 1) {
      // One finger remains — resume single-finger panning from the current view.
      this.pinchStartDist = 0;
      this.isDragging = true;
      const rest = Array.from(this.pointers.values())[0];
      this.dragStartX = rest.x;
      this.dragStartY = rest.y;
      this.panStartX = this.panX;
      this.panStartY = this.panY;
    }
  };

  private onPointerCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.isDragging = false;
    this.pinchStartDist = 0;
    this.dragMoved = false;
    this.viewport.removeClass('better-mermaid-grabbing');
  };

  /**
   * Toggle between the fitted view (scale 1) and 2x zoom on a quick tap
   * without significant movement.  Works for both touch and mouse
   * (double-click).
   */
  private handleTap(e: PointerEvent) {
    const now = Date.now();
    const dx = e.clientX - this.lastTapX;
    const dy = e.clientY - this.lastTapY;
    const isDoubleTap =
      now - this.lastTapTime < DOUBLE_TAP_MS &&
      Math.hypot(dx, dy) < TAP_MOVE_TOLERANCE;

    if (isDoubleTap) {
      if (this.scale > 1.01) {
        // Restore the fully fitted, centered view.
        this.panX = 0;
        this.panY = 0;
        this.scale = 1;
      } else {
        // Zoom in, keeping the tapped diagram point stationary.
        const pos = this.pointerPos(e);
        const rect = this.viewport.getBoundingClientRect();
        const mx = pos.x - rect.width / 2;
        const my = pos.y - rect.height / 2;
        const target = 2;
        const ratio = target / this.scale;
        this.panX = mx + (this.panX - mx) * ratio;
        this.panY = my + (this.panY - my) * ratio;
        this.scale = target;
      }
      this.applyView();
      this.syncZoomDisplay(this.scale);
      // Reset so a third tap doesn't immediately toggle again.
      this.lastTapTime = 0;
    } else {
      this.lastTapTime = now;
      this.lastTapX = e.clientX;
      this.lastTapY = e.clientY;
    }
  }

  private pointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = this.viewport.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private pointerDistance(): number {
    const pts = Array.from(this.pointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private pointerMidpoint(): { x: number; y: number } {
    const pts = Array.from(this.pointers.values());
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  /**
   * Reposition the SVG (translate only — never CSS scale).  Scaling is done
   * by changing the SVG's pixel size in applyView(), so the browser
   * re-renders the vector content at the exact target size instead of
   * upscaling a raster texture (which would blur text and strokes).
   */
  private updateTransform() {
    this.svgEl.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
  }

  /**
   * Size the SVG to the viewport-fit dimensions (derived from the viewBox
   * attribute, aspect ratio preserved) multiplied by the current zoom level.
   * The viewport flex-centers the SVG (see styles.css); pan offsets from
   * updateTransform() are applied on top of that centering.
   */
  private applyView() {
    const viewBox = this.svgEl.getAttribute('viewBox');
    if (!viewBox) return;

    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length !== 4) return;

    const vbWidth = parts[2];
    const vbHeight = parts[3];
    if (!vbWidth || !vbHeight) return;

    const vpRect = this.viewport.getBoundingClientRect();
    const vpWidth = vpRect.width;
    const vpHeight = vpRect.height;
    if (!vpWidth || !vpHeight) return;

    const svgAspect = vbWidth / vbHeight;
    const vpAspect = vpWidth / vpHeight;

    let fitWidth: number;
    let fitHeight: number;

    if (svgAspect > vpAspect) {
      // SVG is wider than viewport — fit by width
      fitWidth = vpWidth;
      fitHeight = vpWidth / svgAspect;
    } else {
      // SVG is taller or equal — fit by height
      fitHeight = vpHeight;
      fitWidth = vpHeight * svgAspect;
    }

    this.svgEl.style.width = `${fitWidth * this.scale}px`;
    this.svgEl.style.height = `${fitHeight * this.scale}px`;
    this.updateTransform();
  }

  /**
   * Fix text squeezing inside mermaid SVG nodes.
   *
   * Mermaid's layout engine often underestimates the width needed for CJK
   * text and emoji, leaving foreignObject containers too narrow.  We inject
   * a <style> element into the cloned SVG that:
   *  1. Slightly reduces the base font-size so existing text fits better.
   *  2. Forces word-wrap on foreignObject content to prevent horizontal
   *     overflow.
   *  3. Ensures node labels remain visible and readable.
   */
  private fixTextOverflow() {
    // Walk every foreignObject and set inline styles directly on child
    // elements so the fix survives SVG→string→Image serialization (used by
    // svgToPng).  Injected <style> elements are unreliable in that path.
    const fos = this.svgEl.querySelectorAll('foreignObject');
    fos.forEach((fo) => {
      fo.setAttribute('style', 'font-size:13px;line-height:1.35');
      const walker = fo.ownerDocument.createTreeWalker(
        fo,
        NodeFilter.SHOW_ELEMENT,
      );
      let node: Element | null = walker.currentNode as Element;
      while (node) {
        const tag = node.tagName.toLowerCase();
        if (tag === 'div' || tag === 'p' || tag === 'span') {
          (node as HTMLElement).style.overflowWrap = 'break-word';
          (node as HTMLElement).style.wordBreak = 'break-word';
          (node as HTMLElement).style.whiteSpace = 'normal';
        }
        node = walker.nextNode() as Element | null;
      }
    });
  }

  private async handleDownload(btn: HTMLButtonElement) {
    btn.setText(this.t('converting'));
    btn.disabled = true;
    try {
      const pngDataUrl = await this.svgToPng();
      const doc = this.contentEl.ownerDocument;
      const link = doc.createElement('a');
      link.download = 'mermaid-diagram.png';
      link.href = pngDataUrl;
      link.click();
    } catch (e) {
      console.error('Failed to convert SVG to PNG:', e);
    }
    btn.setText(this.t('downloadPng'));
    btn.disabled = false;
  }

  private svgToPng(): Promise<string> {
    // Clone the modal's SVG (which has fixTextOverflow CSS injected)
    // rather than the original reading-mode SVG.
    const cloned = this.svgEl.cloneNode(true) as SVGSVGElement;
    // Remove the CSS transform (zoom/pan) and the fitted pixel size so the
    // export uses the native viewBox dimensions below.
    cloned.style.removeProperty('transform');
    cloned.style.removeProperty('width');
    cloned.style.removeProperty('height');
    const viewBox = cloned.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4) {
        cloned.setAttribute('width', String(parts[2]));
        cloned.setAttribute('height', String(parts[3]));
      }
    }

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(cloned);
    const dataUrl =
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const doc = this.contentEl.ownerDocument;
        const canvas = doc.createElement('canvas');
        const pxRatio = 2;
        canvas.width = img.width * pxRatio;
        canvas.height = img.height * pxRatio;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.scale(pxRatio, pxRatio);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, img.width, img.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        reject(new Error('Failed to load SVG image'));
      };
      img.src = dataUrl;
    });
  }
}
