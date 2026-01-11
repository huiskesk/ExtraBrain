// ExtraBrain Web Clipper - Content Script
// This script runs on web pages to enable clipping functionality
// Uses Mozilla Readability for intelligent article extraction

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getSelection':
      const selection = window.getSelection().toString().trim();
      sendResponse({
        selection,
        html: getSelectionHtml()
      });
      break;

    case 'getArticle':
      const article = extractArticleWithReadability();
      sendResponse(article);
      break;

    case 'getSimplifiedPage':
      const simplified = extractSimplifiedPage();
      sendResponse(simplified);
      break;

    case 'getFullPage':
      sendResponse({
        content: document.body.innerHTML,
        title: document.title
      });
      break;

    case 'getPageInfo':
      sendResponse({
        title: document.title,
        url: window.location.href,
        description: document.querySelector('meta[name="description"]')?.content || '',
        image: document.querySelector('meta[property="og:image"]')?.content || '',
        author: getAuthor(),
        publishedDate: getPublishedDate()
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

// Get selected text as HTML
function getSelectionHtml() {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) return '';

  const container = document.createElement('div');
  for (let i = 0; i < selection.rangeCount; i++) {
    container.appendChild(selection.getRangeAt(i).cloneContents());
  }
  return container.innerHTML;
}

// Extract article using Mozilla Readability
function extractArticleWithReadability() {
  try {
    // Check if Readability is available
    if (typeof Readability === 'undefined') {
      console.warn('Readability not loaded, falling back to simple extraction');
      return {
        title: document.title,
        content: extractSimplifiedPage().content,
        textContent: document.body.textContent,
        excerpt: getExcerpt(),
        byline: getAuthor(),
        success: false
      };
    }

    // Clone the document to avoid modifying the original
    const documentClone = document.cloneNode(true);

    // Create Readability instance and parse
    const reader = new Readability(documentClone, {
      charThreshold: 100,
      classesToPreserve: ['highlight', 'code', 'pre']
    });

    const article = reader.parse();

    if (article && article.content) {
      return {
        title: article.title || document.title,
        content: article.content,
        textContent: article.textContent,
        excerpt: article.excerpt || getExcerpt(),
        byline: article.byline || getAuthor(),
        siteName: article.siteName,
        length: article.length,
        success: true
      };
    }

    // Fallback if Readability couldn't parse
    console.warn('Readability returned no content, falling back');
    return {
      title: document.title,
      content: extractSimplifiedPage().content,
      textContent: document.body.textContent,
      excerpt: getExcerpt(),
      byline: getAuthor(),
      success: false
    };

  } catch (error) {
    console.error('Readability extraction failed:', error);
    return {
      title: document.title,
      content: extractSimplifiedPage().content,
      textContent: document.body.textContent,
      excerpt: getExcerpt(),
      byline: getAuthor(),
      success: false,
      error: error.message
    };
  }
}

// Simplified page extraction (fallback and for "Simplified" mode)
function extractSimplifiedPage() {
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
    '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
    '[aria-hidden="true"]', '[data-ad]', '[data-advertisement]'
  ];

  removeSelectors.forEach(selector => {
    try {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    } catch (e) {}
  });

  // Find the main content area
  const mainSelectors = [
    'article', 'main', '[role="main"]', '[role="article"]',
    '.article', '.post', '.entry', '.content', '.story',
    '#article', '#post', '#content', '#main'
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

  // Clean up the content
  targetElement.querySelectorAll('*').forEach(el => {
    // Remove style attributes
    el.removeAttribute('style');
    el.removeAttribute('onclick');
    el.removeAttribute('onload');

    // Keep useful classes, remove others
    const className = el.className;
    if (typeof className === 'string' && !className.includes('highlight') && !className.includes('code')) {
      el.removeAttribute('class');
    }
    el.removeAttribute('id');
  });

  // Remove empty elements (except images)
  targetElement.querySelectorAll('div, span, p').forEach(el => {
    if (!el.textContent.trim() && !el.querySelector('img, video, audio')) {
      el.remove();
    }
  });

  return {
    content: targetElement.innerHTML,
    title: document.title
  };
}

// Get page excerpt from meta tags
function getExcerpt() {
  return document.querySelector('meta[name="description"]')?.content ||
         document.querySelector('meta[property="og:description"]')?.content ||
         document.querySelector('meta[name="twitter:description"]')?.content ||
         '';
}

// Get author from meta tags or common patterns
function getAuthor() {
  // Try meta tags first
  const authorMeta =
    document.querySelector('meta[name="author"]')?.content ||
    document.querySelector('meta[property="article:author"]')?.content ||
    document.querySelector('meta[name="twitter:creator"]')?.content;

  if (authorMeta) return authorMeta;

  // Try common author patterns in the page
  const authorSelectors = [
    '[rel="author"]', '.author', '.byline', '.writer',
    '[itemprop="author"]', '.post-author', '.article-author'
  ];

  for (const selector of authorSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.textContent.trim();
      if (text.length > 0 && text.length < 100) {
        return text.replace(/^by\s+/i, '');
      }
    }
  }

  return '';
}

// Get published date from meta tags
function getPublishedDate() {
  return document.querySelector('meta[property="article:published_time"]')?.content ||
         document.querySelector('meta[name="date"]')?.content ||
         document.querySelector('time[datetime]')?.getAttribute('datetime') ||
         '';
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

  // Clone and clean the selected element
  const clone = e.target.cloneNode(true);
  clone.querySelectorAll('script, style').forEach(el => el.remove());

  const content = clone.innerHTML;

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

// Log that content script is loaded
console.log('ExtraBrain Web Clipper content script loaded');
