// ExtraBrain Web Clipper Popup
// Uses Readability for article extraction - saves clean HTML directly

const API_URL = 'http://localhost:3847'; // Local API endpoint
const EXTENSION_TOKEN = 'extrabrain-extension-token';
const AUTH_HEADER = { Authorization: `Bearer ${EXTENSION_TOKEN}` };

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
  try {
    await chrome.runtime.sendMessage({ action: 'syncPendingClips' });
  } catch (error) {
    console.debug('ExtraBrain syncPendingClips skipped:', error);
  }

  // Setup clip button
  document.getElementById('clip-btn').addEventListener('click', handleClip);
});

function updateClipTypeUI() {
  const notesField = document.getElementById('notes-field');
  notesField.style.display = 'block';
}

async function loadNotebooks() {
  const stored = await chrome.storage.local.get(['notebooks', 'lastSync']);

  if (stored.notebooks && stored.notebooks.length > 0) {
    notebooks = stored.notebooks;
    updateNotebookSelect();
  }

  try {
    const response = await fetch(`${API_URL}/notebooks`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER }
    });

    if (response.ok) {
      notebooks = await response.json();
      await chrome.storage.local.set({ notebooks, lastSync: Date.now() });
      updateNotebookSelect();
      document.getElementById('main-content').style.display = 'block';
      document.getElementById('setup-content').style.display = 'none';
    }
  } catch (error) {
    if (notebooks.length === 0) {
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

  btn.disabled = true;
  btnText.innerHTML = '<span class="loading"></span>';
  status.innerHTML = '';

  try {
    let content = '';
    let extractedTitle = title;
    let contentType = 'html'; // Default to HTML for web clips

    switch (selectedClipType) {
      case 'article':
        const articleResult = await getArticleContent();
        content = articleResult.content;
        if (articleResult.title && articleResult.title !== document.title) {
          extractedTitle = articleResult.title;
          document.getElementById('clip-title').value = extractedTitle;
        }
        // Add byline/author if available
        if (articleResult.byline) {
          content = `<p class="article-byline">${articleResult.byline}</p>` + content;
        }
        break;
      case 'selection':
        content = await getSelectedContent();
        break;
      case 'full':
        content = await getSimplifiedContent();
        break;
      case 'url':
        content = `<p><a href="${pageInfo.url}">${pageInfo.title}</a></p>`;
        break;
    }

    // Add user notes at the top if provided
    if (notes) {
      content = `<blockquote class="user-notes"><strong>My Notes:</strong> ${notes}</blockquote><hr/>` + content;
    }

    // Add source footer
    if (selectedClipType !== 'url') {
      content += `<hr/><p class="source-link"><small>Source: <a href="${pageInfo.url}">${pageInfo.title}</a></small></p>`;
    }

    const clip = {
      id: `clip_${Date.now()}`,
      notebookId,
      title: extractedTitle,
      content,
      sourceUrl: pageInfo.url,
      createdAt: new Date().toISOString(),
      synced: false
    };

    try {
      const response = await fetch(`${API_URL}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
        body: JSON.stringify({
          notebook_id: notebookId,
          title: extractedTitle,
          content,
          content_type: contentType,
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
      const pending = await chrome.storage.local.get('pendingClips') || { pendingClips: [] };
      pending.pendingClips = pending.pendingClips || [];
      pending.pendingClips.push(clip);
      await chrome.storage.local.set(pending);
      showStatus('Saved locally. Will sync when app is open.', 'info');
    }

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

// Get article content using Readability - returns clean HTML
async function getArticleContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    // Inject Readability library
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/Readability.js']
    });

    // Extract article using Readability
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (baseUrl) => {
        try {
          if (typeof Readability === 'undefined') {
            return { success: false, content: document.body.innerHTML, title: document.title };
          }

          const documentClone = document.cloneNode(true);

          // Fix relative URLs before parsing
          documentClone.querySelectorAll('img[src]').forEach(img => {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('http') && !src.startsWith('data:')) {
              try {
                img.setAttribute('src', new URL(src, baseUrl).href);
              } catch (e) {}
            }
          });

          documentClone.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('#')) {
              try {
                a.setAttribute('href', new URL(href, baseUrl).href);
              } catch (e) {}
            }
          });

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
      },
      args: [pageInfo.url]
    });

    if (result?.result?.success) {
      return result.result;
    }

    return await getSimplifiedContent();

  } catch (error) {
    console.error('Article extraction failed:', error);
    return {
      content: `<p>Could not extract article content from this page.</p><p><a href="${pageInfo.url}">View original</a></p>`,
      title: pageInfo.title
    };
  }
}

// Get selected text content as HTML
async function getSelectedContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (baseUrl) => {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return { text: '', html: '' };

      const text = selection.toString().trim();
      const container = document.createElement('div');
      for (let i = 0; i < selection.rangeCount; i++) {
        container.appendChild(selection.getRangeAt(i).cloneContents());
      }

      // Fix relative URLs
      container.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
          try {
            img.setAttribute('src', new URL(src, baseUrl).href);
          } catch (e) {}
        }
      });

      container.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('mailto:')) {
          try {
            a.setAttribute('href', new URL(href, baseUrl).href);
          } catch (e) {}
        }
      });

      return { text, html: container.innerHTML };
    },
    args: [pageInfo.url]
  });

  const { text, html } = result?.result || { text: '', html: '' };

  if (!text) {
    return '<p>No text selected. Please select text on the page and try again.</p>';
  }

  return html || `<blockquote>${text}</blockquote>`;
}

// Get simplified page content as clean HTML
async function getSimplifiedContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (baseUrl) => {
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

      // Fix relative URLs
      targetElement.querySelectorAll('img[src]').forEach(img => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
          try {
            img.setAttribute('src', new URL(src, baseUrl).href);
          } catch (e) {}
        }
      });

      targetElement.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('mailto:')) {
          try {
            a.setAttribute('href', new URL(href, baseUrl).href);
          } catch (e) {}
        }
      });

      // Clean up unwanted attributes but keep essential ones
      targetElement.querySelectorAll('*').forEach(el => {
        el.removeAttribute('onclick');
        el.removeAttribute('onload');
        el.removeAttribute('onerror');
        // Remove inline styles except for images that might need them
        if (el.tagName !== 'IMG') {
          el.removeAttribute('style');
        }
        el.removeAttribute('class');
        el.removeAttribute('id');
      });

      return {
        content: targetElement.innerHTML,
        title: document.title
      };
    },
    args: [pageInfo.url]
  });

  return result?.result?.content || '';
}
