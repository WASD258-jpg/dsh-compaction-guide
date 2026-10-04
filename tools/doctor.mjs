#!/usr/bin/env node
/**
 * dsh-compaction-doctor — diagnose automatic-compaction health from session logs.
 *
 * Reads DSH session logs (zstd multi-frame JSONL), counts compaction outcomes,
 * classifies failures, and reports whether the session corpus shows the three
 * known defects documented in this repository.
 *
 * Usage:
 *   node tools/doctor.mjs [sessions-root] [--json] [--verbose]
 *
 * Default root: $DSH_HOME/sessions  (falls back to ~/.dsh/sessions)
 *
 * @module dsh-FixCompaction/tools/doctor
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

/* ------------------------------------------------------------------ decoding */

/**
 * Decode a zstd multi-frame log into its line-joined text.
 *
 * A whole-buffer `zstdDecompressSync` call returns only the FIRST frame and does
 * not throw — measured: 188 bytes vs 25,048,287 across 709 frames. Frame
 * boundaries must be located by magic and each frame decompressed separately.
 *
 * @param file - path to a `.jsonl.zstd` session log.
 * @returns { text, frames, failedFrames }
 */
function decodeLog(file) {
  const buf = fs.readFileSync(file)
  const offsets = []
  for (let i = 0; i + 4 <= buf.length; i += 1) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1]
      && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) offsets.push(i)
  }
  const parts = []
  let failedFrames = 0
  for (let i = 0; i < offsets.length; i += 1) {
    const slice = buf.subarray(offsets[i], i + 1 < offsets.length ? offsets[i + 1] : buf.length)
    try { parts.push(zlib.zstdDecompressSync(slice)) } catch { failedFrames += 1 }
  }
  return { text: Buffer.concat(parts).toString('utf8'), frames: offsets.length, failedFrames }
}

/** Parse newline-delimited JSON, silently skipping a truncated tail line. */
function parseEvents(text) {
  const out = []
  for (const line of text.split('\n')) {
    if (!line) continue
    try { out.push(JSON.parse(line)) } catch { /* truncated tail */ }
  }
  return out
}

/** Walk a directory tree collecting session log files. */
function findLogs(root, out = []) {
  let entries
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { return out }
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) findLogs(full, out)
    else if (entry.name.endsWith('.jsonl.zstd')) out.push(full)
  }
  return out
}

/* ------------------------------------------------------------------ analysis */

/**
 * Pick exactly ONE log per session directory.
 *
 * A session directory can hold `session.jsonl.zstd`, `session.v3.jsonl.zstd`,
 * and `session.v4.jsonl.zstd` side by side. These are **snapshots of the same
 * session and overlap heavily** — counting every file inflates every number.
 * Measured on one corpus: counting all files gave 84 `compaction/start` and 478
 * HTTP-413 failures; counting one file per session gave materially lower,
 * correct figures. The inflated numbers are wrong.
 *
 * Choosing which file is harder than it looks, because the snapshots are not
 * nested:
 *
 *   - `session.jsonl.zstd` is a truncated residue in some directories but the
 *     largest file in others;
 *   - a lower format version can hold MORE events than a higher one;
 *   - the snapshot with the most events is not necessarily the one with the
 *     most recent activity (a later snapshot may compact away events, so its
 *     total event count falls while its `lastTime` rises).
 *
 * Picking by event count alone therefore silently drops recent evidence —
 * observed: a directory reported 5 compactions instead of 7, and 413 failures
 * vanished entirely.
 *
 * The honest fix is to score on **recency first, volume second**: a diagnostic
 * must see the latest state of a session. `--merge` is available for callers
 * who want union semantics instead.
 *
 * @param logs - all discovered log paths.
 * @param merge - when true, return every file (union of snapshots) instead of one.
 * @returns selected log paths.
 */
