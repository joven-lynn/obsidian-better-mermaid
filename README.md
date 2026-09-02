# Better Mermaid|[中文](https://github.com/Joven-Lynn/obsidian-better-mermaid/blob/main/README_zh.md)

An Obsidian plugin that enhances Mermaid diagram viewing experience with click-to-zoom, pan & zoom controls, and PNG export.

## Features

- **Click to Zoom** — Click any Mermaid diagram in reading mode to open it in a full-size modal
- **Pan & Zoom** — Scroll to pan, Ctrl + scroll to zoom, drag to move around
- **Zoom Presets** — Quick zoom levels: 20%, 50%, 75%, 100%
- **Export PNG** — Download any diagram as a high-resolution PNG image (2x)
- **Custom CSS** — Inject your own CSS to customize Mermaid diagram appearance
- **i18n** — English and Chinese language support

## Preview

Click a Mermaid diagram → opens a floating modal with frosted glass controls:
<img width="1547" height="850" alt="image" src="https://github.com/user-attachments/assets/12ffd099-4f55-4ad9-a2ae-48ec8d4fb31f" />

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Copy them to your vault's `.obsidian/plugins/obsidian-better-mermaid/` folder
3. Enable the plugin in Obsidian Settings → Community Plugins

### Manual Build

```bash
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` to the plugin folder.

## Usage

| Action           | Control                                       |
| ---------------- | --------------------------------------------- |
| Open modal       | Click a Mermaid diagram in reading mode       |
| Pan vertically   | Scroll wheel                                  |
| Pan horizontally | Shift + scroll wheel                          |
| Zoom             | Ctrl + scroll wheel                           |
| Pan freely       | Click and drag                                |
| Preset zoom      | Select from dropdown (20% / 50% / 75% / 100%) |
| Download PNG     | Click **Download PNG** button                 |

## Settings

| Setting              | Description                             | Default   |
| -------------------- | --------------------------------------- | --------- |
| Language             | UI language (English / 中文)              | English   |
| Enable click to zoom | Toggle the click-to-zoom feature on/off | On        |
| Modal width          | Width of the modal (% of viewport)      | 80%       |
| Modal height         | Height of the modal (% of viewport)     | 80%       |
| Custom CSS           | CSS rules injected into Obsidian        | *(empty)* |

Each slider has a reset button to restore default values.

## Custom CSS Example

```css
.markdown-preview-view .mermaid svg,
.markdown-source-view .mermaid svg {
  max-width: 100% !important;
  height: auto !important;
}

/* 限制最大高度，避免纵向过长 */
.markdown-preview-view .mermaid,
.markdown-source-view .mermaid {
  max-height: 80vh; /* 可根据需要调整，如 70vh、90vh */
  overflow: auto;    /* 超出时显示滚动条 */
}
```

## Troubleshooting

**Cannot open the plugin's settings tab** (the page is blank/unresponsive, console shows `TypeError: e.display is not a function`)

- **Cause**: since v1.0.6 the settings tab uses the declarative settings API (`getSettingDefinitions()`), which requires Obsidian **1.13.0 or later**. On older versions Obsidian still tries to render the tab through the legacy `display()` method, which is no longer implemented.
- **Fix**: update Obsidian to 1.13.0 or newer — Settings → About → Check for updates. You can see your current version in Settings → About.
- Note: `manifest.json` declares `minAppVersion: 1.13.0`, so installs from the community directory automatically block older Obsidian versions; only manually copied (sideloaded) plugins can end up running on an outdated Obsidian.

## Compatibility

- Minimum Obsidian version: **1.13.0** (required by the declarative settings API used for the settings tab)
- Works on both desktop and mobile
- Mobile: pinch to zoom, single-finger pan, double-tap to zoom, share-sheet / vault save for PNG export

## License

MIT
