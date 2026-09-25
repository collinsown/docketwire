# Docket Wire

Live dockets on the deals and disputes that reach East Africa's regulators and courts. Each matter is a numbered file showing the gates it has to pass, a dated docket sheet with a source for every entry, and the dates coming up. The dates also publish as a cause list and a calendar people can subscribe to.

The site is plain files. A small builder (`build.js`, no installs) turns the text files in `content/` into the website, and GitHub publishes it for free.

## Where it lives

The site is live at https://collinsown.github.io/docketwire/ and its files are in the GitHub repository `collinsown/docketwire`. Every change you commit republishes the site in about a minute, and it also rebuilds itself every morning at 06:00 Nairobi time, so dates that have passed drop off the cause list.

**To replace many files at once** (for example when you receive an updated zip): unzip it, open https://github.com/collinsown/docketwire/upload/main, open the unzipped folder, click on empty space in it, press Ctrl + A, drag everything into the upload box, wait for the list to finish, and click **Commit changes**. Files with the same names are replaced and new files are added. The `.github` folder may not come across; that is fine, because the publishing file is already in the repository.

**To check a build**, open the **Actions** tab. A green tick next to "Publish site" means the new version is live. If it shows a red cross, open it and click **Re-run all jobs**.

Everything in a public repository can be read by anyone, drafts included.

## Your own address (optional)

Buy the domain from any registrar. For a `.co.ke` name, use a KENIC-accredited registrar. Then:

1. In **Settings > Pages > Custom domain**, enter the address (for example `www.docketwire.co.ke`) and save.
2. At the registrar, add a `CNAME` record for `www` pointing to `collinsown.github.io`. For the bare domain, add four `A` records pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`.
3. When GitHub shows the domain as verified, tick **Enforce HTTPS**.

## Email alerts with beehiiv

beehiiv's free Launch plan covers up to 2,500 subscribers.

1. In beehiiv, go to **Subscribers > Subscribe forms > Create new form**.
2. Style it: button colour `#B3261E`, and a line linking to your privacy page (`/privacy/` on your site).
3. Choose the **Regular** layout and the **Inline** embed, then **Save & get embed code**.
4. Paste the code into `content/subscribe-embed.html` and commit. The form then appears on the front page, the alerts page and every explainer.

Sending is manual on the free plan: once a week, write the email in beehiiv from the week's new entries, the coming dates and the latest explainer.

## Keeping the dockets

Every docket is one file in `content/dockets/`. To change one, open the file on GitHub, click the pencil, edit, and commit.

**Write the story.** Every docket opens with three sections of plain prose above the gates: `## The story so far` (what the deal is and how it got here), `## Why it matters` (what it means for the market and for the people advising on it) and `## What to watch` (the next steps and the risks). Write them as connected paragraphs and keep them current when a gate moves. Any other `##` heading you add above `## Gates` is published the same way. List the articles the story relies on under `sources:` in the front of the file, one per line as `  - Publication, date | https://...`; they appear under the story as "Sources for this story".

**Add what happened** as a line under `## Entries`:

```
- 2026-10-02 | The Capital Markets Tribunal dismisses the appeal. | [Business Daily, 2 October 2026](https://...)
```

**Change a gate** by editing its line under `## Gates`. A gate line reads: authority code, what needs approving, status, date, note, sources.

```
- CMT | Minority shareholders' appeal against the exemption | cleared | 2026-10-02 | Appeal dismissed. | [Business Daily, 2 October 2026](https://...)
```

Statuses: `cleared`, `conditions` (cleared with conditions), `pending`, `hold` (a court or tribunal order is in force), `challenged`, `refused`, `unknown` (expected but nothing reported).

**Add a coming date** under `## Next`. Delete it once it has happened and record it as an entry instead.

**Dates** can be a day (`2026-10-07`), about a day (`~2026-09-30`), a month (`2026-10`), a quarter (`2026-Q4`), a half year (`2026-H2`), a year (`2026`), or `Not fixed`. Only exact days go into the calendar feed; the rest stay on the cause list page.

**Open a new docket** by copying `content/dockets/_template.md` to a new file named after the matter, such as `bank-merger.md`. Give it the next number (`number: 9 of 2026`), fill in the front, and add its gates, entries and next dates.

**Close a docket** by setting `status: completed` (or `withdrawn`, or `blocked`) and `closed: 2026-10` in its front.

**A new regulator or court** goes in `content/authorities.csv` with a short code. Gates refer to it by that code, and it gets its own page once a docket names it.

**Other dates** for the cause list, such as rate decisions and filing deadlines, go in `content/calendar.csv`.

**Rates** are in `content/rates.csv`.

**Analysis** pieces are the long reads in `content/explainers/` (the site calls them Analysis). Copy `_template.md`, name the file with the date first (`2026-10-05-short-name.md`), and set `docket:` to the docket's file name so the two link to each other. `points:` holds the key points shown in the box at the top of the piece, one per line, and every `##` heading in the body becomes an entry in the contents list beside it. A definition box is a quote block that starts with a `###` heading.

Files whose names start with `_` are never published. If something is typed wrong, the build still runs and prints a note saying what to fix; you can read it under the **Actions** tab.

## Drafting updates with Claude

Paste this into a Claude chat, with the docket files you want checked (paste them, or give their raw links: open a file on GitHub and click **Raw**):

```
I run Docket Wire, a site of live dockets on East African deals and disputes.
Below are my current docket files. Search for anything that has happened since
each file's last entry, and for any new deal or dispute that has reached a
regulator, tribunal or court in Kenya or East Africa this week.

For each change, give me the exact lines to paste, in the file's own format:
entries as "date | what happened | sources", gate lines as
"code | what | status | date | note | sources", and next dates the same way.
For a new matter, give me a complete new docket file based on the template.
Use only facts a source states, put primary sources (company announcements,
regulator decisions, court orders) first, and write sources as
[Publication, date](link). Tell me what you could not confirm.
Where a change affects the story, also give me rewritten versions of the
docket's "The story so far", "Why it matters" and "What to watch" sections,
in full connected paragraphs, with no em dashes.
Once a week, also draft a long-form analysis (1,200 to 1,800 words) on the
matter that moved most, in the explainer template's format, with four key
points, a definition box for the main legal concept, the argument on each
side, and a closing section on what to watch.
```

Check each line against its source before you commit it.

## Preview on your computer (optional)

With Node.js 18 or later installed, run `node build.js serve` in this folder and open http://localhost:8080. The finished site is written to `dist/`, which is never uploaded.

## What is where

- `content/dockets/` one file per matter
- `content/explainers/` the long-form analysis pieces, each linked to a docket
- `content/authorities.csv` regulators, tribunals and courts
- `content/calendar.csv` dates that belong to no docket
- `content/rates.csv` the rates list
- `content/pages/` About and Privacy
- `content/subscribe-embed.html` the beehiiv form code
- `site.config.json` name, tagline, contact email and social links
- `assets/` styles, fonts, icons and the share image
- `build.js` the builder
- `.github/workflows/publish.yml` the publishing instructions for GitHub
