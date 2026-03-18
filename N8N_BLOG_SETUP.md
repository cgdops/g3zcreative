# n8n → G3Z Creative Blog Setup

## How it works

1. n8n generates SEO blog content (title, body, meta, etc.)
2. n8n calls the **GitHub Contents API** to create a new markdown file in `_posts/`
3. GitHub Actions detects the push, builds the blog HTML, and deploys to GitHub Pages
4. New post is live at `g3zcreative.com/blog/{slug}/` within ~2 minutes

---

## Fields your n8n workflow must output

| Field | Type | Description |
|---|---|---|
| `title` | string | Post title (60–70 chars ideal for SEO) |
| `slug` | string | URL slug, lowercase, hyphens, no spaces (e.g. `seo-tips-miramar-2026`) |
| `date` | string | Publication date in `YYYY-MM-DD` format |
| `meta_description` | string | SEO meta description, 140–160 characters |
| `tags` | array | List of tag strings, e.g. `["SEO", "Miramar", "Small Business"]` |
| `author` | string | Author name (default: `G3Z Creative`) |
| `featured_image` | string | Full URL to a featured image (optional, leave empty `""` if none) |
| `body` | string | Post body in **Markdown** format |

---

## Markdown file format n8n must produce

```
---
title: "Your Post Title Here"
slug: "your-post-slug-here"
date: "2026-03-18"
meta_description: "Your SEO meta description here, approximately 150 characters long for best results."
tags: ["Tag One", "Tag Two", "Tag Three"]
author: "G3Z Creative"
featured_image: "https://example.com/image.jpg"
---

Your post body in Markdown goes here.

## Section Heading

Paragraph text, **bold**, *italic*, [links](https://example.com), bullet lists, etc.
```

---

## n8n HTTP Request node configuration

**Method:** `PUT`

**URL:**
```
https://api.github.com/repos/cgdops/g3zcreative/contents/_posts/{{ $json.date }}-{{ $json.slug }}.md
```

**Headers:**
```
Authorization: Bearer YOUR_GITHUB_PAT
Accept: application/vnd.github+json
Content-Type: application/json
X-GitHub-Api-Version: 2022-11-28
```

**Body (JSON):**
```json
{
  "message": "Add post: {{ $json.title }}",
  "content": "{{ Buffer.from(markdownContent).toString('base64') }}"
}
```

### Building the markdown content in n8n

Use a **Function** node before the HTTP Request to assemble and base64-encode the file:

```javascript
const frontmatter = [
  '---',
  `title: "${$json.title.replace(/"/g, '\\"')}"`,
  `slug: "${$json.slug}"`,
  `date: "${$json.date}"`,
  `meta_description: "${$json.meta_description.replace(/"/g, '\\"')}"`,
  `tags: ${JSON.stringify($json.tags)}`,
  `author: "${$json.author || 'G3Z Creative'}"`,
  `featured_image: "${$json.featured_image || ''}"`,
  '---',
  '',
].join('\n');

const markdown = frontmatter + $json.body;

return [{
  json: {
    ...$json,
    markdownContent: markdown,
    base64Content: Buffer.from(markdown).toString('base64'),
    filename: `${$json.date}-${$json.slug}.md`,
  }
}];
```

Then in the HTTP Request body use `{{ $json.base64Content }}` as the `content` value.

---

## GitHub PAT permissions required

Your token needs these scopes:
- `repo` → Contents (read & write)

Store it securely in n8n as a **Credential** (HTTP Header Auth or use the n8n Secrets store). Never hardcode it in a workflow node.

---

## Testing

To test without n8n, you can run the build locally:

```bash
cd g3zcreative
npm install
node scripts/build-blog.js
```

This generates `blog/index.html` and `blog/{slug}/index.html` from whatever is in `_posts/`.
