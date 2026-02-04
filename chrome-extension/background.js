// ExtraBrain Web Clipper - Background Service Worker

const API_URL = 'http://localhost:3847';
const EXTENSION_TOKEN = 'extrabrain-extension-token';
const AUTH_HEADER = { Authorization: `Bearer ${EXTENSION_TOKEN}` };

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

    // Try to send to API
    try {
      const response = await fetch(`${API_URL}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
        body: JSON.stringify({
          notebook_id: notebookId,
          title: tab.title,
          content: clip.content,
          source_url: tab.url
        })
      });

      if (response.ok) {
        clip.synced = true;
        showNotification('Page clipped!', 'Saved to ExtraBrain');
      } else {
        throw new Error('API error');
      }
    } catch (apiError) {
      // Save locally
      const pending = await chrome.storage.local.get('pendingClips') || { pendingClips: [] };
      pending.pendingClips = pending.pendingClips || [];
      pending.pendingClips.push(clip);
      await chrome.storage.local.set(pending);
      showNotification('Page clipped!', 'Saved locally, will sync later');
    }
  } catch (error) {
    console.error('Quick clip error:', error);
    showNotification('Clip failed', 'Please try again');
  }
}

// Try to sync pending clips periodically
chrome.alarms?.create('sync-clips', { periodInMinutes: 5 });
syncPendingClips();

chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-clips') {
    await syncPendingClips();
  }
});

chrome.runtime.onStartup.addListener(() => {
  syncPendingClips();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'syncPendingClips') {
    syncPendingClips()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message }));
    return true;
  }
  return false;
});

async function syncPendingClips() {
  const { pendingClips } = await chrome.storage.local.get('pendingClips');

  if (!pendingClips || pendingClips.length === 0) return;

  const stillPending = [];

  for (const clip of pendingClips) {
    if (clip.synced) continue;

    try {
      const response = await fetch(`${API_URL}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
        body: JSON.stringify({
          notebook_id: clip.notebookId,
          title: clip.title,
          content: clip.content,
          source_url: clip.sourceUrl
        })
      });

      if (!response.ok) {
        stillPending.push(clip);
      }
    } catch (error) {
      stillPending.push(clip);
    }
  }

  await chrome.storage.local.set({ pendingClips: stillPending });
}

function showNotification(title, message) {
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message
  });
}

// Article extraction function
function extractArticle() {
  const selectors = [
    'article',
    '[role="article"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content-body',
    'main',
    '.main-content'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('script, style, nav, header, footer, aside, .ad, .advertisement, .social-share').forEach(e => e.remove());
      return clone.innerHTML;
    }
  }

  const body = document.body.cloneNode(true);
  body.querySelectorAll('script, style, nav, header, footer, aside').forEach(e => e.remove());

  const paragraphs = body.querySelectorAll('p');
  if (paragraphs.length > 0) {
    return Array.from(paragraphs)
      .map(p => `<p>${p.textContent}</p>`)
      .join('\n');
  }

  return body.textContent || '';
}

// Context menu for right-click clipping
chrome.runtime.onInstalled.addListener(() => {
  syncPendingClips();
  chrome.contextMenus?.create({
    id: 'clip-selection',
    title: 'Clip selection to ExtraBrain',
    contexts: ['selection']
  });

  chrome.contextMenus?.create({
    id: 'clip-page',
    title: 'Clip page to ExtraBrain',
    contexts: ['page']
  });

  chrome.contextMenus?.create({
    id: 'clip-link',
    title: 'Clip link to ExtraBrain',
    contexts: ['link']
  });

  chrome.contextMenus?.create({
    id: 'clip-image',
    title: 'Clip image to ExtraBrain',
    contexts: ['image']
  });
});

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  const { notebooks } = await chrome.storage.local.get('notebooks');
  const notebookId = notebooks?.[0]?.id || 'default';

  let title = tab?.title || 'Clipped content';
  let content = '';

  switch (info.menuItemId) {
    case 'clip-selection':
      content = `<blockquote>${info.selectionText}</blockquote>\n<p><a href="${tab.url}">Source</a></p>`;
      title = `Selection from ${tab.title}`;
      break;

    case 'clip-page':
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractArticle
      });
      content = result.result;
      break;

    case 'clip-link':
      content = `<a href="${info.linkUrl}">${info.linkUrl}</a>`;
      title = info.linkUrl;
      break;

    case 'clip-image':
      content = `<img src="${info.srcUrl}" alt="Clipped image" />\n<p><a href="${tab.url}">Source</a></p>`;
      title = `Image from ${tab.title}`;
      break;
  }

  // Save clip
  const clip = {
    id: `clip_${Date.now()}`,
    notebookId,
    title,
    content,
    sourceUrl: tab?.url || info.linkUrl,
    createdAt: new Date().toISOString(),
    synced: false
  };

  try {
    const response = await fetch(`${API_URL}/clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({
        notebook_id: notebookId,
        title,
        content,
        source_url: clip.sourceUrl
      })
    });

    if (response.ok) {
      showNotification('Clipped!', title);
    } else {
      throw new Error('API error');
    }
  } catch (error) {
    const pending = await chrome.storage.local.get('pendingClips') || { pendingClips: [] };
    pending.pendingClips = pending.pendingClips || [];
    pending.pendingClips.push(clip);
    await chrome.storage.local.set(pending);
    showNotification('Clipped!', 'Saved locally, will sync later');
  }
});
