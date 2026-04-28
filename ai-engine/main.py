import os
import io
import json 
import psycopg2
import urllib.parse
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client.models import Filter, FieldCondition, MatchValue
from pypdf import PdfReader
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="AI Market Agent - Full RAG")
os.makedirs("saved_docs", exist_ok=True)

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    question: str
    mode: Optional[str] = "normal"
    user_id: Optional[str] = ""
    history: Optional[List[Message]] = []

def format_history(history: List[Message]) -> str:
    if not history:
        return ""
    formatted = ""
    for msg in history[-6:]: 
        if msg.role == "user":
            formatted += f"User: {msg.content}\n"
        elif msg.role == "bot":
            formatted += f"AI: {msg.content}\n"
    return formatted

api_key = os.getenv("GEMINI_API_KEY")
qdrant_url = os.getenv("QDRANT_URL", "http://qdrant:6333")
DB_URL = "postgresql://admin:password123@db:5432/agent_db"

def init_db():
    try:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                citations TEXT, -- Para guardar los botones azules
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        cursor.close()
        conn.close()
        print("✅ Base de datos inicializada con soporte para citaciones!")
    except Exception as e:
        print(f"❌ Error: {e}")

init_db()

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite", 
    google_api_key=api_key,
    temperature=0.3 
)

embeddings_model = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=api_key
)

@app.post("/api/ai/chat")
def autonomous_agent(req: ChatRequest):
    try:
        found_context = ""
        unique_citations = []
        
        try:
            vector_store = QdrantVectorStore.from_existing_collection(
                embedding=embeddings_model,
                collection_name="company_documents",
                url=qdrant_url,
            )
            
            search_filter = Filter(
                should=[
                    FieldCondition(key="metadata.user_id", match=MatchValue(value=req.user_id)),
                    FieldCondition(key="user_id", match=MatchValue(value=req.user_id))
                ]
            )
            
            search_query = req.question
            if req.history:
                recent_msgs = " ".join([msg.content for msg in req.history[-3:]])
                search_query = f"{recent_msgs} {req.question}"
                
            results = vector_store.similarity_search(search_query, k=5, filter=search_filter)
            
            citations = []
            for doc in results:
                found_context += doc.page_content + "\n"
                meta = doc.metadata or {}
                page = meta.get("page", 1)
                filename = meta.get("filename", "Documento")
                citations.append({"file": filename, "page": page})
            
            seen = set()
            for c in citations:
                t = (c["file"], c["page"])
                if t not in seen:
                    seen.add(t)
                    unique_citations.append(c)
                    
        except Exception:
            pass

        history_text = format_history(req.history)
        
        agent_prompt = PromptTemplate.from_template("""
        You are Agent.ai, an advanced autonomous assistant.
        
        Conversation History:
        {history}
        
        User's Private Documents Context (if any):
        {context}
        
        Current User Question: {question}
        
        INSTRUCTIONS:
        1. Evaluate the user's question.
        2. If it's a general question, answer from your knowledge.
        3. If it relates to the Private Context, base your answer HEAVILY on it.
        4. If the info isn't in the context, politely say so.
        5. DO NOT mention page numbers in your text. The system handles citations automatically.
        """)
        
        chain = agent_prompt | llm
        
        def generate_response():
            full_ai_response = ""
            try:
                if req.user_id:
                    conn = psycopg2.connect(DB_URL)
                    cursor = conn.cursor()
                    cursor.execute(
                        "INSERT INTO chat_history (user_id, role, content) VALUES (%s, %s, %s)",
                        (req.user_id, "user", req.question)
                    )
                    conn.commit()

                for chunk in chain.stream({
                    "history": history_text,
                    "context": found_context,
                    "question": req.question
                }):
                    if chunk.content:
                        full_ai_response += chunk.content 
                        safe_content = chunk.content.replace('\n', '\\n')
                        yield f"data: {safe_content}\n\n"
                
                cites_to_save = None
                if unique_citations:
                    cites_to_save = json.dumps(unique_citations)
                    yield f"data: __CITATIONS__{cites_to_save}\n\n"
                
                yield "data: [DONE]\n\n"

                if req.user_id:
                    cursor.execute(
                        "INSERT INTO chat_history (user_id, role, content, citations) VALUES (%s, %s, %s, %s)",
                        (req.user_id, "bot", full_ai_response, cites_to_save)
                    )
                    conn.commit()
                    cursor.close()
                    conn.close()

            except Exception as e:
                error_real = str(e).replace('\n', ' ')
                yield f"data: 🚨 Error Interno: {error_real}\n\n"

        return StreamingResponse(generate_response(), media_type="text/event-stream")
        
    except Exception as e:
        return {"error": f"Agent failure: {str(e)}"}

