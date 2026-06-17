// JS for NotebookLM Folder Extension Popup

document.addEventListener('DOMContentLoaded', () => {
  updateStats();
  setupBackupRestore();
});

// Update stats from chrome.storage.local
function updateStats() {
  chrome.storage.local.get(['customFolders', 'notebookFolderMap'], (result) => {
    const customFolders = result.customFolders || [];
    const notebookFolderMap = result.notebookFolderMap || {};

    document.getElementById('stat-folders').textContent = customFolders.length;
    document.getElementById('stat-notebooks').textContent = Object.keys(notebookFolderMap).length;
  });
}

// Setup export/import listeners
function setupBackupRestore() {
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const fileInput = document.getElementById('file-input');

  // Export Data
  exportBtn.addEventListener('click', () => {
    chrome.storage.local.get(['customFolders', 'notebookFolderMap'], (result) => {
      const customFolders = result.customFolders || [];
      const notebookFolderMap = result.notebookFolderMap || {};

      const backupData = {
        version: '1.0.0',
        customFolders,
        notebookFolderMap
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `notebooklm-folders-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    });
  });

  // Import Data Trigger
  importBtn.addEventListener('click', () => {
    fileInput.click();
  });

  // Handle File Selection
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        if (!data.customFolders || !Array.isArray(data.customFolders)) {
          alert('Invalid backup file: customFolders is missing or invalid.');
          return;
        }

        if (!data.notebookFolderMap || typeof data.notebookFolderMap !== 'object') {
          alert('Invalid backup file: notebookFolderMap is missing or invalid.');
          return;
        }

        // Save to storage
        chrome.storage.local.set({
          customFolders: data.customFolders,
          notebookFolderMap: data.notebookFolderMap
        }, () => {
          alert('Backup imported successfully! Reloading NotebookLM tabs...');
          updateStats();
          reloadNotebookLMTabs();
        });

      } catch (err) {
        alert('Failed to parse backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

// Reload all active NotebookLM tabs to apply changes
function reloadNotebookLMTabs() {
  chrome.tabs.query({ url: '*://notebooklm.google.com/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      tabs.forEach(tab => {
        chrome.tabs.reload(tab.id);
      });
    }
  });
}
