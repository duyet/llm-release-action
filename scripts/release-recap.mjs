// Computes a deterministic "release recap" from git history + the GitHub API and
// emits two files:
//   recap.md         a markdown stats block for the release body
//   recap-facts.txt  compact plain-text facts fed to the LLM so its narrative
//                    recap (a blockquote) can reference real numbers
//
// Best-effort: anything that needs the GitHub API is wrapped so the git-derived
// stats (commits, issues, days, pace, peak hour, day/night) always render even
// if `gh` is missing or rate-limited. Shared verbatim across every duyet repo
// via duyet/llm-release-action.
//
// Env: RANGE (e.g. v0.2.7..HEAD or HEAD), RELEASE_TAG, PREVIOUS_TAG,
//      GITHUB_REPOSITORY, GH_TOKEN/GITHUB_TOKEN (for gh api).

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const env = (k) => (process.env[k] ?? '').trim()
const RANGE = env('RANGE') || 'HEAD'
const REPO = env('GITHUB_REPOSITORY')
const MAX_PRS = 40

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const ghJson = (path) => {
  try {
    return JSON.parse(sh(`gh api "${path}" --paginate 2>/dev/null`))
  } catch {
    return null
  }
}

const isAgent = (login, type) =>
  type === 'Bot' ||
  /(\[bot\]|^.*bot$|copilot|claude|codex|cursor|devin|sweep|gemini|duyetbot|dependabot|renovate)/i.test(login || '')

// --- git-derived stats ---
let lines = []
try {
  lines = sh(`git log --no-merges --pretty=format:'%H%x09%cI%x09%an%x09%s' ${RANGE}`)
    .split('\n')
    .filter(Boolean)
} catch {
  lines = []
}

