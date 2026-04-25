from fastapi import FastAPI

app = FastAPI(
    title="AI Market Agent - Cerebro",
    description="Motor de Inteligencia Artificial para análisis de mercado",
    version="1.0.0"
)

@app.get("/api/ai/health")
def health_check():
    return {
        "status": "success", 
        "message": "Cerebro de IA (FastAPI) funcionando al 100% 🧠"
    }
