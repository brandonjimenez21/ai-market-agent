FROM python:3.11-slim

# We set the working directory
WORKDIR /app
    
# We copy the dependency file first to take advantage of the cache
COPY requirements.txt .

# We installed the dependencies without caching to make the image lighter
RUN pip install --no-cache-dir -r requirements.txt

# We copy the rest of our code
COPY . .

# We expose port 8000
EXPOSE 8000

# Command to start FastAPI with Uvicorn (with auto-reload for development)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]