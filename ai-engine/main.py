import os
from fastapi import FastAPI
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient

app = FastAPI(title="AI Market Agent - Dual Mode")

api_key = os.getenv("GEMINI_API_KEY")
qdrant_url = os.getenv("QDRANT_URL", "http://qdrant:6333") 

# 1. The Talking Brain (Text Generation)
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite", 
    google_api_key=api_key,
    temperature=0.3 
)

# 2. The Brain that TRANSLATES to NUMBERS (Embeddings for Qdrant)
embeddings_model = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=api_key
)

@app.get("/api/ai/health")
def health_check():
    return {"status": "success", "message": "Dual Brain in operation 🧠"}

# NORMAL CHAT (General Google Knowledge)
@app.get("/api/ai/chat")
def normal_chat(question: str = "What is the stock market?"):
    prompt = PromptTemplate.from_template("Answer this briefly: {question}")
    chain = prompt | llm
    answer = chain.invoke({"question": question})
    
    return {"mode": "Normal", "answer": answer.content}

# TEACH QDRANT (Data Ingestion)
@app.get("/api/ai/learn")
def learn_document():
    # mock "private document"
    private_text = [
        "The Titan Project is a secret initiative by the company to create coffee with an apple flavor.",
        "The CEO of the Titan Project is named Brandon Jimenez and approved the budget in 2026.",
        "The projected sales for the apple coffee are $5 million."
    ]
    
    try:
        QdrantVectorStore.from_texts(
            private_text,
            embeddings_model,
            url=qdrant_url,
            collection_name="company_documents",
            force_recreate=True
        )
        return {"status": "Success", "message": "Private document saved in Qdrant memory! 🗄️"}
    except Exception as e:
        return {"error": f"Failed to save in Qdrant: {str(e)}"}

# ASK DOCUMENT (RAG)
@app.get("/api/ai/ask-doc")
def rag_chat(question: str = "Who is the CEO of the Titan Project?"):
    try:
        # 1. We connect to the collection we created above
        vector_store = QdrantVectorStore.from_existing_collection(
            embedding=embeddings_model,
            collection_name="company_documents",
            url=qdrant_url,
        )
        
        # 2. We search in Qdrant for the 2 most similar paragraphs to the question
        results = vector_store.similarity_search(question, k=2)
        
        # Extract only the text from the results
        found_context = "\n".join([doc.page_content for doc in results])
        
        # 3. We tell the AI that it should NOT make things up, and only use the context
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
            "used_context": found_context,
            "answer": answer.content
        }
    except Exception as e:
        return {"error": f"RAG system failure: {str(e)}"}