// Issues closed: best-effort scan of commit bodies for closes/fixes/resolves #N
// (these live in the footer, so we need full bodies %B, not just subjects %s).
let bodies = ''
try {
  bodies = sh(`git log --no-merges --pretty=format:'%B' ${RANGE}`)
} catch {
  bodies = ''
}
const issuesClosed = new Set()
for (const line of bodies.split(/[\r\n]+/)) {
  if (/(?:closes?|fixes?|resolves?|closed|fixed|resolved)/i.test(line)) {
    for (const n of line.matchAll(/#(\d+)/g)) issuesClosed.add(n[1])
  }
}

const commitCount = lines.length
const authors = new Set()
const contributors = new Map() // name -> {name, commits, isAgent}
const prNums = new Set()
const hours = new Array(24).fill(0)
let day = 0
let night = 0
let minT = Infinity
let maxT = -Infinity
for (const l of lines) {
  const [, iso, an, subj] = l.split('\t')
  if (an) {
    authors.add(an)
    const c = contributors.get(an) || { name: an, commits: 0, isAgent: isAgent(an) }
    c.commits++
    contributors.set(an, c)
  }
  const t = Date.parse(iso)
  if (!Number.isNaN(t)) {
    minT = Math.min(minT, t)
    maxT = Math.max(maxT, t)
    const h = new Date(t).getUTCHours()
    hours[h]++
    if (h >= 6 && h < 18) day++
    else night++
  }
  const m = (subj || '').match(/\(#(\d+)\)/) || (subj || '').match(/#(\d+)/)
  if (m) prNums.add(m[1])
}

const spanDays = maxT > minT ? Math.max(1, Math.round((maxT - minT) / 86400000)) : 1
const pace = commitCount ? (commitCount / spanDays).toFixed(1) : '0'
const peakHour = hours.indexOf(Math.max(...hours))
const topContributors = [...contributors.values()].sort((a, b) => b.commits - a.commits).slice(0, 5)

// --- GitHub API stats (best-effort) ---
const agentStats = new Map() // login -> {comments, reviews, approvals, type}
let totalComments = 0
const prList = [...prNums].slice(0, MAX_PRS)
const involved = new Set()

const bump = (login, type, field) => {
  if (!login) return
  involved.add(login)
  if (!isAgent(login, type)) return
  const s = agentStats.get(login) || { comments: 0, reviews: 0, approvals: 0 }
  s[field]++
  agentStats.set(login, s)
}

if (REPO) {
  for (const n of prList) {
    const issueComments = ghJson(`repos/${REPO}/issues/${n}/comments?per_page=100`) || []
    const reviewComments = ghJson(`repos/${REPO}/pulls/${n}/comments?per_page=100`) || []
    const reviews = ghJson(`repos/${REPO}/pulls/${n}/reviews?per_page=100`) || []
    for (const c of [...issueComments, ...reviewComments]) {
      totalComments++
      bump(c.user?.login, c.user?.type, 'comments')
    }
    for (const r of reviews) {
      bump(r.user?.login, r.user?.type, 'reviews')
      if (r.state === 'APPROVED') bump(r.user?.login, r.user?.type, 'approvals')
    }
  }
}

const agents = [...agentStats.entries()]
  .map(([login, s]) => ({ login, ...s, score: s.comments + s.reviews }))
  .sort((a, b) => b.score - a.score)
const topAgent = agents[0]

// --- render ---
const md = ['## 📊 Release recap', '']
md.push(`- 📦 **${commitCount} commit${commitCount === 1 ? '' : 's'}**${prNums.size ? ` across **${prNums.size} pull request${prNums.size === 1 ? '' : 's'}**` : ''}`)
if (issuesClosed.size) md.push(`- 🧯 Closed **${issuesClosed.size} issue${issuesClosed.size === 1 ? '' : 's'}**`)
md.push(`- 🗓️ Shipped over **${spanDays} day${spanDays === 1 ? '' : 's'}** — pace **~${pace} commits/day**`)
if (peakHour >= 0 && hours[peakHour] > 0) md.push(`- ⏰ Peak hour **${String(peakHour).padStart(2, '0')}:00 UTC** · 🌞 ${day} day / 🌙 ${night} night`)
else if (day + night > 0) md.push(`- 🌞 ${day} day / 🌙 ${night} night`)
if (authors.size) md.push(`- 👥 **${authors.size} contributor${authors.size === 1 ? '' : 's'}**`)
if (totalComments) md.push(`- 💬 **${totalComments} comment${totalComments === 1 ? '' : 's'}** back and forth across reviews`)
if (agents.length) md.push(`- 🤖 **${agents.length} AI agent${agents.length === 1 ? '' : 's'}** involved`)
if (topContributors.length) {
  const list = topContributors.map((c) => `${c.isAgent ? '🤖' : '👤'} **${c.name}** (${c.commits})`).join(', ')
  md.push(`- 🙌 Top contributors: ${list}`)
}
writeFileSync('recap.md', `${md.join('\n')}\n`)

const facts = [
  `commits: ${commitCount}`,
  `pull_requests: ${prNums.size}`,
  `issues_closed: ${issuesClosed.size}`,
  `span_days: ${spanDays}`,
  `pace_per_day: ${pace}`,
  `peak_hour_utc: ${peakHour >= 0 && hours[peakHour] > 0 ? peakHour : 'n/a'}`,
  `daytime_commits: ${day}`,
  `nighttime_commits: ${night}`,
  `contributors: ${authors.size}`,
  `review_comments: ${totalComments}`,
  `agents_involved: ${agents.length}`,
  topContributors.length
    ? `top_contributors: ${topContributors.map((c) => `${c.name}(${c.commits}${c.isAgent ? ', ai' : ''})`).join(', ')}`
    : 'top_contributors: none',
  topAgent
    ? `most_active_agent: @${topAgent.login} (${topAgent.comments} comments, ${topAgent.reviews} reviews, ${topAgent.approvals} approvals)`
    : 'most_active_agent: none',
].join('\n')
writeFileSync('recap-facts.txt', `${facts}\n`)
process.stdout.write(`${md.join('\n')}\n`)