@app.get("/api/ai/health")
def health_check():
    return {"status": "success", "message": "Full AI Engine running 🧠"}

@app.post("/api/ai/upload")
async def upload_document(file: UploadFile = File(...), user_id: str = Form(...)):
    try:
        content = await file.read()
        docs = []

        file_path = f"saved_docs/{user_id}_{file.filename}"
        with open(file_path, "wb") as f:
            f.write(content)
        
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1500,
            chunk_overlap=150
        )
        
        if file.filename.lower().endswith(".pdf"):
            pdf_reader = PdfReader(io.BytesIO(content))
            for i, page in enumerate(pdf_reader.pages):
                extracted = page.extract_text()
                if extracted and extracted.strip():
                    chunks = text_splitter.split_text(extracted)
                    for chunk in chunks:
                        docs.append(
                            Document(
                                page_content=chunk, 
                                metadata={"user_id": user_id, "filename": file.filename, "page": i + 1}
                            )
                        )
        else:
            text = content.decode("utf-8")
            if text.strip():
                chunks = text_splitter.split_text(text)
                for chunk in chunks:
                    docs.append(
                        Document(
                            page_content=chunk, 
                            metadata={"user_id": user_id, "filename": file.filename, "page": 1}
                        )
                    )
            
        if not docs:
            return {"error": "Could not extract text. The file might be empty or a scanned image."}
        
        QdrantVectorStore.from_documents(
            docs,
            embeddings_model,
            url=qdrant_url,
            collection_name="company_documents"
        )
        
        return {"status": "Success", "message": f"File '{file.filename}' processed and saved."}
    except Exception as e:
        return {"error": f"Failed to process file: {str(e)}"}
    
@app.get("/api/ai/documents")
def list_documents(user_id: str):
    try:
        vector_store = QdrantVectorStore.from_existing_collection(
            embedding=embeddings_model,
            collection_name="company_documents",
            url=qdrant_url,
        )
        
        records, _ = vector_store.client.scroll(
            collection_name="company_documents",
            scroll_filter=Filter(
                should=[
                    FieldCondition(key="metadata.user_id", match=MatchValue(value=user_id)),
                    FieldCondition(key="user_id", match=MatchValue(value=user_id))
                ]
            ),
            limit=1000,
            with_payload=True,
            with_vectors=False
        )

        filenames = set()
        for record in records:
            if record.payload and "metadata" in record.payload and "filename" in record.payload["metadata"]:
                filenames.add(record.payload["metadata"]["filename"])
            elif record.payload and "filename" in record.payload:
                filenames.add(record.payload["filename"])

        return {"documents": list(filenames)}
    except Exception as e:
        return {"error": f"Failed to list documents: {str(e)}"}

@app.delete("/api/ai/documents")
def delete_document(user_id: str, filename: str):
    try:
        vector_store = QdrantVectorStore.from_existing_collection(
            embedding=embeddings_model,
            collection_name="company_documents",
            url=qdrant_url,
        )
        
        vector_store.client.delete(
            collection_name="company_documents",
            points_selector=Filter(
                must=[
                    Filter(should=[
                        FieldCondition(key="metadata.user_id", match=MatchValue(value=user_id)),
                        FieldCondition(key="user_id", match=MatchValue(value=user_id))
                    ]),
                    Filter(should=[
                        FieldCondition(key="metadata.filename", match=MatchValue(value=filename)),
                        FieldCondition(key="filename", match=MatchValue(value=filename))
                    ])
                ]
            )
        )
        return {"status": "Success", "message": f"Document '{filename}' deleted permanently. 🗑️"}
    except Exception as e:
        return {"error": f"Failed to delete document: {str(e)}"}
    
@app.get("/api/ai/history")
def get_chat_history(user_id: str):
    try:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT role, content, citations FROM chat_history WHERE user_id = %s ORDER BY created_at ASC LIMIT 50",
            (user_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        history = [
            {
                "role": row[0], 
                "content": row[1], 
                "citations": json.loads(row[2]) if row[2] else None
            } for row in rows
        ]
        return {"history": history}
    except Exception as e:
        return {"error": f"Failed to fetch history: {str(e)}"}

@app.get("/api/ai/files/{file_name:path}")
def serve_file(file_name: str):
    file_path = os.path.join("saved_docs", file_name)
    
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="application/pdf")
    
    return {"error": f"Archivo no encontrado en el disco de Python", "ruta_buscada": file_path}