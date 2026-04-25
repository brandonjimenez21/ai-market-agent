FROM python:3.11-slim

# Establecemos el directorio de trabajo
WORKDIR /app

# Copiamos el archivo de dependencias primero para aprovechar el caché
COPY requirements.txt .

# Instalamos las dependencias sin guardar caché para hacer la imagen más ligera
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos el resto de nuestro código
COPY . .

# Exponemos el puerto 8000
EXPOSE 8000

# Comando para iniciar FastAPI con Uvicorn (con recarga automática para desarrollo)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]