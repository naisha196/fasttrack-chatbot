import os
from openai import OpenAI
from dotenv import load_dotenv

# 1. Load the API Key
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def setup_fasttrack_assistant():
    print("--- STARTING SETUP ---")

    # 2. Create a Vector Store
    print("Creating Vector Store...")
    try:
        vector_store = client.vector_stores.create(name="FastTrack_Documents")
    except AttributeError:
        vector_store = client.beta.vector_stores.create(name="FastTrack_Documents")

    print(f"Vector Store ID: {vector_store.id}")

    # 3. Find and Upload files
    folder_path = "data_files"
    file_streams = []

    if not os.path.exists(folder_path):
        print(f"Error: Folder '{folder_path}' not found.")
        return

    for filename in os.listdir(folder_path):
        file_path = os.path.join(folder_path, filename)
        if os.path.isfile(file_path):
            file_streams.append(open(file_path, "rb"))
            print(f"Found file: {filename}")

    if not file_streams:
        print("No files found. Please add documents to 'data_files'.")
        return

    print("Uploading files... (This may take a moment)")
    try:
        file_batch = client.vector_stores.file_batches.upload_and_poll(
            vector_store_id=vector_store.id,
            files=file_streams
        )
    except AttributeError:
        file_batch = client.beta.vector_stores.file_batches.upload_and_poll(
            vector_store_id=vector_store.id,
            files=file_streams
        )

    print(f"File Counts: {file_batch.file_counts}")

    # 4. Create Assistant with HTML Instructions
    print("Creating Assistant...")
    assistant = client.beta.assistants.create(
        name="FastTrack Punjab Assistant",
        instructions="""You are an AI assistant for the FastTrack Punjab portal. 
        Use the provided documents to answer applicant queries.

        IMPORTANT FORMATTING RULES:
        1. Do NOT use Markdown formatting (no **, no #, no -).
        2. Use HTML tags for formatting:
           - Use <b>text</b> for bold text.
           - Use <br> for line breaks.
           - Use <ul><li>item</li></ul> for bullet lists.
        3. If the answer is not in the files, say you don't know.""",
        model="gpt-4o",
        tools=[{"type": "file_search"}],
        tool_resources={"file_search": {"vector_store_ids": [vector_store.id]}}
    )

    print("\n--------------------------------------------------")
    print("SUCCESS! COPY THIS ID BELOW:")
    print(f"ASSISTANT_ID = \"{assistant.id}\"")
    print("--------------------------------------------------")


if __name__ == "__main__":
    setup_fasttrack_assistant()