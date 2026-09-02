import { App, PluginSettingTab, Setting } from 'obsidian';
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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl).setName(this.t('settingsTitle')).setHeading();

    new Setting(containerEl)
      .setName(this.t('languageLabel'))
      .setDesc(this.t('languageDesc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption('en', 'English')
          .addOption('zh', '中文')
          .setValue(s.language)
          .onChange(async (value: 'en' | 'zh') => {
            s.language = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(this.t('enableClickToZoom'))
      .setDesc(this.t('enableClickToZoomDesc'))
      .addToggle((toggle) =>
        toggle.setValue(s.enableClickToZoom).onChange(async (value) => {
          s.enableClickToZoom = value;
          await this.plugin.saveSettings();
        })
      );

	    const modalWidthSetting = new Setting(containerEl)
	      .setName(this.t('modalWidth'))
	      .setDesc(`${this.t('modalWidthDesc')} (${s.modalWidthPercent}%)`)
	      .addSlider((slider) =>
	        slider
	          .setLimits(30, 100, 5)
	          .setValue(s.modalWidthPercent)
	          .setDynamicTooltip()
	          .onChange(async (value) => {
	            s.modalWidthPercent = value;
	            modalWidthSetting.descEl.innerText = `${this.t('modalWidthDesc')} (${value}%)`;
	            await this.plugin.saveSettings();
	          })
	      )
	      .addButton((btn) =>
	        btn
	          .setButtonText(this.t('reset'))
	          .onClick(async () => {
	            s.modalWidthPercent = DEFAULT_SETTINGS.modalWidthPercent;
	            await this.plugin.saveSettings();
	            this.display();
	          })
	      );

	    const modalHeightSetting = new Setting(containerEl)
	      .setName(this.t('modalHeight'))
	      .setDesc(`${this.t('modalHeightDesc')} (${s.modalHeightPercent}%)`)
		      .addSlider((slider) =>
		        slider
		          .setLimits(30, 100, 5)
		          .setValue(s.modalHeightPercent)
		          .setDynamicTooltip()
		          .onChange(async (value) => {
		            s.modalHeightPercent = value;
		            modalHeightSetting.descEl.innerText = `${this.t('modalHeightDesc')} (${value}%)`;
		            await this.plugin.saveSettings();
		          })
		      )
			      .addButton((btn) =>
		        btn
		          .setButtonText(this.t('reset'))
		          .onClick(async () => {
		            s.modalHeightPercent = DEFAULT_SETTINGS.modalHeightPercent;
		            await this.plugin.saveSettings();
		            this.display();
		          })
		      );

		    const zoomSetting = new Setting(containerEl)
		      .setName(this.t('defaultZoomLevel'))
		      .setDesc(`${this.t('defaultZoomLevelDesc')} (${s.defaultZoomLevel}%)`)
			    .addSlider((slider) =>
			        slider
			          .setLimits(20, 200, 5)
			          .setValue(s.defaultZoomLevel)
			          .setDynamicTooltip()
			          .onChange(async (value) => {
			            s.defaultZoomLevel = value;
			            zoomSetting.descEl.innerText = `${this.t('defaultZoomLevelDesc')} (${value}%)`;
			            await this.plugin.saveSettings();
			          })
			      )
		      .addButton((btn) =>
		        btn
		          .setButtonText(this.t('reset'))
		          .onClick(async () => {
		            s.defaultZoomLevel = DEFAULT_SETTINGS.defaultZoomLevel;
		            await this.plugin.saveSettings();
		            this.display();
		          })
		      );

	    new Setting(containerEl)
	      .setName(this.t('customCss'))
      .setDesc(this.t('customCssDesc'))
      .addTextArea((textarea) =>
        textarea
          .setPlaceholder(this.t('customCssPlaceholder'))
          .setValue(s.customCss)
          .onChange(async (value) => {
            s.customCss = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
