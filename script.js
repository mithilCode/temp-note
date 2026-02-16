class NoteApp {
  constructor() {
    this.notes = JSON.parse(localStorage.getItem("temp_notes_v2")) || [];
    this.storageKeyV1 = "editorIds";
    this.theme = localStorage.getItem("theme") || "light";
    this.currentNoteId = null;
    this.currentView = "all"; // all, pinned, archive
    this.saveTimeout = null;

    this.init();
  }

  init() {
    this.migrateFromV1();
    this.applyTheme();
    this.attachEventListeners();
    this.render();
  }

  migrateFromV1() {
    const v1Ids = JSON.parse(localStorage.getItem(this.storageKeyV1));
    if (v1Ids && this.notes.length === 0) {
      v1Ids.forEach((id) => {
        const title = localStorage.getItem(`${id}_title`) || "Untitled";
        const content = localStorage.getItem(id) || "";
        this.notes.push({
          id: Date.now() + Math.random(),
          title,
          content,
          tags: [],
          language: "text",
          pinned: false,
          archived: false,
          images: [],
          updatedAt: Date.now(),
        });
      });
      this.save();
    }
  }

  save() {
    localStorage.setItem("temp_notes_v2", JSON.stringify(this.notes));
    localStorage.setItem("theme", this.theme);
  }

  applyTheme() {
    document.body.setAttribute("data-theme", this.theme);
    const themeIcon = document.querySelector("#theme-toggle i");
    if (themeIcon) {
      themeIcon.className = this.theme === "dark" ? "fas fa-sun" : "fas fa-moon";
    }
  }

  toggleTheme() {
    this.theme = this.theme === "dark" ? "light" : "dark";
    this.applyTheme();
    this.save();
  }

  addNote() {
    const newNote = {
      id: Date.now(),
      title: "",
      content: "",
      tags: [],
      language: "text",
      pinned: false,
      archived: false,
      images: [],
      updatedAt: Date.now(),
    };
    this.notes.unshift(newNote);
    this.save();
    this.render();
    this.openEditor(newNote.id);
  }

  deleteNote(id) {
    if (confirm("Delete this note?")) {
      this.notes = this.notes.filter((n) => n.id !== id);
      this.save();
      this.render();
      this.showToast("Note deleted");
    }
  }

  togglePin(id) {
    const note = this.notes.find((n) => n.id === id);
    if (note) {
      note.pinned = !note.pinned;
      this.save();
      this.render();
    }
  }

  toggleArchive(id) {
    const note = this.notes.find((n) => n.id === id);
    if (note) {
      note.archived = !note.archived;
      if (note.archived) note.pinned = false; // Unpin if archived
      this.save();
      this.render();
      this.showToast(note.archived ? "Note archived" : "Note unarchived");
    }
  }

  formatDate(timestamp) {
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const strTime = hours + ":" + minutes + " " + ampm;

    return `${day}-${month}-${year} ${strTime}`;
  }

  openEditor(id) {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;

    this.currentNoteId = id;
    const overlay = document.getElementById("editor-overlay");
    const titleInput = document.getElementById("editor-title");
    const contentArea = document.getElementById("editor-content");
    const tagsInput = document.getElementById("editor-tags");
    const langSelect = document.getElementById("editor-language");

    titleInput.value = note.title;
    contentArea.value = note.content;
    tagsInput.value = (note.tags || []).join(", ");
    langSelect.value = note.language || "text";
    overlay.style.display = "flex";
    this.renderImageGallery(note.images || []);
    this.updateStats();

    setTimeout(() => contentArea.focus(), 100);
  }

  saveCurrentNote(silent = false) {
    const id = this.currentNoteId;
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;

    const titleInput = document.getElementById("editor-title");
    const contentArea = document.getElementById("editor-content");
    const tagsInput = document.getElementById("editor-tags");
    const langSelect = document.getElementById("editor-language");

    note.title = titleInput.value;
    note.content = contentArea.value;
    note.tags = tagsInput.value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
    note.language = langSelect.value;
    note.updatedAt = Date.now();

    this.save();
    this.render();
    if (!silent) this.showToast("Note saved");
    this.updateSaveStatus();
  }

  autoSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveCurrentNote(true);
    }, 1000); // 1 second debounce
  }

  updateSaveStatus() {
    const stats = document.getElementById("editor-stats");
    const originalText = stats.textContent.split(" | Saved")[0];
    stats.textContent = `${originalText} | Saved`;
    setTimeout(() => {
      stats.textContent = originalText;
    }, 2000);
  }

  closeEditor() {
    document.getElementById("editor-overlay").style.display = "none";
    document.getElementById("editor-image-gallery").innerHTML = "";
    this.currentNoteId = null;
  }

  updateStats() {
    const content = document.getElementById("editor-content").value;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const chars = content.length;
    document.getElementById("editor-stats").textContent = `Words: ${words} | Chars: ${chars}`;
  }

  async formatCode() {
    const contentArea = document.getElementById("editor-content");
    const lang = document.getElementById("editor-language").value;

    if (lang === "text") {
      this.showToast("Select a code language to format", "info");
      return;
    }

    try {
      const config = {
        parser: lang,
        plugins: prettierPlugins,
        semi: true,
        singleQuote: true,
        tabWidth: 2,
      };

      const formatted = await prettier.format(contentArea.value, config);
      contentArea.value = formatted;
      this.updateStats();
      this.showToast("Code formatted");
    } catch (err) {
      console.error(err);
      this.showToast("Format error: " + err.message.split("\n")[0], "error");
    }
  }

  async handlePaste(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        const base64 = await this.compressImage(file);
        const note = this.notes.find((n) => n.id === this.currentNoteId);
        if (note) {
          if (!note.images) note.images = [];
          note.images.push(base64);
          this.renderImageGallery(note.images);
          this.save();
          this.showToast("Image pasted");
        }
      }
    }
  }

  compressImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
      };
    });
  }

  renderImageGallery(images) {
    const gallery = document.getElementById("editor-image-gallery");
    gallery.innerHTML = images
      .map(
        (img, index) => `
      <div class="image-item">
        <img src="${img}" alt="Attached image" />
        <div class="image-actions">
          <button class="btn-icon" onclick="app.downloadImage('${img}', ${index})" title="Download image">
            <i class="fas fa-download"></i>
          </button>
          <button class="btn-icon" onclick="app.removeImage(${index})" title="Remove image">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `,
      )
      .join("");
  }

  removeImage(index) {
    const note = this.notes.find((n) => n.id === this.currentNoteId);
    if (note && note.images) {
      note.images.splice(index, 1);
      this.renderImageGallery(note.images);
      this.save();
      this.showToast("Image removed");
    }
  }

  downloadImage(base64, index) {
    const link = document.createElement("a");
    link.href = base64;
    link.download = `image_${Date.now()}_${index}.jpg`;
    link.click();
  }

  exportData() {
    const dataStr = JSON.stringify(this.notes, null, 2);
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    const exportFileDefaultName = "temp_notes_backup.json";

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
    this.showToast("Data exported");
  }

  importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedNotes = JSON.parse(e.target.result);
        if (Array.isArray(importedNotes)) {
          this.notes = [...importedNotes, ...this.notes];
          this.save();
          this.render();
          this.showToast("Data imported");
        }
      } catch (err) {
        this.showToast("Invalid JSON file", "error");
      }
    };
    reader.readAsText(file);
  }

  getFilteredNotes() {
    const searchValue = document.getElementById("search-input").value.toLowerCase();
    return this.notes
      .filter((n) => {
        // View Filtering
        if (this.currentView === "archive") {
          if (!n.archived) return false;
        } else if (this.currentView === "pinned") {
          if (!n.pinned || n.archived) return false;
        } else {
          // 'all' view
          if (n.archived) return false;
        }

        // Search Filtering
        const matchTitle = (n.title || "").toLowerCase().includes(searchValue);
        const matchContent = (n.content || "").toLowerCase().includes(searchValue);
        const matchTags = (n.tags || []).some((t) => t.toLowerCase().includes(searchValue));
        return matchTitle || matchContent || matchTags;
      })
      .sort((a, b) => {
        if (a.pinned === b.pinned) return b.updatedAt - a.updatedAt;
        return a.pinned ? -1 : 1;
      });
  }

  render() {
    const container = document.getElementById("notes-container");
    const filtered = this.getFilteredNotes();

    // Update Sidebar Active State
    document.querySelectorAll(".nav-item").forEach((el) => el.classList.remove("active"));
    const activeNav = document.getElementById(`nav-${this.currentView}`);
    if (activeNav) activeNav.classList.add("active");

    if (filtered.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No notes found...</div>`;
      return;
    }

    container.innerHTML = filtered
      .map(
        (note) => `
            <div class="note-card" onclick="app.openEditor(${note.id})">
                <div class="note-header">
                    <span class="note-title">${note.title || "Untitled"}</span>
                    <div class="language-container">
                        ${note.images && note.images.length > 0 ? `<i class="fas fa-image media-indicator" title="Includes images"></i>` : ""}
                        ${note.language && note.language !== "text" ? `<span class="language-badge">${note.language}</span>` : ""}
                        <button class="pin-btn ${note.pinned ? "pinned" : ""}" onclick="event.stopPropagation(); app.togglePin(${note.id})">
                            <i class="fas fa-thumbtack"></i>
                        </button>
                    </div>
                </div>
                <div class="note-excerpt">${note.content || "No content..."}</div>
                <div class="note-tags">
                    ${(note.tags || []).map((t) => `<span class="tag">#${t}</span>`).join("")}
                </div>
                <div class="note-footer">
                    <span>${this.formatDate(note.updatedAt)}</span>
                    <div style="display: flex; gap: 4px">
                        <button class="btn-icon" onclick="event.stopPropagation(); app.toggleArchive(${note.id})" title="${note.archived ? "Unarchive" : "Archive"} note">
                            <i class="fas fa-${note.archived ? "box-open" : "archive"}"></i>
                        </button>
                        <button class="btn-icon" onclick="event.stopPropagation(); app.deleteNote(${note.id})" title="Delete note">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `,
      )
      .join("");
  }

  showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.style.display = "block";
    toast.style.borderColor = type === "error" ? "var(--accent-red)" : "var(--border-color)";
    setTimeout(() => (toast.style.display = "none"), 3000);
  }

  attachEventListeners() {
    document.getElementById("add-note-btn").onclick = () => this.addNote();
    document.getElementById("theme-toggle").onclick = () => this.toggleTheme();
    document.getElementById("search-input").oninput = () => this.render();
    document.getElementById("close-editor").onclick = () => this.closeEditor();

    // Editor Auto-save & Interaction
    document.getElementById("editor-title").oninput = () => this.autoSave();

    const editorContent = document.getElementById("editor-content");
    editorContent.oninput = () => {
      this.updateStats();
      this.autoSave();
    };
    editorContent.onpaste = (e) => this.handlePaste(e);

    document.getElementById("editor-tags").oninput = () => this.autoSave();

    document.getElementById("editor-language").onchange = () => {
      this.formatCode();
      this.autoSave();
    };

    document.getElementById("export-btn").onclick = () => this.exportData();
    document.getElementById("import-btn").onclick = () =>
      document.getElementById("import-input").click();
    document.getElementById("import-input").onchange = (e) => this.importData(e);

    // Sidebar Navigation
    document.getElementById("nav-all").onclick = () => {
      this.currentView = "all";
      this.render();
    };
    document.getElementById("nav-pinned").onclick = () => {
      this.currentView = "pinned";
      this.render();
    };
    document.getElementById("nav-archive").onclick = () => {
      this.currentView = "archive";
      this.render();
    };

    // Modal Outer Click Closing
    document.getElementById("editor-overlay").onclick = (e) => {
      if (e.target.id === "editor-overlay") {
        this.closeEditor();
      }
    };

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      // New Note: Ctrl + N
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        this.addNote();
      }
      // Save & Close: Ctrl + S (only if editor is open)
      if (e.ctrlKey && e.key === "s" && this.currentNoteId) {
        e.preventDefault();
        this.saveCurrentNote();
        this.closeEditor();
      }
      // Format Code: Ctrl + Alt + F
      if (e.ctrlKey && e.altKey && e.key === "f" && this.currentNoteId) {
        e.preventDefault();
        this.formatCode();
      }
      // Close: Escape
      if (e.key === "Escape") {
        this.closeEditor();
      }
    });
  }
}

const app = new NoteApp();
window.app = app;
