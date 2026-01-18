import os
import time
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

# 1. Load environment variables
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 2. Initialize FastAPI
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def home():
    return open("static/index.html").read()


# 3. Add CORS (Allows the HTML file to talk to this server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURATION ---
ASSISTANT_ID = "asst_LWedvpWpKOk6ihm6sObE3vRV"
# ---------------------

class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        # Step A: Manage Thread
        if not request.thread_id:
            thread = client.beta.threads.create()
            thread_id = thread.id
        else:
            thread_id = request.thread_id

        # Step B: Send User Message
        client.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=request.message
        )

        # Step C: Run Assistant
        run = client.beta.threads.runs.create(
            thread_id=thread_id,
            assistant_id=ASSISTANT_ID
        )

        # Step D: Polling Loop
        while run.status not in ["completed", "failed", "cancelled"]:
            time.sleep(1)
            run = client.beta.threads.runs.retrieve(
                thread_id=thread_id,
                run_id=run.id
            )

        if run.status == "failed":
            print(f"OpenAI Error: {run.last_error}")
            raise HTTPException(status_code=500, detail="OpenAI Run Failed")

        # Step E: Get Answer
        messages = client.beta.threads.messages.list(thread_id=thread_id)
        full_response = messages.data[0].content[0].text.value

        # Clean citations
        clean_response = re.sub(r"【.*?】", "", full_response)

        return {
            "response": clean_response,
            "thread_id": thread_id
        }

    except Exception as e:
        print(f"Server Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Run the server
    uvicorn.run(app, host="127.0.0.1", port=8000)