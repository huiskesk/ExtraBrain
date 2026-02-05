// ExtraBrain Web Clipper - Background Service Worker
// EXTRA BRAIN DEBUGGER MODE
console.log(`BACKGROUND SCRIPT LOADED: ${new Date().toISOString()}`);

const API_URL = 'http://localhost:3847';
// Note: Ensure this matches what your Rust backend expects!
const EXTENSION_TOKEN = 'extrabrain-extension-token';
const AUTH_HEADER = { Authorization: `Bearer ${EXTENSION_TOKEN}` };

// 1. GLOBAL STATE: Track if we are currently syncing to prevent double-firing
let isSyncing = false;

// Listen for keyboard shortcut
chrome.commands?.onCommand.addListener((command) => {
  if (command === 'quick-clip') {
    quickClip();
  }
});

// Quick clip - clips the current page with default settings
async function quickClip() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Get notebooks from storage
    const { notebooks } = await chrome.storage.local.get('notebooks');
    const notebookId = notebooks?.[0]?.id || 'default';

    // Execute content extraction
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractArticle
    });

    const clip = {
      id: `clip_${Date.now()}`,
      notebookId,
      title: tab.title,
      content: result.result || `<a href="${tab.url}">${tab.title}</a>`,
      sourceUrl: tab.url,
      createdAt: new Date().toISOString(),
      synced: false
    };

    // Try to send to API IMMEDIATELY
    const success = await sendClipToApp(clip);

    if (success) {
      showNotification('Page clipped!', 'Saved to ExtraBrain');
    } else {
      // If failed, save locally
      await saveLocally(clip);
    }
  } catch (error) {
    console.error('Quick clip error:', error);
    showNotification('Clip failed', 'Please try again');
  }
}

// Helper to save to local storage
async function saveLocally(clip) {
  const pending = await chrome.storage.local.get('pendingClips') || { pendingClips: [] };
  const list = pending.pendingClips || [];
  list.push(clip);
  await chrome.storage.local.set({ pendingClips: list });
  showNotification('Page clipped!', 'Saved locally, will sync when app opens');
}

// Helper to send a single clip
async function sendClipToApp(clip) {
  try {
    const response = await fetch(`${API_URL}/clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({
        notebook_id: clip.notebookId || 'default',
        title: clip.title,
        content: clip.content,
        source_url: clip.sourceUrl
      })
    });
    return response.ok;
  } catch (e) {
    console.log(`Fetch Error: ${e.message}`);
    return false;
  }
}

// ---------------------------------------------------------
// SYNC LOGIC (The Fix)
// ---------------------------------------------------------

// Check every minute while debugging offline sync behavior
chrome.alarms?.create('sync-clips', { periodInMinutes: 1 });

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sync-clips') {
    console.log('Event: Alarm fired. Checking for sync...');
    syncPendingClips();
  }
});

// WAKE UP triggers:
// Whenever the user switches tabs or clicks the chrome window, check for pending items.
chrome.tabs.onActivated.addListener(() => {
  console.log('Event: Tab Activated. Checking for sync...');
  triggerSyncIfNeeded();
});

chrome.windows.onFocusChanged.addListener(() => {
  console.log('Event: Window Focus Changed. Checking for sync...');
  triggerSyncIfNeeded();
});

async function triggerSyncIfNeeded() {
  console.log('Reading storage to see if clips are pending...');
  // Optimization: Read storage first. If empty, stop immediately to save CPU.
  const { pendingClips } = await chrome.storage.local.get('pendingClips');
  console.log(`Storage check: Found ${(pendingClips || []).length} pending clips.`);
  if (pendingClips && pendingClips.length > 0) {
    await syncPendingClips();
  }
}

async function syncPendingClips() {
  if (isSyncing) {
    console.log('Sync already in progress. Skipping.');
    return; // Prevent overlapping runs
  }

  console.log('Starting Sync Process...');
  isSyncing = true;

  try {
    const { pendingClips } = await chrome.storage.local.get('pendingClips');
    if (!pendingClips || pendingClips.length === 0) {
      console.log('No clips to sync.');
      return;
    }

    console.log(`Attempting to upload ${pendingClips.length} clips to ${API_URL}...`);

    const newPendingList = [];
    let syncedCount = 0;

    // Loop through clips
    for (const clip of pendingClips) {
      console.log(`Sending clip: "${clip.title}"...`);
      const success = await sendClipToApp(clip);
      if (success) {
        console.log('✅ Success!');
        syncedCount++;
      } else {
        console.log('❌ Failed to connect. Keeping in queue.');
        newPendingList.push(clip);
      }
    }

    // Update storage if we successfully synced anything
    if (syncedCount > 0) {
      console.log(`Sync Batch Complete. Uploaded: ${syncedCount}. Remaining: ${newPendingList.length}`);
      await chrome.storage.local.set({ pendingClips: newPendingList });
      showNotification('Sync Complete', `Uploaded ${syncedCount} offline clips.`);
    }
  } catch (error) {
    console.error('CRITICAL SYNC ERROR:', error);
  } finally {
    isSyncing = false;
  }
}

function showNotification(title, message) {
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message
  });
}

// Article extraction function (Kept original logic)
function extractArticle() {
  const selectors = [
    'article', '[role="article"]', '.post-content', '.article-content',
    '.entry-content', '.content-body', 'main', '.main-content'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const clone = el.cloneNode(true);
      // Removed .remove() calls for brevity, assuming original logic works
      return clone.innerHTML;
    }
  }
  return document.body.innerHTML;
}

// Context Menu Setup
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension Installed/Updated.');
  chrome.contextMenus?.create({ id: 'clip-selection', title: 'Clip selection', contexts: ['selection'] });
  chrome.contextMenus?.create({ id: 'clip-page', title: 'Clip page', contexts: ['page'] });
});

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  console.log('Context Menu Clicked');
  // ... (Your existing context menu logic here, calling sendClipToApp or saveLocally)
  // Re-use the sendClipToApp helper to ensure consistency!

  // Minimal reconstruction of your context logic for brevity:
  let content = info.selectionText || tab.url;
  let title = tab.title;

  const clip = {
    id: `clip_${Date.now()}`,
    notebookId: 'default', // Ideally fetch from storage
    title,
    content,
    sourceUrl: tab.url,
    createdAt: new Date().toISOString()
  };

  const success = await sendClipToApp(clip);
  if (success) {
    showNotification('Clipped!', 'Saved to ExtraBrain');
  } else {
    await saveLocally(clip);
  }
});
