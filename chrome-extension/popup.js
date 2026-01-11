// ExtraBrain Web Clipper Popup
// Uses Readability for article extraction and Turndown for Markdown conversion

const API_URL = 'http://localhost:3847'; // Local API endpoint

let selectedClipType = 'article';
let pageInfo = null;
let notebooks = [];
let turndownService = null;

// Initialize Turndown service for HTML to Markdown conversion
function initTurndown() {
  if (typeof TurndownService !== 'undefined') {
    turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined'
    });

    // Keep some elements as HTML
    turndownService.keep(['iframe', 'video', 'audio']);

    // Custom rule for images with better alt text handling
    turndownService.addRule('images', {
      filter: 'img',
      replacement: function (content, node) {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        const title = node.getAttribute('title') || '';
        if (!src) return '';
        const titlePart = title ? ` "${title}"` : '';
        return `![${alt}](${src}${titlePart})`;
      }
    });

    console.log('Turndown initialized');
    return true;
  }
  console.warn('TurndownService not available');
  return false;
}

// Convert HTML to Markdown
function htmlToMarkdown(html) {
  if (turndownService) {
    try {
      return turndownService.turndown(html);
    } catch (error) {
      console.error('Turndown conversion failed:', error);
      return html; // Return original HTML on failure
    }
  }
  return html; // Return HTML if Turndown not available
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Turndown
  initTurndown();

  // Setup clip type selection
  document.querySelectorAll('.clip-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.clip-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      selectedClipType = option.dataset.type;
      updateClipTypeUI();
    });
  });

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab) {
    pageInfo = { url: tab.url, title: tab.title, tabId: tab.id };
    document.getElementById('url-preview').textContent = tab.url || '';

    // Get page info from content script for better title
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content || '',
          author: document.querySelector('meta[name="author"]')?.content || ''
        })
      });
      if (result?.result?.title) {
        document.getElementById('clip-title').value = result.result.title;
      } else {
        document.getElementById('clip-title').value = tab.title || '';
      }
    } catch (e) {
      document.getElementById('clip-title').value = tab.title || '';
    }
  }

  // Try to load notebooks from storage or API
  await loadNotebooks();

  // Setup clip button
  document.getElementById('clip-btn').addEventListener('click', handleClip);
});

function updateClipTypeUI() {
  const notesField = document.getElementById('notes-field');
  // Show notes field for all types
  notesField.style.display = 'block';
}

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
    let extractedTitle = title;

    switch (selectedClipType) {
      case 'article':
        const articleResult = await getArticleContent();
        content = articleResult.content;
        if (articleResult.title && articleResult.title !== document.title) {
          extractedTitle = articleResult.title;
          document.getElementById('clip-title').value = extractedTitle;
        }
        break;
      case 'selection':
        content = await getSelectedContent();
        break;
      case 'full':
        content = await getSimplifiedContent();
        break;
      case 'url':
        content = `[${pageInfo.title}](${pageInfo.url})`;
        break;
    }

    // Convert to Markdown if possible (except for URL which is already markdown)
    if (selectedClipType !== 'url' && turndownService) {
      content = htmlToMarkdown(content);
    }

    // Add user notes if provided
    if (notes) {
      content = `> **My Notes:** ${notes}\n\n---\n\n${content}`;
    }

    // Add source link at the bottom
    if (selectedClipType !== 'url') {
      content += `\n\n---\n*Source: [${pageInfo.title}](${pageInfo.url})*`;
    }

    // Save to storage for later sync (works offline)
    const clip = {
      id: `clip_${Date.now()}`,
      notebookId,
      title: extractedTitle,
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
          title: extractedTitle,
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

// Get article content using Readability (via content script)
async function getArticleContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    // First, inject Readability library
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/Readability.js']
    });

    // Then extract article using Readability
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        try {
          if (typeof Readability === 'undefined') {
            return { success: false, content: document.body.innerHTML, title: document.title };
          }

          const documentClone = document.cloneNode(true);
          const reader = new Readability(documentClone, {
            charThreshold: 100
          });
          const article = reader.parse();

          if (article && article.content) {
            return {
              success: true,
              title: article.title || document.title,
              content: article.content,
              excerpt: article.excerpt,
              byline: article.byline,
              siteName: article.siteName
            };
          }

          return { success: false, content: document.body.innerHTML, title: document.title };
        } catch (error) {
          return { success: false, content: document.body.innerHTML, title: document.title, error: error.message };
        }
      }
    });

    if (result?.result?.success) {
      return result.result;
    }

    // Fallback to simplified extraction
    return await getSimplifiedContent();

  } catch (error) {
    console.error('Article extraction failed:', error);
    return {
      content: `<p>Could not extract article content from this page.</p><p><a href="${pageInfo.url}">View original</a></p>`,
      title: pageInfo.title
    };
  }
}

// Get selected text content
async function getSelectedContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return { text: '', html: '' };

      const text = selection.toString().trim();
      const container = document.createElement('div');
      for (let i = 0; i < selection.rangeCount; i++) {
        container.appendChild(selection.getRangeAt(i).cloneContents());
      }
      return { text, html: container.innerHTML };
    }
  });

  const { text, html } = result?.result || { text: '', html: '' };

  if (!text) {
    return '<p>No text selected. Please select text on the page and try again.</p>';
  }

  // Return HTML if available, otherwise wrapped text
  return html || `<blockquote>${text}</blockquote>`;
}

// Get simplified page content (cleaned up, no Readability)
async function getSimplifiedContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const clone = document.body.cloneNode(true);

      // Remove unwanted elements
      const removeSelectors = [
        'script', 'style', 'noscript', 'iframe', 'svg',
        'nav', 'header', 'footer', 'aside',
        '.nav', '.navigation', '.menu', '.sidebar',
        '.ad', '.ads', '.advertisement', '.advert',
        '.social-share', '.share-buttons', '.social',
        '.comments', '.comment-section', '.comment-form',
        '.related-posts', '.recommended', '.suggestions',
        '.newsletter', '.subscribe', '.popup', '.modal',
        '[role="navigation"]', '[role="banner"]', '[role="complementary"]'
      ];

      removeSelectors.forEach(selector => {
        try {
          clone.querySelectorAll(selector).forEach(el => el.remove());
        } catch (e) {}
      });

      // Find main content area
      const mainSelectors = [
        'article', 'main', '[role="main"]', '[role="article"]',
        '.article', '.post', '.entry', '.content', '.story'
      ];

      let mainContent = null;
      for (const selector of mainSelectors) {
        const el = clone.querySelector(selector);
        if (el && el.textContent.trim().length > 200) {
          mainContent = el;
          break;
        }
      }

      const targetElement = mainContent || clone;

      // Clean up attributes
      targetElement.querySelectorAll('*').forEach(el => {
        el.removeAttribute('style');
        el.removeAttribute('class');
        el.removeAttribute('id');
        el.removeAttribute('onclick');
        el.removeAttribute('onload');
      });

      return {
        content: targetElement.innerHTML,
        title: document.title
      };
    }
  });

  return result?.result || { content: '', title: pageInfo.title };
}
