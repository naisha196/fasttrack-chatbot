import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function setup() {
    console.log("--- STARTING SETUP ---");

    try {
        // 1. Create Vector Store (MOVED OUT OF BETA)
        console.log("Creating Vector Store...");
        
        // Use client.vectorStores instead of client.beta.vectorStores
        const vectorStore = await client.vectorStores.create({
            name: "FastTrack_Documents",
        });
        console.log(`✅ Vector Store Created: ${vectorStore.id}`);

        // 2. Prepare Files
        const folderPath = path.join(__dirname, "data_files");
        const files = fs.readdirSync(folderPath)
            .filter(f => fs.lstatSync(path.join(folderPath, f)).isFile());

        const fileStreams = files.map(f => fs.createReadStream(path.join(folderPath, f)));

        // 3. Upload and Poll (MOVED OUT OF BETA)
        console.log(`Uploading ${fileStreams.length} files...`);
        const fileBatch = await client.vectorStores.fileBatches.uploadAndPoll(
            vectorStore.id,
            { files: fileStreams }
        );

        // 4. Create Assistant (STILL IN BETA for now)
        const assistant = await client.beta.assistants.create({
            name: "FastTrack Punjab Assistant",
            instructions: "You are a helpful assistant. Use HTML for formatting.",
            model: "gpt-4o",
            tools: [{ type: "file_search" }],
            tool_resources: {
                file_search: { vector_store_ids: [vectorStore.id] }
            }
        });

        console.log("\n--------------------------------------------------");
        console.log(`ASSISTANT_ID = "${assistant.id}"`);
        console.log("--------------------------------------------------");

    } catch (error) {
        console.error("❌ SETUP FAILED:", error.message);
    }
}

setup();