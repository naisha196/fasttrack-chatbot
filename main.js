import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = "asst_8xYsC1DCGI11V1c9Q1nKD5aI";

const app = express();

app.use(cors({ origin: "*", methods: "*", allowedHeaders: "*", credentials: true }));
app.use(express.json());

app.use("/static", express.static(path.join(__dirname, "static")));
app.use("/data_files", express.static(path.join(__dirname, "data_files")));

console.log("\nCHECKING FILES IN 'data_files'");
try {
  const files = fs.readdirSync(path.join(__dirname, "data_files"));
  files.forEach((f) => console.log(` ✅ Found: ${f}`));
} catch (e) {
  console.log(` ❌ ERROR: Could not read 'data_files' folder: ${e.message}`);
}
console.log("------------------------------------------\n");


async function extractVerbatimPhrase(userQuestion, assistantResponse) {
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",  
      max_tokens: 100,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You extract verbatim quotes. When given a question and an AI answer, " +
            "return ONE phrase of 20–35 words that most likely appears word-for-word " +
            "in the source document the answer was based on. " +
            "The phrase MUST be unique enough to appear only ONCE in the document — " +
            "avoid short phrases, generic headings, or common words that could repeat many times. " +
            "Pick a full sentence or clause with specific, distinctive terminology. " +
            "Return ONLY the phrase itself — no quotes, no explanation, no punctuation around it."
        },
        {
          role: "user",
          content: `Question: ${userQuestion}\n\nAnswer: ${assistantResponse}`
        }
      ]
    });

    const phrase = completion.choices[0].message.content.trim();
    console.log(`DEBUG verbatim phrase from GPT: "${phrase}"`);
    return phrase;
  } catch (e) {
    console.error("DEBUG: verbatim phrase extraction failed:", e.message);
    return "";
  }
}

app.get("/", (req, res) => {
  const indexPath = path.join(__dirname, "static", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("❌ ERROR: static/index.html not found.");
  }
});

app.post("/chat", async (req, res) => {
  try {
    const { message, thread_id: incomingThreadId } = req.body;

    let threadId;
    if (!incomingThreadId) {
      const thread = await client.beta.threads.create();
      threadId = thread.id;
    } else {
      threadId = incomingThreadId;
    }

    await client.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });

    let run = await client.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
      additional_instructions: `
Every response must follow this exact structure — no exceptions:

1. One short opening sentence answering the question directly.
2. A bullet point list of key details (always use bullets, even for 1 item).
3. If there are steps, use a numbered list.
4. End with one short closing sentence if needed, otherwise stop.

Always use **bold** for key terms. Never write paragraphs. Never add intros like "Great question!" or outros like "I hope this helps!".
      `
    });

    while (!["completed", "failed", "cancelled"].includes(run.status)) {
      await new Promise((r) => setTimeout(r, 1000));
      run = await client.beta.threads.runs.retrieve(threadId, run.id);
    }

    if (run.status === "failed") {
      return res.status(500).json({ detail: "Run Failed" });
    }

    const messages = await client.beta.threads.messages.list(threadId);
    const lastMsg = messages.data[0];
    const textContent = lastMsg.content[0].text;
    let responseText = textContent.value;

    const annotations = textContent.annotations ?? [];
    const citations = [];

    const hasCitations = annotations.some((a) => a.file_citation);
    const searchPhrase = hasCitations
      ? await extractVerbatimPhrase(message, responseText)
      : "";

    for (let index = 0; index < annotations.length; index++) {
      const annotation = annotations[index];

      responseText = responseText.replace(
        annotation.text,
        `%%CITATION_${index}%%`
      );

      const fileCitation = annotation.file_citation;
      if (fileCitation) {
        const citedFile = await client.files.retrieve(fileCitation.file_id);
        const filename = citedFile.filename;

        console.log(`DEBUG citation [${index}]: filename=${filename}`);
        console.log(`DEBUG search phrase being used: "${searchPhrase}"`);

        const safeFilenameUrl = encodeURIComponent(filename);
        const localFileUrl = `/data_files/${safeFilenameUrl}`;
        const viewerUrl = `/static/pdfjs-5/web/viewer.html?file=${localFileUrl}`;

        const cleanName = filename.replace(/'/g, "").replace(/"/g, "");
        const safeSearchPhrase = searchPhrase
          .replace(/\\/g, "\\\\")
          .replace(/'/g, "\\'")
          .replace(/"/g, "&quot;");

        responseText = responseText.replace(
          `%%CITATION_${index}%%`,
          ` <sup class='citation-ref'><a href='#' onclick="openDocument('${viewerUrl}', '${cleanName}', '${safeSearchPhrase}'); return false;" style='color:#007bff; text-decoration:none; font-weight:bold;'>[${index + 1}]</a></sup>`
        );

        const citationHtml =
          `<div class='citation-card' style='margin-top:8px; padding:10px; background:#f0f8ff; border:1px solid #cce5ff; border-radius:6px;'>` +
          `<strong style='color:#0056b3;'>[${index + 1}] ${cleanName}</strong><br>` +
          `<button onclick="openDocument('${viewerUrl}', '${cleanName}', '${safeSearchPhrase}')" ` +
          `style='margin-top:5px; background:#007bff; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px;'>` +
          `📄 View &amp; Highlight` +
          `</button>` +
          `</div>`;

        citations.push(citationHtml);
      }
    }

    if (citations.length > 0) {
      responseText +=
        "<br><br><div class='sources-container'><strong>📂 Sources:</strong>" +
        citations.join("") +
        "</div>";
    }

    return res.json({ response: responseText, thread_id: threadId });
  } catch (e) {
    console.error("Server Error:", e);
    return res.status(500).json({ detail: e.message });
  }
});

app.post("/feedback", async (req, res) => {
  const { thread_id, rating, comments } = req.body;
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const sheetdbUrl = process.env.SHEETDB_URL;

  console.log("\n--- 🔍 FEEDBACK DEBUG START ---");

  if (!sheetdbUrl) {
    console.log("❌ DEBUG: SHEETDB_URL is missing from .env!");
    return res.status(500).json({ status: "error", message: "Database configuration error." });
  }

  const payload = {
    data: [
      {
        Timestamp: timestamp,
        "Thread ID": thread_id ?? null,
        Rating: rating,
        Comments: comments,
      },
    ],
  };

  console.log("DEBUG: Data being sent:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(sheetdbUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.text();
    console.log(`DEBUG: Status Code: ${response.status}`);
    console.log(`DEBUG: API Response: ${responseBody}`);

    if (response.status === 200 || response.status === 201) {
      console.log("✅ SUCCESS: Feedback added to Google Sheet!");
      return res.json({ status: "success", message: "Feedback securely saved!" });
    } else {
      console.log(`⚠️ API returned status: ${response.status}`);
      return res.status(500).json({ detail: "Unexpected API status" });
    }
  } catch (e) {
    console.error("❌ DEBUG ERROR:", e.message);
    return res.status(500).json({ detail: e.message });
  } finally {
    console.log("--- 🔍 FEEDBACK DEBUG END ---\n");
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});