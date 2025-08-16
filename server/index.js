import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { decodeTransaction } from "../src/decoder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Static frontend
app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/decode/:txId", async (req, res) => {
  try {
    const { txId } = req.params;
    if (!txId || typeof txId !== "string") {
      return res.status(400).json({ error: "Missing txId" });
    }
    const result = await decodeTransaction(txId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


