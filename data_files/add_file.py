import os
from openai import OpenAI
from dotenv import load_dotenv

# 1. Load Environment
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --- CONFIGURATION ---
ASSISTANT_ID = "asst_LWedvpWpKOk6ihm6sObE3vRV" 
NEW_FILENAME = "Project Approval Framework.pdf" 
# ---------------------

def add_single_file():
    print(f"--- ADDING FILE TO ASSISTANT: {ASSISTANT_ID} ---")

    # Step 1: Find the Vector Store
    try:
        # Note: 'assistants' usually stays in beta longer, but we check just in case
        try:
            assistant = client.beta.assistants.retrieve(ASSISTANT_ID)
        except AttributeError:
            assistant = client.assistants.retrieve(ASSISTANT_ID)

        # Get the Vector Store ID attached to this assistant
        if hasattr(assistant.tool_resources, 'file_search'):
            vector_store_ids = assistant.tool_resources.file_search.vector_store_ids
        else:
            print("Error: Could not find file_search resources on this assistant.")
            return

        if not vector_store_ids:
            print("Error: This assistant has no file storage attached.")
            return
            
        vector_store_id = vector_store_ids[0]
        print(f"Found Vector Store ID: {vector_store_id}")

    except Exception as e:
        print(f"Error retrieving assistant: {e}")
        return

    # Step 2: Upload the file
    file_path = os.path.join("data_files", NEW_FILENAME)
    if not os.path.exists(file_path):
        print(f"Error: Could not find '{NEW_FILENAME}' inside 'data_files'.")
        return

    print(f"Uploading '{NEW_FILENAME}'...")
    try:
        file_stream = open(file_path, "rb")
        
        # --- THE CORRECTION ---
        # accessing client.vector_stores directly (removing .beta)
        batch = client.vector_stores.file_batches.upload_and_poll(
            vector_store_id=vector_store_id,
            files=[file_stream]
        )
        # ----------------------
            
        print("Success! File uploaded and indexed.")
        print(f"File Counts: {batch.file_counts}")
        
    except Exception as e:
        print(f"Upload failed: {e}")

if __name__ == "__main__":
    add_single_file()