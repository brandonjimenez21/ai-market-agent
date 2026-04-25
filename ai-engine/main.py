import os
from fastapi import FastAPI, UploadFile, File, Form
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client.models import Filter, FieldCondition, MatchValue

app = FastAPI(title="AI Market Agent - Full RAG")

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

@app.get("/api/ai/chat")
def normal_chat(question: str = "Hello"):
    prompt = PromptTemplate.from_template("Answer this briefly: {question}")
    chain = prompt | llm
    answer = chain.invoke({"question": question})
    return {"mode": "Normal", "answer": answer.content}

@app.post("/api/ai/upload")
async def upload_document(file: UploadFile = File(...), user_id: str = Form(...)):
    try:
        # 1. Read the file content
        content = await file.read()
        text = content.decode("utf-8")
        
        # 2. Split the text into smaller chunks for the AI to digest easily
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,   
            chunk_overlap=50 
        )
        chunks = text_splitter.split_text(text)
        
        # 3. Create Document objects attaching the user_id as metadata (The Secret Tag!)
        docs = [
            Document(
                page_content=chunk, 
                metadata={"user_id": user_id, "filename": file.filename}
            ) for chunk in chunks
        ]
        
        # 4. Save to Qdrant memory
        QdrantVectorStore.from_documents(
            docs,
            embeddings_model,
            url=qdrant_url,
            collection_name="company_documents"
        )
        
        return {"status": "Success", "message": f"File '{file.filename}' processed and saved."}
    except Exception as e:
        return {"error": f"Failed to process file: {str(e)}"}

@app.get("/api/ai/ask-doc")
def rag_chat(question: str, user_id: str = ""):
    try:
        vector_store = QdrantVectorStore.from_existing_collection(
            embedding=embeddings_model,
            collection_name="company_documents",
            url=qdrant_url,
        )
        
        search_filter = Filter(
            must=[
                FieldCondition(
                    key="metadata.user_id",
                    match=MatchValue(value=user_id),
                )
            ]
        )
        
        results = vector_store.similarity_search(question, k=3, filter=search_filter)
        
        if not results:
            return {
                "mode": "Documents (RAG)",
                "answer": "You haven't uploaded any documents yet, or I couldn't find the answer in them."
            }
        
        found_context = "\n".join([doc.page_content for doc in results])
        
        prompt_rag = PromptTemplate.from_template("""
        You are a strict assistant. Answer the question based ONLY on the following context.
        If the answer is not in the context, say "I don't have information about that in my documents".
        
        Context found in the database:
        {context}
        
        User's question: {question}
        """)
        
        chain = prompt_rag | llm
        answer = chain.invoke({
            "context": found_context,
            "question": question
        })
        
        return {
            "mode": "Documents (RAG)", 
            "answer": answer.content
        }
    except Exception as e:
        return {"error": f"RAG system failure: {str(e)}"}