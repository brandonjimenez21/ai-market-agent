# AI Agent SaaS - Arquitectura Full-Stack de Microservicios

Una aplicación SaaS completa y escalable que integra un agente de Inteligencia Artificial capaz de razonar, mantener memoria a largo plazo y analizar documentos privados (RAG) utilizando el modelo Gemini 2.0 Flash.

## Arquitectura del Sistema

Este proyecto utiliza una arquitectura moderna basada en microservicios, completamente contenedorizada con Docker:

* **Frontend (Next.js 16 + Tailwind CSS):** Interfaz minimalista y responsiva con renderizado en tiempo real (SSE) y autenticación segura.
* **API Gateway (Go):** Enrutador de alto rendimiento que maneja el tráfico, CORS y el streaming de respuestas al cliente.
* **AI Engine (Python + FastAPI):** El cerebro del sistema. Utiliza LangChain/LlamaIndex para orquestar agentes, herramientas y lógica RAG.
* **Memoria Vectorial (Qdrant):** Base de datos vectorial para búsquedas semánticas ultrarrápidas sobre documentos (PDF, TXT).
* **Base de Datos Relacional (PostgreSQL):** Almacenamiento seguro y persistente de usuarios, credenciales encriptadas y el historial infinito de los chats.

## Seguridad y Autenticación

* Protección de rutas vía Next.js Middleware.
* Inicio de sesión social con OAuth (Google).
* Registro clásico con encriptación de contraseñas mediante `bcryptjs`.
* Aislamiento de datos: Cada usuario tiene una bóveda de documentos y un historial de chat 100% privado.

## Requisitos Previos

* Docker y Docker Compose.
* Claves de API: Gemini (Google AI Studio) y Google Cloud Console (OAuth).

## Instalación y Uso

1. Clona este repositorio: `git clone <tu-url-del-repo>`
2. Configura las variables de entorno (`.env` local, no incluido en el repo por seguridad).
3. Levanta la arquitectura completa con un solo comando:
   ```bash
   docker compose up -d --build