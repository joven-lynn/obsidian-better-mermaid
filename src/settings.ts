import { App, PluginSettingTab } from 'obsidian';
import type { SettingDefinition, SettingDefinitionItem } from 'obsidian';
import type BetterMermaidPlugin from './main';

export interface BetterMermaidSettings {
  language: 'en' | 'zh';
  customCss: string;
  enableClickToZoom: boolean;
  modalWidthPercent: number;
  modalHeightPercent: number;
  defaultZoomLevel: number;
}

export const DEFAULT_SETTINGS: BetterMermaidSettings = {
  language: 'en',
  customCss: '',
  enableClickToZoom: true,
  modalWidthPercent: 80,
  modalHeightPercent: 80,
  defaultZoomLevel: 100,
};

const STRINGS: Record<string, Record<string, string>> = {
  en: {
    settingsTitle: 'Better Mermaid Settings',
    languageLabel: 'Language',
    languageDesc: 'Display language for plugin UI',
    enableClickToZoom: 'Enable click to zoom',
    enableClickToZoomDesc: 'Click on a Mermaid diagram in reading mode to view it enlarged',
    modalWidth: 'Modal width',
    modalWidthDesc: 'Width of the zoom modal (percentage of viewport)',
    modalHeight: 'Modal height',
    modalHeightDesc: 'Height of the zoom modal (percentage of viewport)',
    customCss: 'Custom CSS',
    customCssDesc: 'CSS to inject into Obsidian (applies immediately)',
    customCssPlaceholder: '/* Enter your custom CSS here */',
    reset: 'Reset to default',
    downloadPng: 'Download PNG',
    zoom: 'Zoom',
    converting: 'Converting...',
    defaultZoomLevel: 'Default zoom level',
    defaultZoomLevelDesc: 'Initial zoom level when opening a Mermaid diagram (percentage)',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fitView: 'Fit',
    savePng: 'Save PNG',
    savedToVault: 'Saved to vault: ',
    pngSaveFailed: 'Failed to save PNG',
  },
  zh: {
    settingsTitle: 'Better Mermaid 设置',
    languageLabel: '语言',
    languageDesc: '插件界面的显示语言',
    enableClickToZoom: '启用单击放大',
    enableClickToZoomDesc: '在阅读模式下单击 Mermaid 图表以放大查看',
    modalWidth: '弹窗宽度',
    modalWidthDesc: '弹窗宽度（视口百分比）',
    modalHeight: '弹窗高度',
    modalHeightDesc: '弹窗高度（视口百分比）',
    customCss: '自定义 CSS',
    customCssDesc: '注入到 Obsidian 的 CSS（即时生效）',
    customCssPlaceholder: '/* 在这里输入自定义 CSS */',
    reset: '重置为默认值',
    downloadPng: '下载 PNG',
    zoom: '缩放',
    converting: '转换中...',
    defaultZoomLevel: '默认缩放级别',
    defaultZoomLevelDesc: '打开 Mermaid 图表时的初始缩放级别（百分比）',
    zoomIn: '放大',
    zoomOut: '缩小',
    fitView: '适应',
    savePng: '保存 PNG',
    savedToVault: '已保存到仓库: ',
    pngSaveFailed: 'PNG 保存失败',
  },
};

export function i18n(lang: string, key: string): string {
  const dict = STRINGS[lang] ?? STRINGS['en'];
  return dict[key] ?? key;
}

export class BetterMermaidSettingTab extends PluginSettingTab {
  plugin: BetterMermaidPlugin;

  constructor(app: App, plugin: BetterMermaidPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private t(key: string): string {
    return i18n(this.plugin.settings.language, key);
  }

  /**
   * Declarative settings (Obsidian 1.13+): the definitions are rendered by
   * Obsidian and indexed into the settings search.  This requires
   * minAppVersion 1.13.0; older runtimes are no longer supported.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const reset = (key: keyof BetterMermaidSettings): SettingDefinition => ({
      name: this.t('reset'),
      action: () => {
        const settings = this.plugin.settings as unknown as Record<
          string,
          unknown
        >;
        const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
        settings[key] = defaults[key];
        void this.plugin.saveSettings();
        this.update();
      },
    });

    return [
      {
        type: 'group',
        heading: this.t('settingsTitle'),
        items: [
          {
            name: this.t('languageLabel'),
            desc: this.t('languageDesc'),
            control: {
              type: 'dropdown',
              key: 'language',
              options: { en: 'English', zh: '中文' },
            },
          },
          {
            name: this.t('enableClickToZoom'),
            desc: this.t('enableClickToZoomDesc'),
            control: { type: 'toggle', key: 'enableClickToZoom' },
          },
          {
            name: this.t('modalWidth'),
            desc: this.t('modalWidthDesc'),
            control: {
              type: 'slider',
              key: 'modalWidthPercent',
              min: 30,
              max: 100,
              step: 5,
              displayFormat: (value) => `${value}%`,
            },
          },
          reset('modalWidthPercent'),
          {
            name: this.t('modalHeight'),
            desc: this.t('modalHeightDesc'),
            control: {
              type: 'slider',
              key: 'modalHeightPercent',
              min: 30,
              max: 100,
              step: 5,
              displayFormat: (value) => `${value}%`,
            },
          },
          reset('modalHeightPercent'),
          {
            name: this.t('defaultZoomLevel'),
            desc: this.t('defaultZoomLevelDesc'),
            control: {
              type: 'slider',
              key: 'defaultZoomLevel',
              min: 20,
              max: 200,
              step: 5,
              displayFormat: (value) => `${value}%`,
            },
          },
          reset('defaultZoomLevel'),
          {
            name: this.t('customCss'),
            desc: this.t('customCssDesc'),
            control: {
              type: 'textarea',
              key: 'customCss',
              rows: 8,
              placeholder: this.t('customCssPlaceholder'),
            },
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    const settings = this.plugin.settings as unknown as Record<
      string,
      unknown
    >;
    return settings[key];
  }

  setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings as unknown as Record<
      string,
      unknown
    >;
    settings[key] = value;
    // Persist and re-inject the generated CSS (custom CSS / modal size).
    return this.plugin.saveSettings();
  }
}
