// Content script for NotebookLM Folders Extension

let customFolders = [];
let notebookFolderMap = {};
let activeFolderId = 'all';

// Preset lists for beautiful folder creation
const PRESET_EMOJIS = ['📁', '📂', '📈', '📊', '📐', '🧠', '🤖', '🎓', '🔬', '📝', '🎬', '💻', '🚀', '💼', '⚖️', '📜', '📔', '🌿', '💡', '📌'];
const PRESET_COLORS = ['#1a73e8', '#34a853', '#fbbc05', '#ea4335', '#a142f4', '#00bac4', '#ff6d00', '#70757a'];

// Initialize extension
async function init() {
  await loadData();
  initStorageListener();
  initObserver();
}

// Load data from chrome.storage.local
async function loadData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customFolders', 'notebookFolderMap', 'activeFolderId'], (result) => {
      customFolders = result.customFolders || [];
      notebookFolderMap = result.notebookFolderMap || {};
      activeFolderId = result.activeFolderId || 'all';
      resolve();
    });
  });
}

// Save data to chrome.storage.local
function saveData() {
  chrome.storage.local.set({
    customFolders,
    notebookFolderMap,
    activeFolderId
  });
}

// Sync changes across other tabs
function initStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      let changed = false;
      if (changes.customFolders) {
        customFolders = changes.customFolders.newValue || [];
        changed = true;
      }
      if (changes.notebookFolderMap) {
        notebookFolderMap = changes.notebookFolderMap.newValue || {};
        changed = true;
      }
      if (changes.activeFolderId) {
        activeFolderId = changes.activeFolderId.newValue || 'all';
        changed = true;
      }
      if (changed) {
        renderSidebar();
        injectFolderTags();
        applyFiltering();
      }
    }
  });
}

// Helper to execute DOM mutations safely without triggering infinite observer loops
function runSafeDOMMutation(fn) {
  if (observer) observer.disconnect();
  try {
    fn();
  } catch (err) {
    console.error('Error during DOM mutation:', err);
  } finally {
    if (observer) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }
}

