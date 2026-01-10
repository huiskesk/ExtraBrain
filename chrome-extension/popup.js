// ExtraBrain Web Clipper Popup

const API_URL = 'http://localhost:3847'; // Local API endpoint

let selectedClipType = 'article';
let pageInfo = null;
let notebooks = [];

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Setup clip type selection
  document.querySelectorAll('.clip-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.clip-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      selectedClipType = option.dataset.type;
    });
  });

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab) {
    document.getElementById('clip-title').value = tab.title || '';
    document.getElementById('url-preview').textContent = tab.url || '';
    pageInfo = { url: tab.url, title: tab.title };
  }

  // Try to load notebooks from storage or API
  await loadNotebooks();

  // Setup clip button
  document.getElementById('clip-btn').addEventListener('click', handleClip);
});

async function loadNotebooks() {
  // First try to get from storage
  const stored = await chrome.storage.local.get(['notebooks', 'lastSync']);

  if (stored.notebooks && stored.notebooks.length > 0) {
    notebooks = stored.notebooks;
    updateNotebookSelect();
  }

  // Try to fetch from API (will fail if app not running, which is okay)
  try {
    const response = await fetch(`${API_URL}/notebooks`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      notebooks = await response.json();
      await chrome.storage.local.set({ notebooks, lastSync: Date.now() });
      updateNotebookSelect();
      document.getElementById('main-content').style.display = 'block';
      document.getElementById('setup-content').style.display = 'none';
    }
  } catch (error) {
    // API not available - use cached notebooks or show setup
    if (notebooks.length === 0) {
      // Create a default notebook entry for offline use
      notebooks = [{ id: 'default', name: 'My Notes', color: '#22c55e' }];
      updateNotebookSelect();
    }
    console.log('ExtraBrain API not available, using cached data');
  }
}

function updateNotebookSelect() {
  const select = document.getElementById('notebook-select');
  select.innerHTML = '<option value="">Select notebook...</option>';

  notebooks.forEach(nb => {
    const option = document.createElement('option');
    option.value = nb.id;
    option.textContent = nb.name;
    select.appendChild(option);
  });

  // Auto-select first notebook
  if (notebooks.length > 0) {
    select.value = notebooks[0].id;
  }
}

async function handleClip() {
  const btn = document.getElementById('clip-btn');
  const btnText = document.getElementById('btn-text');
  const status = document.getElementById('status');
  const title = document.getElementById('clip-title').value.trim();
  const notebookId = document.getElementById('notebook-select').value;
  const notes = document.getElementById('clip-notes').value.trim();

  if (!title) {
    showStatus('Please enter a title', 'error');
    return;
  }

  if (!notebookId) {
    showStatus('Please select a notebook', 'error');
    return;
  }

  // Show loading state
  btn.disabled = true;
  btnText.innerHTML = '<span class="loading"></span>';
  status.innerHTML = '';

  try {
    // Get content based on clip type
    let content = '';

    switch (selectedClipType) {
      case 'article':
        content = await getArticleContent();
        break;
      case 'selection':
        content = await getSelectedContent();
        break;
      case 'full':
        content = await getFullPageContent();
        break;
      case 'url':
        content = `<a href="${pageInfo.url}">${pageInfo.title}</a>`;
        break;
    }

    // Add user notes if provided
    if (notes) {
      content = `<div class="user-notes"><p>${notes}</p></div>\n\n${content}`;
    }

    // Save to storage for later sync (works offline)
    const clip = {
      id: `clip_${Date.now()}`,
      notebookId,
      title,
      content,
      sourceUrl: pageInfo.url,
      createdAt: new Date().toISOString(),
      synced: false
    };

    // Try to send to API
    try {
      const response = await fetch(`${API_URL}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebook_id: notebookId,
          title,
          content,
          source_url: pageInfo.url
        })
      });

      if (response.ok) {
        clip.synced = true;
        showStatus('Saved to ExtraBrain!', 'success');
      } else {
        throw new Error('API error');
      }
    } catch (apiError) {
      // Save locally for later sync
      const pending = await chrome.storage.local.get('pendingClips') || { pendingClips: [] };
      pending.pendingClips = pending.pendingClips || [];
      pending.pendingClips.push(clip);
      await chrome.storage.local.set(pending);
      showStatus('Saved locally. Will sync when app is open.', 'info');
    }

    // Close popup after short delay
    setTimeout(() => window.close(), 1500);

  } catch (error) {
    console.error('Clip error:', error);
    showStatus('Failed to clip page. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Save to ExtraBrain';
  }
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.className = `status status-${type}`;
  status.textContent = message;
}

async function getArticleContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractArticle
  });

  return result.result || `<p>Could not extract article content from this page.</p><a href="${pageInfo.url}">View original</a>`;
}

async function getSelectedContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString()
  });

  const selection = result.result;
  if (!selection) {
    return `<p>No text selected. Please select text on the page and try again.</p>`;
  }

  return `<blockquote>${selection}</blockquote>\n<p><a href="${pageInfo.url}">Source</a></p>`;
}

async function getFullPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.body.innerHTML
  });

  return result.result || '';
}

// Article extraction function (injected into page)
function extractArticle() {
  // Simple article extraction - looks for common article containers
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
      // Clean up the content
      const clone = el.cloneNode(true);

      // Remove scripts, styles, comments, etc.
      clone.querySelectorAll('script, style, nav, header, footer, aside, .ad, .advertisement, .social-share').forEach(e => e.remove());

      return clone.innerHTML;
    }
  }

  // Fallback: get main text content
  const body = document.body.cloneNode(true);
  body.querySelectorAll('script, style, nav, header, footer, aside').forEach(e => e.remove());

  // Get text with basic structure
  const paragraphs = body.querySelectorAll('p');
  if (paragraphs.length > 0) {
    return Array.from(paragraphs)
      .map(p => `<p>${p.textContent}</p>`)
      .join('\n');
  }

  return body.textContent || '';
}
