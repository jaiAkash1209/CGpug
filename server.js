import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");
const recordsFile = path.join(dataDir, "submissions.json");
const adminUser = process.env.ADMIN_USER || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "";

await fs.mkdir(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-z0-9._-]/gi, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

app.use(["/admin.html", "/admin.js", "/uploads"], requireAdmin);
app.use((req, res, next) => {
  const shouldDisableCache = req.path.endsWith(".html") || req.path.endsWith(".js") || req.path.endsWith(".css");
  if (shouldDisableCache) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});
app.use(express.static(__dirname));
app.use("/uploads", express.static(uploadDir));

app.get("/api/submissions", requireAdmin, async (_req, res) => {
  res.json(await readRecords());
});

app.post("/api/submissions", upload.single("resultFile"), async (req, res) => {
  const payload = parsePayload(req.body.payload);
  const records = await readRecords();
  const record = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    file: req.file
      ? {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        url: `/uploads/${req.file.filename}`,
        size: req.file.size,
        mimeType: req.file.mimetype,
      }
      : null,
    ...payload,
  };

  records.unshift(record);
  await fs.writeFile(recordsFile, JSON.stringify(records, null, 2));
  res.status(201).json(record);
});

app.listen(port, () => {
  console.log(`Result GPA Scanner running on port ${port}`);
});

async function readRecords() {
  try {
    return JSON.parse(await fs.readFile(recordsFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function parsePayload(payload) {
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function requireAdmin(req, res, next) {
  if (!adminPassword) {
    return res.status(403).send("Admin access is not configured. Set ADMIN_PASSWORD in Render.");
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [user, password] = Buffer.from(encoded, "base64").toString("utf8").split(":");
    if (user === adminUser && password === adminPassword) return next();
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="Result Records"');
  return res.status(401).send("Authentication required.");
}
