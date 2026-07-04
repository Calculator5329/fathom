import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const sourcePath =
  process.argv[2] ??
  'C:\\Users\\et2bo\\Desktop\\New folder\\master-site\\exports\\projection-data-2026-07-03\\stock-projections-2-full.json'
const outputDir = path.join(root, 'app', 'public', 'data')
const seedJsonPath = path.join(outputDir, 'projection-seed-2026-07-03.json')
const seedPagePath = path.join(outputDir, 'seed-projections.html')

const targetEmail = '5329548871.eg@gmail.com'
const targetUid = 'bFVdRJo3X2VOd0ryyjwx1M0KR6Y2'
const expectedCount = 17

const firebaseConfig = {
  apiKey: 'AIzaSyAjqKuEWI3xzYaHN594Evod45gsSYALfLc',
  authDomain: 'ethan-488900.firebaseapp.com',
  projectId: 'ethan-488900',
  storageBucket: 'ethan-488900.firebasestorage.app',
  messagingSenderId: '108003293186',
  appId: '1:108003293186:web:c9270c261acea823164f1b',
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function asFiniteNumber(value, field, ticker) {
  assert(Number.isFinite(value), `${ticker}: ${field} must be a finite number`)
  return value
}

function parseEpoch(value, field, ticker) {
  const ms = Date.parse(value)
  assert(Number.isFinite(ms), `${ticker}: ${field} must be a valid date`)
  return ms
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function scenario(source, label, ticker) {
  assert(source && typeof source === 'object', `${ticker}: missing ${label} scenario`)
  return {
    revenueGrowth: round(asFiniteNumber(source.revenueGrowth, `${label}.revenueGrowth`, ticker) / 100),
    netMargin: round(asFiniteNumber(source.profitMargin, `${label}.profitMargin`, ticker) / 100),
    exitPe: round(asFiniteNumber(source.peRatio, `${label}.peRatio`, ticker)),
    dividendYield: round(asFiniteNumber(source.dividendAndBuyback, `${label}.dividendAndBuyback`, ticker) / 100),
    buybackYield: 0,
  }
}

function transformProjection(source) {
  assert(source && typeof source === 'object', 'Projection row must be an object')
  assert(typeof source.ticker === 'string' && source.ticker.trim(), 'Projection row missing ticker')

  const ticker = source.ticker.trim().toUpperCase()
  const notes = typeof source.notes === 'string' ? source.notes : ''

  return {
    ticker,
    inputs: {
      baseRevenue: round(asFiniteNumber(source.currentRevenue, 'currentRevenue', ticker) * 1000),
      netIncome: round(asFiniteNumber(source.currentNetIncome, 'currentNetIncome', ticker) * 1000),
      sharesOut: round(asFiniteNumber(source.sharesOutstanding, 'sharesOutstanding', ticker) * 1000),
      currentPrice: round(asFiniteNumber(source.currentPrice, 'currentPrice', ticker)),
      horizonYears: asFiniteNumber(source.years, 'years', ticker),
    },
    scenarios: {
      bear: scenario(source.scenarios?.conservative, 'conservative', ticker),
      base: scenario(source.scenarios?.moderate, 'moderate', ticker),
      bull: scenario(source.scenarios?.aggressive, 'aggressive', ticker),
    },
    notes,
    createdAt: parseEpoch(source.createdAt, 'createdAt', ticker),
    updatedAt: parseEpoch(source.lastUpdated, 'lastUpdated', ticker),
  }
}

function validateProjection(doc) {
  assert(doc.ticker.length > 0 && doc.ticker.length <= 12, `${doc.ticker}: invalid ticker length`)
  assert(doc.inputs && typeof doc.inputs === 'object', `${doc.ticker}: missing inputs`)
  assert(Number.isFinite(doc.inputs.baseRevenue), `${doc.ticker}: invalid baseRevenue`)
  assert(Number.isFinite(doc.inputs.netIncome), `${doc.ticker}: invalid netIncome`)
  assert(Number.isFinite(doc.inputs.sharesOut), `${doc.ticker}: invalid sharesOut`)
  assert(Number.isFinite(doc.inputs.currentPrice), `${doc.ticker}: invalid currentPrice`)
  assert(Number.isFinite(doc.inputs.horizonYears), `${doc.ticker}: invalid horizonYears`)
  assert(doc.inputs.horizonYears >= 1 && doc.inputs.horizonYears <= 30, `${doc.ticker}: horizon out of bounds`)
  assert(doc.scenarios && typeof doc.scenarios === 'object', `${doc.ticker}: missing scenarios`)
  assert(typeof doc.notes === 'string', `${doc.ticker}: notes must be a string`)
  assert(doc.notes.length <= 5000, `${doc.ticker}: notes exceeds 5000 chars`)
  assert(Number.isFinite(doc.updatedAt), `${doc.ticker}: invalid updatedAt`)
}

function buildSeedPage() {
  const configJson = JSON.stringify(firebaseConfig, null, 2)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fathom Projection Seeder</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #07110d;
        color: #eef6f1;
      }

      body {
        margin: 0;
        min-height: 100vh;
        padding: 48px 20px;
      }

      main {
        margin: 0 auto;
        width: min(920px, 100%);
      }

      h1 {
        margin: 0 0 8px;
        font-size: 28px;
        letter-spacing: 0;
      }

      p,
      li {
        color: #a8b8af;
        line-height: 1.55;
      }

      code,
      pre {
        font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace;
      }

      .panel {
        border: 1px solid #21382f;
        border-radius: 8px;
        background: #0c1813;
        margin-top: 20px;
        padding: 18px;
      }

      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 20px;
        margin: 10px 0;
      }

      .label {
        color: #a8b8af;
        min-width: 140px;
      }

      .ok {
        color: #5fe0a0;
      }

      pre {
        background: #06100c;
        border: 1px solid #21382f;
        border-radius: 8px;
        overflow: auto;
        padding: 14px;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Fathom Projection Seeder</h1>
      <p>
        Browser Google sign-in is not required for this seed path. The generated JSON is ready,
        and the local REST seeder can write the 17 projections with a short-lived Google Cloud
        access token.
      </p>

      <div class="panel">
        <div class="row"><span class="label">Status</span><strong class="ok">Seed files ready</strong></div>
        <div class="row"><span class="label">Target project</span><code>${firebaseConfig.projectId}</code></div>
        <div class="row"><span class="label">Target user</span><code>${targetEmail}</code></div>
        <div class="row"><span class="label">Target UID</span><code>${targetUid}</code></div>
        <div class="row"><span class="label">Seed count</span><code>${expectedCount}</code></div>
        <div class="row"><span class="label">Write path</span><code>users/${targetUid}/projections/{TICKER}</code></div>
      </div>

      <div class="panel">
        <p>From the repo root, validate the payload without writing:</p>
        <pre>node scripts/seed-projections-rest.mjs</pre>
        <p>To write the data, provide a short-lived access token and run the seeder with <code>--write</code>:</p>
        <pre>$env:GOOGLE_OAUTH_ACCESS_TOKEN = (gcloud auth print-access-token)
node scripts/seed-projections-rest.mjs --write</pre>
        <p>
          The script overwrites only these 17 ticker docs and leaves unrelated projection docs alone.
          It does not print the token.
        </p>
      </div>

      <div class="panel">
        <p>Seeded tickers:</p>
        <pre>GOOGL, META, MELI, CRM, ADBE, AMZN, NKE, DUOL, ASML, AMD, TXRH, PYPL, SOFI, NFLX, MA, AAPL, MSFT</pre>
      </div>
    </main>
  </body>
</html>
`

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fathom Projection Seeder</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #07110d;
        color: #eef6f1;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: start center;
        padding: 48px 20px;
      }

      main {
        width: min(880px, 100%);
      }

      h1 {
        margin: 0 0 8px;
        font-size: 28px;
        letter-spacing: 0;
      }

      p {
        color: #a8b8af;
        line-height: 1.55;
      }

      button {
        border: 1px solid #254538;
        border-radius: 8px;
        background: #153929;
        color: #eef6f1;
        cursor: pointer;
        font: inherit;
        margin-right: 8px;
        padding: 10px 14px;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      code,
      pre {
        font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace;
      }

      .panel {
        border: 1px solid #21382f;
        border-radius: 8px;
        background: #0c1813;
        margin-top: 20px;
        padding: 18px;
      }

      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 20px;
        margin: 10px 0;
      }

      .label {
        color: #a8b8af;
        min-width: 120px;
      }

      .ok {
        color: #5fe0a0;
      }

      .bad {
        color: #ff7b7b;
      }

      pre {
        background: #06100c;
        border: 1px solid #21382f;
        border-radius: 8px;
        overflow: auto;
        padding: 14px;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Fathom Projection Seeder</h1>
      <p>
        Seeds 17 legacy projections into <code>users/${targetUid}/projections/{TICKER}</code>.
        This page refuses to write unless the signed-in Firebase user is <code>${targetEmail}</code>
        with UID <code>${targetUid}</code>.
      </p>

      <div class="panel">
        <div class="row"><span class="label">Status</span><strong id="status">Loading seed data...</strong></div>
        <div class="row"><span class="label">Signed in as</span><code id="identity">Not signed in</code></div>
        <div class="row"><span class="label">Seed count</span><code id="count">-</code></div>
        <button id="signin" type="button">Sign in with Google</button>
        <button id="seed" type="button" disabled>Overwrite 17 projection docs</button>
      </div>

      <pre id="log"></pre>
    </main>

    <script type="module">
      import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js'
      import {
        GoogleAuthProvider,
        getAuth,
        onAuthStateChanged,
        signInWithPopup,
      } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js'
      import {
        doc,
        getFirestore,
        serverTimestamp,
        setDoc,
      } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js'

      const targetEmail = ${JSON.stringify(targetEmail)}
      const targetUid = ${JSON.stringify(targetUid)}
      const expectedCount = ${expectedCount}
      const firebaseConfig = ${configJson}

      const app = initializeApp(firebaseConfig)
      const auth = getAuth(app)
      const db = getFirestore(app)
      const provider = new GoogleAuthProvider()

      const statusEl = document.querySelector('#status')
      const identityEl = document.querySelector('#identity')
      const countEl = document.querySelector('#count')
      const signInButton = document.querySelector('#signin')
      const seedButton = document.querySelector('#seed')
      const logEl = document.querySelector('#log')

      let seed = null
      let currentUser = null

      function log(line) {
        logEl.textContent += line + '\\n'
      }

      function normalizedEmail(value) {
        return typeof value === 'string' ? value.trim().toLowerCase() : ''
      }

      function normalizedUid(value) {
        return typeof value === 'string' ? value.trim() : ''
      }

      function allowedUser(user) {
        return normalizedEmail(user?.email) === normalizedEmail(targetEmail) && normalizedUid(user?.uid) === normalizedUid(targetUid)
      }

      function refresh() {
        const allowed = allowedUser(currentUser)
        identityEl.textContent = currentUser
          ? currentUser.email + ' / ' + currentUser.uid
          : 'Not signed in'
        identityEl.className = allowed ? 'ok' : currentUser ? 'bad' : ''
        seedButton.disabled = !seed || !allowed
        statusEl.textContent = allowed
          ? 'Ready to seed'
          : currentUser
            ? 'Signed in user does not match target'
            : 'Sign in required'
        statusEl.className = allowed ? 'ok' : currentUser ? 'bad' : ''
      }

      async function loadSeed() {
        const response = await fetch('./projection-seed-2026-07-03.json', { cache: 'no-store' })
        if (!response.ok) throw new Error('Failed to load seed JSON: HTTP ' + response.status)
        seed = await response.json()
        if (!Array.isArray(seed.projections)) throw new Error('Seed JSON missing projections array')
        if (seed.projections.length !== expectedCount) {
          throw new Error('Expected ' + expectedCount + ' projections, found ' + seed.projections.length)
        }
        countEl.textContent = String(seed.projections.length)
        log('Loaded ' + seed.projections.length + ' projections: ' + seed.projections.map((p) => p.ticker).join(', '))
        refresh()
      }

      async function seedFirestore() {
        if (!allowedUser(currentUser)) {
          throw new Error('Refusing to seed: signed-in user does not match target email and UID')
        }

        seedButton.disabled = true
        log('Starting overwrite into users/' + targetUid + '/projections/{TICKER}')
        let ok = 0
        const failures = []

        for (const projection of seed.projections) {
          try {
            const ref = doc(db, 'users', targetUid, 'projections', projection.ticker)
            await setDoc(ref, { ...projection, _serverUpdatedAt: serverTimestamp() })
            ok += 1
            log('OK ' + projection.ticker)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            failures.push({ ticker: projection.ticker, message })
            log('FAIL ' + projection.ticker + ': ' + message)
          }
        }

        const summary = {
          email: currentUser.email,
          uid: currentUser.uid,
          attempted: seed.projections.length,
          succeeded: ok,
          failed: failures.length,
          failures,
        }
        log('')
        log(JSON.stringify(summary, null, 2))
        statusEl.textContent = failures.length === 0 ? 'Seed complete' : 'Seed finished with failures'
        statusEl.className = failures.length === 0 ? 'ok' : 'bad'
        refresh()
      }

      signInButton.addEventListener('click', async () => {
        try {
          await signInWithPopup(auth, provider)
        } catch (error) {
          log('Sign-in failed: ' + (error instanceof Error ? error.message : String(error)))
        }
      })

      seedButton.addEventListener('click', async () => {
        try {
          await seedFirestore()
        } catch (error) {
          log('Seed failed: ' + (error instanceof Error ? error.message : String(error)))
          refresh()
        }
      })

      onAuthStateChanged(auth, (user) => {
        currentUser = user
        refresh()
      })

      loadSeed().catch((error) => {
        statusEl.textContent = 'Failed to load seed data'
        statusEl.className = 'bad'
        log(error instanceof Error ? error.stack ?? error.message : String(error))
      })
    </script>
  </body>
</html>
`
}

const raw = JSON.parse(await readFile(sourcePath, 'utf8'))
assert(Array.isArray(raw.projections), 'Source JSON must contain a projections array')
assert(raw.projections.length === expectedCount, `Expected ${expectedCount} source projections, found ${raw.projections.length}`)

const projections = raw.projections.map(transformProjection)
const tickers = projections.map((projection) => projection.ticker)
const duplicates = tickers.filter((ticker, index) => tickers.indexOf(ticker) !== index)
assert(duplicates.length === 0, `Duplicate tickers: ${[...new Set(duplicates)].join(', ')}`)
for (const projection of projections) validateProjection(projection)

const seed = {
  generatedAt: new Date().toISOString(),
  sourcePath,
  sourceCollection: raw.collection ?? null,
  sourceUserId: raw.userId ?? null,
  targetProjectId: firebaseConfig.projectId,
  targetEmail,
  targetUid,
  overwrite: true,
  documentPath: `users/${targetUid}/projections/{TICKER}`,
  count: projections.length,
  projections,
}

await mkdir(outputDir, { recursive: true })
await writeFile(seedJsonPath, `${JSON.stringify(seed, null, 2)}\n`)
await writeFile(seedPagePath, buildSeedPage())

console.log(
  JSON.stringify(
    {
      sourcePath,
      seedJsonPath,
      seedPagePath,
      count: projections.length,
      tickers,
      targetEmail,
      targetUid,
      validation: 'ok',
    },
    null,
    2,
  ),
)
