import os
import io
from fastapi import FastAPI, UploadFile, File, Form
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

# 1. The Talking Brain
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash", 
    google_api_key=api_key,
    temperature=0.3 
)

# 2. The Embedding Brain
embeddings_model = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=api_key
)

@app.get("/api/ai/health")
def health_check():
    return {"status": "success", "message": "Full AI Engine running 🧠"}

@app.post("/api/ai/chat")
def normal_chat(req: ChatRequest):
    history_text = format_history(req.history)
    
    prompt = PromptTemplate.from_template("""
    You are a helpful and intelligent AI assistant. 
    Use the conversation history to understand the context of the user's new question.
    
    Conversation History:
    {history}
    
    Current Question: {question}
    """)
    chain = prompt | llm
    answer = chain.invoke({"history": history_text, "question": req.question})
    return {"mode": "Normal", "answer": answer.content}

@app.post("/api/ai/upload")
async def upload_document(file: UploadFile = File(...), user_id: str = Form(...)):
    try:
        content = await file.read()
        text = ""
        
        if file.filename.lower().endswith(".pdf"):
            pdf_reader = PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        else:
            text = content.decode("utf-8")
            
        if not text.strip():
            return {"error": "Could not extract text. The file might be empty or a scanned image."}
        
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50
        )
        chunks = text_splitter.split_text(text)
        
        docs = [
            Document(
                page_content=chunk, 
                metadata={"user_id": user_id, "filename": file.filename}
            ) for chunk in chunks
        ]
        
        QdrantVectorStore.from_documents(
            docs,
            embeddings_model,
            url=qdrant_url,
            collection_name="company_documents"
        )
        
        return {"status": "Success", "message": f"File '{file.filename}' processed and saved."}
    except Exception as e:
        return {"error": f"Failed to process file: {str(e)}"}

@app.post("/api/ai/ask-doc")
def rag_chat(req: ChatRequest):
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
            last_msg = req.history[-1].content
            search_query = f"{last_msg} {req.question}"
        
        results = vector_store.similarity_search(search_query, k=40, filter=search_filter)
        
        if not results:
            return {
                "mode": "Documents (RAG)",
                "answer": "You haven't uploaded any documents yet, or I couldn't find the answer in them."
            }
        
        found_context = "\n".join([doc.page_content for doc in results])
        history_text = format_history(req.history)
        
        prompt_rag = PromptTemplate.from_template("""
        You are an expert and helpful AI assistant analyzing private documents. 
        Answer the user's Current Question based ONLY on the following Document Context.
        Use the Conversation History to understand pronouns (like "he", "it", "that") or follow-up questions.
        Provide a comprehensive, detailed, and well-explained answer formatted nicely.
        
        Conversation History:
        {history}
        
        Document Context found in database:
        {context}
        
        Current Question: {question}
        """)
        
        chain = prompt_rag | llm
        answer = chain.invoke({
            "history": history_text,
            "context": found_context,
            "question": req.question
        })
        
        return {
            "mode": "Documents (RAG)", 
            "answer": answer.content
        }
    except Exception as e:
        return {"error": f"RAG system failure: {str(e)}"}
    
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