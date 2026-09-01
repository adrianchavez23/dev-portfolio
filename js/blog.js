window.BLOG_POSTS = window.BLOG_POSTS || [];
window.BLOG_CONFIG = window.BLOG_CONFIG || {};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(
    /!\[([^\]]*)\]\((https?:[^)\s]+)\)/g,
    '<img src="$2" alt="$1">'
  );
  html = html.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+|mailto:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function renderMarkdown(markdown) {
  if (!markdown) return "";

  const codeBlocks = [];
  let source = String(markdown).replace(/\r\n/g, "\n");

  source = source.replace(/```[\w-]*\n([\s\S]*?)```/g, function (_match, code) {
    const token = "%%CODEBLOCK" + codeBlocks.length + "%%";
    codeBlocks.push(
      "<pre><code>" + escapeHtml(code.replace(/\n$/, "")) + "</code></pre>"
    );
    return token;
  });

  const html = [];
  const paragraph = [];
  let inUl = false;
  let inOl = false;

  function flushParagraph() {
    if (paragraph.length) {
      html.push("<p>" + inlineMarkdown(paragraph.join(" ")) + "</p>");
      paragraph.length = 0;
    }
  }

  function closeLists() {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  }

  source.split("\n").forEach(function (line) {
    if (/^%%CODEBLOCK\d+%%$/.test(line.trim())) {
      flushParagraph();
      closeLists();
      html.push(line.trim());
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeLists();
      const level = heading[1].length;
      html.push(
        "<h" + level + ">" + inlineMarkdown(heading[2]) + "</h" + level + ">"
      );
      return;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeLists();
      html.push("<blockquote>" + inlineMarkdown(quote[1]) + "</blockquote>");
      return;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      closeLists();
      html.push("<hr>");
      return;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push("<li>" + inlineMarkdown(unordered[1]) + "</li>");
      return;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push("<li>" + inlineMarkdown(ordered[1]) + "</li>");
      return;
    }

    if (line.trim() === "") {
      flushParagraph();
      closeLists();
      return;
    }

    closeLists();
    paragraph.push(line);
  });

  flushParagraph();
  closeLists();

  let output = html.join("\n");
  codeBlocks.forEach(function (block, index) {
    output = output.replace("%%CODEBLOCK" + index + "%%", block);
  });
  return output;
}

function formatPostDate(value) {
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return value || "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function sortedPosts(posts) {
  return (posts || [])
    .slice()
    .sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
}

function getPostBySlug(posts, slug) {
  return (posts || []).find(function (post) {
    return post.slug === slug;
  });
}

function slugify(title) {
  const slug = String(title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "post";
}

function uniqueSlug(posts, title, currentId) {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  const taken = function (value) {
    return (posts || []).some(function (post) {
      return post.slug === value && post.id !== currentId;
    });
  };
  while (taken(slug)) {
    slug = base + "-" + n;
    n += 1;
  }
  return slug;
}

function serializePostsFile(posts) {
  return "window.BLOG_POSTS = " + JSON.stringify(posts, null, 2) + ";\n";
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    })
    .join("");
}

function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function renderPostList(posts) {
  const items = sortedPosts(posts);
  if (!items.length) {
    return (
      '<div class="empty-blog">' +
      "<h2>Blog</h2>" +
      "<p>No posts yet. Check back soon.</p>" +
      "</div>"
    );
  }

  const cards = items
    .map(function (post) {
      const excerpt = escapeHtml(post.excerpt || post.body.slice(0, 180));
      return (
        '<article class="post-card">' +
        "<h3><a href=\"blog.html?post=" +
        encodeURIComponent(post.slug) +
        '">' +
        escapeHtml(post.title) +
        "</a></h3>" +
        '<p class="post-date">' +
        escapeHtml(formatPostDate(post.date)) +
        "</p>" +
        "<p>" +
        excerpt +
        "</p>" +
        '<a class="read-more" href="blog.html?post=' +
        encodeURIComponent(post.slug) +
        '">Read more</a>' +
        "</article>"
      );
    })
    .join("");

  return "<h2>Blog</h2><div class=\"post-list\">" + cards + "</div>";
}

function renderSinglePost(post) {
  if (!post) {
    return (
      '<p class="empty-blog">This post was not found.</p>' +
      '<p><a href="blog.html">Back to the blog</a></p>'
    );
  }

  return (
    '<article class="post-article">' +
    '<p class="back-link"><a href="blog.html">Back to the blog</a></p>' +
    "<h2>" +
    escapeHtml(post.title) +
    "</h2>" +
    '<p class="post-date">' +
    escapeHtml(formatPostDate(post.date)) +
    "</p>" +
    '<div class="post-body">' +
    renderMarkdown(post.body) +
    "</div>" +
    "</article>"
  );
}

function initPublicBlog() {
  const root = document.getElementById("blog-view");
  if (!root) return;

  const slug = queryParam("post");
  if (slug) {
    document.title = "Blog - Adrián Chávez";
    const post = getPostBySlug(window.BLOG_POSTS, slug);
    if (post) document.title = post.title + " - Adrián Chávez";
    root.innerHTML = renderSinglePost(post);
    return;
  }

  document.title = "Blog - Adrián Chávez";
  root.innerHTML = renderPostList(window.BLOG_POSTS);
}