function pickLatestPerSession(logs, merge) {
  if (merge) return logs
  const byDir = new Map()
  for (const file of logs) {
    const dir = path.dirname(file)
    const list = byDir.get(dir)
    if (list) list.push(file)
    else byDir.set(dir, [file])
  }
  const chosen = []
  for (const files of byDir.values()) {
    if (files.length === 1) { chosen.push(files[0]); continue }
    let best = null
    for (const file of files) {
      let events = []
      try { events = parseEvents(decodeLog(file).text) } catch { /* unreadable */ }
      const lastTime = events.at(-1)?.time
        ?? events.find(e => e.type === 'session')?.createdAt
        ?? 0
      const score = { file, lastTime, count: events.length }
      if (best === null || score.lastTime > best.lastTime
        || (score.lastTime === best.lastTime && score.count > best.count)) {
        best = score
      }
    }
    chosen.push(best.file)
  }
  return chosen
}

/** Classify one compaction failure by its persisted error text. */
function classifyFailure(text) {
  if (typeof text !== 'string') return 'other'
  if (/context overflow|context[_ ]length|context[_ ]window|too large for|exceeds? (?:the )?(?:model|maximum)/i.test(text)) {
    return 'overflow'
  }
  if (/aborted|cancel/i.test(text)) return 'aborted'
  if (/timeout|timed out/i.test(text)) return 'timeout'
  if (/rate.?limit|429/i.test(text)) return 'rate-limit'
  return 'other'
}

/** Collect per-session compaction facts. */
function analyseSession(file) {
  const { text, frames, failedFrames } = decodeLog(file)
  const events = parseEvents(text)

  // A forked session declares `parentSession` and carries `seedLength` at the TOP
  // LEVEL of its `session` header event (not under `data`). Events with
  // seq < seedLength are a byte-identical replay of the parent's history, not work
  // this session performed. Upstream treats `seq >= inheritedEventCount` as "this
  // session's own work" (core/session/src/index.ts).
  //
  // Counting them inflates the corpus: the parent's compactions get counted once
  // for the parent and again for each fork. Directory-based de-duplication cannot
  // see this, because the two live in different directories.
  const header = events.find(e => e.type === 'session')
  const parentSession = typeof header?.parentSession === 'string' ? header.parentSession : null
  const seedLength = Number.isInteger(header?.seedLength) ? header.seedLength : null
  const inheritedCut = parentSession !== null && seedLength !== null ? seedLength : 0
  const isFork = parentSession !== null
  const own = (e) => e.seq >= inheritedCut

  const counts = {}
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1

  const starts = events.filter(e => e.type === 'compaction/start')
  const ends = events.filter(e => e.type === 'compaction/end')
  const summaries = events.filter(e => e.type === 'compaction/summary')
  const failed = ends.filter(e => e.data?.error !== undefined)

  // The same events, restricted to this session's own work.
  const ownStarts = starts.filter(own)
  const ownSummaries = summaries.filter(own)
  const ownFailed = failed.filter(own)
  const inheritedStarts = starts.length - ownStarts.length

  // Failure taxonomy. Note: `compaction/end` persists `error` as a FLATTENED
  // string via errorChain(); `code`/`name`/`cause` are NOT stored, so
  // classification must read rendered text.
  const failureKinds = {}
  for (const e of ownFailed) {
    const kind = classifyFailure(e.data.error)
    failureKinds[kind] = (failureKinds[kind] ?? 0) + 1
  }

  // HTTP status + assigned code, from assistant/attempt stream failures.
  //
  // These are counted from THIS file only, so a session stored in several snapshots
  // would be counted once per snapshot under `--merge`. Per-session figures are
  // therefore only comparable across the default (one file per session) run.
  const statuses = {}
  const codes = {}
  for (const e of events) {
    if (e.type !== 'assistant/attempt') continue
    if (!own(e)) continue
    const stream = e.data?.stream
    if (!Array.isArray(stream)) continue
    for (const entry of stream) {
      const failure = entry?.chunk?.reason?.failure
      if (!failure || typeof failure !== 'object') continue
      if (typeof failure.code === 'string') codes[failure.code] = (codes[failure.code] ?? 0) + 1
      if (failure.status !== undefined) {
        const key = `${failure.status} → ${failure.code}`
        statuses[key] = (statuses[key] ?? 0) + 1
      }
    }
  }

  // Retry cadence: consecutive start timestamps within one turn.
  const times = ownStarts.map(e => e.time).filter(t => typeof t === 'number')
  const gaps = []
  for (let i = 1; i < times.length; i += 1) gaps.push(times[i] - times[i - 1])
  gaps.sort((a, b) => a - b)

  // Summary sizes. The guide publishes a max and a median for these, and previously
  // cited this tool as the reproduction path while the tool did not compute them at
  // all -- an empty reproduction path.
  //
  // Two measures are collected because they answer different questions:
  //   textChars   - the summary text as persisted, useful for a size floor
  //   outputTokens- the provider's own count for the summarization call, which is
  //                 what a context budget is actually spent on
  const summarySizes = []
  for (const e of ownSummaries) {
    const blocks = e.data?.summary
    let chars = 0
    if (Array.isArray(blocks)) {
      for (const b of blocks) if (typeof b?.text === 'string') chars += b.text.length
    } else if (typeof blocks === 'string') chars = blocks.length
    const out = e.data?.usage?.outputTokens
    summarySizes.push({
      seq: e.seq,
      chars,
      outputTokens: typeof out === 'number' ? out : null,
    })
  }

  // Sessions that were handed off (session-rescue), if the marker exists.
  const handoff = events.some(e =>
    e.type === 'session/title' && typeof e.data?.title === 'string' && /已交接|handed off/i.test(e.data.title))

  return {
    dir: path.basename(path.dirname(file)),
    file: path.basename(file),
    id: header?.id ?? path.basename(path.dirname(file)),
    cwd: header?.cwd ?? '',
    events: events.length,
    frames,
    failedFrames,
    // own-work counts: the figures the corpus totals are built from
    starts: ownStarts.length,
    ends: ends.filter(own).length,
    summaries: ownSummaries.length,
    failed: ownFailed.length,
    // inheritance bookkeeping, so inflation is visible rather than silent
    isFork,
    parentSession,
    seedLength,
    inheritedStarts,
    inheritedSummaries: summaries.length - ownSummaries.length,
    inheritedFailed: failed.length - ownFailed.length,
    rawStarts: starts.length,
    rawSummaries: summaries.length,
    rawFailed: failed.length,
    failureKinds,
    statuses,
    codes,
    gaps,
    summarySizes,
    handoff,
    lastTime: events.at(-1)?.time ?? header?.createdAt ?? 0,
  }
}

