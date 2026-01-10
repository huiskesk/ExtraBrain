# ExtraBrain Web Clipper

Chrome extension to clip web pages to ExtraBrain.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select this `chrome-extension` folder

## Usage

### Popup Clipper
- Click the ExtraBrain icon in your Chrome toolbar
- Choose clip type: Article, Selection, Full Page, or URL Only
- Select target notebook
- Add optional notes
- Click "Save to ExtraBrain"

### Right-Click Menu
- Right-click on any page and select "Clip page to ExtraBrain"
- Right-click on selected text to clip just the selection
- Right-click on links or images to clip them directly

### Offline Support
Clips are saved locally if ExtraBrain app isn't running and will sync automatically when the app is opened.

## Icons

Replace the placeholder icons in the `icons/` folder with proper PNG icons:
- `icon16.png` - 16x16 pixels
- `icon32.png` - 32x32 pixels
- `icon48.png` - 48x48 pixels
- `icon128.png` - 128x128 pixels

## Development

The extension communicates with ExtraBrain via a local HTTP API on port 3847.

### Files
- `manifest.json` - Extension manifest (Manifest V3)
- `popup.html/js` - Extension popup UI
- `background.js` - Service worker for background tasks
- `content.js/css` - Content scripts injected into pages
