// ExtraBrain Web Clipper - Content Script
// This script runs on web pages to enable clipping functionality

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getSelection':
      sendResponse({ selection: window.getSelection().toString() });
      break;

    case 'getArticle':
      sendResponse({ content: extractArticle() });
      break;

    case 'getFullPage':
      sendResponse({ content: document.body.innerHTML });
      break;

    case 'getPageInfo':
      sendResponse({
        title: document.title,
        url: window.location.href,
        description: document.querySelector('meta[name="description"]')?.content || '',
        image: document.querySelector('meta[property="og:image"]')?.content || ''
      });
      break;

    case 'showClipOverlay':
      showClipOverlay();
      sendResponse({ success: true });
      break;

    case 'hideClipOverlay':
      hideClipOverlay();
      sendResponse({ success: true });
      break;
  }

  return true; // Keep the message channel open for async responses
});

// Extract article content using various heuristics
function extractArticle() {
  // Priority list of selectors for article content
  const selectors = [
    'article',
    '[role="article"]',
    '[itemprop="articleBody"]',
    '.post-content',
    '.article-content',
    '.article-body',
    '.entry-content',
    '.content-body',
    '.story-body',
    '#article-body',
    'main article',
    'main',
    '.main-content',
    '#main-content',
    '.post',
    '.blog-post'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim().length > 200) {
      return cleanContent(element);
    }
  }

  // Fallback: try to find the largest text container
  const containers = document.querySelectorAll('div, section');
  let bestContainer = null;
  let maxTextLength = 0;

  containers.forEach(container => {
    const text = container.textContent.trim();
    const paragraphs = container.querySelectorAll('p');

    if (paragraphs.length >= 2 && text.length > maxTextLength) {
      maxTextLength = text.length;
      bestContainer = container;
    }
  });

  if (bestContainer) {
    return cleanContent(bestContainer);
  }

  // Last resort: return body content
  return cleanContent(document.body);
}

// Clean extracted content
function cleanContent(element) {
  const clone = element.cloneNode(true);

  // Remove unwanted elements
  const removeSelectors = [
    'script',
    'style',
    'noscript',
    'iframe',
    'nav',
    'header',
    'footer',
    'aside',
    '.nav',
    '.navigation',
    '.menu',
    '.sidebar',
    '.ad',
    '.ads',
    '.advertisement',
    '.social-share',
    '.share-buttons',
    '.comments',
    '.comment-section',
    '.related-posts',
    '.recommended',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '[aria-hidden="true"]'
  ];

  removeSelectors.forEach(selector => {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  });

  // Remove empty elements
  clone.querySelectorAll('*').forEach(el => {
    if (!el.textContent.trim() && !el.querySelector('img')) {
      el.remove();
    }
  });

  // Remove inline styles and classes that might break rendering
  clone.querySelectorAll('*').forEach(el => {
    el.removeAttribute('style');
    el.removeAttribute('class');
    el.removeAttribute('id');
  });

  return clone.innerHTML;
}

// Visual overlay for clip mode
let overlayElement = null;

function showClipOverlay() {
  if (overlayElement) return;

  overlayElement = document.createElement('div');
  overlayElement.id = 'extrabrain-clip-overlay';
  overlayElement.innerHTML = `
    <div class="extrabrain-overlay-content">
      <div class="extrabrain-overlay-header">
        <span class="extrabrain-logo">EB</span>
        <span>ExtraBrain Clipper</span>
        <button class="extrabrain-close-btn">&times;</button>
      </div>
      <div class="extrabrain-overlay-body">
        <p>Click on any element to clip it, or press Escape to cancel.</p>
      </div>
    </div>
  `;

  document.body.appendChild(overlayElement);

  // Add close button handler
  overlayElement.querySelector('.extrabrain-close-btn').addEventListener('click', hideClipOverlay);

  // Add element highlighting
  document.addEventListener('mouseover', highlightElement);
  document.addEventListener('mouseout', unhighlightElement);
  document.addEventListener('click', clipElement, true);
  document.addEventListener('keydown', handleEscape);
}

function hideClipOverlay() {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }

  document.removeEventListener('mouseover', highlightElement);
  document.removeEventListener('mouseout', unhighlightElement);
  document.removeEventListener('click', clipElement, true);
  document.removeEventListener('keydown', handleEscape);

  // Remove any highlights
  document.querySelectorAll('.extrabrain-highlight').forEach(el => {
    el.classList.remove('extrabrain-highlight');
  });
}

function highlightElement(e) {
  if (e.target === overlayElement || overlayElement?.contains(e.target)) return;

  e.target.classList.add('extrabrain-highlight');
}

function unhighlightElement(e) {
  e.target.classList.remove('extrabrain-highlight');
}

function clipElement(e) {
  if (e.target === overlayElement || overlayElement?.contains(e.target)) return;

  e.preventDefault();
  e.stopPropagation();

  const content = cleanContent(e.target);

  // Send to background script
  chrome.runtime.sendMessage({
    action: 'clipContent',
    content,
    title: document.title,
    url: window.location.href
  });

  hideClipOverlay();
}

function handleEscape(e) {
  if (e.key === 'Escape') {
    hideClipOverlay();
  }
}

// Inject toast notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `extrabrain-toast extrabrain-toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('extrabrain-toast-show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('extrabrain-toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Export for testing
if (typeof module !== 'undefined') {
  module.exports = { extractArticle, cleanContent };
}
