## Solana Multisig Transaction Decoder

Decode Squads multisig transactions and render human‑readable instruction details using Anchor IDLs. A minimal Express server serves a static UI and an API endpoint.

### Prerequisites
- Node.js 18+ and npm
- Internet access (fetches IDLs, calls Squads API and a Solana RPC)

### Install
```bash
npm install
```

### Run locally
- Dev (auto-restart):
```bash
npm run dev
```
- Prod:
```bash
npm start
```
The server listens on http://localhost:5173 by default. Override with:
```bash
PORT=3000 npm run dev
```

### Using the UI
1. Open http://localhost:5173 in a browser.
2. Paste a Squads transaction ID (e.g. `BtVmmpGqhvXgonCWU2DUb3mvyzDErFSi5MhZM8Qw5ium`).
3. Click Decode to see:
   - Program name and ID
   - Accounts (named when available from IDL)
   - Decoded data (BN/hex normalized to readable strings)

### API
- Decode a transaction:
```bash
curl "http://localhost:5173/api/decode/<TX_ID>"
```
Response shape:
```json
{
  "transactionId": "<TX_ID>",
  "memo": "...",
  "instructions": [
    {
      "programId": "...",
      "programName": "...",
      "instructionName": "...",
      "accounts": [ { "name": "...", "address": "...", "index": 0 } ],
      "decodedData": { "...": "..." },
      "rawData": [1,2,3]
    }
  ]
}
```

### Project structure
- `server/index.js`: Express server, serves `public/` and `GET /api/decode/:txId`
- `src/decoder.js`: Core decoding (fetch Squads tx, resolve ALT accounts, decode via `@coral-xyz/anchor`)
- `public/index.html`: Simple UI for decoding and viewing results

### Add more programs / IDLs
Known programs and IDL URLs live in `PROGRAM_MAPPINGS` inside `src/decoder.js`.
Add entries like:
```js
PROGRAM_MAPPINGS["YourProgramPubkeyHere"] = {
  name: "YOUR_PROGRAM",
  idlUrl: "https://raw.githubusercontent.com/your-org/your-repo/main/target/idl/your_program.json"
};
```
Restart the server afterward.

### Configuration
- Port: `PORT` env var (default `5173`).
- RPC endpoint: set inside `src/decoder.js` in the `Connection` constructor. Replace with your preferred endpoint if needed.

### Troubleshooting
- Unknown program: add its ID and IDL URL to `PROGRAM_MAPPINGS`.
- Network/rate limits: the app calls Squads API, GitHub raw (for IDLs), and a Solana RPC. Use reliable endpoints or retry later.
- CORS: enabled on the server for the API.

### Scripts
- `npm run dev`: Start with nodemon
- `npm start`: Start with node

### License
MIT