/* -------------------------------------------------------------------- report */

function median(sorted) {
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function main() {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const verbose = args.includes('--verbose')
  const merge = args.includes('--merge')
  const positional = args.filter(a => !a.startsWith('--'))

  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  const root = positional[0] ?? path.join(home, 'sessions')

  if (!fs.existsSync(root)) {
    console.error(`sessions root not found: ${root}`)
    console.error('pass it explicitly: node tools/doctor.mjs <sessions-root>')
    process.exit(2)
  }

  const all = findLogs(root)
  const logs = pickLatestPerSession(all, merge)
  const rows = []
  for (const file of logs) {
    try { rows.push(analyseSession(file)) } catch { /* unreadable log */ }
  }
  rows.sort((a, b) => b.lastTime - a.lastTime)

  const total = {
    sessions: rows.length,
    starts: rows.reduce((n, r) => n + r.starts, 0),
    summaries: rows.reduce((n, r) => n + r.summaries, 0),
    failed: rows.reduce((n, r) => n + r.failed, 0),
  }
  // Fork inheritance: the same events replayed inside a child session's seed. These
  // are counted by a naive pass and must not be. Reported rather than silently
  // dropped, so a reader can see how much the corpus totals were inflated before.
  const inheritance = {
    forkSessions: rows.filter(r => r.isFork).length,
    forksCarryingCompaction: rows.filter(r => r.isFork && r.inheritedStarts > 0).length,
    inheritedStarts: rows.reduce((n, r) => n + r.inheritedStarts, 0),
    inheritedSummaries: rows.reduce((n, r) => n + r.inheritedSummaries, 0),
    inheritedFailed: rows.reduce((n, r) => n + r.inheritedFailed, 0),
    rawStarts: rows.reduce((n, r) => n + r.rawStarts, 0),
    rawSummaries: rows.reduce((n, r) => n + r.rawSummaries, 0),
    rawFailed: rows.reduce((n, r) => n + r.rawFailed, 0),
  }
  const withCompaction = rows.filter(r => r.starts > 0)
  const successRate = total.starts > 0 ? (total.summaries / total.starts) * 100 : null

  // Aggregate failure taxonomy.
  const kinds = {}
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.failureKinds)) kinds[k] = (kinds[k] ?? 0) + v
  }
  const statuses = {}
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.statuses)) statuses[k] = (statuses[k] ?? 0) + v
  }

  // Summary size distribution, seeded from the per-session records above.
  const allSizes = rows.flatMap(r => r.summarySizes ?? [])
  const charSizes = allSizes.map(s => s.chars).filter(n => n > 0).sort((a, b) => a - b)
  const tokenSizes = allSizes.map(s => s.outputTokens).filter(n => typeof n === 'number').sort((a, b) => a - b)
  const summarySizes = {
    count: allSizes.length,
    chars: {
      n: charSizes.length,
      min: charSizes[0] ?? null,
      max: charSizes.at(-1) ?? null,
      median: median(charSizes),
    },
    outputTokens: {
      n: tokenSizes.length,
      min: tokenSizes[0] ?? null,
      max: tokenSizes.at(-1) ?? null,
      median: median(tokenSizes),
    },
  }

  // Defect inference.
  const findings = []
  if (total.starts > 0 && successRate !== null && successRate < 50) {
    findings.push({
      id: 'B-low-success',
      severity: 'high',
      title: `Compaction success rate is ${successRate.toFixed(0)}% (${total.summaries}/${total.starts})`,
      detail: 'Below 50% indicates the summarization request is itself exceeding a budget. See root cause B.',
    })
  }
  const overflowFailures = kinds.overflow ?? 0
  if (overflowFailures > 0) {
    findings.push({
      id: 'B-overflow',
      severity: 'high',
      title: `${overflowFailures} compaction failure(s) were overflow-classified`,
      detail: 'The summarization request exceeded a window or transport limit. See root cause B.',
    })
  }
  const invalid413 = Object.entries(statuses).filter(([k]) => k.startsWith('413'))
  if (invalid413.length > 0) {
    findings.push({
      id: 'A-misclassified-413',
      severity: 'high',
      title: `HTTP 413 observed: ${invalid413.map(([k, v]) => `${k} ×${v}`).join(', ')}`,
      detail: 'If classified INVALID_REQUEST, overflow recovery never runs (root cause A). Verify the code above.',
    })
  }
  const stormRow = rows.find(r => r.gaps.length >= 5
    && median(r.gaps) !== null && r.gaps[r.gaps.length - 1] < median(r.gaps) * 3)
  if (stormRow) {
    findings.push({
      id: 'C-no-backoff',
      severity: 'medium',
      title: `Retry storm pattern in ${stormRow.id.slice(0, 24)}… (${stormRow.gaps.length} consecutive retries)`,
      detail: `Median gap ${Math.round(median(stormRow.gaps) / 1000)}s; the maximum gap is under 3x the median, which indicates no backoff growth. See root cause C.`,
    })
  }
  const handoffs = rows.filter(r => r.handoff)
  if (handoffs.length > 0) {
    findings.push({
      id: 'handoff',
      severity: 'medium',
      title: `${handoffs.length} session(s) carry a handoff title`,
      detail: 'A handoff is usually the user running /rescue after compaction stopped making progress.',
    })
  }

  if (asJson) {
    console.log(JSON.stringify({
      root,
      logsFound: all.length,
      sessionsAnalysed: rows.length,
      totals: { ...total, withCompaction: withCompaction.length, successRate },
      inheritance,
      summarySizes,
      failureKinds: kinds,
      httpStatuses: statuses,
      findings,
      sessions: verbose ? rows : undefined,
    }, null, 2))
    return
  }

  /* ---------------------------------------------------------- human report */

  console.log('')
  console.log('  dsh-compaction-doctor')
  console.log('  =====================')
  console.log(`  root:     ${root}`)
  console.log(`  logs:     ${all.length} files found, ${rows.length} analysed`
    + (merge ? ' (union: every snapshot, so one session may appear more than once)' : ' (one snapshot per session)'))
  console.log('')

  console.log('  Compaction totals')
  console.log(`    compaction/start      ${String(total.starts).padStart(6)}`)
  console.log(`    compaction/summary    ${String(total.summaries).padStart(6)}   (succeeded)`)
  console.log(`    failed closures       ${String(total.failed).padStart(6)}`)
  console.log(`    success rate          ${successRate === null ? '     n/a' : `${successRate.toFixed(1).padStart(6)}%`}`)
  console.log(`    sessions with dumps   ${String(withCompaction.length).padStart(6)}`)
  console.log('')

  // Make inheritance visible. Silently subtracting it would hide how much the
  // naive count was inflated, which is exactly the fact a reader needs.
  if (inheritance.inheritedStarts > 0) {
    console.log('  Fork inheritance excluded from the totals above')
    console.log(`    forked sessions                        ${String(inheritance.forkSessions).padStart(6)}`)
    console.log(`    forks replaying a parent's compactions ${String(inheritance.forksCarryingCompaction).padStart(6)}`)
    console.log(`    inherited compaction/start             ${String(inheritance.inheritedStarts).padStart(6)}`)
    console.log(`    inherited compaction/summary           ${String(inheritance.inheritedSummaries).padStart(6)}`)
    console.log(`    inherited failed closures              ${String(inheritance.inheritedFailed).padStart(6)}`)
    console.log(`    naive totals would be          ${inheritance.rawStarts} / ${inheritance.rawSummaries} / ${inheritance.rawFailed}`)
    console.log('')
    console.log('    A forked session replays its parent\'s history inside seedLength.')
    console.log('    Those events are the PARENT\'s work, counted again in the child\'s log.')
    console.log('    Directory-based de-duplication cannot see it: the two live in')
    console.log('    different directories.')
    console.log('')
  }

  if (Object.keys(kinds).length > 0) {
    console.log('  Failure taxonomy (by rendered error text)')
    for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${k.padEnd(12)} ${String(v).padStart(6)}`)
    }
    console.log('')
  }

  if (summarySizes.count > 0) {
    console.log('  Summary sizes (this session set only)')
    console.log(`    recorded summaries      ${String(summarySizes.count).padStart(6)}`)
    if (summarySizes.outputTokens.n > 0) {
      const t = summarySizes.outputTokens
      console.log(`    provider outputTokens   n=${t.n}  min=${t.min}  median=${t.median}  max=${t.max}`)
    }
    if (summarySizes.chars.n > 0) {
      const c = summarySizes.chars
      console.log(`    summary text chars      n=${c.n}  min=${c.min}  median=${c.median}  max=${c.max}`)
    }
    console.log('')
  }

  if (Object.keys(statuses).length > 0) {
    console.log('  HTTP status → assigned code')
    for (const [k, v] of Object.entries(statuses).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${k.padEnd(32)} ${String(v).padStart(6)}`)
    }
    console.log('')
  }

  if (withCompaction.length > 0) {
    console.log('  Sessions that compacted')
    console.log('    ' + 'session'.padEnd(26) + 'start'.padStart(6) + 'ok'.padStart(6) + 'fail'.padStart(6) + '  last')
    for (const r of withCompaction.slice(0, 12)) {
      const t = r.lastTime ? new Date(r.lastTime).toISOString().slice(0, 16).replace('T', ' ') : ''
      console.log('    ' + String(r.id).slice(0, 25).padEnd(26)
        + String(r.starts).padStart(6) + String(r.summaries).padStart(6)
        + String(r.failed).padStart(6) + '  ' + t)
    }
    console.log('')
  }

  console.log('  Findings')
  if (findings.length === 0) {
    console.log('    No known defect signature detected in this corpus.')
  } else {
    for (const f of findings) {
      const tag = f.severity === 'high' ? '[HIGH]  ' : '[MEDIUM]'
      console.log(`    ${tag} ${f.title}`)
      console.log(`             ${f.detail}`)
      console.log('')
    }
  }

  console.log('  Reference: root causes A/B/C are documented in README.md and EVIDENCE.md')
  console.log('')
}

main()
