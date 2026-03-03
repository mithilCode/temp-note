/**
 * TempNotes — A clean, fast note-taking workspace.
 * Fully rewritten for simplicity, stability, and ease of use.
 */

class NoteApp {
  constructor() {
    this.notes = this._load("temp_notes_v3", []);
    this.notebooks = this._load("temp_notebooks", ["My Notes"]);
    this.theme = localStorage.getItem("theme") || "dark";

    this.currentNoteId = null;
    this.currentView = "all";
    this.saveTimeout = null;
    this._pendingConfirm = null;

    this.init();
  }

  /* ─── Helpers ─── */

  _load(key, fallback) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      return Array.isArray(data) ? data : fallback;
    } catch {
      return fallback;
    }
  }

  _save() {
    localStorage.setItem("temp_notes_v3", JSON.stringify(this.notes));
    localStorage.setItem("temp_notebooks", JSON.stringify(this.notebooks));
    localStorage.setItem("theme", this.theme);
  }

  _el(id) {
    return document.getElementById(id);
  }

  _escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /* ─── Init ─── */

  init() {
    this._applyTheme();
    this._attachEvents();
    this.render();
  }

  /* ─── Theme ─── */

  _applyTheme() {
    document.body.setAttribute("data-theme", this.theme);
    const icon = document.querySelector("#theme-toggle i");
    if (icon) {
      icon.className = this.theme === "dark" ? "fas fa-sun" : "fas fa-moon";
    }
  }

  toggleTheme() {
    this.theme = this.theme === "dark" ? "light" : "dark";
    this._applyTheme();
    this._save();
    this.showToast(`Switched to ${this.theme} mode`, "info");
  }

  /* ─── Toast ─── */

  showToast(msg, type = "success") {
    const toast = this._el("toast");
    const msgEl = this._el("toast-message");
    const icon = toast.querySelector("i");

    // Set icon based on type
    const icons = {
      success: "fas fa-check-circle",
      error: "fas fa-exclamation-circle",
      info: "fas fa-info-circle",
    };
    icon.className = icons[type] || icons.success;
    toast.className = `toast toast-${type}`;
    msgEl.textContent = msg;

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2200);
  }

  /* ─── Confirm Modal ─── */

  confirm(title, message, confirmText = "Delete") {
    return new Promise((resolve) => {
      this._el("modal-title").textContent = title;
      this._el("modal-message").textContent = message;
      this._el("modal-confirm").textContent = confirmText;

      const overlay = this._el("modal-overlay");
      overlay.classList.add("show");

      this._pendingConfirm = resolve;
    });
  }

  _handleModalConfirm() {
    this._el("modal-overlay").classList.remove("show");
    if (this._pendingConfirm) {
      this._pendingConfirm(true);
      this._pendingConfirm = null;
    }
  }

  _handleModalCancel() {
    this._el("modal-overlay").classList.remove("show");
    if (this._pendingConfirm) {
      this._pendingConfirm(false);
      this._pendingConfirm = null;
    }
  }

  /* ─── Notes CRUD ─── */

  addNote() {
    const notebook =
      typeof this.currentView === "string" &&
      !["all", "pinned", "archive", "trash"].includes(this.currentView)
        ? this.currentView
        : "My Notes";

    const newNote = {
      id: Date.now(),
      title: "",
      content: "",
      tags: [],
      language: "text",
      pinned: false,
      archived: false,
      trash: false,
      notebook,
      images: [],
      updatedAt: Date.now(),
    };

    this.notes.unshift(newNote);
    this._save();

    // Switch to the notebook view if we're not in a special view
    if (!["all", "pinned", "archive", "trash"].includes(this.currentView)) {
      // Stay in current notebook
    } else {
      this.currentView = "all";
    }

    this.render();
    this.openEditor(newNote.id);
    this.showToast("New note created", "success");
  }

  addNotebook() {
    const name = prompt("Enter notebook name:");
    if (!name || !name.trim()) return;
    const trimmed = name.trim();

    if (this.notebooks.includes(trimmed)) {
      this.showToast("Notebook already exists", "error");
      return;
    }

    this.notebooks.push(trimmed);
    this._save();
    this.setView(trimmed);
    this.showToast(`"${trimmed}" notebook created`, "success");
  }

  async deleteNotebook(name) {
    if (name === "My Notes") {
      this.showToast("Cannot delete default notebook", "error");
      return;
    }

    const count = this.notes.filter((n) => n.notebook === name && !n.trash).length;

    const confirmed = await this.confirm(
      "Delete Notebook",
      `Delete "${name}"? ${count} note(s) will be moved to "My Notes".`,
      "Delete",
    );
    if (!confirmed) return;

    // Move notes to default notebook
    this.notes.forEach((n) => {
      if (n.notebook === name) n.notebook = "My Notes";
    });

    this.notebooks = this.notebooks.filter((nb) => nb !== name);
    this._save();

    if (this.currentView === name) this.currentView = "all";
    this.render();
    this.showToast("Notebook deleted", "success");
  }

  async deleteNote(id) {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;

    if (note.trash) {
      // Permanently delete
      const confirmed = await this.confirm(
        "Delete Forever",
        "This note will be permanently deleted. This cannot be undone.",
        "Delete Forever",
      );
      if (!confirmed) return;

      this.notes = this.notes.filter((n) => n.id !== id);
      if (this.currentNoteId === id) this.closeEditor();
      this._save();
      this.render();
      this.showToast("Note permanently deleted", "success");
    } else {
      note.trash = true;
      note.pinned = false;
      if (this.currentNoteId === id) this.closeEditor();
      this._save();
      this.render();
      this.showToast("Moved to Trash", "info");
    }
  }

  restoreNote(id) {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;
    note.trash = false;
    this._save();
    this.render();
    this.showToast("Note restored", "success");
  }

  togglePin(id) {
    const note = this.notes.find((n) => n.id === id);
    if (!note || note.trash) return;
    note.pinned = !note.pinned;
    this._save();
    this._updateEditorButtons(note);
    this.render();
    this.showToast(note.pinned ? "Pinned" : "Unpinned", "info");
  }

  toggleArchive(id) {
    const note = this.notes.find((n) => n.id === id);
    if (!note || note.trash) return;
    note.archived = !note.archived;
    if (note.archived) note.pinned = false;
    this._save();
    this._updateEditorButtons(note);
    this.render();
    this.showToast(note.archived ? "Archived" : "Unarchived", "info");
  }

  /* ─── Editor ─── */

  openEditor(id) {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;

    this.currentNoteId = id;

    this._el("editor-empty-state").classList.add("hidden");
    const workspace = this._el("editor-workspace");
    workspace.classList.remove("hidden");

    // Load data
    this._el("editor-title").value = note.title;
    this._el("editor-content").value = note.content;
    this._el("editor-tags").value = (note.tags || []).join(", ");
    this._el("editor-language").value = note.language || "text";
    this._el("note-notebook-name").textContent = note.notebook;

    // Update format button state
    this._updateFormatButton(note.language);

    // Update action buttons
    this._updateEditorButtons(note);

    // Image gallery
    this._renderImageGallery(note.images || []);
    this._updateStats();
    this.render(); // Highlight active card

    // Mobile: open editor panel
    this._el("editor-column").classList.add("open");
    this._el("mobile-back-btn").classList.add("show");

    // Focus content
    setTimeout(() => this._el("editor-content").focus(), 100);
  }

  closeEditor() {
    this.currentNoteId = null;
    this._el("editor-empty-state").classList.remove("hidden");
    this._el("editor-workspace").classList.add("hidden");
    this._el("editor-column").classList.remove("open");
    this._el("mobile-back-btn").classList.remove("show");
    this.render();
  }

  _updateEditorButtons(note) {
    const pinBtn = this._el("editor-pin-btn");
    const archiveBtn = this._el("editor-archive-btn");

    if (pinBtn) {
      pinBtn.classList.toggle("active", note.pinned);
    }
    if (archiveBtn) {
      archiveBtn.classList.toggle("active", note.archived);
    }
  }

  _updateFormatButton(language) {
    const btn = this._el("format-btn");
    if (btn) {
      btn.disabled = language === "text";
    }
  }

  saveCurrentNote(silent = false) {
    const note = this.notes.find((n) => n.id === this.currentNoteId);
    if (!note) return;

    note.title = this._el("editor-title").value;
    note.content = this._el("editor-content").value;
    note.tags = this._el("editor-tags")
      .value.split(",")
      .map((t) => t.trim())
      .filter((t) => t);
    note.language = this._el("editor-language").value;
    note.updatedAt = Date.now();

    this._save();
    this.render();

    if (!silent) this.showToast("Saved", "success");
    this._flashSaveStatus();
  }

  _autoSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveCurrentNote(true), 800);
  }

  _flashSaveStatus() {
    const el = this._el("save-status");
    el.classList.add("visible");
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => el.classList.remove("visible"), 2000);
  }

  _updateStats() {
    const content = this._el("editor-content").value;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const chars = content.length;
    this._el("editor-stats").textContent = `Words: ${words} | Chars: ${chars}`;
  }

  /* ─── Code Formatting ─── */

  async formatCode() {
    const note = this.notes.find((n) => n.id === this.currentNoteId);
    if (!note || note.language === "text") return;

    const contentArea = this._el("editor-content");

    try {
      // Map CSS value to postcss parser
      const parser = note.language === "css" ? "css" : note.language;

      const formatted = await prettier.format(contentArea.value, {
        parser: parser,
        plugins: prettierPlugins,
        semi: true,
        singleQuote: true,
        tabWidth: 2,
      });

      contentArea.value = formatted;
      note.content = formatted;
      note.updatedAt = Date.now();
      this._updateStats();
      this._save();
      this.render();
      this.showToast("Code formatted", "success");
    } catch (err) {
      console.error("Format error:", err);
      this.showToast("Format error: " + err.message.split("\n")[0], "error");
    }
  }

  /* ─── Image Handling ─── */

  _handlePaste(e) {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        this._processImage(file);
        break;
      }
    }
  }

  async _processImage(file) {
    const note = this.notes.find((n) => n.id === this.currentNoteId);
    if (!note) return;

    const base64 = await this._compressImage(file);
    if (!note.images) note.images = [];
    note.images.push(base64);
    this._renderImageGallery(note.images);
    this._save();
    this.showToast("Image added", "success");
  }

  _compressImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800;
          let w = img.width;
          let h = img.height;
          if (w > MAX_WIDTH) {
            h *= MAX_WIDTH / w;
            w = MAX_WIDTH;
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  _renderImageGallery(images) {
    const gallery = this._el("editor-image-gallery");
    if (!images.length) {
      gallery.innerHTML = "";
      return;
    }

    gallery.innerHTML = images
      .map(
        (_, idx) => `
      <div class="image-item" data-idx="${idx}">
        <img src="${images[idx]}" alt="Note image ${idx + 1}" loading="lazy" />
        <div class="image-actions">
          <button class="btn-icon" data-action="download-image" data-idx="${idx}" title="Download">
            <i class="fas fa-download"></i>
          </button>
          <button class="btn-icon" data-action="remove-image" data-idx="${idx}" title="Remove">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `,
      )
      .join("");
  }

  _downloadImage(idx) {
    const note = this.notes.find((n) => n.id === this.currentNoteId);
    if (!note || !note.images[idx]) return;

    const a = document.createElement("a");
    a.href = note.images[idx];
    a.download = `note_image_${idx + 1}.jpg`;
    a.click();
  }

  _removeImage(idx) {
    const note = this.notes.find((n) => n.id === this.currentNoteId);
    if (!note) return;
    note.images.splice(idx, 1);
    this._renderImageGallery(note.images);
    this._save();
    this.showToast("Image removed", "info");
  }

  /* ─── Filtering & Rendering ─── */

  _getFilteredNotes() {
    const query = this._el("search-input").value.toLowerCase().trim();

    return this.notes
      .filter((n) => {
        // View filter
        if (this.currentView === "trash") {
          if (!n.trash) return false;
        } else {
          if (n.trash) return false;
          if (this.currentView === "pinned" && !n.pinned) return false;
          if (this.currentView === "archive" && !n.archived) return false;
          if (
            this.currentView !== "all" &&
            this.currentView !== "pinned" &&
            this.currentView !== "archive" &&
            n.notebook !== this.currentView
          )
            return false;
          // In "all" view, don't show archived notes
          if (this.currentView === "all" && n.archived) return false;
        }

        // Search query
        if (!query) return true;
        return (
          n.title.toLowerCase().includes(query) ||
          n.content.toLowerCase().includes(query) ||
          (n.tags || []).some((t) => t.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => {
        // Pinned first, then by date
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }

  _formatDate(timestamp) {
    const d = new Date(timestamp);
    const now = new Date();
    const diff = now - d;

    // Less than 1 minute
    if (diff < 60000) return "Just now";
    // Less than 1 hour
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    // Less than 24 hours
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    // Less than 7 days
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    // Otherwise show date
    const day = String(d.getDate()).padStart(2, "0");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  _getViewTitle() {
    const titles = {
      all: "All Notes",
      pinned: "Pinned",
      archive: "Archive",
      trash: "Trash",
    };
    return titles[this.currentView] || this.currentView;
  }

  render() {
    // 1. Update nav active state
    document.querySelectorAll("#main-nav .nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === this.currentView);
    });

    // 2. Render notebook list
    const notebookList = this._el("notebook-list");
    notebookList.innerHTML = this.notebooks
      .map((nb) => {
        const esc = this._escapeHtml(nb);
        const count = this.notes.filter((n) => n.notebook === nb && !n.trash && !n.archived).length;
        const isDefault = nb === "My Notes";
        return `
        <li class="nav-item notebook-item ${this.currentView === nb ? "active" : ""}" 
            data-view="${esc}" data-notebook="${esc}">
          <i class="fas fa-book"></i>
          <span>${esc}</span>
          ${!isDefault ? `<button class="notebook-delete" data-action="delete-notebook" data-name="${esc}" title="Delete notebook">&times;</button>` : ""}
        </li>
      `;
      })
      .join("");

    // 3. Render view title
    this._el("view-title").textContent = this._getViewTitle();

    // 4. Render note list
    const container = this._el("notes-container");
    const filtered = this._getFilteredNotes();

    if (!filtered.length) {
      const isTrash = this.currentView === "trash";
      const hasSearch = this._el("search-input").value.trim();
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas ${hasSearch ? "fa-search" : isTrash ? "fa-trash" : "fa-sticky-note"}"></i>
          <p>${hasSearch ? "No matching notes" : isTrash ? "Trash is empty" : "No notes yet"}</p>
          <div class="empty-hint">${hasSearch ? "Try a different search term" : isTrash ? "Deleted notes appear here" : 'Click "New Note" to get started'}</div>
        </div>
      `;
    } else {
      container.innerHTML = filtered
        .map((n) => {
          const isActive = this.currentNoteId === n.id;
          const title = this._escapeHtml(n.title || "Untitled Note");
          const excerpt = this._escapeHtml(
            n.content ? n.content.substring(0, 120) : "No additional text",
          );
          const firstTag = n.tags && n.tags.length ? this._escapeHtml(n.tags[0]) : "";

          return `
          <div class="note-card ${isActive ? "active" : ""}" data-id="${n.id}" data-action="open-note">
            <div class="note-card-header">
              <div class="note-card-title">${title}</div>
              ${n.pinned ? '<i class="fas fa-thumbtack note-card-pin"></i>' : ""}
            </div>
            <div class="note-card-excerpt">${excerpt}</div>
            <div class="note-card-footer">
              <span class="note-card-date">${this._formatDate(n.updatedAt)}</span>
              ${firstTag ? `<span class="note-card-tag">${firstTag}</span>` : ""}
              ${
                n.trash
                  ? `<div class="note-card-actions">
                      <button class="btn-restore" data-action="restore" data-id="${n.id}">Restore</button>
                      <button class="btn-permadelete" data-action="permadelete" data-id="${n.id}">Delete</button>
                    </div>`
                  : ""
              }
            </div>
          </div>
        `;
        })
        .join("");
    }
  }

  setView(view) {
    this.currentView = view;
    // Clear search when switching views
    this._el("search-input").value = "";
    this.render();

    // Close sidebar on mobile
    this._closeMobileSidebar();
  }

  /* ─── Mobile ─── */

  _openMobileSidebar() {
    this._el("sidebar").classList.add("open");
    this._el("mobile-overlay").classList.add("show");
  }

  _closeMobileSidebar() {
    this._el("sidebar").classList.remove("open");
    this._el("mobile-overlay").classList.remove("show");
  }

  /* ─── Export / Import ─── */

  exportData() {
    const data = {
      notes: this.notes,
      notebooks: this.notebooks,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tempnotes_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.showToast("Notes exported", "success");
  }

  importData(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);

        // Support both old format (array) and new format (object)
        let imported;
        if (Array.isArray(parsed)) {
          imported = parsed;
        } else if (parsed.notes && Array.isArray(parsed.notes)) {
          imported = parsed.notes;
          // Also import notebooks
          if (Array.isArray(parsed.notebooks)) {
            parsed.notebooks.forEach((nb) => {
              if (!this.notebooks.includes(nb)) {
                this.notebooks.push(nb);
              }
            });
          }
        } else {
          throw new Error("Invalid format");
        }

        // Deduplicate by ID
        const existingIds = new Set(this.notes.map((n) => n.id));
        const newNotes = imported.filter((n) => !existingIds.has(n.id));
        this.notes = [...newNotes, ...this.notes];

        this._save();
        this.render();
        this.showToast(`Imported ${newNotes.length} note(s)`, "success");
      } catch (err) {
        console.error("Import error:", err);
        this.showToast("Import failed: invalid file", "error");
      }
    };
    reader.readAsText(file);
  }

  /* ─── Event Listeners ─── */

  _attachEvents() {
    // New note
    this._el("add-note-btn").addEventListener("click", () => this.addNote());
    this._el("add-notebook-btn").addEventListener("click", () => this.addNotebook());

    // Theme
    this._el("theme-toggle").addEventListener("click", () => this.toggleTheme());

    // Search
    this._el("search-input").addEventListener("input", () => this.render());

    // Main nav — use event delegation
    this._el("main-nav").addEventListener("click", (e) => {
      const item = e.target.closest(".nav-item");
      if (item && item.dataset.view) {
        this.setView(item.dataset.view);
      }
    });

    // Notebook list — event delegation
    this._el("notebook-list").addEventListener("click", (e) => {
      // Delete notebook button
      const delBtn = e.target.closest("[data-action='delete-notebook']");
      if (delBtn) {
        e.stopPropagation();
        this.deleteNotebook(delBtn.dataset.name);
        return;
      }
      // Click notebook
      const item = e.target.closest(".nav-item");
      if (item && item.dataset.notebook) {
        this.setView(item.dataset.notebook);
      }
    });

    // Notes container — event delegation
    this._el("notes-container").addEventListener("click", (e) => {
      // Restore button
      const restoreBtn = e.target.closest("[data-action='restore']");
      if (restoreBtn) {
        e.stopPropagation();
        this.restoreNote(Number(restoreBtn.dataset.id));
        return;
      }
      // Permanent delete button
      const deleteBtn = e.target.closest("[data-action='permadelete']");
      if (deleteBtn) {
        e.stopPropagation();
        this.deleteNote(Number(deleteBtn.dataset.id));
        return;
      }
      // Open note
      const card = e.target.closest("[data-action='open-note']");
      if (card) {
        this.openEditor(Number(card.dataset.id));
      }
    });

    // Image gallery — event delegation
    this._el("editor-image-gallery").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (btn.dataset.action === "download-image") this._downloadImage(idx);
      if (btn.dataset.action === "remove-image") this._removeImage(idx);
    });

    // Editor inputs
    const title = this._el("editor-title");
    const content = this._el("editor-content");
    const tags = this._el("editor-tags");
    const lang = this._el("editor-language");

    title.addEventListener("input", () => this._autoSave());

    content.addEventListener("input", () => {
      this._updateStats();
      this._autoSave();
    });

    content.addEventListener("paste", (e) => this._handlePaste(e));

    tags.addEventListener("input", () => this._autoSave());

    lang.addEventListener("change", () => {
      const note = this.notes.find((n) => n.id === this.currentNoteId);
      if (note) {
        note.language = lang.value;
        this._updateFormatButton(lang.value);
        this._autoSave();
      }
    });

    // Format button
    this._el("format-btn").addEventListener("click", () => this.formatCode());

    // Editor action buttons
    this._el("editor-pin-btn").addEventListener("click", () => this.togglePin(this.currentNoteId));
    this._el("editor-archive-btn").addEventListener("click", () =>
      this.toggleArchive(this.currentNoteId),
    );
    this._el("editor-delete-btn").addEventListener("click", () =>
      this.deleteNote(this.currentNoteId),
    );

    // Export / Import
    this._el("export-btn").addEventListener("click", () => this.exportData());
    this._el("import-btn").addEventListener("click", () => this._el("import-input").click());
    this._el("import-input").addEventListener("change", (e) => {
      if (e.target.files[0]) {
        this.importData(e.target.files[0]);
        e.target.value = ""; // Reset so same file can be imported again
      }
    });

    // Confirm modal
    this._el("modal-confirm").addEventListener("click", () => this._handleModalConfirm());
    this._el("modal-cancel").addEventListener("click", () => this._handleModalCancel());
    this._el("modal-overlay").addEventListener("click", (e) => {
      if (e.target === this._el("modal-overlay")) this._handleModalCancel();
    });

    // Mobile toggle
    this._el("mobile-toggle").addEventListener("click", () => this._openMobileSidebar());
    this._el("mobile-overlay").addEventListener("click", () => this._closeMobileSidebar());
    this._el("mobile-back-btn").addEventListener("click", () => this.closeEditor());

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      // Ctrl+N — New note
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        this.addNote();
      }
      // Ctrl+S — Save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        this.saveCurrentNote();
      }
      // Ctrl+Shift+F — Format
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        this.formatCode();
      }
      // Escape — Close editor on mobile / close modal
      if (e.key === "Escape") {
        if (this._pendingConfirm) {
          this._handleModalCancel();
        } else if (window.innerWidth <= 640 && this.currentNoteId) {
          this.closeEditor();
        }
      }
    });
  }
}

// Boot
const app = new NoteApp();
window.app = app;
