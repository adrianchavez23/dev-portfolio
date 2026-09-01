const STORAGE_KEYS = {
  passwordHash: "portfolio_blog_password_hash",
  unlocked: "portfolio_blog_unlocked",
  token: "portfolio_blog_github_token",
  workingCopy: "portfolio_blog_working_copy",
  draft: "portfolio_blog_draft"
};

function loadWorkingPosts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.workingCopy);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.warn("Could not read saved posts", error);
  }
  return JSON.parse(JSON.stringify(window.BLOG_POSTS || []));
}

function saveWorkingPosts(posts) {
  localStorage.setItem(STORAGE_KEYS.workingCopy, JSON.stringify(posts));
}

function configuredPasswordHash() {
  return (window.BLOG_CONFIG && window.BLOG_CONFIG.passwordHash) || "";
}

function storedPasswordHash() {
  return localStorage.getItem(STORAGE_KEYS.passwordHash) || "";
}

function expectedPasswordHash() {
  return configuredPasswordHash() || storedPasswordHash();
}

function isUnlocked() {
  return sessionStorage.getItem(STORAGE_KEYS.unlocked) === "1";
}

function setUnlocked(value) {
  if (value) sessionStorage.setItem(STORAGE_KEYS.unlocked, "1");
  else sessionStorage.removeItem(STORAGE_KEYS.unlocked);
}

function show(el) {
  el.classList.remove("hidden");
}

function hide(el) {
  el.classList.add("hidden");
}

