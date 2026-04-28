package main

import (
	"bytes" 
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Question string    `json:"question"`
	Mode     string    `json:"mode"`
	UserID   string    `json:"user_id"`
	History  []Message `json:"history"`
}

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func askAI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	var reqBody ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil || reqBody.Question == "" {
		http.Error(w, `data: Invalid request\n\n`, http.StatusBadRequest)
		return
	}

	pythonURL := "http://ai-engine:8000/api/ai/chat"
	jsonData, _ := json.Marshal(reqBody)
	
	req, err := http.NewRequest("POST", pythonURL, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	
	if err != nil {
		http.Error(w, `data: The AI Brain is not responding\n\n`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	buf := make([]byte, 1024)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
			flusher.Flush()
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			break
		}
	}
}

func uploadFile(w http.ResponseWriter, r *http.Request) {
    resp, err := http.Post("http://ai-engine:8000/api/ai/upload", r.Header.Get("Content-Type"), r.Body)
    if err != nil {
        http.Error(w, `{"error": "Failed to reach AI Engine"}`, http.StatusInternalServerError)
        return
    }
    defer resp.Body.Close()
    
    body, _ := io.ReadAll(resp.Body)
    w.WriteHeader(resp.StatusCode)
    w.Write(body)
}

func handleDocuments(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, `{"error": "user_id is required"}`, http.StatusBadRequest)
		return
	}
	if r.Method == "GET" {
		pythonURL := fmt.Sprintf("http://ai-engine:8000/api/ai/documents?user_id=%s", url.QueryEscape(userID))
		resp, err := http.Get(pythonURL)
		if err != nil {
			http.Error(w, `{"error": "Failed to reach AI Engine"}`, http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		w.Write(body)
		return
	}
	if r.Method == "DELETE" {
		filename := r.URL.Query().Get("filename")
		if filename == "" {
			http.Error(w, `{"error": "filename is required"}`, http.StatusBadRequest)
			return
		}
		pythonURL := fmt.Sprintf("http://ai-engine:8000/api/ai/documents?user_id=%s&filename=%s", url.QueryEscape(userID), url.QueryEscape(filename))
		req, err := http.NewRequest("DELETE", pythonURL, nil)
		if err != nil {
			http.Error(w, `{"error": "Failed to create request"}`, http.StatusInternalServerError)
			return
		}
		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, `{"error": "Failed to reach AI Engine"}`, http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		w.Write(body)
		return
	}
	http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
}

func getHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, `{"error": "user_id is required"}`, http.StatusBadRequest)
		return
	}

	pythonURL := "http://ai-engine:8000/api/ai/history?user_id=" + userID
	resp, err := http.Get(pythonURL)
	if err != nil {
		http.Error(w, `{"error": "Failed to fetch history"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	w.Write(body)
}

func proxyFiles(w http.ResponseWriter, r *http.Request) {
	
    pythonURL := "http://ai-engine:8000" + r.URL.Path
    
    fmt.Printf("🔍 Proxying FILE request to: %s\n", pythonURL)

    req, err := http.NewRequest("GET", pythonURL, nil)
    if err != nil {
        http.Error(w, "Error creando request", http.StatusInternalServerError)
        return
    }

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        http.Error(w, "Error contactando a Python", http.StatusInternalServerError)
        return
    }
    defer resp.Body.Close()

    if resp.StatusCode == http.StatusNotFound {
        w.WriteHeader(http.StatusNotFound)
        fmt.Printf("❌ Python dijo que el archivo no existe en esa ruta\n")
        return
    }

    for name, values := range resp.Header {
        for _, value := range values {
            w.Header().Add(name, value)
        }
    }
    w.WriteHeader(resp.StatusCode)
    io.Copy(w, resp.Body)
}

func main() {
    http.HandleFunc("/api/ai/chat", enableCORS(askAI))
    http.HandleFunc("/api/ai/upload", enableCORS(uploadFile))
    http.HandleFunc("/api/ai/documents", enableCORS(handleDocuments))
    http.HandleFunc("/api/ai/history", enableCORS(getHistory))
    http.HandleFunc("/api/ai/files/", enableCORS(proxyFiles)) 

    port := ":8080"
    fmt.Printf("🚀 Gateway running on port %s\n", port)
    if err := http.ListenAndServe(port, nil); err != nil {
        log.Fatalf("Error starting the server: %v", err)
    }
}