# AI Market Agent - Dual Mode (RAG & General Knowledge)

A production-ready, microservices-based AI assistant built to seamlessly switch between general web knowledge and private document querying (RAG - Retrieval-Augmented Generation). 

## Architecture

This project is built using a modern microservices architecture orchestrated with Docker:

* **Frontend:** Next.js 16 (React) with Tailwind CSS. Features guest-session management (UUID) and a minimalist UI.
* **API Gateway:** Go (Golang). Acts as a secure reverse proxy and router.
* **AI Engine:** Python (FastAPI). Handles the LangChain logic, file chunking, embeddings, and prompting.
* **Vector Database:** Qdrant. Stores document embeddings for hyper-fast semantic search.
* **LLM Provider:** Google Gemini API (`gemini-2.5-flash` & `gemini-embedding-001`).

## Features

* **Dual Mode:** Switch between "Normal Mode" (general AI) and "Document Mode" (RAG).
* **Data Privacy:** Uses session-based UUIDs to tag and filter vectors in Qdrant, ensuring users can only query their own uploaded documents.
* **Smart Ingestion:** Automatically splits `.txt` files into manageable chunks and generates embeddings on the fly.
* **Minimalist UI:** Clean, responsive, dark-mode interface with auto-scrolling and loading states.

## How to Run (Development)

1. Clone the repository.
2. Create a `.env` file inside the `ai-engine` folder and add your Gemini API Key:
   `GEMINI_API_KEY=your_api_key_here`
3. Run the complete architecture using Docker Compose:
   ```bash
   docker compose up --build