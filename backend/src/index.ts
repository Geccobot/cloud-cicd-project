import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432"),
  ssl: {
    rejectUnauthorized: false,
  },
});

app.get("/api/message", (req, res) => {
  res.json({ text: "Hello from the backend!" });
});

app.get("/api/data", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sample_data");
    res.json(result.rows);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Database query failed" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});