#!/usr/bin/env python3
"""
Play Store review triage script.

Fetches recent Play Store reviews via the Android Publisher API and maintains
a single, sanitized, aggregated GitHub issue summarizing low-rated reviews so
they enter the normal fix cycle without manual monitoring.

Privacy: the created/updated issue is public, so it never contains a
reviewer's name or verbatim review text. It only contains star-rating
counts, a paraphrased common-terms summary derived from word frequency
(not quoted sentences), and opaque review_id references an operator can
look up in the Play Console.

Dedup: an HTML comment marker embeds the sorted set of review_ids
represented in the issue (same pattern as scripts/product-intelligence.mjs).
If the current run's actionable review_id set is unchanged from the
marker, the run skips without touching the issue. Otherwise it
creates the issue (first run) or updates it in place.

Required env vars:
  GOOGLE_SERVICE_ACCOUNT_JSON  — full JSON key for the service account
  GH_TOKEN                     — GitHub token with issues:write scope
  PACKAGE_NAME                 — Android package (cc.agentlabs.opencode)
  DAYS_BACK                    — how many days back to look (default 7)
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone, timedelta

from google.oauth2 import service_account
from googleapiclient.discovery import build

REPO = os.environ.get("GITHUB_REPOSITORY", "dzianisv/opencode-mobile")
PACKAGE_NAME = os.environ.get("PACKAGE_NAME", "cc.agentlabs.opencode")
DAYS_BACK = int(os.environ.get("DAYS_BACK", "7"))
GH_TOKEN = os.environ.get("GH_TOKEN", "")

ISSUE_TITLE = "Play Store Review Triage"
MARKER_RE = re.compile(r"<!-- review-triage:([^>]*?) -->")

SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]

STOPWORDS = {
    "the", "and", "for", "that", "this", "with", "have", "has", "not",
    "you", "your", "but", "app", "when", "just", "very", "also", "from",
    "are", "was", "were", "its", "it's", "can't", "cant", "dont", "don't",
    "wont", "won't", "them", "they", "their", "there", "here", "what",
    "would", "could", "should", "been", "being", "than", "then", "into",
    "about", "even", "still", "again", "after", "before", "which", "some",
    "only", "more", "most", "much", "many", "will", "does", "did", "how",
    "why", "get", "got", "use", "used", "using", "please", "make", "made",
}


def env_client():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        # Fail visibly (issue #61 done-criteria): a missing credential must
        # turn the workflow run red, not report success while doing nothing.
        print("ERROR: GOOGLE_SERVICE_ACCOUNT_JSON not set — cannot fetch reviews.", file=sys.stderr)
        sys.exit(1)
    info = json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("androidpublisher", "v3", credentials=creds, cache_discovery=False)


def fetch_reviews(service):
    cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)
    results = []
    token = None
    while True:
        resp = service.reviews().list(
            packageName=PACKAGE_NAME,
            maxResults=100,
            **({"token": token} if token else {}),
        ).execute()
        for review in resp.get("reviews", []):
            comment = review.get("comments", [{}])[0].get("userComment", {})
            ts = int(comment.get("lastModified", {}).get("seconds", 0))
            if not ts:
                continue
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            if dt < cutoff:
                continue
            results.append({
                "review_id": review.get("reviewId", ""),
                # author name is intentionally not carried past this point —
                # it never enters the aggregated public issue.
                "rating": int(comment.get("starRating", 0) or 0),
                "text": comment.get("text", ""),
                "date": dt.strftime("%Y-%m-%d"),
                "lang": comment.get("reviewerLanguage", "en"),
            })
        token = resp.get("tokenPagination", {}).get("nextPageToken")
        if not token:
            break
    return results


def common_terms(reviews, top_n=8):
    """Word-frequency summary across review text. Deliberately NOT a
    verbatim excerpt — single lowercased tokens only, no sentence
    structure, no attribution to a specific review or author."""
    counts = Counter()
    for review in reviews:
        for word in re.findall(r"[a-zA-Z']{4,}", review["text"].lower()):
            if word in STOPWORDS:
                continue
            counts[word] += 1
    return [word for word, _ in counts.most_common(top_n)]


def find_existing_issue():
    result = subprocess.run(
        [
            "gh", "issue", "list",
            "--repo", REPO,
            "--search", f'"{ISSUE_TITLE}" in:title',
            "--state", "open",
            "--json", "number,title,body",
            "--limit", "10",
        ],
        capture_output=True,
        text=True,
        env={**os.environ, "GH_TOKEN": GH_TOKEN},
    )
    if result.returncode != 0:
        print(f"  ⚠️ gh issue list failed: {result.stderr.strip()}", file=sys.stderr)
        return None
    issues = json.loads(result.stdout or "[]")
    for issue in issues:
        if issue["title"] == ISSUE_TITLE:
            return issue
    return None


def build_body(reviews, review_ids_marker):
    total = len(reviews)
    avg = sum(r["rating"] for r in reviews) / total if total else 0
    by_rating = Counter(r["rating"] for r in reviews)
    terms = common_terms(reviews)

    lines = [
        f"<!-- review-triage:{review_ids_marker} -->",
        "",
        f"## Play Store review triage — last {DAYS_BACK} days",
        "",
        f"**Reviews in window:** {total}  |  **Average rating:** {avg:.1f}★",
        "",
        "### Rating breakdown",
        "",
        "| Stars | Count |",
        "| --- | --- |",
    ]
    for stars in (1, 2, 3):
        lines.append(f"| {stars}★ | {by_rating.get(stars, 0)} |")

    lines += [
        "",
        "### Common terms (word-frequency summary, not verbatim quotes)",
        "",
        (", ".join(f"`{t}`" for t in terms) if terms else "_not enough signal_"),
        "",
        "### Review references",
        "",
        "Look these up in Play Console → Reviews by ID for full context. "
        "No reviewer name or review text is reproduced here.",
        "",
        "| Review ID | Rating | Date | Language |",
        "| --- | --- | --- | --- |",
    ]
    for r in sorted(reviews, key=lambda r: (r["rating"], r["date"])):
        lines.append(f"| `{r['review_id']}` | {r['rating']}★ | {r['date']} | {r['lang']} |")

    lines += [
        "",
        "---",
        "",
        "*This issue is automatically maintained by the "
        "[triage-reviews workflow](/.github/workflows/triage-reviews.yml). "
        "It is updated in place as new low-rated reviews appear in the window "
        "and intentionally contains no author names or raw review text.*",
    ]
    return "\n".join(lines) + "\n"


def write_issue(existing, body):
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
        f.write(body)
        body_path = f.name
    try:
        if existing:
            subprocess.run(
                [
                    "gh", "issue", "edit", str(existing["number"]),
                    "--repo", REPO,
                    "--body-file", body_path,
                ],
                check=True,
                env={**os.environ, "GH_TOKEN": GH_TOKEN},
            )
            print(f"  ✅ Updated issue #{existing['number']}")
        else:
            subprocess.run(
                [
                    "gh", "issue", "create",
                    "--repo", REPO,
                    "--title", ISSUE_TITLE,
                    "--body-file", body_path,
                    "--label", "user-feedback",
                ],
                check=True,
                env={**os.environ, "GH_TOKEN": GH_TOKEN},
            )
            print("  ✅ Created triage issue")
    finally:
        os.unlink(body_path)


def main():
    print(f"Fetching Play Store reviews for {PACKAGE_NAME} (last {DAYS_BACK} days)...")
    service = env_client()
    reviews = fetch_reviews(service)
    print(f"Found {len(reviews)} review(s) in window.")

    # Material = actionable = potential bugs/problems worth triaging.
    actionable = sorted({r["review_id"] for r in reviews if r["rating"] <= 3 and r["review_id"]})
    actionable_reviews = [r for r in reviews if r["review_id"] in set(actionable)]
    current_marker = ",".join(actionable)
    print(f"Actionable (≤3★): {len(actionable)}")

    if not actionable:
        print("No actionable reviews in window. Skipping.")
        return

    existing = find_existing_issue()
    old_marker = ""
    if existing:
        match = MARKER_RE.search(existing.get("body") or "")
        if match:
            old_marker = match.group(1)

    if current_marker == old_marker:
        print("  ⏭ No change in actionable review set since last run. Skipping.")
        return

    body = build_body(actionable_reviews, current_marker)
    write_issue(existing, body)

    avg = sum(r["rating"] for r in reviews) / len(reviews) if reviews else 0
    print(f"\nSummary: {len(reviews)} reviews, avg rating {avg:.1f}★, {len(actionable)} actionable.")


if __name__ == "__main__":
    main()
