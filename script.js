class NoteApp {
  constructor() {
    this.notes = JSON.parse(localStorage.getItem("temp_notes_v3")) || [];
    this.notebooks = JSON.parse(localStorage.getItem("temp_notebooks")) || ["My Notes"];
    this.theme = localStorage.getItem("theme") || "light";

    this.currentNoteId = null;
    this.currentView = "all"; // all, pinned, archive, trash, or a notebook name
    this.saveTimeout = null;

    this.init();
  }

  init() {
    this.applyTheme();
    this.attachEventListeners();
    this.render();
  }

  save() {
    localStorage.setItem("temp_notes_v3", JSON.stringify(this.notes));
    localStorage.setItem("temp_notebooks", JSON.stringify(this.notebooks));
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
      trash: false,
      notebook:
        typeof this.currentView === "string" &&
        !["all", "pinned", "archive", "trash"].includes(this.currentView)
          ? this.currentView
          : "My Notes",
      images: [],
      updatedAt: Date.now(),
    };
    this.notes.unshift(newNote);
    this.save();
    this.currentView = newNote.notebook;
    this.render();
    this.openEditor(newNote.id);
  }

  addNotebook() {
    const name = prompt("Enter notebook name:");
    if (name && !this.notebooks.includes(name)) {
      this.notebooks.push(name);
      this.save();
      this.render();
    }
  }

  deleteNote(id) {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;

    if (note.trash) {
      if (confirm("Permanently delete this note?")) {
        this.notes = this.notes.filter((n) => n.id !== id);
        this.currentNoteId = null;
        this.save();
        this.render();
        this.showToast("Note deleted permanently");
      }
    } else {
      note.trash = true;
      note.pinned = false;
      this.save();
      this.render();
      this.showToast("Moved to Trash");
      if (this.currentNoteId === id) this.closeEditor();
    }
  }

  restoreNote(id) {
    const note = this.notes.find((n) => n.id === id);
    if (note) {
      note.trash = false;
      this.save();
      this.render();
      this.showToast("Note restored");
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
      if (note.archived) note.pinned = false;
      this.save();
      this.render();
      this.showToast(note.archived ? "Archived" : "Unarchived");
    }
  }

  formatDate(timestamp) {
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  openEditor(id) {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;

    this.currentNoteId = id;

    // UI Transitions
    document.getElementById("editor-empty-state").classList.add("hidden");
    const workspace = document.getElementById("editor-workspace");
    workspace.classList.remove("hidden");

    // Load Data
    document.getElementById("editor-title").value = note.title;
    document.getElementById("editor-content").value = note.content;
    document.getElementById("editor-tags").value = (note.tags || []).join(", ");
    document.getElementById("editor-language").value = note.language || "text";
    document.getElementById("note-notebook-name").textContent = note.notebook;

    // Update Icons
    const pinBtn = document.getElementById("editor-pin-btn");
    pinBtn.style.color = note.pinned ? "var(--en-green)" : "inherit";

    const archiveBtn = document.getElementById("editor-archive-btn");
    archiveBtn.style.color = note.archived ? "var(--en-green)" : "inherit";

    this.renderImageGallery(note.images || []);
    this.updateStats();
    this.render(); // To highlight active card

    document.getElementById("editor-content").focus();
  }

  closeEditor() {
    this.currentNoteId = null;
    document.getElementById("editor-empty-state").classList.remove("hidden");
    document.getElementById("editor-workspace").classList.add("hidden");
    this.render();
  }

  saveCurrentNote(silent = false) {
    const id = this.currentNoteId;
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;

    note.title = document.getElementById("editor-title").value;
    note.content = document.getElementById("editor-content").value;
    note.tags = document
      .getElementById("editor-tags")
      .value.split(",")
      .map((t) => t.trim())
      .filter((t) => t);
    note.language = document.getElementById("editor-language").value;
    note.updatedAt = Date.now();

    this.save();
    this.render();
    if (!silent) this.showToast("Saved");
    this.updateSaveStatus();
  }

  autoSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveCurrentNote(true), 1000);
  }

  updateSaveStatus() {
    const el = document.getElementById("save-status");
    el.classList.add("visible");
    setTimeout(() => el.classList.remove("visible"), 2000);
  }

  updateStats() {
    const content = document.getElementById("editor-content").value;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const chars = content.length;
    document.getElementById("editor-stats").textContent = `Words: ${words} | Chars: ${chars}`;
  }

  async formatCode() {
    const note = this.notes.find((n) => n.id === this.currentNoteId);
    if (!note || note.language === "text") return;

    const contentArea = document.getElementById("editor-content");

    try {
      const config = {
        parser: note.language,
        plugins: prettierPlugins,
        semi: true,
        singleQuote: true,
        tabWidth: 2,
      };

      const formatted = await prettier.format(contentArea.value, config);
      contentArea.value = formatted;
      note.content = formatted;
      this.updateStats();
      this.save();
      this.render();
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
        }
      }
    }
  }

  compressImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800;
          let w = img.width,
            h = img.height;
          if (w > MAX_WIDTH) {
            h *= MAX_WIDTH / w;
            w = MAX_WIDTH;
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
      };
    });
  }

  renderImageGallery(images) {
    const gallery = document.getElementById("editor-image-gallery");
    gallery.innerHTML = images
      .map(
        (img, idx) => `
      <div class="image-item">
        <img src="${img}" />
        <div class="image-actions">
           <button class="btn-icon" onclick="app.downloadImage('${img}', ${idx})"><i class="fas fa-download"></i></button>
           <button class="btn-icon" onclick="app.removeImage(${idx})"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `,
      )
      .join("");
  }

  removeImage(idx) {
    const note = this.notes.find((n) => n.id === this.currentNoteId);
    if (note) {
      note.images.splice(idx, 1);
      this.renderImageGallery(note.images);
      this.save();
    }
  }

  downloadImage(base64, idx) {
    const a = document.createElement("a");
    a.href = base64;
    a.download = `img_${idx}.jpg`;
    a.click();
  }

  getFilteredNotes() {
    const query = document.getElementById("search-input").value.toLowerCase();
    return this.notes
      .filter((n) => {
        // 1. View Filter
        if (this.currentView === "trash") {
          if (!n.trash) return false;
        } else {
          if (n.trash) return false;
          if (this.currentView === "pinned" && !n.pinned) return false;
          if (this.currentView === "archive" && !n.archived) return false;
          if (
            this.currentView !== "all" &&
            !["pinned", "archive"].includes(this.currentView) &&
            n.notebook !== this.currentView
          )
            return false;
        }

        // 2. Search Query
        return n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  render() {
    // 1. Navigation
    const notebookList = document.getElementById("notebook-list");
    notebookList.innerHTML = this.notebooks
      .map(
        (nb) => `
      <li class="nav-item ${this.currentView === nb ? "active" : ""}" onclick="app.setView('${nb}')">
        <i class="fas fa-book"></i>
        <span>${nb}</span>
      </li>
    `,
      )
      .join("");

    // 2. Note List
    const container = document.getElementById("notes-container");
    const filtered = this.getFilteredNotes();

    document.getElementById("view-title").textContent =
      this.currentView.charAt(0).toUpperCase() + this.currentView.slice(1);

    container.innerHTML = filtered
      .map(
        (n) => `
      <div class="note-card ${this.currentNoteId === n.id ? "active" : ""}" onclick="app.openEditor(${n.id})">
        <div class="note-card-title">${n.title || "Untitled Note"}</div>
        <div class="note-card-excerpt">${n.content || "No additional text"}</div>
        <div class="note-card-footer">
          <span>${this.formatDate(n.updatedAt)}</span>
          ${n.pinned ? '<i class="fas fa-thumbtack" style="color:var(--en-green)"></i>' : ""}
        </div>
      </div>
    `,
      )
      .join("");
  }

  setView(view) {
    this.currentView = view;
    this.render();
  }

  showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.style.display = "block";
    setTimeout(() => (t.style.display = "none"), 2000);
  }

  attachEventListeners() {
    document.getElementById("add-note-btn").onclick = () => this.addNote();
    document.getElementById("add-notebook-btn").onclick = () => this.addNotebook();
    document.getElementById("theme-toggle").onclick = () => this.toggleTheme();
    document.getElementById("search-input").oninput = () => this.render();

    // Sidebar Views
    document.getElementById("nav-all").onclick = () => this.setView("all");
    document.getElementById("nav-pinned").onclick = () => this.setView("pinned");
    document.getElementById("nav-archive").onclick = () => this.setView("archive");
    document.getElementById("nav-trash").onclick = () => this.setView("trash");

    // Editor Events
    const title = document.getElementById("editor-title");
    const content = document.getElementById("editor-content");
    const tags = document.getElementById("editor-tags");
    const lang = document.getElementById("editor-language");

    title.oninput = () => this.autoSave();
    content.oninput = () => {
      this.updateStats();
      this.autoSave();
    };
    content.onpaste = (e) => this.handlePaste(e);
    tags.oninput = () => this.autoSave();
    lang.onchange = () => {
      const note = this.notes.find((n) => n.id === this.currentNoteId);
      if (note) note.language = lang.value;
      this.formatCode();
      this.autoSave();
    };

    // Editor Meta Actions
    document.getElementById("editor-pin-btn").onclick = () => this.togglePin(this.currentNoteId);
    document.getElementById("editor-archive-btn").onclick = () =>
      this.toggleArchive(this.currentNoteId);
    document.getElementById("editor-delete-btn").onclick = () =>
      this.deleteNote(this.currentNoteId);

    // Export/Import
    document.getElementById("export-btn").onclick = () => {
      const blob = new Blob([JSON.stringify(this.notes)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "notes.json";
      a.click();
    };
    document.getElementById("import-btn").onclick = () =>
      document.getElementById("import-input").click();
    document.getElementById("import-input").onchange = (e) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imported = JSON.parse(ev.target.result);
        if (Array.isArray(imported)) {
          this.notes = [...imported, ...this.notes];
          this.save();
          this.render();
        }
      };
      reader.readAsText(e.target.files[0]);
    };
  }
}

const app = new NoteApp();
window.app = app;
