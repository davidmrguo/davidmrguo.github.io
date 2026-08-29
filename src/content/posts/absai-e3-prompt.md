---
title: "Sample Prompt: AI Email Link Auditor"
description: "A scheduled task in ChatGPT to check for broken links in HTML emails."
pubDate: 2026-08-20
tags: ["AI Automation", "Web Scraping", "HTML"]
---

Use @Gmail and the cloud browser to audit links only in newly received HTML emails.

Checkpoint and scope:
- The creation cutoff is YYYY-MM-DDThh:mm:ss-04:00. Never inspect or alert on any message received before this cutoff.
- Use the Gmail label "HTML Link Audit/Processed" as the durable checkpoint.
- Search the inbox for messages after the cutoff that do not have this label. Read each candidate once. After inspection, apply the checkpoint label whether the message is HTML, plain text, contains no eligible links, passes, fails, or is blocked. This prevents any message from being reprocessed indefinitely.
- Do not remove the checkpoint label. Do not process Sent, Spam, or Trash.
- If multiple new messages exist, process each independently.

Emails that meet the following criteria are eligible for cloud browser auto-approval, so the scheduled task isn't stalled:
- From: ["David Guo"]
- AND subject line contains: ["HTML Email Test"]

For each HTML email:
1. Extract every URL referenced by a hyperlink in the email body.
2. Decode ordinary HTML entities, then deduplicate exact-identical URLs.
3. Ignore missing or empty href values; fragment-only URLs; non-HTTP(S) schemes such as mailto:, tel:, and javascript:; unsubscribe/preference-management links; and social-media links.
4. Preserve each eligible URL as it appears after ordinary HTML-entity decoding.
5. Explicitly use the cloud browser to open every unique eligible URL and evaluate the rendered final destination after redirects. Do not substitute HTTP-only checks or web-search snippets for browser inspection. Do not rely on previously open tabs, history, or signed-in sessions.

Assign exactly one status to each URL:
- **"live"**: it loads and contains a normal amount of substantive content appropriate to its apparent purpose.
- **"page unavailable"**: the reachable site explicitly reports that the page is missing, expired, removed, or unavailable, including a 404/410 or an HTTP 200 error page.
- **"server unavailable"**: DNS, connection, TLS, timeout, HTTP 5xx, or repeated gateway/service-unavailable failure prevents reaching the site.
- **"thin or empty content"**: the page technically loads but lacks meaningful destination content, such as a product/category/promotion/article page containing mainly navigation, footer, cookie controls, an empty grid, or a shell.
- **"blocked"**: anti-bot, CAPTCHA, access denial, authentication/login wall, geographic/security/consent control, or a restriction-caused 401/403/429 prevents meaningful evaluation.

Classification rules:
- Redirects are not failures; evaluate the final destination.
- A successful page that explicitly says the requested page does not exist is "page unavailable", not "thin or empty content".
- Do not mark a normal minimalist page thin merely for having little text.
- Base classification only on observable destination state.

An actionable broken link is any URL classified as "page unavailable", "server unavailable", "thin or empty content", or "blocked".

If an email has one or more actionable broken links:
- Send an email immediately with @Gmail to _REDACTED_@gmail.com. Use subject "Broken Links Detected in HTML Email".
- Identify the source email by subject, sender, and received time.
- Include only the actionable URLs and their statuses, plus a short observed reason for each.
- Also return the same message as a scheduled-task alert in the chat.
- For multiple source emails with failures, group them in one email/alert.

If no actionable broken link is found across all new messages, do not send email and do not notify the user. Still apply the checkpoint label to every inspected message.