function setStatus(message, kind) {
  const status = document.getElementById("writer-status");
  status.textContent = message || "";
  status.className = "writer-status" + (kind ? " " + kind : "");
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

function insertAtCursor(textarea, before, after) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || "text";
  const next = textarea.value.slice(0, start) + before + selected + after + textarea.value.slice(end);
  textarea.value = next;
  textarea.focus();
  textarea.selectionStart = start + before.length;
  textarea.selectionEnd = start + before.length + selected.length;
  textarea.dispatchEvent(new Event("input"));
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(function (byte) {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  setTimeout(function () {
    link.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

function serializeConfigFile(passwordHash) {
  const config = Object.assign({}, window.BLOG_CONFIG, { passwordHash: passwordHash });
  return (
    "window.BLOG_CONFIG = " +
    JSON.stringify(config, null, 2) +
    ";\n"
  );
}

async function publishToGitHub(filePath, content, message) {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  const owner = window.BLOG_CONFIG.githubOwner;
  const repo = window.BLOG_CONFIG.githubRepo;
  const branch = window.BLOG_CONFIG.githubBranch || "main";
  if (!token) throw new Error("Add a GitHub token in Settings first.");

  const url =
    "https://api.github.com/repos/" +
    owner +
    "/" +
    repo +
    "/contents/" +
    filePath +
    "?ref=" +
    encodeURIComponent(branch);

  const headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json"
  };

  const current = await fetch(url, { headers: headers });
  let sha;
  if (current.ok) {
    const data = await current.json();
    sha = data.sha;
  } else if (current.status !== 404) {
    const error = await current.json().catch(function () {
      return {};
    });
    throw new Error(error.message || "Could not read the file on GitHub.");
  }

  const put = await fetch(url.replace(/\?ref=.*$/, ""), {
    method: "PUT",
    headers: Object.assign({ "Content-Type": "application/json" }, headers),
    body: JSON.stringify({
      message: message,
      content: utf8ToBase64(content),
      branch: branch,
      sha: sha
    })
  });

  if (!put.ok) {
    const error = await put.json().catch(function () {
      return {};
    });
    throw new Error(error.message || "GitHub did not accept the publish.");
  }
}

function initWriter() {
  const gate = document.getElementById("writer-gate");
  const app = document.getElementById("writer-app");
  const setupForm = document.getElementById("setup-form");
  const loginForm = document.getElementById("login-form");
  const setupError = document.getElementById("setup-error");
  const loginError = document.getElementById("login-error");
  const form = document.getElementById("post-form");
  const titleInput = document.getElementById("post-title");
  const dateInput = document.getElementById("post-date");
  const excerptInput = document.getElementById("post-excerpt");
  const bodyInput = document.getElementById("post-body");
  const preview = document.getElementById("post-preview");
  const postIdInput = document.getElementById("post-id");
  const postList = document.getElementById("saved-posts");
  const settingsPanel = document.getElementById("settings-panel");
  const tokenInput = document.getElementById("github-token");

  let posts = loadWorkingPosts();

  function refreshPreview() {
    preview.innerHTML = renderMarkdown(bodyInput.value) || "<p class=\"preview-empty\">Preview will appear here.</p>";
  }

  function fillForm(post) {
    postIdInput.value = post && post.id ? post.id : "";
    titleInput.value = post && post.title ? post.title : "";
    dateInput.value = post && post.date ? post.date : todayIso();
    excerptInput.value = post && post.excerpt ? post.excerpt : "";
    bodyInput.value = post && post.body ? post.body : "";
    document.getElementById("editor-heading").textContent = post && post.id ? "Edit post" : "New post";
    refreshPreview();
  }

  function persistDraft() {
    const draft = {
      id: postIdInput.value,
      title: titleInput.value,
      date: dateInput.value,
      excerpt: excerptInput.value,
      body: bodyInput.value
    };
    localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(draft));
  }

  function renderSavedPosts() {
    if (!posts.length) {
      postList.innerHTML = "<p class=\"muted\">No posts yet.</p>";
      return;
    }

    postList.innerHTML = sortedPosts(posts)
      .map(function (post) {
        const active = post.id === postIdInput.value ? " active" : "";
        return (
          '<div class="saved-post' +
          active +
          '" data-id="' +
          escapeHtml(post.id) +
          '">' +
          "<strong>" +
          escapeHtml(post.title) +
          "</strong>" +
          "<span>" +
          escapeHtml(formatPostDate(post.date)) +
          "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function showApp() {
    hide(gate);
    show(app);
    tokenInput.value = localStorage.getItem(STORAGE_KEYS.token) || "";
    const draftRaw = localStorage.getItem(STORAGE_KEYS.draft);
    if (draftRaw) {
      try {
        fillForm(JSON.parse(draftRaw));
      } catch (error) {
        fillForm(null);
      }
    } else {
      fillForm(null);
    }
    renderSavedPosts();
    refreshLockBanner();
  }

  function lockFileNeedsSaving() {
    return Boolean(storedPasswordHash()) && !configuredPasswordHash();
  }

  function refreshLockBanner() {
    const banner = document.getElementById("lock-file-banner");
    if (lockFileNeedsSaving()) show(banner);
    else hide(banner);
  }

  function saveLockFile() {
    const hash = expectedPasswordHash();
    if (!hash) {
      setStatus("Create a password first.", "error");
      return;
    }
    downloadTextFile("blog-config.js", serializeConfigFile(hash));
    setStatus(
      "If your browser blocked the download, use Copy file contents and paste it into js/blog-config.js.",
      "success"
    );
  }

  function showGate() {
    show(gate);
    hide(app);
    const hasPassword = Boolean(expectedPasswordHash());
    setupForm.classList.toggle("hidden", hasPassword);
    loginForm.classList.toggle("hidden", !hasPassword);
  }

  setupForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    setupError.textContent = "";
    const password = document.getElementById("setup-password").value;
    const confirm = document.getElementById("setup-confirm").value;
    if (password.length < 6) {
      setupError.textContent = "Use at least 6 characters.";
      return;
    }
    if (password !== confirm) {
      setupError.textContent = "The two passwords do not match.";
      return;
    }
    try {
      const hash = await hashPassword(password);
      localStorage.setItem(STORAGE_KEYS.passwordHash, hash);
      setUnlocked(true);
      showApp();
      refreshLockBanner();
      setStatus(
        "Password saved on this computer. Click “Download lock file” and replace js/blog-config.js, then commit.",
        "success"
      );
    } catch (error) {
      setupError.textContent = error.message || "Could not create the password.";
    }
  });

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    loginError.textContent = "";
    try {
      const password = document.getElementById("login-password").value;
      const hash = await hashPassword(password);
      if (hash !== expectedPasswordHash()) {
        loginError.textContent = "Wrong password.";
        return;
      }
      setUnlocked(true);
      showApp();
    } catch (error) {
      loginError.textContent = error.message || "Could not check the password.";
    }
  });

  document.getElementById("new-post-btn").addEventListener("click", function () {
    fillForm(null);
    persistDraft();
    renderSavedPosts();
    setStatus("");
  });

  postList.addEventListener("click", function (event) {
    const row = event.target.closest(".saved-post");
    if (!row) return;
    const post = posts.find(function (item) {
      return item.id === row.dataset.id;
    });
    if (post) {
      fillForm(post);
      persistDraft();
      renderSavedPosts();
      setStatus("");
    }
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  ["input", "change"].forEach(function (eventName) {
    form.addEventListener(eventName, function () {
      persistDraft();
      refreshPreview();
    });
  });

  document.getElementById("download-config").addEventListener("click", saveLockFile);
  document.getElementById("copy-config").addEventListener("click", async function () {
    const hash = expectedPasswordHash();
    if (!hash) {
      setStatus("Create a password first.", "error");
      return;
    }
    const contents = serializeConfigFile(hash);
    try {
      await navigator.clipboard.writeText(contents);
      setStatus("Copied. Paste it into js/blog-config.js and save that file.", "success");
    } catch (error) {
      setStatus("Could not copy. Download the lock file instead.", "error");
    }
  });

  document.querySelectorAll("[data-md]").forEach(function (button) {
    button.addEventListener("click", function () {
      const kind = button.getAttribute("data-md");
      if (kind === "bold") insertAtCursor(bodyInput, "**", "**");
      if (kind === "italic") insertAtCursor(bodyInput, "*", "*");
      if (kind === "heading") insertAtCursor(bodyInput, "## ", "");
      if (kind === "link") insertAtCursor(bodyInput, "[", "](https://)");
      if (kind === "list") insertAtCursor(bodyInput, "- ", "");
      if (kind === "code") insertAtCursor(bodyInput, "`", "`");
    });
  });

  document.getElementById("toggle-settings").addEventListener("click", function () {
    settingsPanel.classList.toggle("hidden");
  });

  document.getElementById("save-token").addEventListener("click", function () {
    const token = tokenInput.value.trim();
    if (token) localStorage.setItem(STORAGE_KEYS.token, token);
    else localStorage.removeItem(STORAGE_KEYS.token);
    setStatus("GitHub token saved in this browser only. It is not uploaded with your site.", "success");
  });

  document.getElementById("sign-out").addEventListener("click", function () {
    setUnlocked(false);
    showGate();
  });

  async function collectPostFromForm() {
    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();
    if (!title || !body) {
      setStatus("Add a title and some text before publishing.", "error");
      return null;
    }

    const currentId = postIdInput.value || "post-" + Date.now();
    const post = {
      id: currentId,
      slug: uniqueSlug(posts, title, currentId),
      title: title,
      date: dateInput.value || todayIso(),
      excerpt: excerptInput.value.trim() || body.slice(0, 180),
      body: bodyInput.value
    };

    const existing = posts.findIndex(function (item) {
      return item.id === post.id;
    });
    if (existing >= 0) posts[existing] = post;
    else posts.unshift(post);

    saveWorkingPosts(posts);
    postIdInput.value = post.id;
    renderSavedPosts();
    return post;
  }

  document.getElementById("download-posts").addEventListener("click", async function () {
    const post = await collectPostFromForm();
    if (!post) return;
    downloadTextFile("posts.js", serializePostsFile(posts));
    setStatus(
      "Downloaded posts.js. Replace the file in the data folder, then commit and push so visitors can see it.",
      "success"
    );
  });

  document.getElementById("publish-github").addEventListener("click", async function () {
    const post = await collectPostFromForm();
    if (!post) return;
    setStatus("Publishing to GitHub...");
    try {
      await publishToGitHub(
        window.BLOG_CONFIG.postsPath,
        serializePostsFile(posts),
        "Publish blog post: " + post.title
      );
      setStatus("Published. After GitHub Pages refreshes, visitors will see the post.", "success");
    } catch (error) {
      setStatus(error.message + " You can still download posts.js and commit it yourself.", "error");
    }
  });

  document.getElementById("delete-post").addEventListener("click", async function () {
    const id = postIdInput.value;
    if (!id) {
      setStatus("This post is not saved yet.", "error");
      return;
    }
    if (!confirm("Delete this post? You still need to publish or download so the public blog updates.")) return;
    posts = posts.filter(function (item) {
      return item.id !== id;
    });
    saveWorkingPosts(posts);
    fillForm(null);
    persistDraft();
    renderSavedPosts();
    downloadTextFile("posts.js", serializePostsFile(posts));
    setStatus("Removed from your list. Replace data/posts.js with the downloaded file, or publish to GitHub.", "success");
  });

  if (isUnlocked() && expectedPasswordHash()) showApp();
  else showGate();
}

document.addEventListener("DOMContentLoaded", initWriter);
