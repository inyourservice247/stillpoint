# Stillpoint

A local-first RSVP reader for `.txt` books and study material.

## What it does

- imports and normalizes TXT files entirely in the browser
- preserves compounds, contractions, currency, decimals and percentages
- folds standalone punctuation into timing metadata instead of wasting frames
- keeps the highlighted ORP character at a fixed horizontal coordinate
- saves books and progress in IndexedDB, with a lightweight crash checkpoint
- remembers global reading settings in local storage

No account, analytics, remote upload, API, PDF or EPUB support is included.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Tests and production build

```bash
npm test
npm run build
```

## Attribution

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). The complete original
MIT license is preserved in `public/licenses/original-rsvp-speed-reader.txt`.
