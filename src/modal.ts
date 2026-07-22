import { Modal, App } from 'obsidian';
import type { BetterMermaidSettings } from './settings';
import { i18n } from './settings';

const ZOOM_OPTIONS = [
  { label: '20%', value: 0.2 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1.0 },
];

export class MermaidImageModal extends Modal {
  private svg: SVGSVGElement;
  private settings: BetterMermaidSettings;
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;
  private viewport: HTMLElement;
  private svgEl: SVGSVGElement;
  private zoomSelect: HTMLSelectElement;
  private resizeObserver: ResizeObserver | null = null;

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
      this.fitSvgToViewport();
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.fitSvgToViewport();
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

    this.applyTransform();
    this.syncZoomDisplay(this.scale);

    const btn = controls.createEl('button', { text: this.t('downloadPng') });
    btn.addEventListener('click', () => {
      void this.handleDownload(btn);
    });

    const doc = this.viewport.ownerDocument;

    this.viewport.addEventListener('wheel', this.onWheel, { passive: false });
    this.viewport.addEventListener('mousedown', this.onMouseDown);
    doc.addEventListener('mousemove', this.onMouseMove);
    doc.addEventListener('mouseup', this.onMouseUp);
  }

  onClose() {
    const doc = this.viewport.ownerDocument;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    doc.removeEventListener('mousemove', this.onMouseMove);
    doc.removeEventListener('mouseup', this.onMouseUp);
    this.contentEl.empty();
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
  }

  private setZoom(scale: number) {
    const rect = this.viewport.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    this.panX = cx - (cx - this.panX) * (scale / this.scale);
    this.panY = cy - (cy - this.panY) * (scale / this.scale);
    this.scale = scale;

    this.applyTransform();
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
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = 1 - e.deltaY * 0.005;
      const newScale = Math.max(0.1, Math.min(10, this.scale * factor));
      this.panX = mx - (mx - this.panX) * (newScale / this.scale);
      this.panY = my - (my - this.panY) * (newScale / this.scale);
      this.scale = newScale;
      this.syncZoomDisplay(newScale);
    } else if (e.shiftKey) {
      this.panX -= e.deltaY;
    } else {
      this.panY -= e.deltaY;
    }
    this.applyTransform();
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.better-mermaid-controls')) return;
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.panStartX = this.panX;
    this.panStartY = this.panY;
    this.viewport.addClass('better-mermaid-grabbing');
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    this.panX = this.panStartX + (e.clientX - this.dragStartX);
    this.panY = this.panStartY + (e.clientY - this.dragStartY);
    this.applyTransform();
  };

  private onMouseUp = () => {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.viewport.removeClass('better-mermaid-grabbing');
  };

  private applyTransform() {
    this.svgEl.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  /**
   * Size the SVG to fit within the viewport while preserving its native
   * aspect ratio (derived from the viewBox attribute).  Without this the
   * CSS `width:100%; height:100%` would stretch the diagram
   * non-uniformly, squeezing text in one direction.
   */
  private fitSvgToViewport() {
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

    let svgWidth: number;
    let svgHeight: number;

    if (svgAspect > vpAspect) {
      // SVG is wider than viewport — fit by width
      svgWidth = vpWidth;
      svgHeight = vpWidth / svgAspect;
    } else {
      // SVG is taller or equal — fit by height
      svgHeight = vpHeight;
      svgWidth = vpHeight * svgAspect;
    }

    this.svgEl.style.width = `${svgWidth}px`;
    this.svgEl.style.height = `${svgHeight}px`;
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
    // Remove the CSS transform (zoom/pan) so the export is at native size.
    cloned.style.removeProperty('transform');
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