// MutationObserver to detect when the dashboard loads or changes
let observer = null;
function initObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    const welcomeContainer = document.querySelector('.welcome-page-container');
    if (welcomeContainer) {
      runSafeDOMMutation(() => {
        setupDashboardLayout(welcomeContainer);
        injectFolderTags();
        applyFiltering();
      });
    } else {
      // Hide sidebar if we navigate away from the dashboard (e.g. inside a notebook)
      const sidebar = document.getElementById('nlmf-sidebar');
      if (sidebar && sidebar.style.display !== 'none') {
        runSafeDOMMutation(() => {
          sidebar.style.display = 'none';
        });
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Wrap dashboard contents and insert sidebar
function setupDashboardLayout(container) {
  let sidebar = document.getElementById('nlmf-sidebar');

  if (!sidebar) {
    sidebar = document.createElement('div');
    sidebar.className = 'nlmf-sidebar';
    sidebar.id = 'nlmf-sidebar';
    document.body.appendChild(sidebar);
    renderSidebar();
  }

  // Ensure sidebar is visible
  if (sidebar.style.display === 'none') {
    sidebar.style.display = 'flex';
  }

  // Shift welcome container content to the right to clear space for the fixed sidebar
  if (container.style.paddingLeft !== '290px') {
    container.style.setProperty('padding-left', '290px', 'important');
  }

  updateFolderCounts();
}

// Helper to extract notebook title from row
function getNotebookTitle(row) {
  const titleEl = row.querySelector('.project-table-title');
  if (!titleEl) return '';
  return titleEl.getAttribute('title') || titleEl.textContent.replace(titleEl.querySelector('.project-table-emoji')?.textContent || '', '').trim();
}

// Render/Update the sidebar
function renderSidebar() {
  const sidebar = document.getElementById('nlmf-sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div class="nlmf-sidebar-header">
      <h3 class="nlmf-sidebar-title">Folders</h3>
      <button class="nlmf-add-folder-btn" title="Create New Folder">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </button>
    </div>
    <div class="nlmf-folder-list">
      <div class="nlmf-folder-item ${activeFolderId === 'all' ? 'active' : ''}" data-id="all" role="button" tabindex="0">
        <span class="nlmf-folder-emoji">📁</span>
        <span class="nlmf-folder-name">All Notebooks</span>
        <span class="nlmf-folder-count">0</span>
      </div>
      <div class="nlmf-folder-item ${activeFolderId === 'uncategorized' ? 'active' : ''}" data-id="uncategorized" role="button" tabindex="0">
        <span class="nlmf-folder-emoji">📥</span>
        <span class="nlmf-folder-name">Uncategorized</span>
        <span class="nlmf-folder-count">0</span>
      </div>
      <div class="nlmf-dropdown-divider"></div>
      ${customFolders.map(folder => `
        <div class="nlmf-folder-item ${activeFolderId === folder.id ? 'active' : ''}" data-id="${folder.id}" style="border-left: 3px solid ${folder.color || 'transparent'}" role="button" tabindex="0">
          <span class="nlmf-folder-emoji">${folder.emoji || '📁'}</span>
          <span class="nlmf-folder-name">${folder.name}</span>
          <span class="nlmf-folder-count">0</span>
          <div class="nlmf-folder-actions">
            <button class="nlmf-folder-action-btn edit-folder" title="Rename Folder">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="nlmf-folder-action-btn delete-folder" title="Delete Folder">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Attach event listeners to sidebar items
  sidebar.querySelectorAll('.nlmf-folder-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Prevent active switch if user clicked action buttons
      if (e.target.closest('.nlmf-folder-action-btn')) return;
      
      activeFolderId = item.dataset.id;
      saveData();
      
      sidebar.querySelectorAll('.nlmf-folder-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      applyFiltering();
    });
  });

  // Attach actions for edit/delete
  sidebar.querySelectorAll('.edit-folder').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderItem = btn.closest('.nlmf-folder-item');
      if (!folderItem) return; // Guard: element may be detached
      const folderId = folderItem.dataset.id;
      const folder = customFolders.find(f => f.id === folderId);
      if (folder) showFolderModal(folder);
    });
  });

  sidebar.querySelectorAll('.delete-folder').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderItem = btn.closest('.nlmf-folder-item');
      if (!folderItem) return; // Guard: element may be detached
      const folderId = folderItem.dataset.id;
      const folder = customFolders.find(f => f.id === folderId);
      if (folder && confirm(`Are you sure you want to delete the folder "${folder.name}"? The notebooks inside will not be deleted.`)) {
        deleteFolder(folderId);
      }
    });
  });

  sidebar.querySelector('.nlmf-add-folder-btn').addEventListener('click', () => {
    showFolderModal();
  });

  updateFolderCounts();
}

// Delete a folder
function deleteFolder(id) {
  customFolders = customFolders.filter(f => f.id !== id);
  // Re-assign notebooks to uncategorized
  Object.keys(notebookFolderMap).forEach(key => {
    if (notebookFolderMap[key] === id) {
      delete notebookFolderMap[key];
    }
  });
  if (activeFolderId === id) {
    activeFolderId = 'all';
  }
  saveData();
  renderSidebar();
  injectFolderTags();
  applyFiltering();
}

// Calculate and update folder badge counts
function updateFolderCounts() {
  const tableRows = document.querySelectorAll('tr.mat-mdc-row');
  const cardLinks = document.querySelectorAll('a.primary-action-button');
  
  const counts = {
    all: 0,
    uncategorized: 0
  };
  customFolders.forEach(f => counts[f.id] = 0);

  if (tableRows.length > 0) {
    counts.all = tableRows.length;
    tableRows.forEach(row => {
      const title = getNotebookTitle(row);
      if (!title) return;
      const folderId = notebookFolderMap[title];
      if (folderId && counts[folderId] !== undefined) {
        counts[folderId]++;
      } else {
        counts['uncategorized']++;
      }
    });
  } else if (cardLinks.length > 0) {
    counts.all = cardLinks.length;
    cardLinks.forEach(cardLink => {
      const href = cardLink.getAttribute('href');
      if (!href || !href.startsWith('/notebook/')) return;
      const id = href.split('/').pop();
      const titleEl = document.getElementById(`project-${id}-title`);
      if (!titleEl) return;
      
      const title = titleEl.textContent.trim();
      const folderId = notebookFolderMap[title];
      if (folderId && counts[folderId] !== undefined) {
        counts[folderId]++;
      } else {
        counts['uncategorized']++;
      }
    });
  }

  const sidebar = document.getElementById('nlmf-sidebar');
  if (!sidebar) return;

  sidebar.querySelectorAll('.nlmf-folder-item').forEach(item => {
    const id = item.dataset.id;
    const countEl = item.querySelector('.nlmf-folder-count');
    if (countEl && counts[id] !== undefined) {
      countEl.textContent = counts[id];
    }
  });
}

// Inject folder selection tags into rows (Table View) and cards (Grid View)
function injectFolderTags() {
  // 1. Table View
  const tableRows = document.querySelectorAll('tr.mat-mdc-row');
  tableRows.forEach(row => {
    const title = getNotebookTitle(row);
    if (!title) return;

    const folderId = notebookFolderMap[title];
    const folder = customFolders.find(f => f.id === folderId);

    let tagContainer = row.querySelector('.nlmf-notebook-tag-container');
    if (!tagContainer) {
      tagContainer = document.createElement('div');
      tagContainer.className = 'nlmf-notebook-tag-container';
      
      const titleCell = row.querySelector('.title-column');
      if (titleCell) {
        titleCell.appendChild(tagContainer);
      }
    }

    renderTagPill(tagContainer, folder, title);
  });

  // 2. Grid View
  const cardLinks = document.querySelectorAll('a.primary-action-button');
  cardLinks.forEach(cardLink => {
    const href = cardLink.getAttribute('href');
    if (!href || !href.startsWith('/notebook/')) return;

    const id = href.split('/').pop();
    const titleEl = document.getElementById(`project-${id}-title`);
    if (!titleEl) return;

    const title = titleEl.textContent.trim();
    const folderId = notebookFolderMap[title];
    const folder = customFolders.find(f => f.id === folderId);

    const cardContainer = cardLink.parentElement;
    let tagContainer = cardContainer.querySelector('.nlmf-notebook-tag-container');
    if (!tagContainer) {
      tagContainer = document.createElement('div');
      tagContainer.className = 'nlmf-notebook-tag-container';
      // Insert tag pill right after the title element in the card DOM
      titleEl.parentNode.insertBefore(tagContainer, titleEl.nextSibling);
    }

    renderTagPill(tagContainer, folder, title);
  });
}

// Helper to render tag pill and bind events
function renderTagPill(container, folder, title) {
  if (folder) {
    container.innerHTML = `
      <span class="nlmf-notebook-tag" style="border-color: ${folder.color}33; background: ${folder.color}11; color: ${folder.color}">
        <span>${folder.emoji || '📁'}</span>
        <span>${folder.name}</span>
        <span>▾</span>
      </span>
    `;
  } else {
    container.innerHTML = `
      <span class="nlmf-notebook-tag unassigned">
        <span>+ Folder</span>
      </span>
    `;
  }

  const tag = container.querySelector('.nlmf-notebook-tag');
  tag.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent opening the notebook URL!
    openFolderDropdown(tag, title);
  });
}

// Open folder selection dropdown
let activeDropdown = null;
function openFolderDropdown(targetTag, notebookTitle) {
  if (activeDropdown) activeDropdown.remove();

  const dropdown = document.createElement('div');
  dropdown.className = 'nlmf-dropdown';

  const currentFolderId = notebookFolderMap[notebookTitle] || 'uncategorized';

  dropdown.innerHTML = `
    <button class="nlmf-dropdown-item ${currentFolderId === 'uncategorized' ? 'active' : ''}" data-id="uncategorized">
      <span class="nlmf-folder-emoji">📥</span> Uncategorized
    </button>
    ${customFolders.length > 0 ? '<div class="nlmf-dropdown-divider"></div>' : ''}
    ${customFolders.map(folder => `
      <button class="nlmf-dropdown-item ${currentFolderId === folder.id ? 'active' : ''}" data-id="${folder.id}">
        <span class="nlmf-folder-emoji">${folder.emoji || '📁'}</span> ${folder.name}
      </button>
    `).join('')}
  `;

  const rect = targetTag.getBoundingClientRect();
  dropdown.style.position = 'absolute';
  dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
  dropdown.style.left = `${rect.left + window.scrollX}px`;

  document.body.appendChild(dropdown);
  activeDropdown = dropdown;

  dropdown.querySelectorAll('.nlmf-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const folderId = item.dataset.id;
      if (folderId === 'uncategorized') {
        delete notebookFolderMap[notebookTitle];
      } else {
        notebookFolderMap[notebookTitle] = folderId;
      }
      saveData();
      dropdown.remove();
      activeDropdown = null;
      
      injectFolderTags();
      updateFolderCounts();
      applyFiltering();
    });
  });

  setTimeout(() => {
    const closeListener = (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.remove();
        activeDropdown = null;
        document.removeEventListener('click', closeListener);
      }
    };
    document.addEventListener('click', closeListener);
  }, 0);
}

// Filter notebook elements based on selected folder
function applyFiltering() {
  // 1. Table rows
  const tableRows = document.querySelectorAll('tr.mat-mdc-row');
  tableRows.forEach(row => {
    const title = getNotebookTitle(row);
    if (!title) return;
    const folderId = notebookFolderMap[title];
    toggleElementVisibility(row, folderId);
  });

  // 2. Grid cards
  const cardLinks = document.querySelectorAll('a.primary-action-button');
  cardLinks.forEach(cardLink => {
    const href = cardLink.getAttribute('href');
    if (!href || !href.startsWith('/notebook/')) return;
    
    const id = href.split('/').pop();
    const titleEl = document.getElementById(`project-${id}-title`);
    if (!titleEl) return;

    const title = titleEl.textContent.trim();
    const folderId = notebookFolderMap[title];
    const cardContainer = cardLink.parentElement;
    
    toggleElementVisibility(cardContainer, folderId);
  });
}

function toggleElementVisibility(element, folderId) {
  if (activeFolderId === 'all') {
    element.classList.remove('nlmf-hidden');
  } else if (activeFolderId === 'uncategorized') {
    if (!folderId) {
      element.classList.remove('nlmf-hidden');
    } else {
      element.classList.add('nlmf-hidden');
    }
  } else {
    if (folderId === activeFolderId) {
      element.classList.remove('nlmf-hidden');
    } else {
      element.classList.add('nlmf-hidden');
    }
  }
}

// Show custom popup modal for create/edit folder
function showFolderModal(existingFolder = null) {
  const isEdit = !!existingFolder;
  const modalId = 'nlmf-folder-modal';

  // Remove existing modal if any
  const oldModal = document.getElementById(modalId);
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.className = 'nlmf-modal-overlay';
  modal.id = modalId;

  const currentEmoji = isEdit ? existingFolder.emoji : '📁';
  const currentName = isEdit ? existingFolder.name : '';
  const currentColor = isEdit ? existingFolder.color : PRESET_COLORS[0];

  modal.innerHTML = `
    <div class="nlmf-modal-card">
      <h3 class="nlmf-modal-header">${isEdit ? 'Edit Folder' : 'Create Folder'}</h3>
      <div class="nlmf-modal-body">
        <div class="nlmf-modal-field">
          <label class="nlmf-modal-label">Name & Icon</label>
          <div class="nlmf-modal-input-row">
            <div class="nlmf-modal-emoji-input" id="nlmf-emoji-btn">${currentEmoji}</div>
            <input type="text" class="nlmf-modal-text-input" id="nlmf-name-input" placeholder="e.g. Psychology 101" value="${currentName}" autocomplete="off" />
          </div>
        </div>
        <div class="nlmf-modal-field">
          <label class="nlmf-modal-label">Folder Color</label>
          <div class="nlmf-color-presets">
            ${PRESET_COLORS.map(color => `
              <div class="nlmf-color-dot ${color === currentColor ? 'selected' : ''}" style="background: ${color}" data-color="${color}"></div>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="nlmf-modal-footer">
        <button class="nlmf-modal-btn nlmf-modal-btn-secondary" id="nlmf-cancel-btn">Cancel</button>
        <button class="nlmf-modal-btn nlmf-modal-btn-primary" id="nlmf-save-btn">${isEdit ? 'Save' : 'Create'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Focus input
  const nameInput = document.getElementById('nlmf-name-input');
  nameInput.focus();

  // Color selection
  let selectedColor = currentColor;
  modal.querySelectorAll('.nlmf-color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      modal.querySelectorAll('.nlmf-color-dot').forEach(el => el.classList.remove('selected'));
      dot.classList.add('selected');
      selectedColor = dot.dataset.color;
    });
  });

  // Emoji picker popup trigger
  let selectedEmoji = currentEmoji;
  const emojiBtn = document.getElementById('nlmf-emoji-btn');
  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEmojiPicker(emojiBtn, (emoji) => {
      selectedEmoji = emoji;
      emojiBtn.textContent = emoji;
    });
  });

  // Button actions
  const saveBtn = document.getElementById('nlmf-save-btn');
  const cancelBtn = document.getElementById('nlmf-cancel-btn');

  const handleSave = () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.style.borderColor = '#ea4335';
      return;
    }

    if (isEdit) {
      // Edit
      existingFolder.name = name;
      existingFolder.emoji = selectedEmoji;
      existingFolder.color = selectedColor;
    } else {
      // Add new
      const newFolder = {
        id: 'folder_' + Date.now(),
        name,
        emoji: selectedEmoji,
        color: selectedColor
      };
      customFolders.push(newFolder);
    }

    saveData();
    modal.remove();
    renderSidebar();
    injectFolderTags();
    applyFiltering();
  };

  saveBtn.addEventListener('click', handleSave);
  cancelBtn.addEventListener('click', () => modal.remove());

  // Handle keyboard events (Enter to save, Esc to cancel)
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      modal.remove();
    }
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Inline emoji picker
function openEmojiPicker(targetBtn, onSelect) {
  const pickerId = 'nlmf-emoji-picker';
  const oldPicker = document.getElementById(pickerId);
  if (oldPicker) oldPicker.remove();

  const picker = document.createElement('div');
  picker.className = 'nlmf-emoji-picker-popover';
  picker.id = pickerId;

  picker.innerHTML = PRESET_EMOJIS.map(emoji => `
    <div class="nlmf-emoji-picker-item">${emoji}</div>
  `).join('');

  // Position relative to target
  const rect = targetBtn.getBoundingClientRect();
  picker.style.position = 'absolute';
  picker.style.top = `${rect.bottom + window.scrollY + 4}px`;
  picker.style.left = `${rect.left + window.scrollX}px`;

  document.body.appendChild(picker);

  picker.querySelectorAll('.nlmf-emoji-picker-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(item.textContent);
      picker.remove();
    });
  });

  // Click outside to close picker
  setTimeout(() => {
    const closePickerListener = (e) => {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('click', closePickerListener);
      }
    };
    document.addEventListener('click', closePickerListener);
  }, 0);
}

// Start
init();
